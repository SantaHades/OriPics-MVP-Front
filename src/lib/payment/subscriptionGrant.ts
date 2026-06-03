import * as PortOne from "@portone/server-sdk";
import { prisma } from "@/lib/prisma";
import { PLAN_GRANTS } from "@/lib/payment";

/**
 * PortOne 결제 검증 + 구독·크레딧 부여 공유 로직.
 *
 * 두 진입점이 이 함수를 호출한다:
 *   - /api/billing/portone/complete  (success 페이지, 세션에서 userId 확보)
 *   - /api/billing/portone/webhook   (PortOne 서버 콜백, customData에서 userId 확보)
 *
 * 두 경로가 동시에 같은 paymentId를 처리할 수 있으므로(사용자가 success로 돌아오는
 * 시점과 webhook 도착이 겹침), Postgres advisory lock으로 직렬화해 이중 지급을 막는다.
 * (CreditTransaction에 unique 제약이 없어 마이그레이션 없이 멱등성 확보.)
 */

export type PlanId = "pro_monthly";

export const PLAN_PRICES: Record<PlanId, number> = {
  pro_monthly: 9900,
};

export const PLAN_PERIOD_DAYS: Record<PlanId, number> = {
  pro_monthly: 30,
};

export function isPlanId(v: unknown): v is PlanId {
  return typeof v === "string" && v in PLAN_PRICES;
}

/** 금액으로 plan 역추론 (customData 누락 시 폴백). */
export function planFromAmount(amount: unknown): PlanId | null {
  for (const [plan, price] of Object.entries(PLAN_PRICES)) {
    if (price === amount) return plan as PlanId;
  }
  return null;
}

export type GrantResult =
  | {
      ok: true;
      alreadyProcessed: boolean;
      granted: number;
      plan: PlanId;
      pgProvider: string;
    }
  | {
      ok: false;
      code:
        | "portone_lookup_failed"
        | "payment_not_paid"
        | "amount_mismatch"
        | "db_update_failed";
      httpStatus: number;
      detail?: any;
    };

/**
 * paymentId를 PortOne에 재질의해 PAID·금액을 검증한 뒤, 멱등적으로 구독·크레딧 부여.
 * 클라이언트가 보낸 금액은 신뢰하지 않고 PortOne 기록을 source of truth로 사용.
 */
export async function verifyAndGrantSubscription(opts: {
  paymentId: string;
  userId: string;
  plan: PlanId;
  secret: string;
}): Promise<GrantResult> {
  const { paymentId, userId, plan, secret } = opts;
  const expectedAmount = PLAN_PRICES[plan];

  // 1) PortOne 결제 조회 (네트워크 호출은 트랜잭션 밖에서)
  const client = PortOne.PaymentClient({ secret });
  let payment: any;
  try {
    payment = await client.getPayment({ paymentId });
  } catch (e: any) {
    return { ok: false, code: "portone_lookup_failed", httpStatus: 502, detail: e?.message };
  }

  if (payment.status !== "PAID") {
    return { ok: false, code: "payment_not_paid", httpStatus: 402, detail: payment.status };
  }

  const paidAmount = payment.amount?.total;
  if (paidAmount !== expectedAmount) {
    return {
      ok: false,
      code: "amount_mismatch",
      httpStatus: 400,
      detail: { expected: expectedAmount, paid: paidAmount },
    };
  }

  const pgProvider = payment.channel?.pgProvider ?? "unknown";
  const grant = PLAN_GRANTS[plan] ?? 0;

  // 2) 멱등 부여 — advisory lock으로 동일 paymentId 동시처리 직렬화
  try {
    return await prisma.$transaction(async (tx) => {
      // 같은 paymentId를 처리하는 다른 트랜잭션을 대기시킨다 (트랜잭션 종료 시 자동 해제)
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`portone:grant:${paymentId}`}))`;

      const existing = await tx.creditTransaction.findFirst({
        where: {
          userId,
          action: "subscription_grant",
          metadata: { path: ["paymentId"], equals: paymentId },
        },
        select: { id: true },
      });
      if (existing) {
        return {
          ok: true as const,
          alreadyProcessed: true,
          granted: 0,
          plan,
          pgProvider,
        };
      }

      const periodStart = new Date();
      const periodEnd = new Date(periodStart);
      periodEnd.setDate(periodEnd.getDate() + PLAN_PERIOD_DAYS[plan]);

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
        data: { tier: "pro", credits: { increment: grant } },
        select: { credits: true },
      });

      await tx.creditTransaction.create({
        data: {
          userId,
          delta: grant,
          action: "subscription_grant",
          balanceAfter: updated.credits,
          metadata: { plan, paymentId, amount: paidAmount, gateway: "portone", pgProvider },
        },
      });

      return {
        ok: true as const,
        alreadyProcessed: false,
        granted: grant,
        plan,
        pgProvider,
      };
    });
  } catch (e: any) {
    console.error("[subscriptionGrant] DB update failed after payment verification", {
      userId,
      paymentId,
      error: e?.message,
    });
    return { ok: false, code: "db_update_failed", httpStatus: 500, detail: paymentId };
  }
}
