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
  normalizeEmailForLedger,
  normalizePartnerCode,
  planBenefitApplication,
  validityDeadline,
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
/**
 * self_code: 조회자 본인의 코드 (viewerId 전달 시) · owner_gone: 코드 주인이 탈퇴한 코드 (2026-09-11 A-93 §3.1).
 * 탈퇴 판정: User 삭제로 코드가 사라지므로, 참여 원장(partner_join_ledger.referrer_code)에 그 코드로 참여한 기록이
 * 남아 있으면 '한때 존재했다가 사라진 코드'로 본다(원장은 FK 없이 영구 보관).
 */
export type CodeLookupError = "invalid_code" | "code_not_found" | "self_code" | "owner_gone";

export async function lookupPartnerCode(
  raw: unknown,
  opts: { viewerId?: string | null } = {},
): Promise<CodeLookup | { ok: false; error: CodeLookupError }> {
  const code = normalizePartnerCode(raw);
  if (!code) return { ok: false, error: "invalid_code" };
  const owner = await prisma.user.findUnique({
    where: { partnerCode: code },
    select: { id: true, name: true, email: true },
  });
  if (!owner) {
    const gone = await prisma.partnerJoinLedger.findFirst({ where: { referrerCode: code }, select: { emailHash: true } }).catch(() => null);
    return { ok: false, error: gone ? "owner_gone" : "code_not_found" };
  }
  if (opts.viewerId && owner.id === opts.viewerId) return { ok: false, error: "self_code" };
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

/**
 * 참여 원장 키 — sha256(normalizeEmailForLedger(email)) hex (2026-09-11 A-91 ⑤: gmail 점·`+tag` 별칭 정규화).
 * 정규화가 무의미한 이메일(별칭 없음)은 기존 lower(trim()) 해시와 동일 값이 나온다.
 */
export function hashEmail(email: string): string {
  return createHash("sha256").update(normalizeEmailForLedger(email), "utf8").digest("hex");
}

/** 기존 원장 키 — sha256(lower(trim(email))). 09/10 SQL 백필과 동일. 백필 전 조회 호환용 */
export function hashEmailLegacy(email: string): string {
  return createHash("sha256").update(email.trim().toLowerCase(), "utf8").digest("hex");
}

/** 원장 조회 — 정규화 해시 → 없으면 레거시 해시 (2026-09-11 A-91 ⑤) */
async function findJoinLedger(email: string) {
  const norm = hashEmail(email);
  const legacy = hashEmailLegacy(email);
  const keys = norm === legacy ? [norm] : [norm, legacy];
  const rows = await prisma.partnerJoinLedger.findMany({ where: { emailHash: { in: keys } } });
  return rows.find((r) => r.emailHash === norm) ?? rows[0] ?? null;
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
  | "email_already_joined"
  | "owner_gone"
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
  const look = await lookupPartnerCode(opts.code, { viewerId: opts.userId });
  if (!look.ok) return look;
  if (look.ownerId === opts.userId) return { ok: false, error: "self_code" };

  const me = await prisma.user.findUnique({
    where: { id: opts.userId },
    select: { id: true, email: true, referredById: true, partnerJoinedAt: true, partnerCode: true },
  });
  if (!me) return { ok: false, error: "user_not_found" };
  if (me.referredById || me.partnerJoinedAt) return { ok: false, error: "already_joined" };

  // 탈퇴·재가입 반복 차단 (2026-09-10 대표 확정): 이메일당 평생 1회. 원장은 User 삭제와 무관하게 남는다.
  // 어떤 코드를 넣든(다른 파트너 코드 포함) 거절 — 양쪽 모두 미지급. 시도 횟수는 어뷰즈 플래그로 기록.
  // (2026-09-11 A-91 ⑤) 조회는 정규화 해시+레거시 해시 둘 다, 기록은 정규화 해시로.
  const emailHash = me.email ? hashEmail(me.email) : null;
  if (me.email) {
    const prior = await findJoinLedger(me.email);
    if (prior && prior.firstUserId !== opts.userId) {
      await prisma.partnerJoinLedger
        .update({ where: { emailHash: prior.emailHash }, data: { rejoinAttempts: { increment: 1 }, lastAttemptAt: new Date() } })
        .catch(() => {});
      return { ok: false, error: "email_already_joined" };
    }
  }

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

    // 좌석(500명)은 현재 파트너 수로, 순번은 max+1 로 — 어드민 revoke_referral(free_seat)로 좌석이 회수되면
    // 인원은 줄지만 기존 순번과 겹치지 않게 다음 번호를 준다 (2026-09-11 A-93 §5)
    const partners = await tx.user.count({ where: { partnerRank: { not: null } } });
    const maxRank = partners > 0 ? (await tx.user.aggregate({ _max: { partnerRank: true } }))._max.partnerRank ?? 0 : 0;
    const rank = partners < PARTNER.CAP ? Math.max(partners, maxRank) + 1 : null;

    // 이전 참여가 어드민에 의해 무효화(revoked)돼 좌석이 회수된 계정의 재참여: referee_id UNIQUE 이므로 옛 행 제거
    // (그 행에 매인 혜택은 이미 revoked 상태, referral_id 만 NULL 로 풀림)
    await tx.partnerReferral.deleteMany({ where: { refereeId: opts.userId, status: "revoked" } });

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

    if (emailHash) {
      await tx.partnerJoinLedger.upsert({
        where: { emailHash },
        create: { emailHash, firstUserId: opts.userId, referrerId: owner.id, referrerCode: look.code, joinedAt: now },
        update: {},
      });
    }

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

export interface ReferralValidity {
  id: string;
  status: string;
  rewarded: boolean;
  joinedAt: Date;
  nameMasked: string;
  valid: boolean;
}

/**
 * 유효 초대 = confirmed 추천 중 피추천인이 사진 인증 1건 이상 완료.
 *  - 첫 인증은 챌린지 종료 +30일까지 인정.
 *  - (2026-09-11 A-93) 피추천인의 **첫 인증(가장 이른 인증)** 이 참여(추천 생성) 시각 이후여야 한다 — 이미 활동하던
 *    기존 회원 12명이 코드만 입력해 즉시 달성하는 것을 막는다. 참여 전에 이미 인증한 계정은 유효 초대로 세지 않는다.
 *  - 이메일 인증: 이메일 가입은 인증 코드 확인 뒤에만 계정이 생성되고(register), 소셜은 provider가 검증하므로
 *    `emailVerified IS NOT NULL` 을 추가로 요구하지 않는다(레거시·소셜 계정은 컬럼이 비어 있음).
 * 여러 파트너를 한 번에 집계(어드민 목록 N+1 제거)하려면 listReferralsWithValidityBulk.
 */
export async function listReferralsWithValidityBulk(referrerIds: string[]): Promise<Map<string, ReferralValidity[]>> {
  const out = new Map<string, ReferralValidity[]>();
  if (referrerIds.length === 0) return out;
  for (const id of referrerIds) out.set(id, []);
  const refs = await prisma.partnerReferral.findMany({
    where: { referrerId: { in: referrerIds } },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      referrerId: true,
      status: true,
      referrerRewarded: true,
      createdAt: true,
      referee: { select: { id: true, name: true, email: true } },
    },
  });
  if (refs.length === 0) return out;
  const refereeIds = Array.from(new Set(refs.map((r) => r.referee.id)));
  const proofs = await prisma.creditTransaction.groupBy({
    by: ["userId"],
    where: {
      userId: { in: refereeIds },
      action: { in: ["image_proof", "verified_proof"] },
    },
    _min: { createdAt: true },
  });
  const firstProofAt = new Map(proofs.map((p) => [p.userId, p._min.createdAt]));
  const deadline = validityDeadline().getTime();
  for (const r of refs) {
    const first = firstProofAt.get(r.referee.id);
    const valid =
      r.status === "confirmed" &&
      !!first &&
      first.getTime() >= r.createdAt.getTime() &&
      first.getTime() <= deadline;
    out.get(r.referrerId)!.push({
      id: r.id,
      status: r.status,
      rewarded: r.referrerRewarded,
      joinedAt: r.createdAt,
      nameMasked: maskName(r.referee.name || r.referee.email?.split("@")[0]),
      valid,
    });
  }
  return out;
}

export async function listReferralsWithValidity(referrerId: string): Promise<ReferralValidity[]> {
  const m = await listReferralsWithValidityBulk([referrerId]);
  return m.get(referrerId) ?? [];
}

export interface MilestoneCheck {
  /** 이번 호출에서 행을 새로 만들었는지 */
  created: boolean;
  /** 현재 마일스톤 행(도달하지 않았으면 null) */
  row: Awaited<ReturnType<typeof prisma.partnerMilestone.findUnique>>;
}

/**
 * 12명 도달 확인 — 도달 시 partner_milestones 행 생성(검수 대기). 지급은 어드민 approve.
 * (2026-09-11 A-91 ①) 반환을 `{ created, row }` 로 바꿈. 알림 발송 여부는 누가 행을 만들었는지가 아니라
 * `row.notifiedAt IS NULL` 로 판단한다(notify.ts notifyMilestoneIfReached) — getPartnerOverview가 먼저 행을 만들어도
 * /api/partner/me·cron의 알림이 유실되지 않는다.
 */
export async function checkMilestoneReached(referrerId: string): Promise<MilestoneCheck> {
  const existing = await prisma.partnerMilestone.findUnique({ where: { userId: referrerId } });
  if (existing) return { created: false, row: existing };
  const owner = await prisma.user.findUnique({ where: { id: referrerId }, select: { partnerRank: true, partnerCode: true } });
  if (!owner || !isPartnerAccount(owner)) return { created: false, row: null };
  const refs = await listReferralsWithValidity(referrerId);
  const valid = refs.filter((r) => r.valid).length;
  if (valid < PARTNER.MILESTONE_COUNT) return { created: false, row: null };
  try {
    const row = await prisma.partnerMilestone.create({ data: { userId: referrerId } });
    return { created: true, row };
  } catch {
    // 동시 생성 경합 — 이미 존재
    const row = await prisma.partnerMilestone.findUnique({ where: { userId: referrerId } });
    return { created: false, row };
  }
}

/**
 * 어드민 승인 → 무료 이용권 6장 발급.
 * (2026-09-11 A-91 ④) 확인·발급을 분리하지 않고 `updateMany({ approvedAt: null })` 조건부 갱신이 정확히 1행일 때만
 * 같은 트랜잭션에서 발급 — 더블클릭·동시 요청에도 6장만 나간다.
 */
export async function approveMilestone(userId: string, approvedBy: string): Promise<"granted" | "already" | "not_reached"> {
  const ms = await prisma.partnerMilestone.findUnique({ where: { userId }, select: { approvedAt: true } });
  if (!ms) return "not_reached";
  if (ms.approvedAt) return "already";
  const expires = benefitExpiry();
  return prisma.$transaction(async (tx) => {
    const claimed = await tx.partnerMilestone.updateMany({
      where: { userId, approvedAt: null },
      data: { approvedAt: new Date(), approvedBy, rejectedAt: null, rejectReason: null },
    });
    if (claimed.count !== 1) return "already" as const;
    await tx.partnerBenefit.createMany({
      data: Array.from({ length: PARTNER.MILESTONE_FREE_MONTHS }, () => ({
        userId,
        type: "pro_free_month",
        source: "milestone_12",
        expiresAt: expires,
      })),
    });
    return "granted" as const;
  });
}

/**
 * (2026-09-11 A-91 ⑥) 피추천인 탈퇴 시 추천인에게 적립된 미사용 할인권 회수 — 탈퇴 파밍 방지.
 * User 삭제 **직전**에 호출해야 한다(삭제되면 partner_referrals가 cascade로 사라지고 partner_benefits.referral_id는 NULL이 돼
 * 연결을 잃는다). 보수적 기준:
 *  - 추천 생성 30일 미만 **또는** 피추천인이 참여 이후 첫 인증을 한 번도 하지 않은 경우에만 회수
 *  - 대상은 그 추천(referral_id)으로 **추천인**에게 발급된 `available` 혜택만. 이미 `used`·`reserved`(결제 진행 중)는 건드리지 않음
 *  - 피추천인 본인 혜택은 계정과 함께 cascade 삭제되므로 별도 처리 없음
 * 반환: 회수한 장수. 마이그레이션 전·오류 시 0 (best-effort).
 */
export async function revokeReferrerBenefitsOnRefereeDelete(refereeId: string): Promise<number> {
  try {
    const ref = await prisma.partnerReferral.findUnique({
      where: { refereeId },
      select: { id: true, referrerId: true, createdAt: true, status: true },
    });
    if (!ref || ref.status !== "confirmed") return 0;
    const ageMs = Date.now() - ref.createdAt.getTime();
    const young = ageMs < 30 * 86_400_000;
    let certified = false;
    if (!young) {
      const proof = await prisma.creditTransaction.findFirst({
        where: { userId: refereeId, action: { in: ["image_proof", "verified_proof"] }, createdAt: { gte: ref.createdAt } },
        select: { id: true },
      });
      certified = !!proof;
    }
    if (!young && certified) return 0;
    const r = await prisma.partnerBenefit.updateMany({
      where: { referralId: ref.id, userId: ref.referrerId, status: "available" },
      data: { status: "revoked", revokedReason: young ? "referee_withdrawn_30d" : "referee_withdrawn_uncertified" },
    });
    return r.count;
  } catch (e: any) {
    console.warn("[partner] revokeReferrerBenefitsOnRefereeDelete skipped", { refereeId, error: e?.message ?? e });
    return 0;
  }
}

// ───────────────────────── 어드민 감사 기록 ─────────────────────────

/**
 * (2026-09-11 A-93) 어드민 조치 실행자 기록 — `meta JSONB` 컬럼(db_migrations/2026_09_11_partner_fixes.sql)에 병합.
 * 컬럼은 Prisma 스키마에 넣지 않고(마이그레이션 전 모든 조회가 깨지는 것을 피함) raw UPDATE 로만 쓰며,
 * 컬럼이 없으면 조용히 건너뛴다. 실행자는 사유 텍스트(`... (by admin@x)`)에도 남겨 마이그레이션 전에도 추적 가능.
 */
export async function recordPartnerAudit(
  client: Tx | typeof prisma,
  target: { table: "partner_referrals" | "partner_benefits"; id: string } | { table: "partner_milestones"; userId: string },
  patch: Record<string, unknown>,
): Promise<boolean> {
  const json = JSON.stringify(patch);
  try {
    if (target.table === "partner_milestones") {
      await client.$executeRaw`UPDATE public.partner_milestones SET meta = COALESCE(meta, '{}'::jsonb) || ${json}::jsonb WHERE user_id = ${target.userId}`;
    } else if (target.table === "partner_referrals") {
      await client.$executeRaw`UPDATE public.partner_referrals SET meta = COALESCE(meta, '{}'::jsonb) || ${json}::jsonb WHERE id = ${target.id}`;
    } else {
      await client.$executeRaw`UPDATE public.partner_benefits SET meta = COALESCE(meta, '{}'::jsonb) || ${json}::jsonb WHERE id = ${target.id}`;
    }
    return true;
  } catch {
    return false; // meta 컬럼 미적용 환경
  }
}

/** 사유 텍스트에 실행자 표기 — "reason (by admin@x)" (300자 컷) */
export function withActor(reason: string | null | undefined, actorEmail: string): string {
  const base = (reason ?? "").trim() || "admin";
  return `${base} (by ${actorEmail})`.slice(0, 300);
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

/** charge_intents.status 값 — pending | paid | failed | expired(2026-09-11 A-91 ③ 스윕) */
export const CHARGE_INTENT_STATUS = {
  PENDING: "pending",
  PAID: "paid",
  FAILED: "failed",
  EXPIRED: "expired",
} as const;

/**
 * (2026-09-11 A-91 ③) 장기 `pending` 의도 스윕 — 청구 도중 프로세스가 죽거나 부여 실패 분기를 타지 못해
 * `reserved` 로 고착된 혜택을 풀어 준다. 기준: 마지막 갱신(updated_at) 2시간 경과(정상 청구는 수 초 안에 paid/failed 확정).
 * 예약 혜택 → available, 의도 → expired. 이후 같은 paymentId로 재시도하면 reserveChargeBenefits가 재계획한다(pending 재설정).
 * 반환: 만료 처리한 의도 수.
 */
export async function expireStaleChargeIntents(opts: { olderThanMs?: number; limit?: number } = {}): Promise<number> {
  const cutoff = new Date(Date.now() - (opts.olderThanMs ?? 2 * 3_600_000));
  const stale = await prisma.chargeIntent.findMany({
    where: { status: CHARGE_INTENT_STATUS.PENDING, updatedAt: { lt: cutoff } },
    select: { paymentId: true, benefitIds: true },
    take: opts.limit ?? 200,
  });
  let n = 0;
  for (const it of stale) {
    const ids = Array.isArray(it.benefitIds) ? (it.benefitIds as string[]) : [];
    await prisma.$transaction([
      prisma.partnerBenefit.updateMany({ where: { id: { in: ids }, status: "reserved" }, data: { status: "available" } }),
      // 그 사이 paid 로 바뀐 의도는 건드리지 않음(조건부)
      prisma.chargeIntent.updateMany({
        where: { paymentId: it.paymentId, status: CHARGE_INTENT_STATUS.PENDING },
        data: { status: CHARGE_INTENT_STATUS.EXPIRED },
      }),
    ]);
    n++;
  }
  return n;
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
    /** (2026-09-11 A-94 ③) 랜딩 '잔여 좌석' 명시 필드 — remaining 과 동일 값(500 − 참여 파트너) */
    remainingSeats: Math.max(0, PARTNER.CAP - partners),
    campaignEnd: PARTNER.CAMPAIGN_END.toISOString(),
    campaignEnded: Date.now() > PARTNER.CAMPAIGN_END.getTime(),
    discountAmount: PARTNER.DISCOUNT_AMOUNT,
    milestoneCount: PARTNER.MILESTONE_COUNT,
    milestoneFreeMonths: PARTNER.MILESTONE_FREE_MONTHS,
    benefitValidMonths: PARTNER.BENEFIT_VALID_MONTHS,
  };
}

export interface LeaderboardEntry {
  rank: number;
  /** maskName 적용 — "손*석" */
  nameMasked: string;
  validCount: number;
  totalCount: number;
}

/**
 * 마스킹 리더보드 (2026-09-11 A-94 ③) — 유효 초대(가입 후 첫 인증 완료) 수 상위 N 명. 동률은 가입 수 → id 순.
 * confirmed 추천이 1건 이상인 추천인만. 이름은 maskName(없으면 이메일 로컬파트). 호출측(/api/partner/stats)이 5분 캐시.
 */
export async function partnerLeaderboard(limit = 10): Promise<LeaderboardEntry[]> {
  const grouped = await prisma.partnerReferral.groupBy({
    by: ["referrerId"],
    where: { status: "confirmed" },
    _count: { _all: true },
  });
  if (grouped.length === 0) return [];
  const byReferrer = await listReferralsWithValidityBulk(grouped.map((g) => g.referrerId));
  const scored = grouped
    .map((g) => {
      const list = byReferrer.get(g.referrerId) ?? [];
      return {
        referrerId: g.referrerId,
        validCount: list.filter((r) => r.valid).length,
        totalCount: list.filter((r) => r.status === "confirmed").length,
      };
    })
    .filter((s) => s.totalCount > 0)
    .sort((a, b) => b.validCount - a.validCount || b.totalCount - a.totalCount || a.referrerId.localeCompare(b.referrerId))
    .slice(0, limit);
  if (scored.length === 0) return [];
  const users = await prisma.user.findMany({
    where: { id: { in: scored.map((s) => s.referrerId) } },
    select: { id: true, name: true, email: true },
  });
  const nameOf = new Map(users.map((u) => [u.id, maskName(u.name || u.email?.split("@")[0])]));
  return scored.map((s, i) => ({
    rank: i + 1,
    nameMasked: nameOf.get(s.referrerId) ?? maskName(null),
    validCount: s.validCount,
    totalCount: s.totalCount,
  }));
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
    // 알림은 여기서 보내지 않는다 — /api/partner/me·cron의 notifyMilestoneIfReached가 notified_at IS NULL 기준으로 발송 (A-91 ①)
    milestoneRow = (await checkMilestoneReached(userId)).row;
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
