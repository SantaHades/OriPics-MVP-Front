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

export const PLAN_ORDER_NAMES: Record<PlanId, string> = {
  pro_monthly: "OriPics Pro (월간 구독)",
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
        | "db_update_failed"
        | "billing_key_charge_failed";
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
  /** 정기결제(빌링키) 결제일 경우 Subscription에 저장할 빌링키. */
  billingKey?: string;
}): Promise<GrantResult> {
  const { paymentId, userId, plan, secret, billingKey } = opts;
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
        // 이미 부여됨(webhook이 먼저 처리한 경우 등). 단 webhook 경로는 billingKey를
        // 모르므로, 빌링키 경로에서 들어온 경우 빌링키만은 반드시 저장한다(갱신 cron에 필요).
        if (billingKey) {
          await tx.subscription.updateMany({ where: { userId }, data: { billingKey } });
        }
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
          ...(billingKey ? { billingKey } : {}),
          plan,
          status: "active",
          currentPeriodStart: periodStart,
          currentPeriodEnd: periodEnd,
        },
        update: {
          gateway: "portone",
          gatewaySubscriptionId: paymentId,
          ...(billingKey ? { billingKey } : {}),
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

/**
 * 정기결제(빌링키)로 한 주기 즉시 청구 후 구독·크레딧을 멱등 부여한다.
 *
 *   - 최초 구독: checkout에서 발급한 billingKey로 첫 달을 즉시 청구 (billing-key 라우트).
 *   - 갱신: 매월 cron이 저장된 billingKey로 다음 달을 청구.
 *
 * payWithBillingKey는 즉시 승인되며, 그 paymentId로 verifyAndGrantSubscription을
 * 재사용해 PAID·금액 검증 + 멱등 부여 + billingKey 저장을 한다.
 */
export async function chargeWithBillingKeyAndGrant(opts: {
  billingKey: string;
  userId: string;
  plan: PlanId;
  secret: string;
  customer?: { fullName?: string | null; email?: string | null; phoneNumber?: string | null };
  /** 멱등 청구를 위한 paymentId (cron에서 주기 식별자로 고정 가능). 미지정 시 자동 생성. */
  paymentId?: string;
}): Promise<GrantResult> {
  const { billingKey, userId, plan, secret, customer } = opts;
  const amount = PLAN_PRICES[plan];
  const paymentId =
    opts.paymentId ??
    `bk-${String(userId).slice(-8)}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const client = PortOne.PaymentClient({ secret });
  try {
    await client.payWithBillingKey({
      paymentId,
      billingKey,
      orderName: PLAN_ORDER_NAMES[plan],
      amount: { total: amount },
      currency: "KRW",
      ...(customer
        ? {
            customer: {
              ...(customer.fullName ? { name: { full: customer.fullName } } : {}),
              ...(customer.email ? { email: customer.email } : {}),
              ...(customer.phoneNumber ? { phoneNumber: customer.phoneNumber } : {}),
            },
          }
        : {}),
      customData: JSON.stringify({ userId, plan }),
    });
  } catch (e: any) {
    // 이미 같은 paymentId로 청구된 경우(PaymentAlreadyPaid 등)는 검증·부여 단계에서
    // 멱등 처리되므로 통과시키고, 그 외 카드 거절 등은 실패로 반환.
    const msg = String(e?.message ?? e);
    const alreadyPaid = /already.?paid|이미.*결제|AlreadyPaid/i.test(msg);
    if (!alreadyPaid) {
      return { ok: false, code: "billing_key_charge_failed", httpStatus: 402, detail: msg };
    }
  }

  // 청구 완료된 paymentId로 검증 + 멱등 부여 + billingKey 저장
  return verifyAndGrantSubscription({ paymentId, userId, plan, secret, billingKey });
}
