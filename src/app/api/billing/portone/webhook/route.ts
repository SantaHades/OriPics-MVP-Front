import { NextRequest, NextResponse } from "next/server";
import { Webhook } from "@portone/server-sdk";
import {
  isPlanId,
  planFromAmount,
  verifyAndGrantSubscription,
  type PlanId,
} from "@/lib/payment/subscriptionGrant";
import * as PortOne from "@portone/server-sdk";

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

  // 결제 승인 이벤트만 처리. 나머지(취소·실패·예약 등)는 ack만.
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
  try {
    if (payment.customData) {
      const parsed = JSON.parse(payment.customData);
      if (typeof parsed?.userId === "string") userId = parsed.userId;
      if (isPlanId(parsed?.plan)) plan = parsed.plan;
    }
  } catch {
    /* customData 파싱 실패는 아래 누락 처리로 흡수 */
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
