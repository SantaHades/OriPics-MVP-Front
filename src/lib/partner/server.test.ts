import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * lib/partner/server — 순수 규칙 외 DB 계층 중 회귀 위험이 큰 두 곳 (2026-09-11 A-91).
 *  ④ approveMilestone: 조건부 updateMany(count===1)일 때만 6장 발급 — 더블클릭·동시 승인 시 12장 방지
 *  ⑤ hashEmail: 정규화 해시 — gmail 점·+tag 별칭이 같은 키로 수렴, 별칭 없는 메일은 레거시 해시와 동일
 * prisma 는 모듈 목(mock)으로 대체한다 (subscriptionGrant.test.ts 와 같은 패턴).
 */

const mockMsFindUnique = vi.fn();
const mockTxMsUpdateMany = vi.fn();
const mockTxBenefitCreateMany = vi.fn();
const mockRefFindUnique = vi.fn();
const mockCtFindFirst = vi.fn();
const mockBenefitUpdateMany = vi.fn();
// (2026-09-11 A-94 ③) partnerLeaderboard
const mockRefGroupBy = vi.fn();
const mockRefFindMany = vi.fn();
const mockCtGroupBy = vi.fn();
const mockUserFindMany = vi.fn();

const tx = {
  partnerMilestone: { updateMany: (...a: any[]) => mockTxMsUpdateMany(...a) },
  partnerBenefit: { createMany: (...a: any[]) => mockTxBenefitCreateMany(...a) },
};

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: (fn: any) => fn(tx),
    partnerMilestone: { findUnique: (...a: any[]) => mockMsFindUnique(...a) },
    partnerReferral: {
      findUnique: (...a: any[]) => mockRefFindUnique(...a),
      groupBy: (...a: any[]) => mockRefGroupBy(...a),
      findMany: (...a: any[]) => mockRefFindMany(...a),
    },
    creditTransaction: { findFirst: (...a: any[]) => mockCtFindFirst(...a), groupBy: (...a: any[]) => mockCtGroupBy(...a) },
    partnerBenefit: { updateMany: (...a: any[]) => mockBenefitUpdateMany(...a) },
    user: { findMany: (...a: any[]) => mockUserFindMany(...a) },
  },
}));

import { approveMilestone, hashEmail, hashEmailLegacy, partnerLeaderboard, revokeReferrerBenefitsOnRefereeDelete } from "./server";
import { PARTNER } from "./config";

beforeEach(() => {
  vi.clearAllMocks();
  mockTxBenefitCreateMany.mockResolvedValue({ count: PARTNER.MILESTONE_FREE_MONTHS });
});

describe("approveMilestone — 원자적 승인 (A-91 ④)", () => {
  it("미승인 행을 선점(count=1)하면 6장 발급", async () => {
    mockMsFindUnique.mockResolvedValue({ approvedAt: null });
    mockTxMsUpdateMany.mockResolvedValue({ count: 1 });
    const r = await approveMilestone("u1", "admin@x");
    expect(r).toBe("granted");
    expect(mockTxMsUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: "u1", approvedAt: null } }),
    );
    expect(mockTxBenefitCreateMany).toHaveBeenCalledTimes(1);
    const data = mockTxBenefitCreateMany.mock.calls[0][0].data;
    expect(data).toHaveLength(PARTNER.MILESTONE_FREE_MONTHS);
    expect(data.every((b: any) => b.type === "pro_free_month" && b.source === "milestone_12" && b.userId === "u1")).toBe(true);
  });

  it("사전 조회는 미승인이었지만 선점에 실패(count=0, 동시 승인)하면 발급하지 않고 already", async () => {
    mockMsFindUnique.mockResolvedValue({ approvedAt: null });
    mockTxMsUpdateMany.mockResolvedValue({ count: 0 });
    const r = await approveMilestone("u1", "admin@x");
    expect(r).toBe("already");
    expect(mockTxBenefitCreateMany).not.toHaveBeenCalled();
  });

  it("이미 승인된 행은 트랜잭션 없이 already", async () => {
    mockMsFindUnique.mockResolvedValue({ approvedAt: new Date() });
    const r = await approveMilestone("u1", "admin@x");
    expect(r).toBe("already");
    expect(mockTxMsUpdateMany).not.toHaveBeenCalled();
    expect(mockTxBenefitCreateMany).not.toHaveBeenCalled();
  });

  it("행이 없으면 not_reached", async () => {
    mockMsFindUnique.mockResolvedValue(null);
    expect(await approveMilestone("u1", "admin@x")).toBe("not_reached");
    expect(mockTxBenefitCreateMany).not.toHaveBeenCalled();
  });
});

describe("hashEmail — 정규화 해시 (A-91 ⑤)", () => {
  it("gmail 점·+tag 별칭이 같은 키로 수렴", () => {
    const base = hashEmail("foobar@gmail.com");
    expect(hashEmail("F.o.o.B.a.r@gmail.com")).toBe(base);
    expect(hashEmail("foobar+1@gmail.com")).toBe(base);
    expect(hashEmail("foo.bar+x@googlemail.com")).toBe(base);
  });
  it("별칭 없는 이메일은 레거시 해시(lower(trim()))와 동일 — 09/10 백필 행과 호환", () => {
    expect(hashEmail(" User@Naver.com ")).toBe(hashEmailLegacy(" User@Naver.com "));
  });
  it("별칭 이메일은 레거시 해시와 다르다(백필 필요)", () => {
    expect(hashEmail("foo+1@naver.com")).not.toBe(hashEmailLegacy("foo+1@naver.com"));
  });
});

describe("revokeReferrerBenefitsOnRefereeDelete — 탈퇴 파밍 회수 (A-91 ⑥)", () => {
  const day = 86_400_000;
  it("참여 30일 미만이면 추천인의 available 혜택만 회수", async () => {
    mockRefFindUnique.mockResolvedValue({ id: "r1", referrerId: "owner", createdAt: new Date(Date.now() - 3 * day), status: "confirmed" });
    mockBenefitUpdateMany.mockResolvedValue({ count: 1 });
    expect(await revokeReferrerBenefitsOnRefereeDelete("referee")).toBe(1);
    expect(mockBenefitUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { referralId: "r1", userId: "owner", status: "available" } }),
    );
    expect(mockCtFindFirst).not.toHaveBeenCalled();
  });
  it("30일 이상 + 참여 후 첫 인증 있음 → 회수하지 않음", async () => {
    mockRefFindUnique.mockResolvedValue({ id: "r1", referrerId: "owner", createdAt: new Date(Date.now() - 40 * day), status: "confirmed" });
    mockCtFindFirst.mockResolvedValue({ id: "tx1" });
    expect(await revokeReferrerBenefitsOnRefereeDelete("referee")).toBe(0);
    expect(mockBenefitUpdateMany).not.toHaveBeenCalled();
  });
  it("30일 이상이지만 인증이 없으면 회수", async () => {
    mockRefFindUnique.mockResolvedValue({ id: "r1", referrerId: "owner", createdAt: new Date(Date.now() - 40 * day), status: "confirmed" });
    mockCtFindFirst.mockResolvedValue(null);
    mockBenefitUpdateMany.mockResolvedValue({ count: 1 });
    expect(await revokeReferrerBenefitsOnRefereeDelete("referee")).toBe(1);
  });
  it("추천 없음/이미 revoked → 0", async () => {
    mockRefFindUnique.mockResolvedValue(null);
    expect(await revokeReferrerBenefitsOnRefereeDelete("x")).toBe(0);
    mockRefFindUnique.mockResolvedValue({ id: "r1", referrerId: "o", createdAt: new Date(), status: "revoked" });
    expect(await revokeReferrerBenefitsOnRefereeDelete("x")).toBe(0);
  });
});

describe("partnerLeaderboard — 마스킹 리더보드 (A-94 ③)", () => {
  const t0 = new Date("2026-09-12T00:00:00Z");
  const before = new Date("2026-09-11T00:00:00Z");
  const after = new Date("2026-09-13T00:00:00Z");

  it("추천이 없으면 빈 배열, 추가 쿼리 없음", async () => {
    mockRefGroupBy.mockResolvedValue([]);
    expect(await partnerLeaderboard()).toEqual([]);
    expect(mockRefFindMany).not.toHaveBeenCalled();
    expect(mockUserFindMany).not.toHaveBeenCalled();
  });

  it("유효 초대(참여 후 첫 인증) 수 내림차순, 동률은 가입 수, 이름은 마스킹·순위 1부터", async () => {
    mockRefGroupBy.mockResolvedValue([{ referrerId: "A" }, { referrerId: "B" }, { referrerId: "C" }]);
    mockRefFindMany.mockResolvedValue([
      // A: 2명 가입, 1명 유효(참여 후 인증), 1명은 참여 전 인증(무효)
      { id: "r1", referrerId: "A", status: "confirmed", referrerRewarded: true, createdAt: t0, referee: { id: "a1", name: "김철수", email: null } },
      { id: "r2", referrerId: "A", status: "confirmed", referrerRewarded: true, createdAt: t0, referee: { id: "a2", name: "박영희", email: null } },
      // B: 1명 가입, 1명 유효
      { id: "r3", referrerId: "B", status: "confirmed", referrerRewarded: true, createdAt: t0, referee: { id: "b1", name: null, email: "friend@x.com" } },
      // C: 회수된 추천만 → 제외
      { id: "r4", referrerId: "C", status: "revoked", referrerRewarded: false, createdAt: t0, referee: { id: "c1", name: "x", email: null } },
    ]);
    mockCtGroupBy.mockResolvedValue([
      { userId: "a1", _min: { createdAt: after } },
      { userId: "a2", _min: { createdAt: before } },
      { userId: "b1", _min: { createdAt: after } },
    ]);
    mockUserFindMany.mockResolvedValue([
      { id: "A", name: "손용석", email: "a@x.com" },
      { id: "B", name: null, email: "yongseog@x.com" },
    ]);
    const lb = await partnerLeaderboard(10);
    expect(lb).toEqual([
      { rank: 1, nameMasked: "손*석", validCount: 1, totalCount: 2 },
      { rank: 2, nameMasked: "y******g", validCount: 1, totalCount: 1 },
    ]);
    // 이름 조회는 상위 N 명만
    expect(mockUserFindMany.mock.calls[0][0].where.id.in).toEqual(["A", "B"]);
  });

  it("limit 만큼만 잘라 반환", async () => {
    mockRefGroupBy.mockResolvedValue([{ referrerId: "A" }, { referrerId: "B" }]);
    mockRefFindMany.mockResolvedValue([
      { id: "r1", referrerId: "A", status: "confirmed", referrerRewarded: true, createdAt: t0, referee: { id: "a1", name: "a", email: null } },
      { id: "r3", referrerId: "B", status: "confirmed", referrerRewarded: true, createdAt: t0, referee: { id: "b1", name: "b", email: null } },
    ]);
    mockCtGroupBy.mockResolvedValue([{ userId: "a1", _min: { createdAt: after } }]);
    mockUserFindMany.mockResolvedValue([{ id: "A", name: "손용석", email: null }]);
    const lb = await partnerLeaderboard(1);
    expect(lb).toHaveLength(1);
    expect(lb[0]).toMatchObject({ rank: 1, nameMasked: "손*석", validCount: 1 });
  });
});
