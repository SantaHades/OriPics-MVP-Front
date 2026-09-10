import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import * as PortOne from "@portone/server-sdk";
import { authOptions } from "@/lib/authOptions";
import { prisma } from "@/lib/prisma";
import { sendGraceDowngradeNotice } from "@/lib/notifications/graceMailer";
import { computeRefundQuote, countProofUsage, PROOF_UNIT_PRICE } from "@/lib/payment/refund";
import { PLAN_GRANTS } from "@/lib/payment";
import {
  PLAN_PERIOD_DAYS,
  PLAN_PRICES,
  chargeWithBillingKeyAndGrant,
  isPlanId,
  type PlanId,
} from "@/lib/payment/subscriptionGrant";

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
 *        { action: "renew_now" }       조기 갱신 (A-79, 2026-09-07): 저장된 빌링키로 지금
 *          한 달치를 즉시 청구 → 주기가 오늘부터 30일로 재설정되고 건수는 정액으로 리셋
 *          (남은 건수는 이월 없이 소멸 — previous_credits 메타에만 기록되어 환불 시 원복 기준).
 *          결제창 없음. paymentId를 (userId, 오늘 날짜)로 고정해 같은 날 중복 청구를 막는다.
 *          해지 예약 상태였다면 갱신과 함께 예약을 해제한다(새 달을 결제한 의사 표시).
 */

/** 현재 주기 결제가 7일(청약철회 기간) 이내 + 이번 주기 인증 사용 0건 — 조기 갱신 차단 조건 (A안) */
async function isUnusedRecentPayment(userId: string, periodStart: Date): Promise<boolean> {
  const withinWithdrawal = Date.now() - periodStart.getTime() < 7 * 24 * 60 * 60 * 1000;
  if (!withinWithdrawal) return false;
  const used = await countProofUsage(userId, periodStart);
  return used === 0;
}

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
      gateway: true,
      billingKey: true,
    },
  });

  if (!sub) return NextResponse.json({ subscription: null });
  const plan: PlanId | null = isPlanId(sub.plan) ? sub.plan : null;
  const { billingKey, ...rest } = sub;
  const renewEligible = sub.gateway === "portone" && !!billingKey && sub.status === "active";
  // A-79 후속(2026-09-10 대표 A안): 현재 주기 결제가 7일 이내이고 인증을 한 건도 안 썼으면 조기 갱신 차단 —
  // 갱신하면 미사용 결제분의 청약철회(전액 환불) 권리가 사실상 사라지고 고객에게 이득이 없는 결제가 된다.
  const renewBlockedReason = renewEligible && (await isUnusedRecentPayment(userId, sub.currentPeriodStart)) ? "unused_recent_payment" : null;
  return NextResponse.json({
    subscription: {
      ...rest,
      // 조기 갱신(renew_now) 가능 여부 — PortOne 빌링키 구독만. Apple IAP는 스토어가 갱신을 관리.
      canRenewNow: renewEligible && !renewBlockedReason,
      renewBlockedReason,
      planGrant: plan ? PLAN_GRANTS[plan] : null,
      planPrice: plan ? PLAN_PRICES[plan] : null,
      planPeriodDays: plan ? PLAN_PERIOD_DAYS[plan] : null,
    },
  });
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
  if (!["cancel", "resume", "refund_preview", "refund_cancel", "renew_now"].includes(action ?? "")) {
    return NextResponse.json({ detail: "invalid_action" }, { status: 400 });
  }

  if (action === "renew_now") {
    if (!PORTONE_API_SECRET) {
      return NextResponse.json({ detail: "portone_not_configured" }, { status: 503 });
    }
    const sub = await prisma.subscription.findUnique({
      where: { userId },
      include: { user: { select: { name: true, email: true } } },
    });
    if (!sub || sub.status !== "active") {
      return NextResponse.json({ detail: "no_active_subscription" }, { status: 404 });
    }
    if (sub.gateway !== "portone" || !sub.billingKey) {
      return NextResponse.json({ detail: "renew_not_available" }, { status: 409 });
    }
    if (await isUnusedRecentPayment(userId, sub.currentPeriodStart)) {
      // A안: 미사용·7일 이내 결제분이 있으면 서버에서도 거절 (UI 우회 방지)
      return NextResponse.json({ detail: "renew_not_needed" }, { status: 409 });
    }
    const plan: PlanId = isPlanId(sub.plan) ? sub.plan : "pro_monthly";
    // 오늘 날짜(UTC)로 결정적 paymentId — 같은 날 두 번 눌러도 한 번만 청구된다.
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const paymentId = `bk-early-${String(userId).slice(-8)}-${today}`;
    const before = await prisma.user.findUnique({ where: { id: userId }, select: { credits: true } });
    let result: Awaited<ReturnType<typeof chargeWithBillingKeyAndGrant>>;
    try {
      result = await chargeWithBillingKeyAndGrant({
        billingKey: sub.billingKey,
        userId,
        plan,
        secret: PORTONE_API_SECRET,
        paymentId,
        customer: { fullName: sub.user?.name, email: sub.user?.email },
      });
    } catch (e: any) {
      console.error("[subscription] renew_now charge threw", { userId, paymentId, error: e?.message ?? e });
      return NextResponse.json({ detail: "charge_failed" }, { status: 502 });
    }
    if (!result.ok) {
      console.error("[subscription] renew_now failed", { userId, paymentId, code: result.code });
      // payment_not_paid/amount_mismatch 계열은 카드 승인 실패로 안내(빌링키 재등록 유도)
      return NextResponse.json(
        { detail: "charge_failed", code: result.code },
        { status: result.httpStatus >= 500 ? 502 : 409 },
      );
    }
    if (!result.alreadyProcessed && sub.cancelAtPeriodEnd) {
      await prisma.subscription.update({
        where: { userId },
        data: { cancelAtPeriodEnd: false, canceledAt: null },
      });
    }
    const after = await prisma.subscription.findUnique({
      where: { userId },
      select: { currentPeriodStart: true, currentPeriodEnd: true },
    });
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { credits: true } });
    return NextResponse.json({
      ok: true,
      alreadyProcessed: !!result.alreadyProcessed,
      credits: user?.credits ?? null,
      forfeited: result.alreadyProcessed ? 0 : (before?.credits ?? 0),
      periodStart: after?.currentPeriodStart ?? null,
      periodEnd: after?.currentPeriodEnd ?? null,
    });
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
