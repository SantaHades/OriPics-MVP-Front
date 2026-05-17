import { describe, it, expect } from "vitest";
import {
  CREDIT_COSTS,
  PLAN_GRANTS,
  getGateway,
  selectGatewayForUser,
} from "./index";

describe("payment/CREDIT_COSTS", () => {
  it("matches 2026-05-15 cost matrix", () => {
    expect(CREDIT_COSTS.VERIFY_QUERY).toBe(1);
    expect(CREDIT_COSTS.LINK_CREATE).toBe(2);
    expect(CREDIT_COSTS.IMAGE_PROOF).toBe(3);       // link 포함 통합 비용
    expect(CREDIT_COSTS.VERIFIED_PROOF).toBe(4);    // link 포함 통합 비용
    expect(CREDIT_COSTS.CERTIFICATE_PDF).toBe(10);
  });

  it("verified is more expensive than standard", () => {
    expect(CREDIT_COSTS.VERIFIED_PROOF).toBeGreaterThan(CREDIT_COSTS.IMAGE_PROOF);
  });

  it("certificate PDF is the most expensive single action", () => {
    expect(CREDIT_COSTS.CERTIFICATE_PDF).toBeGreaterThan(CREDIT_COSTS.VERIFIED_PROOF);
  });
});

describe("payment/PLAN_GRANTS", () => {
  it("free signup = monthly grant = 20 (사진인증 5건 ≒ 4×5)", () => {
    expect(PLAN_GRANTS.free_signup).toBe(20);
    expect(PLAN_GRANTS.free_monthly).toBe(20);
  });

  it("free monthly grant — 인증 1회 = 통합 비용 (Standard 3 / Verified 4)", () => {
    expect(Math.floor(PLAN_GRANTS.free_monthly / CREDIT_COSTS.IMAGE_PROOF)).toBe(6);
    expect(Math.floor(PLAN_GRANTS.free_monthly / CREDIT_COSTS.VERIFIED_PROOF)).toBe(5);
  });

  it("free monthly grant — 검증 조회만 20건 가능", () => {
    expect(Math.floor(PLAN_GRANTS.free_monthly / CREDIT_COSTS.VERIFY_QUERY)).toBe(20);
  });

  it("free monthly grant cannot cover one traffic accident (5+ verified photos × multiplier)", () => {
    // 사고 1건 평균 5~8장. 사이즈 multiplier(2~3×) 적용 시 free 20을 쉽게 초과.
    const minAccidentPhotos = 5;
    const requiredCredits = minAccidentPhotos * CREDIT_COSTS.VERIFIED_PROOF; // 20
    expect(PLAN_GRANTS.free_monthly).toBeLessThanOrEqual(requiredCredits);
  });

  it("pro monthly grant covers heavy use (250 verified proofs)", () => {
    expect(PLAN_GRANTS.pro_monthly).toBeGreaterThanOrEqual(250 * CREDIT_COSTS.VERIFIED_PROOF);
  });

  it("business monthly grant covers 2,500 verified proofs", () => {
    expect(PLAN_GRANTS.business_monthly).toBeGreaterThanOrEqual(2500 * CREDIT_COSTS.VERIFIED_PROOF);
  });

  it("yearly subscription grants per-month, not bulk", () => {
    expect(PLAN_GRANTS.pro_yearly_monthly).toBe(PLAN_GRANTS.pro_monthly);
  });
});

// 2026-05-17 B-2'' 흐름 — confirm(proof만) ↔ publish(LINK_CREATE) 별도 차감
describe("payment/B-2'' 흐름 (인증 ↔ 공개링크 분리)", () => {
  it("인증만 받는 경우(공개링크 미생성) Standard = -3 / Verified = -4", () => {
    expect(CREDIT_COSTS.IMAGE_PROOF).toBe(3);
    expect(CREDIT_COSTS.VERIFIED_PROOF).toBe(4);
  });

  it("인증 + 공개링크 생성 총비용 (Standard = 5 / Verified = 6)", () => {
    const standardFullFlow = CREDIT_COSTS.IMAGE_PROOF + CREDIT_COSTS.LINK_CREATE; // 3 + 2 = 5
    const verifiedFullFlow = CREDIT_COSTS.VERIFIED_PROOF + CREDIT_COSTS.LINK_CREATE; // 4 + 2 = 6
    expect(standardFullFlow).toBe(5);
    expect(verifiedFullFlow).toBe(6);
  });

  it("Free 20크레딧 시 인증+공개링크 풀 흐름 가능 횟수 (Standard 4 / Verified 3)", () => {
    expect(Math.floor(PLAN_GRANTS.free_monthly / (CREDIT_COSTS.IMAGE_PROOF + CREDIT_COSTS.LINK_CREATE))).toBe(4);
    expect(Math.floor(PLAN_GRANTS.free_monthly / (CREDIT_COSTS.VERIFIED_PROOF + CREDIT_COSTS.LINK_CREATE))).toBe(3);
  });

  it("LINK_CREATE는 사이즈 multiplier 영향 받지 않음 (publish는 항상 -2)", () => {
    // 정책: LINK_CREATE·CERTIFICATE_PDF는 메타·DB 작업만이라 사이즈 무관 1× 고정
    // 이 테스트는 정책 회귀 방지용 anchor (코드는 sizeMultiplier.ts에서 처리)
    expect(CREDIT_COSTS.LINK_CREATE).toBe(2);
    expect(CREDIT_COSTS.CERTIFICATE_PDF).toBe(10);
  });

  it("PDF 첫 발급은 LINK_CREATE 이후만 가능 (총 흐름: proof + link + pdf)", () => {
    // 시나리오: 사진인증 + 공개링크 + PDF 발급 = 4 + 2 + 10 = 16
    const verifiedWithCert = CREDIT_COSTS.VERIFIED_PROOF + CREDIT_COSTS.LINK_CREATE + CREDIT_COSTS.CERTIFICATE_PDF;
    expect(verifiedWithCert).toBe(16);
    // Free 20크레딧으로 1건 가능 (잔여 4 — verify 4번 또는 image_proof 1번 추가 가능)
    expect(verifiedWithCert).toBeLessThanOrEqual(PLAN_GRANTS.free_monthly);
  });
});

describe("payment/getGateway", () => {
  it("returns portone adapter", () => {
    const g = getGateway("portone");
    expect(g.provider).toBe("portone");
    expect(typeof g.createCustomer).toBe("function");
  });

  it("returns stripe adapter", () => {
    const g = getGateway("stripe");
    expect(g.provider).toBe("stripe");
  });

  it("throws on unknown provider", () => {
    expect(() => getGateway("paypal" as any)).toThrow(/Unknown payment gateway/);
  });
});

describe("payment/selectGatewayForUser", () => {
  it("Phase 1: always returns portone", () => {
    expect(selectGatewayForUser({})).toBe("portone");
    expect(selectGatewayForUser({ locale: "ko" })).toBe("portone");
    expect(selectGatewayForUser({ locale: "en" })).toBe("portone");
    expect(selectGatewayForUser({ userCountry: "US" })).toBe("portone");
    expect(selectGatewayForUser({ userCountry: "KR" })).toBe("portone");
  });
});
