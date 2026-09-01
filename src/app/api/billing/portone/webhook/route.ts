import { NextRequest, NextResponse } from "next/server";
import { Webhook } from "@portone/server-sdk";
import {
  isPlanId,
  planFromAmount,
  verifyAndGrantSubscription,
  type PlanId,
} from "@/lib/payment/subscriptionGrant";
import * as PortOne from "@portone/server-sdk";
import { prisma } from "@/lib/prisma";
import {
  PASS_PRODUCT_MARKER,
  verifyAndIssueDayPass,
  revokeDayPassForPayment,
} from "@/lib/pass/passPurchase";

export const runtime = "nodejs";

const PORTONE_API_SECRET = process.env.PORTONE_API_SECRET ?? "";
const PORTONE_WEBHOOK_SECRET = process.env.PORTONE_WEBHOOK_SECRET ?? "";

/**
 * POST /api/billing/portone/webhook
 *
 * PortOne V2 결제 webhook 수신점 (비동기 안전망).
 * success 페이지로의 리다이렉트가 실패하는 경우(모바일에서 결제 직후 브라우저
 * 종료, 네트워크 단절 등)에도 결제 완료 시 크레딧이 지급되도록 보장한다.
 *
 * 흐름:
 *  1. webhook 시그니처 검증 (PortOne 콘솔의 webhook secret)
 *  2. Transaction.Paid 이벤트만 처리 (그 외는 200 ack)
 *  3. paymentId로 PortOne 재질의 → customData(JSON {userId, plan}) 복원
 *  4. complete 경로와 동일한 검증·멱등 부여 로직 호출
 *
 * customData는 checkout의 requestPayment에서 주입한다. 누락 시 userId를 알 수
 * 없어 안전하게 부여할 수 없으므로, 로깅 후 200으로 ack(재시도 폭주 방지).
 * 그런 결제도 사용자가 success로 돌아오면 complete 경로가 처리한다.
 *
 * 멱등성: verifyAndGrantSubscription이 advisory lock + 기존 거래 확인으로 보장.
 * → success(complete)와 webhook이 같은 결제를 동시에 처리해도 1회만 지급.
 */
export async function POST(req: NextRequest) {
  if (!PORTONE_API_SECRET || !PORTONE_WEBHOOK_SECRET) {
    console.error("[portone/webhook] secrets not configured");
    return NextResponse.json({ detail: "not_configured" }, { status: 500 });
  }

  // 시그니처 검증은 raw body가 필요
  const rawBody = await req.text();

  /** 콘솔/외부 취소 → 해당 결제로 활성화된 구독 회수 (멱등) */
  async function handleCancelled(paymentId: string, eventType: string) {
    // 원데이 패스 결제의 환불이면 미등록 코드 무효화 (A-60 — 등록 후 상태는 수동 판단)
    const passRevoke = await revokeDayPassForPayment(paymentId);
    if (passRevoke === "revoked") {
      console.warn("[portone/webhook] day pass code revoked on refund", { paymentId, eventType });
      return NextResponse.json({ ok: true, pass_revoked: true });
    }
    if (passRevoke === "already_redeemed") {
      // 정책상 등록 후 환불 불가 — 콘솔 강제 환불 등 예외는 로그만 남기고 수동 처리
      console.error("[portone/webhook] refund for a REDEEMED day pass — manual review needed", {
        paymentId,
        eventType,
      });
      return NextResponse.json({ ok: true, pass_refund_needs_review: true });
    }

    // 해당 결제의 grant TX로 사용자 식별
    const grant = await prisma.creditTransaction.findFirst({
      where: { action: "subscription_grant", metadata: { path: ["paymentId"], equals: paymentId } },
      select: { userId: true, metadata: true },
    });
    if (!grant) {
      // 우리가 부여한 적 없는 결제(테스트 등) — ack
      return NextResponse.json({ ok: true, ignored: "grant_not_found" });
    }
    const userId = grant.userId;

    // 자체 refund_cancel 경로가 이미 처리한 취소(우리가 호출한 부분취소의 webhook 반향) — 스킵
    const selfProcessed = await prisma.creditTransaction.findFirst({
      where: { userId, action: "refund_cancel", metadata: { path: ["paymentId"], equals: paymentId } },
      select: { id: true },
    });
    if (selfProcessed) {
      return NextResponse.json({ ok: true, alreadyProcessed: true });
    }

    // 외부(콘솔/차지백) 취소 — 구독 회수 + 다운그레이드 + 크레딧 previous_credits 원복 (멱등)
    const sub = await prisma.subscription.findUnique({ where: { userId } });
    if (!sub || sub.status !== "active" || sub.gatewaySubscriptionId !== paymentId) {
      // 이미 종료됐거나 다른 기간의 결제 취소 — 상태 변경 없이 감사 로그만
      console.warn("[portone/webhook] cancelled for non-current subscription", { paymentId, eventType });
      return NextResponse.json({ ok: true, ignored: "not_current_period" });
    }
    const meta = (grant.metadata ?? {}) as Record<string, unknown>;
    const previousCredits = typeof meta.previous_credits === "number" ? meta.previous_credits : 0;
    const now = new Date();
    await prisma.$transaction(async (tx) => {
      await tx.subscription.update({
        where: { userId },
        data: { status: "canceled", cancelAtPeriodEnd: true, canceledAt: now, currentPeriodEnd: now },
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
          metadata: { paymentId, source: "webhook", event_type: eventType, restored_credits: previousCredits },
        },
      });
      await tx.$executeRaw`
        UPDATE public.links
        SET expires_at = now() + interval '37 days'
        WHERE user_id = ${userId} AND expires_at IS NULL`;
    });
    console.warn("[portone/webhook] external cancellation processed — subscription revoked", { paymentId, userId, eventType });
    return NextResponse.json({ ok: true, revoked: true });
  }

  let event: Awaited<ReturnType<typeof Webhook.verify>>;
  try {
    event = await Webhook.verify(PORTONE_WEBHOOK_SECRET, rawBody, {
      "webhook-id": req.headers.get("webhook-id") ?? "",
      "webhook-timestamp": req.headers.get("webhook-timestamp") ?? "",
      "webhook-signature": req.headers.get("webhook-signature") ?? "",
    });
  } catch (e: any) {
    // 검증 실패 = 위조 가능성. 401로 거절.
    console.warn("[portone/webhook] signature verification failed", { reason: e?.reason ?? e?.message });
    return NextResponse.json({ detail: "invalid_signature" }, { status: 401 });
  }

  // 취소 이벤트 (A-34 ②): 콘솔/외부 환불 시 구독 자동 회수.
  // 자체 refund_cancel 경로로 이미 처리된 결제는 멱등 스킵.
  if ("type" in event && (event.type === "Transaction.Cancelled" || event.type === "Transaction.PartialCancelled")) {
    const cancelledPaymentId = (event as any).data?.paymentId;
    if (!cancelledPaymentId) return NextResponse.json({ ok: true, ignored: true });
    return handleCancelled(cancelledPaymentId, event.type);
  }

  // 결제 승인 이벤트만 처리. 나머지(실패·예약 등)는 ack만.
  if (!("type" in event) || event.type !== "Transaction.Paid") {
    return NextResponse.json({ ok: true, ignored: true });
  }

  const paymentId = event.data.paymentId;
  if (!paymentId) {
    return NextResponse.json({ ok: true, ignored: true });
  }

  // customData에서 userId/plan 복원
  const client = PortOne.PaymentClient({ secret: PORTONE_API_SECRET });
  let payment: any;
  try {
    payment = await client.getPayment({ paymentId });
  } catch (e: any) {
    // 결제 건이 존재하지 않음(영구) → 재시도해도 동일하므로 200 ack.
    // (포트원 "호출 테스트"의 더미 paymentId, 삭제된 결제 등이 여기 해당.)
    if (e?.data?.type === "PAYMENT_NOT_FOUND") {
      console.warn("[portone/webhook] payment not found; ack", { paymentId });
      return NextResponse.json({ ok: true, ignored: "payment_not_found" });
    }
    // 그 외(네트워크/일시 장애) → 500 반환 시 PortOne이 재시도하므로 강건.
    console.error("[portone/webhook] getPayment failed", { paymentId, error: e?.message });
    return NextResponse.json({ detail: "lookup_failed" }, { status: 500 });
  }

  let userId: string | undefined;
  let plan: PlanId | undefined;
  let product: string | undefined;
  try {
    if (payment.customData) {
      const parsed = JSON.parse(payment.customData);
      if (typeof parsed?.userId === "string") userId = parsed.userId;
      if (isPlanId(parsed?.plan)) plan = parsed.plan;
      if (typeof parsed?.product === "string") product = parsed.product;
    }
  } catch {
    /* customData 파싱 실패는 아래 누락 처리로 흡수 */
  }

  // 원데이 패스 단건 결제 (A-60 Phase 3) — 구독 경로와 분리 처리.
  // 사용자가 success 페이지로 못 돌아온 경우(모바일 브라우저 종료 등)에도
  // 코드가 발급되도록 보장. 코드 전달은 프로필 최근 내역/재방문 complete가 담당.
  if (product === PASS_PRODUCT_MARKER) {
    if (!userId) {
      console.warn("[portone/webhook] day pass payment without userId; deferring to complete path", { paymentId });
      return NextResponse.json({ ok: true, deferred: true });
    }
    const passResult = await verifyAndIssueDayPass({ paymentId, userId, secret: PORTONE_API_SECRET });
    if (!passResult.ok) {
      if (passResult.code === "portone_lookup_failed" || passResult.code === "db_update_failed") {
        return NextResponse.json({ detail: passResult.code }, { status: 500 });
      }
      console.warn("[portone/webhook] day pass permanent rejection", { paymentId, code: passResult.code });
      return NextResponse.json({ ok: true, rejected: passResult.code });
    }
    return NextResponse.json({ ok: true, pass_issued: true, alreadyProcessed: passResult.alreadyProcessed });
  }

  // plan 폴백: customData에 없으면 결제 금액으로 역추론
  if (!plan) {
    const inferred = planFromAmount(payment.amount?.total);
    if (inferred) plan = inferred;
  }

  if (!userId || !plan) {
    // userId 없이는 안전하게 지급 불가. 재시도해도 동일하므로 200 ack 후 로깅.
    // 이 결제는 사용자가 success로 복귀하면 complete 경로가 처리.
    console.warn("[portone/webhook] missing userId/plan in customData; deferring to complete path", {
      paymentId,
      hasUserId: !!userId,
      hasPlan: !!plan,
    });
    return NextResponse.json({ ok: true, deferred: true });
  }

  const result = await verifyAndGrantSubscription({
    paymentId,
    userId,
    plan,
    secret: PORTONE_API_SECRET,
  });

  if (!result.ok) {
    // 일시 오류(조회/DB)는 500으로 반환해 PortOne 재시도 유도.
    // 단 금액 불일치/미결제 같은 영구 거절은 200으로 ack(무한 재시도 방지).
    if (result.code === "portone_lookup_failed" || result.code === "db_update_failed") {
      return NextResponse.json({ detail: result.code }, { status: 500 });
    }
    console.warn("[portone/webhook] permanent rejection", { paymentId, code: result.code, detail: result.detail });
    return NextResponse.json({ ok: true, rejected: result.code });
  }

  return NextResponse.json({
    ok: true,
    granted: result.granted,
    alreadyProcessed: result.alreadyProcessed,
  });
}
