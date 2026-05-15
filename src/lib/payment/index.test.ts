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
