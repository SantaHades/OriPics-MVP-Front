import { describe, it, expect, vi, beforeEach } from "vitest";

// PortOne 재질의 결과를 케이스별로 바꾼다 (subscriptionGrant.test.ts와 같은 골격)
let mockGetPayment: (...a: any[]) => any = () => ({});
vi.mock("@portone/server-sdk", () => ({
  PaymentClient: () => ({ getPayment: (...a: any[]) => mockGetPayment(...a) }),
}));

const tx = {
  $executeRaw: vi.fn(async () => 0),
  dayPass: {
    findFirst: vi.fn(async () => null),
    create: vi.fn(async () => ({ code: "ABCD-EFGH-1234" })),
  },
  user: { findUnique: vi.fn(async () => ({ credits: 20 })) },
  creditTransaction: { create: vi.fn(async () => ({})) },
};
const transaction = vi.fn(async (fn: any) => fn(tx));
vi.mock("@/lib/prisma", () => ({
  prisma: { $transaction: (fn: any) => transaction(fn) },
}));

import { verifyAndIssueDayPass, PASS_PRICE_KRW } from "./passPurchase";

const base = {
  status: "PAID",
  amount: { total: PASS_PRICE_KRW },
  customData: JSON.stringify({ userId: "u1", product: "day_pass" }),
};

describe("verifyAndIssueDayPass — 채널 타입 게이트 (KG 상점 심사용 테스트 채널)", () => {
  beforeEach(() => {
    transaction.mockClear();
    tx.dayPass.create.mockClear();
  });

  it("TEST 채널 결제는 검증만 통과시키고 코드를 발급하지 않는다 (DB 미접근)", async () => {
    mockGetPayment = () => ({ ...base, channel: { type: "TEST", pgProvider: "INICIS_V2" } });
    const r = await verifyAndIssueDayPass({ paymentId: "dp-test-1", userId: "u1", secret: "s" });
    expect(r.ok).toBe(true);
    expect((r as any).testChannel).toBe(true);
    expect((r as any).code).toBeUndefined();
    expect(transaction).not.toHaveBeenCalled();
  });

  it("TEST 채널이라도 PAID가 아니면 기존 규칙대로 거부한다", async () => {
    mockGetPayment = () => ({ ...base, status: "FAILED", channel: { type: "TEST" } });
    const r = await verifyAndIssueDayPass({ paymentId: "dp-test-2", userId: "u1", secret: "s" });
    expect(r.ok).toBe(false);
    expect((r as any).code).toBe("payment_not_paid");
  });

  it("LIVE 채널 정상 결제는 코드를 발급한다", async () => {
    mockGetPayment = () => ({ ...base, channel: { type: "LIVE", pgProvider: "INICIS_V2" } });
    const r = await verifyAndIssueDayPass({ paymentId: "dp-live-1", userId: "u1", secret: "s" });
    expect(r.ok).toBe(true);
    expect((r as any).testChannel).toBeUndefined();
    expect((r as any).code).toBe("ABCD-EFGH-1234");
    expect(tx.dayPass.create).toHaveBeenCalledTimes(1);
  });

  it("channel 필드가 없는(구형/미상) 결제는 LIVE로 취급해 기존 경로를 탄다", async () => {
    mockGetPayment = () => ({ ...base });
    const r = await verifyAndIssueDayPass({ paymentId: "dp-live-2", userId: "u1", secret: "s" });
    expect(r.ok).toBe(true);
    expect(tx.dayPass.create).toHaveBeenCalledTimes(1);
  });
});
