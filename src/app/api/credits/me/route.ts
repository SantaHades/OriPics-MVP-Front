import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { prisma } from "@/lib/prisma";
import { renewCreditsIfDue } from "@/lib/credits/renewCredits";

export const runtime = "nodejs";

const RECENT_LIMIT = 20;

export async function GET() {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as any)?.id;
  if (!userId) {
    return NextResponse.json({ detail: "unauthenticated" }, { status: 401 });
  }

  const [user, transactions] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { tier: true, credits: true, creditsRenewAt: true },
    }),
    prisma.creditTransaction.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: RECENT_LIMIT,
      select: {
        id: true,
        delta: true,
        action: true,
        balanceAfter: true,
        metadata: true,
        createdAt: true,
      },
    }),
  ]);

  if (!user) {
    return NextResponse.json({ detail: "user_not_found" }, { status: 404 });
  }

  // Lazy refresh: 갱신 도래 시 즉시 크레딧 리셋 (cron 대기 없이)
  if (user.creditsRenewAt && user.creditsRenewAt <= new Date()) {
    const result = await renewCreditsIfDue(userId);
    if (result.renewed) {
      const refreshed = await prisma.user.findUnique({
        where: { id: userId },
        select: { tier: true, credits: true, creditsRenewAt: true },
      });
      if (refreshed) {
        return NextResponse.json({
          tier: refreshed.tier,
          credits: refreshed.credits,
          creditsRenewAt: refreshed.creditsRenewAt,
          recentTransactions: transactions,
        });
      }
    }
  }

  return NextResponse.json({
    tier: user.tier,
    credits: user.credits,
    creditsRenewAt: user.creditsRenewAt,
    recentTransactions: transactions,
  });
}
