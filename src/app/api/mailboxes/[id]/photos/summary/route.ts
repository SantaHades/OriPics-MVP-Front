// 사진함 사진 요약 (2026-09-13 A-98) — GET /api/mailboxes/:id/photos/summary (참여자)
//   → { photo_count, unread_total, latest_at }. 앱·웹 상세가 15초 폴링에서 이것만 받고, 값이 바뀌었을 때만 /photos 전체를 다시 받는다.
//   인증·참여 검사는 photos/route.ts와 동일(isActiveMember). 이미지 URL·링크 조인 없음(count/head 쿼리만).
import { NextRequest, NextResponse } from "next/server";

import { getSessionUserId } from "@/lib/auth/getSessionUserId";
import { eventsDb, isMissingTable } from "@/lib/events/server";
import { isActiveMember, loadMailbox, loadMember } from "@/lib/mailboxes/server";
import { loadPhotoSummary } from "@/lib/mailboxes/summary";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ detail: "unauthenticated" }, { status: 401 });
  const db = eventsDb();
  if (!db) return NextResponse.json({ detail: "server_misconfigured" }, { status: 500 });
  const mb = await loadMailbox(db, id);
  if (!mb || mb.status !== "active") return NextResponse.json({ detail: "not_found" }, { status: 404 });
  const me = await loadMember(db, id, userId);
  const kicked = !!me?.kicked_at;
  if (!isActiveMember(me)) return NextResponse.json({ detail: kicked ? "kicked" : "forbidden" }, { status: 403 });
  try {
    return NextResponse.json(await loadPhotoSummary(db, id, userId));
  } catch (e) {
    const err = e as { code?: string; message?: string };
    if (isMissingTable(err)) return NextResponse.json({ photo_count: 0, unread_total: 0, latest_at: null, setup_required: true });
    console.error("[mailboxes] summary failed:", err?.message);
    return NextResponse.json({ detail: "db_error" }, { status: 500 });
  }
}
