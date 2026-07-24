import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * verifyAndGrantSubscription — 크레딧 부여가 "가산"이 아니라 "플랜 정액 리셋(SET)"으로
 * 동작하는지 검증. (pricing-policy.md §5.1 이월 불가 cap 모델)
 *
 * 회귀 배경(2026-07-24): 첫 실결제 테스트에서 기존 잔액 1,000 + 부여 1,000 = 2,000으로
 * 누적되는 버그 발견. 매월 빌링키 자동청구마다 누적되는 구조였음.
 */

const mockGetPayment = vi.fn();
vi.mock("@portone/server-sdk", () => ({
  PaymentClient: () => ({ getPayment: (...a: any[]) => mockGetPayment(...a) }),
  BillingKeyClient: () => ({ getBillingKeyInfo: vi.fn() }),
}));

const mockTxUserFindUnique = vi.fn();
const mockTxUserUpdate = vi.fn();
const mockTxSubUpsert = vi.fn();
const mockTxSubUpdateMany = vi.fn();
const mockTxCtFindFirst = vi.fn();
const mockTxCtCreate = vi.fn();
const mockExecuteRaw = vi.fn();

const tx = {
  $executeRaw: (...a: any[]) => mockExecuteRaw(...a),
  user: {
    findUnique: (...a: any[]) => mockTxUserFindUnique(...a),
    update: (...a: any[]) => mockTxUserUpdate(...a),
  },
  subscription: {
    upsert: (...a: any[]) => mockTxSubUpsert(...a),
    updateMany: (...a: any[]) => mockTxSubUpdateMany(...a),
  },
  creditTransaction: {
    findFirst: (...a: any[]) => mockTxCtFindFirst(...a),
    create: (...a: any[]) => mockTxCtCreate(...a),
  },
};

vi.mock("@/lib/prisma", () => ({
  prisma: { $transaction: (fn: any) => fn(tx) },
}));

import { verifyAndGrantSubscription } from "./subscriptionGrant";
import { PLAN_GRANTS } from "@/lib/payment";

const PAID = { status: "PAID", amount: { total: 9900 }, channel: { pgProvider: "INICIS_V2" } };

beforeEach(() => {
  vi.clearAllMocks();
  mockGetPayment.mockResolvedValue(PAID);
  mockTxCtFindFirst.mockResolvedValue(null); // 아직 미부여
  mockTxSubUpsert.mockResolvedValue({});
  mockTxCtCreate.mockResolvedValue({});
});

describe("verifyAndGrantSubscription — 크레딧 리셋(SET)", () => {
  it("기존 잔액과 무관하게 플랜 정액으로 SET하고 delta는 차액으로 기록한다", async () => {
    const grant = PLAN_GRANTS.pro_monthly; // 1000
    mockTxUserFindUnique.mockResolvedValue({ credits: 1000 }); // 기존 잔액 1000
    mockTxUserUpdate.mockResolvedValue({ credits: grant });

    const result = await verifyAndGrantSubscription({
      paymentId: "bk-test-1",
      userId: "user-1",
      plan: "pro_monthly",
      secret: "sk",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.granted).toBe(grant);

    // user.update가 increment가 아닌 SET으로 호출됐는지
    const updateArg = mockTxUserUpdate.mock.calls[0][0];
    expect(updateArg.data.credits).toBe(grant); // { increment: … } 아님
    expect(updateArg.data.tier).toBe("pro");
    expect(updateArg.data.creditsRenewAt).toBeInstanceOf(Date); // 주기 anchor 정렬

    // 거래 기록: delta = 정액 − 기존 잔액 (1000 − 1000 = 0), 누적 방지 증빙
    const ctArg = mockTxCtCreate.mock.calls[0][0];
    expect(ctArg.data.delta).toBe(grant - 1000);
    expect(ctArg.data.balanceAfter).toBe(grant);
    expect(ctArg.data.metadata.previous_credits).toBe(1000);
  });

  it("Free(20크레딧)에서 업그레이드 시 1000으로 SET, delta=980", async () => {
    const grant = PLAN_GRANTS.pro_monthly;
    mockTxUserFindUnique.mockResolvedValue({ credits: 20 });
    mockTxUserUpdate.mockResolvedValue({ credits: grant });

    const result = await verifyAndGrantSubscription({
      paymentId: "bk-test-2",
      userId: "user-2",
      plan: "pro_monthly",
      secret: "sk",
    });

    expect(result.ok).toBe(true);
    const ctArg = mockTxCtCreate.mock.calls[0][0];
    expect(ctArg.data.delta).toBe(grant - 20);
    expect(ctArg.data.balanceAfter).toBe(grant);
  });

  it("이미 처리된 paymentId는 재부여하지 않는다 (멱등)", async () => {
    mockTxCtFindFirst.mockResolvedValue({ id: "existing" });

    const result = await verifyAndGrantSubscription({
      paymentId: "bk-test-3",
      userId: "user-3",
      plan: "pro_monthly",
      secret: "sk",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.alreadyProcessed).toBe(true);
    expect(result.granted).toBe(0);
    expect(mockTxUserUpdate).not.toHaveBeenCalled();
    expect(mockTxCtCreate).not.toHaveBeenCalled();
  });

  it("PAID가 아니면 부여하지 않는다", async () => {
    mockGetPayment.mockResolvedValue({ ...PAID, status: "CANCELLED" });

    const result = await verifyAndGrantSubscription({
      paymentId: "bk-test-4",
      userId: "user-4",
      plan: "pro_monthly",
      secret: "sk",
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("payment_not_paid");
  });

  it("금액 불일치 시 부여하지 않는다", async () => {
    mockGetPayment.mockResolvedValue({ ...PAID, amount: { total: 100 } });

    const result = await verifyAndGrantSubscription({
      paymentId: "bk-test-5",
      userId: "user-5",
      plan: "pro_monthly",
      secret: "sk",
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("amount_mismatch");
  });
});
