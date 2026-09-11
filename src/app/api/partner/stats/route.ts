import { NextResponse } from "next/server";
import { partnerLeaderboard, partnerStats, type LeaderboardEntry } from "@/lib/partner/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// (2026-09-11 A-94 ③) 리더보드는 집계 쿼리라 인스턴스 메모리에 5분 캐시(카운터는 매 요청 최신).
//   실패해도 카운터 응답은 유지(빈 배열).
const LEADERBOARD_TTL_MS = 5 * 60_000;
let leaderboardCache: { at: number; data: LeaderboardEntry[] } | null = null;

async function cachedLeaderboard(): Promise<LeaderboardEntry[]> {
  const now = Date.now();
  if (leaderboardCache && now - leaderboardCache.at < LEADERBOARD_TTL_MS) return leaderboardCache.data;
  try {
    const data = await partnerLeaderboard(10);
    leaderboardCache = { at: now, data };
    return data;
  } catch (e: any) {
    console.warn("[partner/stats] leaderboard failed", e?.message ?? e);
    return leaderboardCache?.data ?? [];
  }
}

/** GET /api/partner/stats — 공개. 랜딩 '파트너 잔여 N명' 카운터 + 마스킹 리더보드(top 10, A-94) */
export async function GET() {
  try {
    const [s, leaderboard] = await Promise.all([partnerStats(), cachedLeaderboard()]);
    return NextResponse.json({ ...s, leaderboard }, { headers: { "Cache-Control": "public, max-age=60" } });
  } catch (e: any) {
    console.error("[partner/stats] failed", e?.message ?? e);
    return NextResponse.json({ detail: "unavailable" }, { status: 503 });
  }
}
