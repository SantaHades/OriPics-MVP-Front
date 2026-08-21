import { NextRequest, NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/auth/getSessionUserId";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

// 건수 사용 내역 페이지네이션 (2026-08-21 "더 보기").
// /api/credits/me의 recentTransactions(최신 20건) 이후 페이지를 ?cursor=<id>로 이어서 조회.
const PAGE = 20;

export async function GET(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json({ detail: "unauthenticated" }, { status: 401 });
  }

  const cursor = req.nextUrl.searchParams.get("cursor");
  const transactions = await prisma.creditTransaction.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: PAGE,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    select: {
      id: true,
      delta: true,
      action: true,
      balanceAfter: true,
      metadata: true,
      createdAt: true,
    },
  });

  const nextCursor = transactions.length === PAGE ? transactions[transactions.length - 1].id : null;
  return NextResponse.json({ transactions, nextCursor });
}
