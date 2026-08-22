import { describe, expect, it } from "vitest";
import { computeRefundQuote } from "./refund";

const paidAt = new Date("2026-08-01T00:00:00Z");
const periodEnd = new Date("2026-08-31T00:00:00Z"); // 30일 주기
const AMOUNT = 9900; // pro_monthly

describe("computeRefundQuote — 약관 제11조 (사용횟수=사진인증당, 2026-08-22 확정)", () => {
  it("7일 내 + 미사용 → 전액 환불", () => {
    const q = computeRefundQuote({
      amount: AMOUNT,
      paidAt,
      periodEnd,
      usedProofs: 0,
      now: new Date("2026-08-03T00:00:00Z"),
    });
    expect(q.basis).toBe("full");
    expect(q.refundAmount).toBe(9900);
    expect(q.refundable).toBe(true);
  });

  it("7일 내 + 3건 사용 → 결제액 − 3×1,000, 위약금 없음", () => {
    const q = computeRefundQuote({
      amount: AMOUNT,
      paidAt,
      periodEnd,
      usedProofs: 3,
      now: new Date("2026-08-03T00:00:00Z"),
    });
    expect(q.basis).toBe("within7d_usage");
    expect(q.refundAmount).toBe(9900 - 3000);
    expect(q.penalty).toBe(0);
  });

  it("7일 내 + 10건 이상 사용 → 산정액 ≤ 0 → 환불 불가", () => {
    const q = computeRefundQuote({
      amount: AMOUNT,
      paidAt,
      periodEnd,
      usedProofs: 10,
      now: new Date("2026-08-03T00:00:00Z"),
    });
    expect(q.refundAmount).toBe(0);
    expect(q.refundable).toBe(false);
  });

  it("경계: 정확히 7일 경과는 after7d로 처리", () => {
    const q = computeRefundQuote({
      amount: AMOUNT,
      paidAt,
      periodEnd,
      usedProofs: 0,
      now: new Date("2026-08-08T00:00:00Z"),
    });
    expect(q.basis).toBe("after7d");
  });

  it("7일 후 + 미사용 → 경과 일할 공제 + 잔여 10% 공제", () => {
    // 15일 경과 / 30일 주기 → 일할 4,950 → 잔여 4,950 → 10% 공제 495 → 4,455
    const q = computeRefundQuote({
      amount: AMOUNT,
      paidAt,
      periodEnd,
      usedProofs: 0,
      now: new Date("2026-08-16T00:00:00Z"),
    });
    expect(q.basis).toBe("after7d");
    expect(q.proratedElapsed).toBe(4950);
    expect(q.penalty).toBe(495);
    expect(q.refundAmount).toBe(4455);
  });

  it("7일 후 + 사용분 정가가 일할보다 크면 사용분 기준 공제", () => {
    // 8건×1,000=8,000 > 일할 4,950 → 잔여 1,900 → 10% 공제 190 → 1,710
    const q = computeRefundQuote({
      amount: AMOUNT,
      paidAt,
      periodEnd,
      usedProofs: 8,
      now: new Date("2026-08-16T00:00:00Z"),
    });
    expect(q.usageDeduction).toBe(8000);
    expect(q.refundAmount).toBe(9900 - 8000 - Math.round(1900 * 0.1));
  });

  it("7일 후 + 기간 만료 직전 → 일할이 결제액 전체에 수렴 → 환불 0", () => {
    const q = computeRefundQuote({
      amount: AMOUNT,
      paidAt,
      periodEnd,
      usedProofs: 0,
      now: new Date("2026-08-31T00:00:00Z"),
    });
    expect(q.refundAmount).toBe(0);
    expect(q.refundable).toBe(false);
  });
});
