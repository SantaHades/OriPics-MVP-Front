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
        | "ownership_mismatch"
        | "billing_key_not_owned"
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

  // 결제 소유권 검증 (H-1): 이 결제의 customData.userId가 있으면 반드시 호출자와
  // 일치해야 한다. checkout(requestPayment/requestIssueBillingKey)과 빌링키 청구가
  // 항상 {userId, plan}을 주입하므로, 남의 paymentId를 complete 경로에 제출해
  // 자기 계정에 구독을 부여받는 위조를 차단한다. (일치 검증만 — 미주입 결제는
  // 위조 대상이 아니므로 경고 로깅 후 통과)
  let paymentUserId: string | undefined;
  try {
    if (payment.customData) {
      const parsed = JSON.parse(payment.customData);
      if (typeof parsed?.userId === "string") paymentUserId = parsed.userId;
    }
  } catch {
    /* customData 파싱 실패는 아래 미검증 경고로 흡수 */
  }
  if (paymentUserId && paymentUserId !== userId) {
    console.warn("[subscriptionGrant] payment ownership mismatch — refusing", {
      paymentId,
      caller: userId,
    });
    return { ok: false, code: "ownership_mismatch", httpStatus: 403 };
  }
  if (!paymentUserId) {
    console.warn("[subscriptionGrant] payment has no customData.userId — ownership unverified", {
      paymentId,
      caller: userId,
    });
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

      // 크레딧은 가산이 아니라 플랜 정액으로 리셋(SET) — pricing-policy.md §5.1 이월 불가
      // (cap 모델)과 정합. 매월 빌링키 자동청구가 돌 때마다 누적되는 것을 방지한다.
      // creditsRenewAt도 결제 주기 종료일로 정렬해, 가입일 anchor 기반의
      // renewCreditsIfDue(cron/lazy)가 결제 주기 중간에 이중 리셋하지 않게 한다.
      // (청구 실패 dunning 중에는 renewCreditsIfDue가 grace 리필을 제공하고,
      //  7일 후 다운그레이드되면 free 정액으로 회귀 — 의도된 동작.)
      const prev = await tx.user.findUnique({
        where: { id: userId },
        select: { credits: true },
      });
      const previousCredits = prev?.credits ?? 0;

      const updated = await tx.user.update({
        where: { id: userId },
        data: { tier: "pro", credits: grant, creditsRenewAt: periodEnd },
        select: { credits: true },
      });

      await tx.creditTransaction.create({
        data: {
          userId,
          delta: grant - previousCredits,
          action: "subscription_grant",
          balanceAfter: updated.credits,
          metadata: {
            plan,
            paymentId,
            amount: paidAmount,
            gateway: "portone",
            pgProvider,
            previous_credits: previousCredits,
          },
        },
      });

      // 보관함 활성화: 아직 살아있는 링크의 만료를 해제(무기한 보관 전환).
      // 재구독 시 다운그레이드 grace 만료 복원 + 기존 free 링크도 보관함에 편입.
      await tx.$executeRaw`
        UPDATE public.links
        SET expires_at = NULL
        WHERE user_id = ${userId} AND expires_at > now()`;

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
  /**
   * 클라이언트가 billingKey를 직접 제출하는 최초 구독 경로(billing-key 라우트)에서 true.
   * 빌링키의 customData.userId(=발급 시점 사용자) 또는 기존 DB 바인딩과 대조해,
   * 타인 카드로 결제해 자기 계정을 Pro로 만드는 위조(H-1b)를 차단한다.
   * cron 갱신은 서버가 DB에서 고른 신뢰된 billingKey이므로 false(생략).
   */
  verifyOwnership?: boolean;
}): Promise<GrantResult> {
  const { billingKey, userId, plan, secret, customer, verifyOwnership } = opts;
  const amount = PLAN_PRICES[plan];
  const paymentId =
    opts.paymentId ??
    `bk-${String(userId).slice(-8)}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const client = PortOne.PaymentClient({ secret });

  // INICIS payWithBillingKey는 customer.name/email/phoneNumber를 모두 필수로 요구하며,
  // 빌링키에 저장된 고객정보를 자동 사용하지 않는다. 빌링키 발급(requestIssueBillingKey)
  // 시 저장된 고객정보(특히 휴대폰)를 조회해 명시적으로 전달한다.
  let bkCustomer: { name?: string; email?: string; phoneNumber?: string } = {};
  let bkInfo: any = null;
  try {
    bkInfo = await PortOne.BillingKeyClient({ secret }).getBillingKeyInfo({ billingKey });
    bkCustomer = bkInfo?.customer ?? {};
  } catch {
    // 조회 실패 시 전달된 customer로 폴백
  }

  // H-1b 소유권 검증 (최초 구독 경로만). 빌링키 발급 시 checkout이 주입한
  // customData.userId가 호출자와 다르면(=타인 빌링키) 청구 거부.
  if (verifyOwnership) {
    let bkUserId: string | undefined;
    try {
      if (bkInfo?.customData) {
        const parsed = JSON.parse(bkInfo.customData);
        if (typeof parsed?.userId === "string") bkUserId = parsed.userId;
      }
    } catch {
      /* 파싱 실패 → 아래 DB 대조로 폴백 */
    }
    if (bkUserId && bkUserId !== userId) {
      console.warn("[billing-key] ownership mismatch — refusing charge", { userId });
      return { ok: false, code: "billing_key_not_owned", httpStatus: 403 };
    }
    // 방어적 2차 검증: 이 빌링키가 이미 다른 사용자의 구독에 바인딩돼 있으면 거부.
    // (customData가 비어 오는 PG를 대비 — customData 검증이 통과/불가한 경우에도 재사용 차단)
    try {
      const bound = await prisma.subscription.findFirst({
        where: { billingKey, NOT: { userId } },
        select: { userId: true },
      });
      if (bound) {
        console.warn("[billing-key] billingKey already bound to another user — refusing", { userId });
        return { ok: false, code: "billing_key_not_owned", httpStatus: 403 };
      }
    } catch {
      /* DB 조회 실패는 청구 진행을 막지 않음 (customData 검증이 1차 방어) */
    }
  }
  const custName = bkCustomer.name || customer?.fullName || customer?.email || "OriPics 구독자";
  const custEmail = bkCustomer.email || customer?.email || undefined;
  const custPhone = bkCustomer.phoneNumber || customer?.phoneNumber || undefined;

  try {
    await client.payWithBillingKey({
      paymentId,
      billingKey,
      orderName: PLAN_ORDER_NAMES[plan],
      amount: { total: amount },
      currency: "KRW",
      customer: {
        name: { full: custName },
        ...(custEmail ? { email: custEmail } : {}),
        ...(custPhone ? { phoneNumber: custPhone } : {}),
      },
      customData: JSON.stringify({ userId, plan }),
    });
  } catch (e: any) {
    // 이미 같은 paymentId로 청구된 경우(PaymentAlreadyPaid 등)는 검증·부여 단계에서
    // 멱등 처리되므로 통과시키고, 그 외 카드 거절 등은 실패로 반환.
    // PortOne server-sdk 에러는 구조화된 상세(e.data)를 담을 수 있어 함께 캡처.
    const raw = e?.data ?? e?.response?.data ?? e?.message ?? e;
    const msg = typeof raw === "string" ? raw : (() => { try { return JSON.stringify(raw); } catch { return String(raw); } })();
    const alreadyPaid = /already.?paid|이미.*결제|AlreadyPaid/i.test(msg);
    if (!alreadyPaid) {
      console.error("[billing-key charge failed]", { userId, paymentId, plan, errorName: e?.name, error: msg });
      return { ok: false, code: "billing_key_charge_failed", httpStatus: 402, detail: msg };
    }
  }

  // 청구 완료된 paymentId로 검증 + 멱등 부여 + billingKey 저장
  return verifyAndGrantSubscription({ paymentId, userId, plan, secret, billingKey });
}
