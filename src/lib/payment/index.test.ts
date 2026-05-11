import { describe, it, expect } from "vitest";
import {
  CREDIT_COSTS,
  PLAN_GRANTS,
  getGateway,
  selectGatewayForUser,
} from "./index";

describe("payment/CREDIT_COSTS", () => {
  it("matches todo.md cost matrix", () => {
    expect(CREDIT_COSTS.IMAGE_PROOF).toBe(2);
    expect(CREDIT_COSTS.VERIFY_QUERY).toBe(1);
    expect(CREDIT_COSTS.LINK_CREATE).toBe(1);
    expect(CREDIT_COSTS.VERIFIED_PROOF).toBe(3);
  });

  it("verified is more expensive than standard", () => {
    expect(CREDIT_COSTS.VERIFIED_PROOF).toBeGreaterThan(CREDIT_COSTS.IMAGE_PROOF);
  });
});

describe("payment/PLAN_GRANTS", () => {
  it("free signup = monthly grant = 10 (pricing-policy §1)", () => {
    expect(PLAN_GRANTS.free_signup).toBe(10);
    expect(PLAN_GRANTS.free_monthly).toBe(10);
  });

  it("free monthly grant — 인증 1회 = proof + link_create 통합 (Standard 3 / Verified 4)", () => {
    // 2026-05-11 정책 갱신: link_create -1 통합 차감
    const standardOneShot = CREDIT_COSTS.IMAGE_PROOF + CREDIT_COSTS.LINK_CREATE; // 3
    const verifiedOneShot = CREDIT_COSTS.VERIFIED_PROOF + CREDIT_COSTS.LINK_CREATE; // 4
    expect(standardOneShot).toBe(3);
    expect(verifiedOneShot).toBe(4);
    expect(Math.floor(PLAN_GRANTS.free_monthly / standardOneShot)).toBe(3);
    expect(Math.floor(PLAN_GRANTS.free_monthly / verifiedOneShot)).toBe(2);
  });

  it("free monthly grant — 검증 조회만 10건 가능", () => {
    expect(Math.floor(PLAN_GRANTS.free_monthly / CREDIT_COSTS.VERIFY_QUERY)).toBe(10);
  });

  it("free monthly grant cannot cover one traffic accident (5+ verified photos)", () => {
    // 핵심 anchor 유지: 사고 1건(8장) Verified 인증 = 32크레딧 ≫ Free 10
    const minAccidentPhotos = 5;
    const requiredCredits =
      minAccidentPhotos * (CREDIT_COSTS.VERIFIED_PROOF + CREDIT_COSTS.LINK_CREATE); // 20
    expect(PLAN_GRANTS.free_monthly).toBeLessThan(requiredCredits);
  });

  it("pro monthly grant covers heavy use (300+ standard proofs incl. link)", () => {
    const standardOneShot = CREDIT_COSTS.IMAGE_PROOF + CREDIT_COSTS.LINK_CREATE; // 3
    expect(PLAN_GRANTS.pro_monthly).toBeGreaterThanOrEqual(300 * standardOneShot);
  });

  it("yearly subscription grants per-month, not bulk", () => {
    // pricing-policy.md: 연결제도 매월 갱신, 한 번에 받지 않음 (이월 불가 정책 정합)
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
