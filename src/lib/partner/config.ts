// 파트너 릴레이 챌린지 (A-82, 2026-09-10) — 상수·순수 함수.
// 설계: docs/partner-relay-challenge-plan.md v0.2 (§3 확정 규칙)
//
// 이 파일은 DB·네트워크 의존이 없어 단위 테스트 대상(config.test.ts).

export const PARTNER = {
  /** 대표 계정 코드(수동). 100~999는 제휴사 예약, 1235~ 일반 회원 시퀀스 */
  OWNER_CODE: "1234",
  /** 파트너(초대 적립 자격) 선착순 상한 */
  CAP: 500,
  /** 마일스톤(1개월 무료 이용권 6장) — 유효 초대 인원 */
  MILESTONE_COUNT: 12,
  /** 마일스톤 보상 = 1개월 무료 이용권 장수 (연속 결제에 1장씩 자동 적용) */
  MILESTONE_FREE_MONTHS: 6,
  /** 50% 할인권 1장의 할인액 (Pro 월 ₩9,900의 절반) */
  DISCOUNT_AMOUNT: 4950,
  /** 혜택 유효기간(발급일 기준, 개월) */
  BENEFIT_VALID_MONTHS: 24,
  /** 소셜/이메일 신규 가입자의 코드 입력 가능 기간(일) */
  JOIN_WINDOW_DAYS: 7,
  /** 챌린지 공지 시점 — 이전 가입자는 "기존 회원"으로 기간 중 언제나 1회 입력 가능 */
  CAMPAIGN_START: new Date(process.env.PARTNER_CAMPAIGN_START ?? "2026-09-10T00:00:00+09:00"),
  /** 적립 종료 — 이후 가입은 양쪽 모두 미지급 */
  CAMPAIGN_END: new Date(process.env.PARTNER_CAMPAIGN_END ?? "2026-12-31T23:59:59+09:00"),
  /** 유효 초대(첫 인증) 인정 기한 — 챌린지 종료 후 N일 (2026-09-10 대표 확정: 30일) */
  VALIDITY_GRACE_DAYS: 30,
} as const;

/** 유효 초대로 인정되는 첫 인증의 마지막 시각 = 종료 + 30일 */
export function validityDeadline(): Date {
  return new Date(PARTNER.CAMPAIGN_END.getTime() + PARTNER.VALIDITY_GRACE_DAYS * 86_400_000);
}

/** 피추천인의 첫 인증 시각이 마일스톤 집계에 인정되는지 */
export function proofCountsForMilestone(proofAt: Date): boolean {
  return proofAt.getTime() <= validityDeadline().getTime();
}

export type BenefitType = "pro_50" | "pro_free_month";
export type BenefitSource = "signup" | "referral" | "milestone_12" | "admin";
export type BenefitStatus = "available" | "reserved" | "used" | "expired" | "revoked";

/** 코드 정규화 — 숫자만, 3~8자리. 아니면 null */
export function normalizePartnerCode(raw: unknown): string | null {
  if (typeof raw !== "string" && typeof raw !== "number") return null;
  const digits = String(raw).replace(/[^0-9]/g, "");
  if (digits.length < 3 || digits.length > 8) return null;
  return digits;
}

/**
 * 파트너 자격 — 초대가 들어올 때 할인권을 적립받을 수 있는 계정.
 *  - 코드 입력으로 참여해 500명 안에 든 회원(partnerRank 1~500)
 *  - 대표(1234)·제휴사(100~999) 예약 코드 계정은 참여 절차 없이 파트너 (500명 카운트 제외)
 */
export function isPartnerAccount(u: { partnerRank: number | null; partnerCode: string | null }): boolean {
  if (u.partnerRank != null) return true;
  if (u.partnerCode && /^[0-9]+$/.test(u.partnerCode) && Number(u.partnerCode) <= Number(PARTNER.OWNER_CODE)) return true;
  return false;
}

/** 이름 마스킹 — "손용석"→"손*석", "홍길"→"홍*", "Yongseog Son"→"Y******g S*n" (단어별) */
export function maskName(name: string | null | undefined, fallback = "회원"): string {
  const n = (name ?? "").trim();
  if (!n) return fallback;
  return n
    .split(/\s+/)
    .map((w) => {
      const chars = Array.from(w);
      if (chars.length <= 1) return "*";
      if (chars.length === 2) return `${chars[0]}*`;
      return `${chars[0]}${"*".repeat(chars.length - 2)}${chars[chars.length - 1]}`;
    })
    .join(" ");
}

export function benefitExpiry(from: Date = new Date()): Date {
  const d = new Date(from);
  d.setMonth(d.getMonth() + PARTNER.BENEFIT_VALID_MONTHS);
  return d;
}

export interface PlannableBenefit {
  id: string;
  type: BenefitType;
  expiresAt: Date;
}

export interface ChargePlanResult {
  /** 실제 청구할 금액 (0이면 PG 호출 없이 주기 부여) */
  expectedAmount: number;
  listAmount: number;
  discountAmount: number;
  /** 이번 청구에 사용할 혜택 id (예약 → 결제 성공 시 used) */
  benefitIds: string[];
  /** 사용한 할인권 장수 */
  couponsApplied: number;
  /** 무료 이용권 1개월 사용 여부 */
  freeMonthApplied: boolean;
}

/**
 * 청구 계획 — §3.4 결제 적용 규칙.
 *  - 할인권이 있으면 할인권 먼저: 첫 Pro 결제는 최대 2장(=0원), 이후 1장.
 *  - 할인권이 없고 무료 이용권이 있으면 1개월 소진(0원).
 *  - 적용 순서는 만료 임박 순.
 */
export function planBenefitApplication(opts: {
  listAmount: number;
  benefits: PlannableBenefit[];
  maxCoupons: 1 | 2;
  now?: Date;
}): ChargePlanResult {
  const now = opts.now ?? new Date();
  const usable = opts.benefits
    .filter((b) => b.expiresAt.getTime() > now.getTime())
    .sort((a, b) => a.expiresAt.getTime() - b.expiresAt.getTime());
  const coupons = usable.filter((b) => b.type === "pro_50");
  const freeMonths = usable.filter((b) => b.type === "pro_free_month");

  if (coupons.length > 0) {
    // 정가를 넘지 않는 범위에서 최대 장수
    const byPrice = Math.max(1, Math.floor(opts.listAmount / PARTNER.DISCOUNT_AMOUNT));
    const n = Math.min(opts.maxCoupons, coupons.length, byPrice);
    const discount = Math.min(opts.listAmount, n * PARTNER.DISCOUNT_AMOUNT);
    return {
      expectedAmount: opts.listAmount - discount,
      listAmount: opts.listAmount,
      discountAmount: discount,
      benefitIds: coupons.slice(0, n).map((c) => c.id),
      couponsApplied: n,
      freeMonthApplied: false,
    };
  }
  if (freeMonths.length > 0) {
    return {
      expectedAmount: 0,
      listAmount: opts.listAmount,
      discountAmount: opts.listAmount,
      benefitIds: [freeMonths[0].id],
      couponsApplied: 0,
      freeMonthApplied: true,
    };
  }
  return {
    expectedAmount: opts.listAmount,
    listAmount: opts.listAmount,
    discountAmount: 0,
    benefitIds: [],
    couponsApplied: 0,
    freeMonthApplied: false,
  };
}

/**
 * 참여 원장(partner_join_ledger) 키용 이메일 정규화 (2026-09-11 A-91 ⑤).
 *  - 공통: trim + 소문자
 *  - 모든 도메인: 로컬파트의 `+tag` 제거 (a+x@b.com → a@b.com)
 *  - gmail.com / googlemail.com: 로컬파트의 점 제거 (a.b.c@gmail.com → abc@gmail.com), googlemail → gmail 통일
 * 기존 원장 행은 lower(trim()) 해시라 조회 시 두 해시를 모두 본다(server.ts hashEmailLegacy) — 백필: scripts/admin-partner-ledger-backfill.ts
 */
export function normalizeEmailForLedger(email: string): string {
  const e = email.trim().toLowerCase();
  const at = e.lastIndexOf("@");
  if (at <= 0) return e;
  let local = e.slice(0, at);
  let domain = e.slice(at + 1);
  const plus = local.indexOf("+");
  if (plus > 0) local = local.slice(0, plus);
  if (domain === "googlemail.com") domain = "gmail.com";
  if (domain === "gmail.com") local = local.replace(/\./g, "");
  return `${local}@${domain}`;
}

/** 가입 시각 기준 코드 입력 가능 여부 — 기존 회원(공지 전 가입)은 기간 중 언제나, 신규는 7일 */
export function joinWindowOpen(signupAt: Date | null, now: Date = new Date()): boolean {
  if (now.getTime() > PARTNER.CAMPAIGN_END.getTime()) return false;
  if (!signupAt) return true; // 가입 기록 없는 초기 계정 = 기존 회원 취급
  if (signupAt.getTime() < PARTNER.CAMPAIGN_START.getTime()) return true;
  return now.getTime() - signupAt.getTime() <= PARTNER.JOIN_WINDOW_DAYS * 86_400_000;
}
