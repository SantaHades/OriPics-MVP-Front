import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import * as PortOne from "@portone/server-sdk";
import { authOptions } from "@/lib/authOptions";
import { prisma } from "@/lib/prisma";
import { PLAN_GRANTS } from "@/lib/payment";

export const runtime = "nodejs";

const PORTONE_API_SECRET = process.env.PORTONE_API_SECRET ?? "";

type PlanId = "pro_monthly";

const PLAN_PRICES: Record<PlanId, number> = {
  pro_monthly: 9900,
};

const PLAN_PERIOD_DAYS: Record<PlanId, number> = {
  pro_monthly: 30,
};

function isPlanId(v: unknown): v is PlanId {
  return typeof v === "string" && v in PLAN_PRICES;
}

/**
 * POST /api/billing/portone/complete
 *
 * PortOne V2 결제 완료 검증 + 구독·크레딧 부여.
 * /billing/success 페이지가 PortOne SDK로부터 받은 paymentId를 전송.
 *
 * Body: { paymentId, plan }
 *
 * 흐름:
 *  1. 세션 확인
 *  2. PortOne API로 결제 상세 조회 (status, amount 신뢰)
 *  3. plan·amount·status 검증
 *  4. Subscription upsert + tier=pro + 크레딧 부여 (트랜잭션)
 *
 * **보안 모델**: 클라이언트가 보낸 amount는 신뢰하지 않음 — PortOne SDK 응답을
 * 그대로 받아오는 게 아니라, 서버에서 paymentId로 PortOne API에 재질의해서
 * "실제로 PG에 PAID 상태로 기록된 금액"을 확인. 이것이 PortOne V2의 표준 패턴.
 */
export async function POST(req: NextRequest) {
  if (!PORTONE_API_SECRET) {
    return NextResponse.json({ detail: "portone_not_configured" }, { status: 500 });
  }

  const session = await getServerSession(authOptions);
  const userId = (session?.user as any)?.id as string | undefined;
  if (!userId) {
    return NextResponse.json({ detail: "unauthenticated" }, { status: 401 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ detail: "invalid_json" }, { status: 400 });
  }

  const { paymentId, plan } = body || {};
  if (!paymentId || typeof paymentId !== "string" || !isPlanId(plan)) {
    return NextResponse.json({ detail: "missing_fields" }, { status: 400 });
  }

  const expectedAmount = PLAN_PRICES[plan];

  // PortOne V2 결제 조회
  const client = PortOne.PaymentClient({ secret: PORTONE_API_SECRET });
  let payment;
  try {
    payment = await client.getPayment({ paymentId });
  } catch (e: any) {
    return NextResponse.json(
      { detail: "portone_lookup_failed", message: e?.message },
      { status: 502 },
    );
  }

  if (payment.status !== "PAID") {
    return NextResponse.json(
      { detail: "payment_not_paid", status: payment.status },
      { status: 402 },
    );
  }

  // 금액 검증 — 클라이언트가 가격을 조작할 수 없도록 서버 측 plan 가격과 일치 확인
  const paidAmount = (payment as any).amount?.total;
  if (paidAmount !== expectedAmount) {
    return NextResponse.json(
      { detail: "amount_mismatch", expected: expectedAmount, paid: paidAmount },
      { status: 400 },
    );
  }

  // 멱등성 — 동일 paymentId 재처리 방지
  const existing = await prisma.creditTransaction.findFirst({
    where: {
      userId,
      action: "subscription_grant",
      metadata: { path: ["paymentId"], equals: paymentId },
    },
    select: { id: true },
  });
  if (existing) {
    return NextResponse.json({ ok: true, already_processed: true });
  }

  const periodStart = new Date();
  const periodEnd = new Date(periodStart);
  periodEnd.setDate(periodEnd.getDate() + PLAN_PERIOD_DAYS[plan]);
  const grant = plan === "pro_monthly" ? PLAN_GRANTS.pro_monthly : 0;
  const pgProvider = (payment as any).channel?.pgProvider ?? "unknown";

  try {
    await prisma.$transaction(async (tx) => {
      await tx.subscription.upsert({
        where: { userId },
        create: {
          userId,
          gateway: "portone",
          gatewayCustomerId: userId,
          gatewaySubscriptionId: paymentId,
          plan,
          status: "active",
          currentPeriodStart: periodStart,
          currentPeriodEnd: periodEnd,
        },
        update: {
          gateway: "portone",
          gatewaySubscriptionId: paymentId,
          plan,
          status: "active",
          currentPeriodStart: periodStart,
          currentPeriodEnd: periodEnd,
          cancelAtPeriodEnd: false,
          canceledAt: null,
        },
      });

      const updated = await tx.user.update({
        where: { id: userId },
        data: {
          tier: "pro",
          credits: { increment: grant },
        },
        select: { credits: true },
      });

      await tx.creditTransaction.create({
        data: {
          userId,
          delta: grant,
          action: "subscription_grant",
          balanceAfter: updated.credits,
          metadata: {
            plan,
            paymentId,
            amount: paidAmount,
            gateway: "portone",
            pgProvider,
          },
        },
      });
    });
  } catch (e: any) {
    console.error("[portone/complete] DB update failed after payment verification", {
      userId,
      paymentId,
      error: e?.message,
    });
    return NextResponse.json(
      { detail: "db_update_failed_after_payment", paymentId },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    plan,
    granted: grant,
    pgProvider,
  });
}
