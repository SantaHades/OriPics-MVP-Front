import { describe, it, expect } from "vitest";
import { PARTNER, isPartnerAccount, joinWindowOpen, maskName, normalizeEmailForLedger, normalizePartnerCode, planBenefitApplication, proofCountsForMilestone, validityDeadline } from "./config";

const d = (days: number) => new Date(Date.now() + days * 86_400_000);

describe("partner/config", () => {
  it("maskName — 한글 3자·2자·1자·영문 단어별", () => {
    expect(maskName("손용석")).toBe("손*석");
    expect(maskName("홍길")).toBe("홍*");
    expect(maskName("김")).toBe("*");
    expect(maskName("Yongseog Son")).toBe("Y******g S*n");
    expect(maskName("")).toBe("회원");
    expect(maskName(null, "member")).toBe("member");
  });

  it("normalizePartnerCode — 숫자 3~8자리만", () => {
    expect(normalizePartnerCode("1234")).toBe("1234");
    expect(normalizePartnerCode(" 12-35 ")).toBe("1235");
    expect(normalizePartnerCode(1236)).toBe("1236");
    expect(normalizePartnerCode("12")).toBeNull();
    expect(normalizePartnerCode("123456789")).toBeNull();
    expect(normalizePartnerCode(null)).toBeNull();
  });

  it("isPartnerAccount — 순번 보유 또는 예약 코드(≤1234)", () => {
    expect(isPartnerAccount({ partnerRank: 3, partnerCode: "1300" })).toBe(true);
    expect(isPartnerAccount({ partnerRank: null, partnerCode: "1234" })).toBe(true);
    expect(isPartnerAccount({ partnerRank: null, partnerCode: "123" })).toBe(true);
    expect(isPartnerAccount({ partnerRank: null, partnerCode: "1235" })).toBe(false);
    expect(isPartnerAccount({ partnerRank: null, partnerCode: null })).toBe(false);
  });

  it("joinWindowOpen — 기존 회원 언제나 · 신규 7일 · 종료 후 불가", () => {
    const now = new Date("2026-10-01T00:00:00Z");
    expect(joinWindowOpen(new Date("2026-09-01T00:00:00Z"), now)).toBe(true); // 공지 전 가입
    expect(joinWindowOpen(new Date("2026-09-28T00:00:00Z"), now)).toBe(true); // 3일 전 가입
    expect(joinWindowOpen(new Date("2026-09-20T00:00:00Z"), now)).toBe(false); // 11일 전 가입
    expect(joinWindowOpen(null, now)).toBe(true);
    expect(joinWindowOpen(new Date("2026-12-30T00:00:00Z"), new Date("2027-01-02T00:00:00Z"))).toBe(false);
  });

  it("챌린지 종료 경계 — 12/31 23:59:59 KST까지 허용, 1초 뒤부터 불가(적립 중단)", () => {
    expect(PARTNER.CAMPAIGN_END.toISOString()).toBe("2026-12-31T14:59:59.000Z");
    const signup = new Date("2026-12-31T10:00:00Z");
    expect(joinWindowOpen(signup, new Date("2026-12-31T14:59:59Z"))).toBe(true);
    expect(joinWindowOpen(signup, new Date("2026-12-31T15:00:00Z"))).toBe(false);
    // 기존 회원(공지 전 가입)도 종료 후에는 불가
    expect(joinWindowOpen(new Date("2026-08-01T00:00:00Z"), new Date("2026-12-31T15:00:00Z"))).toBe(false);
  });

  it("유효 초대 인정 기한 — 종료 +30일(2027-01-30 23:59:59 KST)까지의 첫 인증만 집계", () => {
    expect(validityDeadline().toISOString()).toBe("2027-01-30T14:59:59.000Z");
    expect(proofCountsForMilestone(new Date("2027-01-30T14:59:59Z"))).toBe(true);
    expect(proofCountsForMilestone(new Date("2027-01-30T15:00:00Z"))).toBe(false);
  });

  describe("planBenefitApplication", () => {
    const list = 9900;
    it("할인권 없음 → 정가", () => {
      const r = planBenefitApplication({ listAmount: list, benefits: [], maxCoupons: 2 });
      expect(r).toMatchObject({ expectedAmount: 9900, discountAmount: 0, benefitIds: [], couponsApplied: 0, freeMonthApplied: false });
    });
    it("첫 결제 2장 → 0원, 만료 임박 순 사용", () => {
      const r = planBenefitApplication({
        listAmount: list,
        maxCoupons: 2,
        benefits: [
          { id: "late", type: "pro_50", expiresAt: d(700) },
          { id: "soon", type: "pro_50", expiresAt: d(30) },
          { id: "mid", type: "pro_50", expiresAt: d(300) },
        ],
      });
      expect(r.expectedAmount).toBe(0);
      expect(r.discountAmount).toBe(9900);
      expect(r.benefitIds).toEqual(["soon", "mid"]);
      expect(r.couponsApplied).toBe(2);
    });
    it("갱신 1장 → 4,950", () => {
      const r = planBenefitApplication({ listAmount: list, maxCoupons: 1, benefits: [{ id: "a", type: "pro_50", expiresAt: d(10) }, { id: "b", type: "pro_50", expiresAt: d(20) }] });
      expect(r.expectedAmount).toBe(4950);
      expect(r.benefitIds).toEqual(["a"]);
    });
    it("첫 결제인데 1장만 있으면 4,950", () => {
      const r = planBenefitApplication({ listAmount: list, maxCoupons: 2, benefits: [{ id: "a", type: "pro_50", expiresAt: d(10) }] });
      expect(r.expectedAmount).toBe(4950);
      expect(r.couponsApplied).toBe(1);
    });
    it("할인권 소진 후 무료 이용권 1개월 → 0원", () => {
      const r = planBenefitApplication({ listAmount: list, maxCoupons: 1, benefits: [{ id: "f1", type: "pro_free_month", expiresAt: d(100) }, { id: "f2", type: "pro_free_month", expiresAt: d(200) }] });
      expect(r).toMatchObject({ expectedAmount: 0, benefitIds: ["f1"], freeMonthApplied: true, couponsApplied: 0 });
    });
    it("할인권이 있으면 무료 이용권보다 먼저 쓴다(대표 시나리오)", () => {
      const r = planBenefitApplication({ listAmount: list, maxCoupons: 1, benefits: [{ id: "f1", type: "pro_free_month", expiresAt: d(10) }, { id: "c1", type: "pro_50", expiresAt: d(500) }] });
      expect(r.benefitIds).toEqual(["c1"]);
      expect(r.expectedAmount).toBe(4950);
    });
    it("만료된 혜택은 무시", () => {
      const r = planBenefitApplication({ listAmount: list, maxCoupons: 2, benefits: [{ id: "x", type: "pro_50", expiresAt: d(-1) }] });
      expect(r.expectedAmount).toBe(9900);
    });
    it("12명 시나리오 검산 — 13장으로 첫달 0 + 11개월 4,950, 이후 무료 6개월", () => {
      let coupons = Array.from({ length: 13 }, (_, i) => ({ id: `c${i}`, type: "pro_50" as const, expiresAt: d(700) }));
      const free = Array.from({ length: 6 }, (_, i) => ({ id: `f${i}`, type: "pro_free_month" as const, expiresAt: d(700) }));
      let total = 0;
      let months = 0;
      let first = true;
      let pool = [...coupons, ...free];
      while (pool.length) {
        const r = planBenefitApplication({ listAmount: list, benefits: pool, maxCoupons: first ? 2 : 1 });
        first = false;
        total += r.expectedAmount;
        months++;
        pool = pool.filter((b) => !r.benefitIds.includes(b.id));
      }
      expect(months).toBe(18);
      expect(total).toBe(4950 * 11);
      expect(PARTNER.DISCOUNT_AMOUNT * 2).toBe(9900);
    });
  });
});

// (2026-09-11 A-91 ⑤) 참여 원장 키 정규화 — gmail 점·`+tag` 별칭으로 '이메일당 1회' 우회 차단
describe("normalizeEmailForLedger", () => {
  it("공통: trim + 소문자", () => {
    expect(normalizeEmailForLedger("  Foo@Example.COM ")).toBe("foo@example.com");
  });
  it("모든 도메인에서 +tag 제거", () => {
    expect(normalizeEmailForLedger("foo+promo@example.com")).toBe("foo@example.com");
    expect(normalizeEmailForLedger("foo+a+b@naver.com")).toBe("foo@naver.com");
  });
  it("gmail/googlemail 은 점 제거 + googlemail→gmail 통일", () => {
    expect(normalizeEmailForLedger("f.o.o@gmail.com")).toBe("foo@gmail.com");
    expect(normalizeEmailForLedger("F.O.O+x@GoogleMail.com")).toBe("foo@gmail.com");
  });
  it("gmail 이 아닌 도메인의 점은 유지", () => {
    expect(normalizeEmailForLedger("f.o.o@example.com")).toBe("f.o.o@example.com");
  });
  it("별칭이 없는 이메일은 lower(trim()) 과 동일 (레거시 해시 호환)", () => {
    expect(normalizeEmailForLedger("user@daum.net")).toBe("user@daum.net");
  });
  it("@ 없는 문자열은 그대로 소문자", () => {
    expect(normalizeEmailForLedger("Nope")).toBe("nope");
  });
});
