import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import * as PortOne from "@portone/server-sdk";
import { authOptions } from "@/lib/authOptions";
import { prisma } from "@/lib/prisma";
import { sendGraceDowngradeNotice } from "@/lib/notifications/graceMailer";
import { computeRefundQuote, countProofUsage, PROOF_UNIT_PRICE } from "@/lib/payment/refund";
import { PLAN_PRICES, isPlanId } from "@/lib/payment/subscriptionGrant";

export const runtime = "nodejs";

const PORTONE_API_SECRET = process.env.PORTONE_API_SECRET ?? "";

/**
 * 구독 관리 (프로필 결제 관리 섹션).
 *
 * GET  — 현재 사용자 구독 상태 조회.
 * POST — { action: "cancel" }          일반해지 예약: cancelAtPeriodEnd=true.
 *          기간말까지 이용 유지, 다음 결제부터 청구 중단 (약관 제11조 제5항 일반해지).
 *        { action: "resume" }          해지 예약 취소: 기간 만료 전이면 구독 재개.
 *        { action: "refund_preview" }  중도해지 예상 환불액 조회 (차감 없음).
 *        { action: "refund_cancel" }   중도해지 자동 환불 (A-34):
 *          제11조 산식(사용횟수=사진인증당 ₩1,000, 2026-08-22 확정) →
 *          PortOne 부분취소 → 즉시 종료·free 다운그레이드·크레딧 previous_credits 원복.
 */

/** 현재 기간 결제(grant TX)와 환불 견적 산출 — preview/cancel 공용 */
async function buildRefundContext(userId: string) {
  const sub = await prisma.subscription.findUnique({ where: { userId } });
  if (!sub || sub.status !== "active") {
    return { error: NextResponse.json({ detail: "no_active_subscription" }, { status: 404 }) };
  }
  if (sub.gateway !== "portone") {
    // Apple IAP 구독 환불은 스토어(Apple) 경유 — 자동 환불 대상 아님
    return { error: NextResponse.json({ detail: "gateway_not_supported" }, { status: 409 }) };
  }
  const grantTx = await prisma.creditTransaction.findFirst({
    where: { userId, action: "subscription_grant" },
    orderBy: { createdAt: "desc" },
  });
  const meta = (grantTx?.metadata ?? {}) as Record<string, unknown>;
  const paymentId = typeof meta.paymentId === "string" ? meta.paymentId : null;
  if (!grantTx || !paymentId) {
    return { error: NextResponse.json({ detail: "payment_not_found" }, { status: 404 }) };
  }
  const amount =
    typeof meta.amount === "number"
      ? meta.amount
      : isPlanId(sub.plan)
        ? PLAN_PRICES[sub.plan]
        : 0;
  if (amount <= 0) {
    return { error: NextResponse.json({ detail: "amount_unresolved" }, { status: 409 }) };
  }
  const usedProofs = await countProofUsage(userId, sub.currentPeriodStart);
  const quote = computeRefundQuote({
    amount,
    paidAt: sub.currentPeriodStart,
    periodEnd: sub.currentPeriodEnd,
    usedProofs,
  });
  const previousCredits = typeof meta.previous_credits === "number" ? meta.previous_credits : 0;
  return { sub, grantTx, paymentId, amount, quote, previousCredits };
}

export async function GET() {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as any)?.id;
  if (!userId) {
    return NextResponse.json({ detail: "unauthenticated" }, { status: 401 });
  }

  const sub = await prisma.subscription.findUnique({
    where: { userId },
    select: {
      plan: true,
      status: true,
      currentPeriodStart: true,
      currentPeriodEnd: true,
      cancelAtPeriodEnd: true,
      canceledAt: true,
    },
  });

  return NextResponse.json({ subscription: sub });
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as any)?.id;
  if (!userId) {
    return NextResponse.json({ detail: "unauthenticated" }, { status: 401 });
  }

  let action: string | undefined;
  try {
    const body = await req.json();
    action = body?.action;
  } catch {
    /* fallthrough */
  }
  if (!["cancel", "resume", "refund_preview", "refund_cancel"].includes(action ?? "")) {
    return NextResponse.json({ detail: "invalid_action" }, { status: 400 });
  }

  if (action === "refund_preview") {
    const ctx = await buildRefundContext(userId);
    if ("error" in ctx) return ctx.error;
    return NextResponse.json({
      quote: ctx.quote,
      unitPrice: PROOF_UNIT_PRICE,
      amount: ctx.amount,
      periodStart: ctx.sub.currentPeriodStart,
      periodEnd: ctx.sub.currentPeriodEnd,
    });
  }

  if (action === "refund_cancel") {
    if (!PORTONE_API_SECRET) {
      return NextResponse.json({ detail: "portone_not_configured" }, { status: 503 });
    }
    const ctx = await buildRefundContext(userId);
    if ("error" in ctx) return ctx.error;
    const { sub, paymentId, quote, previousCredits } = ctx;

    if (!quote.refundable) {
      // 산정액 ≤ 0 → 환불 불가 (약관 제11조) — 일반해지(기간말 유지)로 안내
      return NextResponse.json({ detail: "refund_not_available", quote }, { status: 409 });
    }

    // 멱등: 같은 결제 건의 중복 환불 방지 (이미 처리됐으면 성공으로 응답)
    const already = await prisma.creditTransaction.findFirst({
      where: {
        userId,
        action: "refund_cancel",
        metadata: { path: ["paymentId"], equals: paymentId },
      },
      select: { id: true },
    });
    if (already) {
      return NextResponse.json({ ok: true, alreadyProcessed: true });
    }

    // 1) PG 부분취소 (전액 산정 시에도 amount 지정 — 잔여 한도 내 취소)
    try {
      const client = PortOne.PaymentClient({ secret: PORTONE_API_SECRET });
      await client.cancelPayment({
        paymentId,
        amount: quote.refundAmount,
        reason: `중도해지 환불 (약관 제11조, 사용 ${quote.usedProofs}건 × ₩${PROOF_UNIT_PRICE})`,
      });
    } catch (e: any) {
      // 이미 전액 취소된 결제 등 — 콘솔 수동 처리와의 경합. 상태를 바꾸지 않고 그대로 노출.
      console.error("[subscription] cancelPayment failed", {
        userId,
        paymentId,
        error: e?.message,
        type: e?.data?.type,
      });
      return NextResponse.json(
        { detail: "pg_cancel_failed", pgError: e?.data?.type ?? e?.message },
        { status: 502 },
      );
    }

    // 2) DB 반영 — 즉시 종료 + free 다운그레이드 + 크레딧 previous_credits 원복 (A-34 ⑤:
    //    Pro 기간 사용분은 환불액 공제로 정산됐으므로 크레딧에서 이중 차감 금지.
    //    creditsRenewAt은 유지 — 기존 anchor(periodEnd)에서 free 정액으로 자연 리셋).
    const now = new Date();
    await prisma.$transaction(async (tx) => {
      await tx.subscription.update({
        where: { userId },
        data: {
          status: "canceled",
          cancelAtPeriodEnd: true,
          canceledAt: now,
          currentPeriodEnd: now,
        },
      });
      const cur = await tx.user.findUnique({ where: { id: userId }, select: { credits: true } });
      const updated = await tx.user.update({
        where: { id: userId },
        data: { tier: "free", credits: previousCredits },
        select: { credits: true },
      });
      await tx.creditTransaction.create({
        data: {
          userId,
          delta: updated.credits - (cur?.credits ?? 0),
          action: "refund_cancel",
          balanceAfter: updated.credits,
          metadata: {
            paymentId,
            refund_amount: quote.refundAmount,
            basis: quote.basis,
            used_proofs: quote.usedProofs,
            usage_deduction: quote.usageDeduction,
            prorated_elapsed: quote.proratedElapsed,
            penalty: quote.penalty,
            unit_price: PROOF_UNIT_PRICE,
            restored_credits: previousCredits,
          },
        },
      });
      // 보관함 종료 — 다운그레이드와 동일한 37일 grace (pricing-policy §11.2, A-7③)
      await tx.$executeRaw`
        UPDATE public.links
        SET expires_at = now() + interval '37 days'
        WHERE user_id = ${userId} AND expires_at IS NULL`;
    });

    // §5.3 즉시 알림 (A-58) — 환불 성공에 무영향(best-effort)
    try {
      const [user, rows] = await Promise.all([
        prisma.user.findUnique({ where: { id: userId }, select: { email: true } }),
        prisma.$queryRaw<Array<{ cnt: bigint; min_exp: Date | null }>>`
          SELECT count(*) AS cnt, min(expires_at) AS min_exp FROM public.links
          WHERE user_id = ${userId} AND expires_at IS NOT NULL AND expires_at > now()`,
      ]);
      const cnt = Number(rows?.[0]?.cnt ?? 0);
      if (user?.email && cnt > 0 && rows[0].min_exp) {
        await sendGraceDowngradeNotice({
          email: user.email,
          linkCount: cnt,
          expiresAt: new Date(rows[0].min_exp),
        });
      }
    } catch (e) {
      console.error("[billing] grace notice failed (ignored):", (e as any)?.message);
    }

    return NextResponse.json({ ok: true, refunded: quote.refundAmount, quote });
  }

  const sub = await prisma.subscription.findUnique({ where: { userId } });
  if (!sub || sub.status !== "active") {
    return NextResponse.json({ detail: "no_active_subscription" }, { status: 404 });
  }

  if (action === "cancel") {
    if (sub.cancelAtPeriodEnd) {
      return NextResponse.json({ ok: true, alreadyCanceled: true });
    }
    await prisma.subscription.update({
      where: { userId },
      data: { cancelAtPeriodEnd: true, canceledAt: new Date() },
    });
    return NextResponse.json({ ok: true, effectiveAt: sub.currentPeriodEnd });
  }

  // resume — 기간이 아직 남아 있을 때만 재개 가능
  if (sub.currentPeriodEnd <= new Date()) {
    return NextResponse.json({ detail: "period_expired" }, { status: 409 });
  }
  await prisma.subscription.update({
    where: { userId },
    data: { cancelAtPeriodEnd: false, canceledAt: null },
  });
  return NextResponse.json({ ok: true });
}
