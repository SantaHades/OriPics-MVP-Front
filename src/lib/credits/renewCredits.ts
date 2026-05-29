import { prisma } from "@/lib/prisma";
import { PLAN_GRANTS } from "@/lib/payment";

/**
 * 크레딧 갱신이 도래한 사용자에게 tier별 월 크레딧을 리셋 부여.
 *
 * pricing-policy.md §5.1: 이월 불가 (cap 모델). 잔여 크레딧 무시, tier 정액으로 SET.
 * creditsRenewAt 기준으로 +1month 이동 (드리프트 방지: now() 아닌 기존값 기준).
 *
 * 멱등성: creditsRenewAt > now()이면 이미 갱신됨 → skip.
 *
 * 호출 위치:
 *  - /api/cron/renew-credits (daily batch)
 *  - /api/credits/me (lazy refresh, 단건)
 */

export interface RenewResult {
  renewed: boolean;
  grantAmount?: number;
  nextRenewAt?: Date;
  previousCredits?: number;
}

function getMonthlyGrant(tier: string): number {
  switch (tier) {
    case "pro":
      return PLAN_GRANTS.pro_monthly;
    case "business":
      return PLAN_GRANTS.business_monthly;
    default:
      return PLAN_GRANTS.free_monthly;
  }
}

export async function renewCreditsIfDue(userId: string): Promise<RenewResult> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { tier: true, credits: true, creditsRenewAt: true },
  });

  if (!user || !user.creditsRenewAt) {
    return { renewed: false };
  }

  const now = new Date();
  if (user.creditsRenewAt > now) {
    return { renewed: false };
  }

  const grantAmount = getMonthlyGrant(user.tier);

  // 다음 갱신일 계산 — 기존 creditsRenewAt 기준 +1month (드리프트 방지).
  // 2개월 이상 밀린 경우 미래가 될 때까지 반복.
  let nextRenewAt = new Date(user.creditsRenewAt);
  while (nextRenewAt <= now) {
    nextRenewAt.setMonth(nextRenewAt.getMonth() + 1);
  }

  const previousCredits = user.credits;
  const delta = grantAmount - previousCredits;

  await prisma.$transaction(async (tx) => {
    // 트랜잭션 내에서 재확인 (race condition 방지)
    const fresh = await tx.user.findUnique({
      where: { id: userId },
      select: { creditsRenewAt: true },
    });
    if (!fresh?.creditsRenewAt || fresh.creditsRenewAt > now) return;

    await tx.user.update({
      where: { id: userId },
      data: {
        credits: grantAmount, // SET (이월 불가)
        creditsRenewAt: nextRenewAt,
      },
    });

    await tx.creditTransaction.create({
      data: {
        userId,
        delta,
        action: "monthly_renewal",
        balanceAfter: grantAmount,
        metadata: {
          tier: user.tier,
          grant_amount: grantAmount,
          previous_credits: previousCredits,
          previous_renew_at: user.creditsRenewAt!.toISOString(),
          next_renew_at: nextRenewAt.toISOString(),
        },
      },
    });
  });

  return { renewed: true, grantAmount, nextRenewAt, previousCredits };
}
