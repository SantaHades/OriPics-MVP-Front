// 파트너 릴레이 챌린지 (A-82) — DB 계층: 코드 발급·조회·참여·혜택 예약/정산·현황.
// 설계: docs/partner-relay-challenge-plan.md v0.2. 순수 규칙은 ./config.ts.
//
// 테이블(db_migrations/2026_09_10_partner_relay.sql): User.partner*, partner_referrals,
// partner_benefits, charge_intents, partner_milestones. 마이그레이션 미실행 환경에서는
// 대부분의 함수가 throw → 호출측은 best-effort(try/catch)로 감싼다.
import { createHash } from "crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  PARTNER,
  benefitExpiry,
  isPartnerAccount,
  joinWindowOpen,
  maskName,
  normalizePartnerCode,
  planBenefitApplication,
  type BenefitType,
  type ChargePlanResult,
} from "./config";

type Tx = Prisma.TransactionClient;

// ───────────────────────── 코드 ─────────────────────────

/** 파트너코드 보장 — 없으면 시퀀스에서 발급(멱등). 마이그레이션 전이면 throw. */
export async function ensurePartnerCode(userId: string, client: Tx | typeof prisma = prisma): Promise<string | null> {
  const u = await client.user.findUnique({ where: { id: userId }, select: { partnerCode: true } });
  if (!u) return null;
  if (u.partnerCode) return u.partnerCode;
  const rows = await client.$queryRaw<Array<{ partnerCode: string }>>`
    UPDATE public."User" SET "partnerCode" = nextval('public.partner_code_seq')::text
    WHERE id = ${userId} AND "partnerCode" IS NULL
    RETURNING "partnerCode"`;
  if (rows[0]?.partnerCode) return rows[0].partnerCode;
  const again = await client.user.findUnique({ where: { id: userId }, select: { partnerCode: true } });
  return again?.partnerCode ?? null;
}

export interface CodeLookup {
  ok: true;
  code: string;
  ownerId: string;
  ownerNameMasked: string;
}
export type CodeLookupError = "invalid_code" | "code_not_found";

export async function lookupPartnerCode(raw: unknown): Promise<CodeLookup | { ok: false; error: CodeLookupError }> {
  const code = normalizePartnerCode(raw);
  if (!code) return { ok: false, error: "invalid_code" };
  const owner = await prisma.user.findUnique({
    where: { partnerCode: code },
    select: { id: true, name: true, email: true },
  });
  if (!owner) return { ok: false, error: "code_not_found" };
  return {
    ok: true,
    code,
    ownerId: owner.id,
    ownerNameMasked: maskName(owner.name || owner.email?.split("@")[0]),
  };
}

// ───────────────────────── 가입 시각 ─────────────────────────

/** User에 createdAt이 없어 가입 보너스 TX(signup_grant) 시각을 가입 시각으로 사용 */
export async function getSignupAt(userId: string): Promise<Date | null> {
  const tx = await prisma.creditTransaction.findFirst({
    where: { userId, action: "signup_grant" },
    orderBy: { createdAt: "asc" },
    select: { createdAt: true },
  });
  return tx?.createdAt ?? null;
}

export function hashIp(ip: string | null | undefined): string | null {
  if (!ip) return null;
  return createHash("sha256").update(ip).digest("hex").slice(0, 16);
}

// ───────────────────────── 참여(코드 입력) ─────────────────────────

export type JoinError =
  | "invalid_code"
  | "code_not_found"
  | "self_code"
  | "already_joined"
  | "circular"
  | "window_expired"
  | "campaign_ended"
  | "user_not_found";

export interface JoinResult {
  ok: true;
  myCode: string | null;
  partnerRank: number | null;
  referrerNameMasked: string;
  /** 코드 주인에게 할인권이 적립됐는지(파트너 여부) */
  referrerRewarded: boolean;
  /** 이번 참여로 본인이 받은 할인권 수 */
  myCoupons: number;
}

/**
 * 코드 입력 → 참여 확정. §3.2·§3.3.
 *  - 계정당 1회, 자기 코드·순환 불가, 신규 7일/기존 회원 기간 중, 연말 이후 불가.
 *  - 500명 안이면 partnerRank 부여. 코드 주인이 파트너면 주인에게도 1장.
 * 반환 후 호출측이 이메일 발송(best-effort).
 */
export async function joinWithPartnerCode(opts: {
  userId: string;
  code: unknown;
  ip?: string | null;
}): Promise<JoinResult | { ok: false; error: JoinError }> {
  const look = await lookupPartnerCode(opts.code);
  if (!look.ok) return look;
  if (look.ownerId === opts.userId) return { ok: false, error: "self_code" };

  const me = await prisma.user.findUnique({
    where: { id: opts.userId },
    select: { id: true, referredById: true, partnerJoinedAt: true, partnerCode: true },
  });
  if (!me) return { ok: false, error: "user_not_found" };
  if (me.referredById || me.partnerJoinedAt) return { ok: false, error: "already_joined" };

  const owner = await prisma.user.findUnique({
    where: { id: look.ownerId },
    select: { id: true, referredById: true, partnerRank: true, partnerCode: true, email: true, name: true },
  });
  if (!owner) return { ok: false, error: "code_not_found" };
  if (owner.referredById === opts.userId) return { ok: false, error: "circular" };

  const now = new Date();
  if (now.getTime() > PARTNER.CAMPAIGN_END.getTime()) return { ok: false, error: "campaign_ended" };
  const signupAt = await getSignupAt(opts.userId);
  if (!joinWindowOpen(signupAt, now)) return { ok: false, error: "window_expired" };

  const ipHash = hashIp(opts.ip);
  const rewardOwner = isPartnerAccount(owner);
  const expires = benefitExpiry(now);

  const result = await prisma.$transaction(async (tx) => {
    // 500명 카운트는 전역 직렬화 (동시 참여 시 순번 중복 방지)
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('partner:join'))`;
    const fresh = await tx.user.findUnique({ where: { id: opts.userId }, select: { referredById: true } });
    if (fresh?.referredById) throw new Error("already_joined");

    const partners = await tx.user.count({ where: { partnerRank: { not: null } } });
    const rank = partners < PARTNER.CAP ? partners + 1 : null;

    // 24시간 내 같은 IP 참여 수 — 어뷰즈 플래그(차단은 아님, 어드민 검수용)
    let sameIp = 0;
    if (ipHash) {
      sameIp = await tx.partnerReferral.count({
        where: { ipHash, createdAt: { gte: new Date(now.getTime() - 86_400_000) } },
      });
    }
    const riskFlags: Record<string, unknown> = {};
    if (sameIp >= 2) riskFlags.same_ip_24h = sameIp + 1;

    await tx.user.update({
      where: { id: opts.userId },
      data: { referredById: owner.id, partnerJoinedAt: now, partnerRank: rank },
    });
    const myCode = await ensurePartnerCode(opts.userId, tx);

    const referral = await tx.partnerReferral.create({
      data: {
        referrerId: owner.id,
        refereeId: opts.userId,
        status: "confirmed",
        referrerRewarded: rewardOwner,
        ipHash,
        riskFlags: Object.keys(riskFlags).length ? (riskFlags as Prisma.InputJsonObject) : undefined,
      },
    });
    await tx.partnerBenefit.create({
      data: { userId: opts.userId, type: "pro_50", source: "signup", referralId: referral.id, expiresAt: expires },
    });
    if (rewardOwner) {
      await tx.partnerBenefit.create({
        data: { userId: owner.id, type: "pro_50", source: "referral", referralId: referral.id, expiresAt: expires },
      });
    }
    return { myCode, rank };
  });

  return {
    ok: true,
    myCode: result.myCode,
    partnerRank: result.rank,
    referrerNameMasked: look.ownerNameMasked,
    referrerRewarded: rewardOwner,
    myCoupons: 1,
  };
}

// ───────────────────────── 유효 초대·마일스톤 ─────────────────────────

/** 유효 초대 = confirmed 추천 중 피추천인이 사진 인증 1건 이상 완료 */
export async function listReferralsWithValidity(referrerId: string) {
  const refs = await prisma.partnerReferral.findMany({
    where: { referrerId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      status: true,
      referrerRewarded: true,
      createdAt: true,
      referee: { select: { id: true, name: true, email: true } },
    },
  });
  if (refs.length === 0) return [];
  const refereeIds = refs.map((r) => r.referee.id);
  const proofs = await prisma.creditTransaction.groupBy({
    by: ["userId"],
    where: { userId: { in: refereeIds }, action: { in: ["image_proof", "verified_proof"] } },
    _count: { _all: true },
  });
  const proofSet = new Set(proofs.map((p) => p.userId));
  return refs.map((r) => ({
    id: r.id,
    status: r.status,
    rewarded: r.referrerRewarded,
    joinedAt: r.createdAt,
    nameMasked: maskName(r.referee.name || r.referee.email?.split("@")[0]),
    valid: r.status === "confirmed" && proofSet.has(r.referee.id),
  }));
}

/**
 * 12명 도달 확인 — 도달 시 partner_milestones 행 생성(검수 대기). 지급은 어드민 approve.
 * 반환: 새로 도달했으면 true (호출측이 대표/운영자 알림 발송).
 */
export async function checkMilestoneReached(referrerId: string): Promise<boolean> {
  const existing = await prisma.partnerMilestone.findUnique({ where: { userId: referrerId }, select: { userId: true } });
  if (existing) return false;
  const owner = await prisma.user.findUnique({ where: { id: referrerId }, select: { partnerRank: true, partnerCode: true } });
  if (!owner || !isPartnerAccount(owner)) return false;
  const refs = await listReferralsWithValidity(referrerId);
  const valid = refs.filter((r) => r.valid).length;
  if (valid < PARTNER.MILESTONE_COUNT) return false;
  try {
    await prisma.partnerMilestone.create({ data: { userId: referrerId } });
    return true;
  } catch {
    return false; // 동시 생성 경합 — 이미 존재
  }
}

/** 어드민 승인 → 무료 이용권 6장 발급(멱등: approvedAt 있으면 스킵) */
export async function approveMilestone(userId: string, approvedBy: string): Promise<"granted" | "already" | "not_reached"> {
  const ms = await prisma.partnerMilestone.findUnique({ where: { userId } });
  if (!ms) return "not_reached";
  if (ms.approvedAt) return "already";
  const expires = benefitExpiry();
  await prisma.$transaction(async (tx) => {
    await tx.partnerMilestone.update({ where: { userId }, data: { approvedAt: new Date(), approvedBy, rejectedAt: null, rejectReason: null } });
    await tx.partnerBenefit.createMany({
      data: Array.from({ length: PARTNER.MILESTONE_FREE_MONTHS }, () => ({
        userId,
        type: "pro_free_month",
        source: "milestone_12",
        expiresAt: expires,
      })),
    });
  });
  return "granted";
}

// ───────────────────────── 혜택 예약·정산 (결제 연동) ─────────────────────────

async function usableBenefits(client: Tx | typeof prisma, userId: string, now: Date) {
  const rows = await client.partnerBenefit.findMany({
    where: { userId, status: "available", expiresAt: { gt: now } },
    select: { id: true, type: true, expiresAt: true },
  });
  return rows.map((r) => ({ id: r.id, type: r.type as BenefitType, expiresAt: r.expiresAt }));
}

/** 첫 Pro 결제 여부 — 유료 구독 부여 이력이 없고 2장 혜택 미사용 */
async function firstChargeBonusEligible(client: Tx | typeof prisma, userId: string): Promise<boolean> {
  const u = await client.user.findUnique({ where: { id: userId }, select: { firstChargeBonusUsedAt: true } });
  if (!u || u.firstChargeBonusUsedAt) return false;
  const paid = await client.creditTransaction.count({
    where: { userId, action: "subscription_grant" },
  });
  return paid === 0;
}

export interface ChargePreview extends ChargePlanResult {
  maxCoupons: 1 | 2;
  couponsAvailable: number;
  freeMonthsAvailable: number;
}

/** 청구 미리보기(쓰기 없음) — 체크아웃·프로필 '다음 결제 예상' */
export async function previewCharge(opts: {
  userId: string;
  listAmount: number;
  initialSubscription: boolean;
}): Promise<ChargePreview> {
  const now = new Date();
  const benefits = await usableBenefits(prisma, opts.userId, now);
  const maxCoupons: 1 | 2 = opts.initialSubscription && (await firstChargeBonusEligible(prisma, opts.userId)) ? 2 : 1;
  const plan = planBenefitApplication({ listAmount: opts.listAmount, benefits, maxCoupons, now });
  return {
    ...plan,
    maxCoupons,
    couponsAvailable: benefits.filter((b) => b.type === "pro_50").length,
    freeMonthsAvailable: benefits.filter((b) => b.type === "pro_free_month").length,
  };
}

export interface ReservedCharge extends ChargePlanResult {
  /** 이미 결제 완료된 의도(멱등 재호출) — 재청구하지 말고 부여 검증만 진행 */
  alreadyPaid: boolean;
}

/**
 * 청구 직전 혜택 예약 + charge_intents 기록(기대 금액). paymentId 단위 멱등:
 *  - paid → 그대로 반환(alreadyPaid)
 *  - pending/failed(이전 시도 실패·중단) → 예약 해제 후 재계획
 */
export async function reserveChargeBenefits(opts: {
  userId: string;
  plan: string;
  paymentId: string;
  listAmount: number;
  initialSubscription: boolean;
}): Promise<ReservedCharge> {
  const now = new Date();
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`partner:charge:${opts.userId}`}))`;
    const existing = await tx.chargeIntent.findUnique({ where: { paymentId: opts.paymentId } });
    if (existing?.status === "paid") {
      const ids = Array.isArray(existing.benefitIds) ? (existing.benefitIds as string[]) : [];
      return {
        alreadyPaid: true,
        expectedAmount: existing.expectedAmount,
        listAmount: existing.listAmount,
        discountAmount: existing.discountAmount,
        benefitIds: ids,
        couponsApplied: 0,
        freeMonthApplied: false,
      };
    }
    if (existing) {
      const ids = Array.isArray(existing.benefitIds) ? (existing.benefitIds as string[]) : [];
      if (ids.length) {
        await tx.partnerBenefit.updateMany({ where: { id: { in: ids }, status: "reserved" }, data: { status: "available" } });
      }
    }
    const benefits = await usableBenefits(tx, opts.userId, now);
    const maxCoupons: 1 | 2 = opts.initialSubscription && (await firstChargeBonusEligible(tx, opts.userId)) ? 2 : 1;
    const plan = planBenefitApplication({ listAmount: opts.listAmount, benefits, maxCoupons, now });
    if (plan.benefitIds.length) {
      await tx.partnerBenefit.updateMany({ where: { id: { in: plan.benefitIds }, status: "available" }, data: { status: "reserved" } });
    }
    await tx.chargeIntent.upsert({
      where: { paymentId: opts.paymentId },
      create: {
        paymentId: opts.paymentId,
        userId: opts.userId,
        plan: opts.plan,
        listAmount: plan.listAmount,
        discountAmount: plan.discountAmount,
        expectedAmount: plan.expectedAmount,
        benefitIds: plan.benefitIds,
        status: "pending",
      },
      update: {
        listAmount: plan.listAmount,
        discountAmount: plan.discountAmount,
        expectedAmount: plan.expectedAmount,
        benefitIds: plan.benefitIds,
        status: "pending",
      },
    });
    return { ...plan, alreadyPaid: false };
  });
}

/** 청구 실패 → 예약 해제 (best-effort) */
export async function releaseChargeBenefits(paymentId: string): Promise<void> {
  const intent = await prisma.chargeIntent.findUnique({ where: { paymentId } });
  if (!intent || intent.status === "paid") return;
  const ids = Array.isArray(intent.benefitIds) ? (intent.benefitIds as string[]) : [];
  await prisma.$transaction([
    prisma.partnerBenefit.updateMany({ where: { id: { in: ids }, status: "reserved" }, data: { status: "available" } }),
    prisma.chargeIntent.update({ where: { paymentId }, data: { status: "failed" } }),
  ]);
}

/** 기대 금액 조회 — 없으면 null(정가 검증으로 폴백) */
export async function getChargeIntent(paymentId: string) {
  try {
    return await prisma.chargeIntent.findUnique({ where: { paymentId } });
  } catch {
    return null;
  }
}

/**
 * 부여 성공 시 정산 — 같은 트랜잭션 안에서 호출. 의도 paid, 혜택 used, 2장 사용이면
 * firstChargeBonusUsedAt 기록. 의도가 없으면(정가 결제·마이그레이션 전) 무동작.
 */
export async function settleChargeBenefits(tx: Tx, paymentId: string, userId: string): Promise<void> {
  const intent = await tx.chargeIntent.findUnique({ where: { paymentId } });
  if (!intent || intent.status === "paid") return;
  const ids = Array.isArray(intent.benefitIds) ? (intent.benefitIds as string[]) : [];
  const now = new Date();
  if (ids.length) {
    await tx.partnerBenefit.updateMany({
      where: { id: { in: ids }, status: { in: ["reserved", "available"] } },
      data: { status: "used", usedAt: now, paymentId },
    });
    const coupons = await tx.partnerBenefit.count({ where: { id: { in: ids }, type: "pro_50" } });
    if (coupons >= 2) {
      await tx.user.update({ where: { id: userId }, data: { firstChargeBonusUsedAt: now } });
    }
  }
  await tx.chargeIntent.update({ where: { paymentId }, data: { status: "paid" } });
}

/** 전액 환불(청약철회) → 그 결제에 쓴 혜택 복원(만료 전 것만) */
export async function restoreBenefitsForRefund(paymentId: string): Promise<number> {
  try {
    const r = await prisma.partnerBenefit.updateMany({
      where: { paymentId, status: "used", expiresAt: { gt: new Date() } },
      data: { status: "available", usedAt: null, paymentId: null },
    });
    return r.count;
  } catch {
    return 0;
  }
}

// ───────────────────────── 현황(프로필·앱) ─────────────────────────

export async function partnerStats() {
  const partners = await prisma.user.count({ where: { partnerRank: { not: null } } });
  return {
    cap: PARTNER.CAP,
    partnersJoined: partners,
    remaining: Math.max(0, PARTNER.CAP - partners),
    campaignEnd: PARTNER.CAMPAIGN_END.toISOString(),
    campaignEnded: Date.now() > PARTNER.CAMPAIGN_END.getTime(),
    discountAmount: PARTNER.DISCOUNT_AMOUNT,
    milestoneCount: PARTNER.MILESTONE_COUNT,
    milestoneFreeMonths: PARTNER.MILESTONE_FREE_MONTHS,
    benefitValidMonths: PARTNER.BENEFIT_VALID_MONTHS,
  };
}

export async function getPartnerOverview(userId: string, opts: { listAmount: number }) {
  const code = await ensurePartnerCode(userId);
  const me = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      partnerCode: true,
      partnerRank: true,
      partnerJoinedAt: true,
      referredById: true,
      firstChargeBonusUsedAt: true,
      referredBy: { select: { name: true, email: true, partnerCode: true } },
      subscription: { select: { status: true, gateway: true, billingKey: true, currentPeriodEnd: true, cancelAtPeriodEnd: true } },
    },
  });
  if (!me) return null;
  const now = new Date();
  const signupAt = await getSignupAt(userId);
  const joined = !!(me.referredById || me.partnerJoinedAt);
  const windowOpen = joinWindowOpen(signupAt, now);
  const joinBlockedReason = joined
    ? "already_joined"
    : now.getTime() > PARTNER.CAMPAIGN_END.getTime()
      ? "campaign_ended"
      : !windowOpen
        ? "window_expired"
        : null;

  const [referrals, benefits, milestone, stats] = await Promise.all([
    listReferralsWithValidity(userId),
    prisma.partnerBenefit.findMany({
      where: { userId },
      orderBy: [{ status: "asc" }, { expiresAt: "asc" }],
      select: { id: true, type: true, source: true, status: true, issuedAt: true, expiresAt: true, usedAt: true, paymentId: true, revokedReason: true },
    }),
    prisma.partnerMilestone.findUnique({ where: { userId } }),
    partnerStats(),
  ]);
  const validCount = referrals.filter((r) => r.valid).length;
  // 마일스톤 도달 지연 확인(피추천인의 첫 인증은 나중에 발생) — 조회 시점에도 체크
  let milestoneRow = milestone;
  if (!milestoneRow && validCount >= PARTNER.MILESTONE_COUNT) {
    const reached = await checkMilestoneReached(userId);
    if (reached) milestoneRow = await prisma.partnerMilestone.findUnique({ where: { userId } });
  }

  const view = benefits.map((b) => ({
    ...b,
    // 만료는 지연 반영: available인데 만료일 지났으면 표시상 expired
    status: b.status === "available" && b.expiresAt.getTime() <= now.getTime() ? "expired" : b.status,
  }));
  const coupons = view.filter((b) => b.type === "pro_50" && b.status === "available");
  const freeMonths = view.filter((b) => b.type === "pro_free_month" && b.status === "available");

  // 사용 내역: 결제(paymentId)별 묶음 + 청구 의도 금액
  const usedPaymentIds = Array.from(new Set(view.filter((b) => b.status === "used" && b.paymentId).map((b) => b.paymentId as string)));
  const intents = usedPaymentIds.length
    ? await prisma.chargeIntent.findMany({ where: { paymentId: { in: usedPaymentIds } } })
    : [];
  const intentById = new Map(intents.map((i) => [i.paymentId, i]));
  const usage = usedPaymentIds
    .map((pid) => {
      const used = view.filter((b) => b.paymentId === pid && b.status === "used");
      const intent = intentById.get(pid);
      return {
        paymentId: pid,
        usedAt: used[0]?.usedAt ?? null,
        coupons: used.filter((b) => b.type === "pro_50").length,
        freeMonths: used.filter((b) => b.type === "pro_free_month").length,
        listAmount: intent?.listAmount ?? opts.listAmount,
        discountAmount: intent?.discountAmount ?? null,
        paidAmount: intent?.expectedAmount ?? null,
      };
    })
    .sort((a, b) => (b.usedAt?.getTime() ?? 0) - (a.usedAt?.getTime() ?? 0));

  const subActive = me.subscription?.status === "active";
  const nextCharge = await previewCharge({ userId, listAmount: opts.listAmount, initialSubscription: !subActive });

  return {
    code: code ?? me.partnerCode,
    isPartner: isPartnerAccount(me),
    partnerRank: me.partnerRank,
    joined: joined
      ? {
          at: me.partnerJoinedAt,
          referrerNameMasked: me.referredBy ? maskName(me.referredBy.name || me.referredBy.email?.split("@")[0]) : null,
          referrerCode: me.referredBy?.partnerCode ?? null,
        }
      : null,
    canJoin: !joinBlockedReason,
    joinBlockedReason,
    campaign: stats,
    referrals,
    validCount,
    milestone: milestoneRow
      ? {
          reachedAt: milestoneRow.reachedAt,
          status: milestoneRow.approvedAt ? "approved" : milestoneRow.rejectedAt ? "rejected" : "pending",
          approvedAt: milestoneRow.approvedAt,
        }
      : null,
    benefits: {
      coupons: coupons.length,
      couponsNearestExpiry: coupons[0]?.expiresAt ?? null,
      freeMonths: freeMonths.length,
      list: view,
    },
    usage,
    nextCharge: {
      ...nextCharge,
      subscriptionActive: subActive,
      nextBillingAt: subActive && !me.subscription?.cancelAtPeriodEnd ? me.subscription?.currentPeriodEnd ?? null : null,
    },
  };
}
