import * as PortOne from "@portone/server-sdk";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { PLAN_GRANTS } from "@/lib/payment";
import {
  getChargeIntent,
  releaseChargeBenefits,
  reserveChargeBenefits,
  settleChargeBenefits,
} from "@/lib/partner/server";

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
 *
 * 파트너 릴레이 챌린지 (A-82, 2026-09-10): 청구 금액은 정가 고정이 아니라
 * charge_intents(paymentId → 기대 금액·적용 혜택)를 따른다. 할인권 2장/무료 이용권으로
 * 기대 금액이 0원이면 PG 호출 없이 주기를 부여한다(카드=빌링키 등록은 필수).
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

/** 파트너 할인 적용 시 나올 수 있는 결제 금액(정가·50% 할인) — 금액 역추론 폴백용 */
const PLAN_AMOUNTS_ACCEPTED: Record<PlanId, number[]> = {
  pro_monthly: [9900, 4950],
};

export function isPlanId(v: unknown): v is PlanId {
  return typeof v === "string" && v in PLAN_PRICES;
}

/** 금액으로 plan 역추론 (customData 누락 시 폴백). 할인 금액(4,950)도 pro_monthly로 인식. */
export function planFromAmount(amount: unknown): PlanId | null {
  for (const [plan, amounts] of Object.entries(PLAN_AMOUNTS_ACCEPTED)) {
    if (amounts.includes(amount as number)) return plan as PlanId;
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
      /** 실제 청구액 (0 = 혜택으로 무료 처리, PG 미호출) */
      amountCharged?: number;
      listAmount?: number;
      discountAmount?: number;
      benefitIds?: string[];
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
        | "billing_key_charge_failed"
        /** 0원 주기인데 빌링키 조회 실패·삭제됨·결제수단 없음 (2026-09-11 A-91 ②, 402) */
        | "billing_key_invalid";
      httpStatus: number;
      detail?: any;
    };

/**
 * 부여 실패 시 예약 혜택을 해제할 코드 (2026-09-11 A-91 ③).
 *  - portone_lookup_failed / payment_not_paid / db_update_failed: 이 요청에서는 부여가 끝나지 않았다. 해제해 두면
 *    할인권이 `reserved` 로 고착되지 않고, 혹시 결제가 실제로 승인돼 webhook 이 뒤늦게 부여하더라도
 *    settleChargeBenefits 가 `failed` 의도도 정산(available→used)하므로 이중 부여·유실이 없다.
 *  - amount_mismatch / ownership_mismatch 는 제외: 결제 자체는 PAID 이고 의도 금액·소유권 대조에서 걸린 상태라
 *    webhook(같은 의도 금액으로 재검증)이 정상 부여할 수 있다. 여기서 풀면 그 사이 다른 청구에 잡혀 이중 할인이 된다.
 */
const RELEASE_ON_GRANT_FAIL = new Set<string>(["portone_lookup_failed", "payment_not_paid", "db_update_failed"]);

/**
 * (2026-09-11 A-91 ②) 0원 주기 카드 검증 — 기획 §2-5 "첫 달 0원도 카드(빌링키) 등록 필수".
 * PortOne 빌링키 조회가 성공하고(status=ISSUED) 결제수단(methods: 카드/간편결제 등)이 1개 이상이어야 한다.
 * 반환: 문제 없으면 null, 아니면 사유 문자열(응답 detail).
 */
export function billingKeyUnusableReason(bkInfo: any, lookupError: string | null): string | null {
  if (!bkInfo) return lookupError ? `lookup_failed:${lookupError}` : "lookup_empty";
  if (bkInfo.status && bkInfo.status !== "ISSUED") return `status:${bkInfo.status}`;
  const methods: any[] = Array.isArray(bkInfo.methods) ? bkInfo.methods : [];
  const usable = methods.some(
    (m) =>
      typeof m?.type === "string" &&
      m.type.startsWith("BillingKeyPaymentMethod") &&
      (m.type !== "BillingKeyPaymentMethodCard" || !!m.card),
  );
  return usable ? null : "no_payment_method";
}

/**
 * 구독·크레딧 부여 트랜잭션 본체 — advisory lock·멱등 확인은 호출측(트랜잭션 안)에서 한다.
 * 결제 검증 경로(verifyAndGrantSubscription)와 0원 부여 경로가 공유.
 */
async function grantSubscriptionTx(
  tx: Prisma.TransactionClient,
  opts: {
    userId: string;
    plan: PlanId;
    paymentId: string;
    billingKey?: string;
    paidAmount: number;
    pgProvider: string;
    intent?: { listAmount: number; discountAmount: number; benefitIds: string[] } | null;
  },
): Promise<number> {
  const { userId, plan, paymentId, billingKey, paidAmount, pgProvider, intent } = opts;
  const grant = PLAN_GRANTS[plan] ?? 0;

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
  const prev = await tx.user.findUnique({ where: { id: userId }, select: { credits: true } });
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
        ...(intent
          ? { list_amount: intent.listAmount, discount_amount: intent.discountAmount, benefit_ids: intent.benefitIds }
          : {}),
      },
    },
  });

  // 보관함 활성화: 아직 살아있는 링크의 만료를 해제(무기한 보관 전환).
  // 재구독 시 다운그레이드 grace 만료 복원 + 기존 free 링크도 보관함에 편입.
  await tx.$executeRaw`
    UPDATE public.links
    SET expires_at = NULL
    WHERE user_id = ${userId} AND expires_at > now()`;

  // 파트너 혜택 정산(의도 없으면 무동작)
  try {
    await settleChargeBenefits(tx, paymentId, userId);
  } catch (e: any) {
    // 마이그레이션 전 환경 등 — 정산 실패가 부여를 막지 않도록 로그만
    console.warn("[subscriptionGrant] settleChargeBenefits skipped", { paymentId, error: e?.message ?? e });
  }

  return grant;
}

/**
 * paymentId를 PortOne에 재질의해 PAID·금액을 검증한 뒤, 멱등적으로 구독·크레딧 부여.
 * 클라이언트가 보낸 금액은 신뢰하지 않고 PortOne 기록을 source of truth로 사용.
 * 기대 금액은 charge_intents(할인 적용) → 없으면 정가.
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
  const intent = await getChargeIntent(paymentId);
  const expectedAmount = intent && intent.userId === userId ? intent.expectedAmount : PLAN_PRICES[plan];

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
  const intentMeta = intent
    ? { listAmount: intent.listAmount, discountAmount: intent.discountAmount, benefitIds: Array.isArray(intent.benefitIds) ? (intent.benefitIds as string[]) : [] }
    : null;

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
          amountCharged: paidAmount,
          listAmount: intentMeta?.listAmount ?? PLAN_PRICES[plan],
          discountAmount: intentMeta?.discountAmount ?? 0,
          benefitIds: intentMeta?.benefitIds ?? [],
        };
      }

      const granted = await grantSubscriptionTx(tx, {
        userId,
        plan,
        paymentId,
        billingKey,
        paidAmount,
        pgProvider,
        intent: intentMeta,
      });

      return {
        ok: true as const,
        alreadyProcessed: false,
        granted,
        plan,
        pgProvider,
        amountCharged: paidAmount,
        listAmount: intentMeta?.listAmount ?? PLAN_PRICES[plan],
        discountAmount: intentMeta?.discountAmount ?? 0,
        benefitIds: intentMeta?.benefitIds ?? [],
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
 * 혜택으로 기대 금액이 0원인 주기 — PG 호출 없이 멱등 부여. 빌링키는 반드시 저장(다음 달 청구).
 */
async function grantWithoutCharge(opts: {
  paymentId: string;
  userId: string;
  plan: PlanId;
  billingKey: string;
  intent: { listAmount: number; discountAmount: number; benefitIds: string[] };
}): Promise<GrantResult> {
  const { paymentId, userId, plan, billingKey, intent } = opts;
  try {
    return await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`portone:grant:${paymentId}`}))`;
      const existing = await tx.creditTransaction.findFirst({
        where: { userId, action: "subscription_grant", metadata: { path: ["paymentId"], equals: paymentId } },
        select: { id: true },
      });
      if (existing) {
        await tx.subscription.updateMany({ where: { userId }, data: { billingKey } });
        return {
          ok: true as const,
          alreadyProcessed: true,
          granted: 0,
          plan,
          pgProvider: "partner_benefit",
          amountCharged: 0,
          listAmount: intent.listAmount,
          discountAmount: intent.discountAmount,
          benefitIds: intent.benefitIds,
        };
      }
      const granted = await grantSubscriptionTx(tx, {
        userId,
        plan,
        paymentId,
        billingKey,
        paidAmount: 0,
        pgProvider: "partner_benefit",
        intent,
      });
      return {
        ok: true as const,
        alreadyProcessed: false,
        granted,
        plan,
        pgProvider: "partner_benefit",
        amountCharged: 0,
        listAmount: intent.listAmount,
        discountAmount: intent.discountAmount,
        benefitIds: intent.benefitIds,
      };
    });
  } catch (e: any) {
    console.error("[subscriptionGrant] zero-amount grant failed", { userId, paymentId, error: e?.message });
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
 *
 * 파트너 혜택: 청구 직전 reserveChargeBenefits로 할인권/무료 이용권을 예약해 기대 금액을
 * 정하고(최초 구독은 최대 2장, 갱신은 1장), 0원이면 PG 호출을 생략한다. 카드 거절 시 예약 해제.
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
  const listAmount = PLAN_PRICES[plan];
  const paymentId =
    opts.paymentId ??
    `bk-${String(userId).slice(-8)}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const client = PortOne.PaymentClient({ secret });

  // INICIS payWithBillingKey는 customer.name/email/phoneNumber를 모두 필수로 요구하며,
  // 빌링키에 저장된 고객정보를 자동 사용하지 않는다. 빌링키 발급(requestIssueBillingKey)
  // 시 저장된 고객정보(특히 휴대폰)를 조회해 명시적으로 전달한다.
  let bkCustomer: { name?: string; email?: string; phoneNumber?: string } = {};
  let bkInfo: any = null;
  let bkLookupError: string | null = null;
  try {
    bkInfo = await PortOne.BillingKeyClient({ secret }).getBillingKeyInfo({ billingKey });
    bkCustomer = bkInfo?.customer ?? {};
  } catch (e: any) {
    // 조회 실패 시 전달된 customer로 폴백 (유료 청구는 PG가 빌링키를 검증). 0원 주기는 아래에서 실패로 처리 (A-91 ②)
    bkLookupError = String(e?.message ?? e);
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

  // 파트너 혜택 예약 → 기대 금액. 테이블 미존재(마이그레이션 전) 등 실패 시 정가로 진행.
  let amount = listAmount;
  let reserved: Awaited<ReturnType<typeof reserveChargeBenefits>> | null = null;
  try {
    reserved = await reserveChargeBenefits({
      userId,
      plan,
      paymentId,
      listAmount,
      initialSubscription: !!verifyOwnership,
    });
    amount = reserved.expectedAmount;
  } catch (e: any) {
    console.warn("[subscriptionGrant] benefit reservation skipped (list price)", { userId, paymentId, error: e?.message ?? e });
  }

  if (reserved && !reserved.alreadyPaid && amount === 0) {
    // 0원 주기 — PG 호출이 없으므로 여기서 카드(빌링키)를 직접 검증한다 (2026-09-11 A-91 ②).
    // 조회 실패·삭제된 키·결제수단 없음이면 위조 빌링키 문자열로 결제 없이 Pro 를 받을 수 있으므로 402 + 예약 해제.
    // (소유권 customData 검증은 위 verifyOwnership 블록에서 그대로 수행됨)
    const unusable = billingKeyUnusableReason(bkInfo, bkLookupError);
    if (unusable) {
      console.warn("[subscriptionGrant] zero-amount cycle refused — billing key unusable", { userId, paymentId, reason: unusable });
      try {
        await releaseChargeBenefits(paymentId);
      } catch (re: any) {
        console.warn("[subscriptionGrant] benefit release failed", { paymentId, error: re?.message ?? re });
      }
      return { ok: false, code: "billing_key_invalid", httpStatus: 402, detail: unusable };
    }
    // 부여 (빌링키 저장 포함)
    return grantWithoutCharge({
      paymentId,
      userId,
      plan,
      billingKey,
      intent: { listAmount: reserved.listAmount, discountAmount: reserved.discountAmount, benefitIds: reserved.benefitIds },
    });
  }
  if (reserved?.alreadyPaid && reserved.expectedAmount === 0) {
    // 같은 paymentId로 이미 0원 처리됨(멱등 재호출)
    return grantWithoutCharge({
      paymentId,
      userId,
      plan,
      billingKey,
      intent: { listAmount: reserved.listAmount, discountAmount: reserved.discountAmount, benefitIds: reserved.benefitIds },
    });
  }

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
      customData: JSON.stringify({ userId, plan, expectedAmount: amount }),
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
      if (reserved && !reserved.alreadyPaid) {
        try {
          await releaseChargeBenefits(paymentId);
        } catch (re: any) {
          console.warn("[subscriptionGrant] benefit release failed", { paymentId, error: re?.message ?? re });
        }
      }
      return { ok: false, code: "billing_key_charge_failed", httpStatus: 402, detail: msg };
    }
  }

  // 청구 완료된 paymentId로 검증 + 멱등 부여 + billingKey 저장
  const result = await verifyAndGrantSubscription({ paymentId, userId, plan, secret, billingKey });
  // (2026-09-11 A-91 ③) PG 승인 뒤 부여가 실패하면 예약 혜택 해제 — 최초 구독(랜덤 paymentId)·renew_now(날짜 id)는
  // 재시도 시 다른/같은 id로 다시 예약하므로 여기서 풀지 않으면 `reserved` 가 영구 고착된다. 제외 코드는 RELEASE_ON_GRANT_FAIL 주석 참고.
  if (!result.ok && reserved && !reserved.alreadyPaid && RELEASE_ON_GRANT_FAIL.has(result.code)) {
    try {
      await releaseChargeBenefits(paymentId);
    } catch (re: any) {
      console.warn("[subscriptionGrant] benefit release after grant failure failed", { paymentId, code: result.code, error: re?.message ?? re });
    }
  }
  return result;
}
