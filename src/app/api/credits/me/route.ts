import { NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/auth/getSessionUserId";
import { prisma } from "@/lib/prisma";
import { renewCreditsIfDue } from "@/lib/credits/renewCredits";

export const runtime = "nodejs";

const RECENT_LIMIT = 20;

export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json({ detail: "unauthenticated" }, { status: 401 });
  }

  const [user, transactions] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { tier: true, credits: true, creditsRenewAt: true, name: true, email: true },
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
    // 회원탈퇴 후에도 무상태 access 토큰(7일)은 서명이 유효 — 존재하지 않는 사용자의 토큰은
    // 무효 세션이므로 401 (모바일 apiFetch가 refresh 시도→실패→로그아웃하는 정상 경로를 타도록.
    // 404였을 땐 앱이 탈퇴 후에도 이전 정보를 계속 표시함, 2026-08-26 실측)
    return NextResponse.json({ detail: "user_not_found" }, { status: 401 });
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
          // 앱 부팅 시 사용자 표시 복원용 (2026-08-29) — 로그인 응답에만 있던 name/email이
          // 재시작 후 증발해 홈탭이 '내 계정' 폴백으로 떨어지던 문제
          user: { id: userId, name: user.name, email: user.email },
          recentTransactions: transactions,
        });
      }
    }
  }

  return NextResponse.json({
    tier: user.tier,
    credits: user.credits,
    creditsRenewAt: user.creditsRenewAt,
    user: { id: userId, name: user.name, email: user.email },
    recentTransactions: transactions,
  });
}
