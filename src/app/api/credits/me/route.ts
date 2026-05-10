import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { prisma } from "@/lib/prisma";

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

  return NextResponse.json({
    tier: user.tier,
    credits: user.credits,
    creditsRenewAt: user.creditsRenewAt,
    recentTransactions: transactions,
  });
}
