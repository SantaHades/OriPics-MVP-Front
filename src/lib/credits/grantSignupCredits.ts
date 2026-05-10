import { prisma } from "@/lib/prisma";
import { PLAN_GRANTS } from "@/lib/payment";

/**
 * 신규 가입자에게 Free 첫 달치 크레딧 부여 + 갱신 시점 설정.
 *
 * pricing-policy.md §1: Free 월 10크레딧, 가입일 기준 매월 갱신 (이월 불가).
 *
 * 멱등성: 이미 signup_grant 트랜잭션 기록이 있는 사용자는 스킵.
 *  - 이메일 가입 라우트 + NextAuth events.createUser 양쪽에서 호출되어도 안전.
 *  - 백필 SQL과 함께 호출되어도 중복 부여 없음.
 *
 * 호출 위치:
 *  - apps/web/src/app/api/register/route.ts (이메일 가입)
 *  - apps/web/src/lib/authOptions.ts events.createUser (OAuth 가입)
 */
export async function grantSignupCredits(userId: string): Promise<void> {
  const grant = PLAN_GRANTS.free_signup;

  await prisma.$transaction(async (tx) => {
    const existing = await tx.creditTransaction.findFirst({
      where: { userId, action: "signup_grant" },
      select: { id: true },
    });
    if (existing) return;

    const renewsAt = new Date();
    renewsAt.setMonth(renewsAt.getMonth() + 1);

    const updated = await tx.user.update({
      where: { id: userId },
      data: {
        tier: "free",
        credits: { increment: grant },
        creditsRenewAt: renewsAt,
      },
      select: { credits: true },
    });

    await tx.creditTransaction.create({
      data: {
        userId,
        delta: grant,
        action: "signup_grant",
        balanceAfter: updated.credits,
        metadata: { plan: "free", grant_amount: grant },
      },
    });
  });
}
