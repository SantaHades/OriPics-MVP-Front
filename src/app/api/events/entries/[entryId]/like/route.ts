// 좋아요 토글 (A-72, 2026-09-05) — POST /api/events/entries/:entryId/like → { liked, like_count }
// 로그인 필수(계정당 출품작 1회). DB 함수 toggle_event_like가 원자적으로 삽입/삭제+집계 갱신.
import { NextRequest, NextResponse } from "next/server";

import { getSessionUserId } from "@/lib/auth/getSessionUserId";
import { eventsDb, isMissingTable } from "@/lib/events/server";

export const dynamic = "force-dynamic";

export async function POST(_req: NextRequest, props: { params: Promise<{ entryId: string }> }) {
  const { entryId } = await props.params;
  if (!/^[A-Za-z0-9_-]{4,64}$/.test(entryId)) return NextResponse.json({ detail: "invalid_entry" }, { status: 400 });
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ detail: "unauthenticated" }, { status: 401 });
  const db = eventsDb();
  if (!db) return NextResponse.json({ detail: "server_misconfigured" }, { status: 500 });

  const { data, error } = await db.rpc("toggle_event_like", { p_entry_id: entryId, p_user_id: userId });
  if (error) {
    if (/entry_not_found/.test(error.message)) return NextResponse.json({ detail: "entry_not_found" }, { status: 404 });
    if (isMissingTable(error) || /function .* does not exist/i.test(error.message)) {
      return NextResponse.json({ detail: "setup_required" }, { status: 503 });
    }
    console.error("[events] like toggle failed:", error.message);
    return NextResponse.json({ detail: "db_error" }, { status: 500 });
  }
  const row = Array.isArray(data) ? data[0] : data;
  return NextResponse.json({ liked: !!row?.liked, like_count: Number(row?.like_count ?? 0) });
}
