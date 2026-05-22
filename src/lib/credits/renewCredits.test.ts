import { describe, it, expect, vi, beforeEach } from "vitest";
import { PLAN_GRANTS } from "@/lib/payment";

// Mock prisma
const mockFindUnique = vi.fn();
const mockUpdate = vi.fn();
const mockCreate = vi.fn();
const mockTransaction = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: (...args: any[]) => mockFindUnique(...args) },
    $transaction: (fn: any) =>
      mockTransaction(fn),
  },
}));

import { renewCreditsIfDue } from "./renewCredits";

function makeDate(daysOffset: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + daysOffset);
  return d;
}

function makeMonthsAgo(months: number): Date {
  const d = new Date();
  d.setMonth(d.getMonth() - months);
  return d;
}

beforeEach(() => {
  vi.clearAllMocks();

  // Default $transaction impl: just execute the callback with mock tx
  mockTransaction.mockImplementation(async (fn: any) => {
    const tx = {
      user: {
        findUnique: mockFindUnique,
        update: mockUpdate,
      },
      creditTransaction: {
        create: mockCreate,
      },
    };
    return fn(tx);
  });
});

describe("renewCreditsIfDue", () => {
  it("skips if user not found", async () => {
    mockFindUnique.mockResolvedValue(null);

    const result = await renewCreditsIfDue("user-1");
    expect(result.renewed).toBe(false);
  });

  it("skips if creditsRenewAt is null", async () => {
    mockFindUnique.mockResolvedValue({
      tier: "free",
      credits: 5,
      creditsRenewAt: null,
    });

    const result = await renewCreditsIfDue("user-1");
    expect(result.renewed).toBe(false);
  });

  it("skips if creditsRenewAt is in the future", async () => {
    mockFindUnique.mockResolvedValue({
      tier: "free",
      credits: 15,
      creditsRenewAt: makeDate(5), // 5 days in future
    });

    const result = await renewCreditsIfDue("user-1");
    expect(result.renewed).toBe(false);
  });

  it("renews free user to 20 credits", async () => {
    const pastDate = makeDate(-1); // yesterday
    mockFindUnique.mockResolvedValue({
      tier: "free",
      credits: 3,
      creditsRenewAt: pastDate,
    });
    mockUpdate.mockResolvedValue({});
    mockCreate.mockResolvedValue({});

    const result = await renewCreditsIfDue("user-1");

    expect(result.renewed).toBe(true);
    expect(result.grantAmount).toBe(PLAN_GRANTS.free_monthly); // 20
    expect(result.previousCredits).toBe(3);
    expect(result.nextRenewAt).toBeDefined();
    expect(result.nextRenewAt!.getTime()).toBeGreaterThan(Date.now());

    // Verify update called with SET (not increment)
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          credits: PLAN_GRANTS.free_monthly,
        }),
      }),
    );

    // Verify transaction recorded
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "monthly_renewal",
          balanceAfter: PLAN_GRANTS.free_monthly,
          delta: PLAN_GRANTS.free_monthly - 3, // 20 - 3 = 17
        }),
      }),
    );
  });

  it("renews pro user to 1000 credits", async () => {
    mockFindUnique.mockResolvedValue({
      tier: "pro",
      credits: 42,
      creditsRenewAt: makeDate(-1),
    });
    mockUpdate.mockResolvedValue({});
    mockCreate.mockResolvedValue({});

    const result = await renewCreditsIfDue("user-2");

    expect(result.renewed).toBe(true);
    expect(result.grantAmount).toBe(PLAN_GRANTS.pro_monthly); // 1000
  });

  it("renews business user to 10000 credits", async () => {
    mockFindUnique.mockResolvedValue({
      tier: "business",
      credits: 500,
      creditsRenewAt: makeDate(-1),
    });
    mockUpdate.mockResolvedValue({});
    mockCreate.mockResolvedValue({});

    const result = await renewCreditsIfDue("user-3");

    expect(result.renewed).toBe(true);
    expect(result.grantAmount).toBe(PLAN_GRANTS.business_monthly); // 10000
  });

  it("handles 2+ months overdue — nextRenewAt jumps to future", async () => {
    mockFindUnique.mockResolvedValue({
      tier: "free",
      credits: 0,
      creditsRenewAt: makeMonthsAgo(3), // 3 months overdue
    });
    mockUpdate.mockResolvedValue({});
    mockCreate.mockResolvedValue({});

    const result = await renewCreditsIfDue("user-4");

    expect(result.renewed).toBe(true);
    expect(result.nextRenewAt!.getTime()).toBeGreaterThan(Date.now());
  });

  it("is idempotent — second call after renewal is skipped by race guard", async () => {
    // First call: user due
    mockFindUnique
      .mockResolvedValueOnce({
        tier: "free",
        credits: 0,
        creditsRenewAt: makeDate(-1),
      })
      // Inside transaction recheck: already renewed
      .mockResolvedValueOnce({
        creditsRenewAt: makeDate(29), // already pushed to future
      });

    const result = await renewCreditsIfDue("user-5");

    // Transaction ran but inner guard prevented duplicate
    expect(mockUpdate).not.toHaveBeenCalled();
  });
});
