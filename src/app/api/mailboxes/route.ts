// 사서함 목록 (A-72, 2026-09-05) — GET /api/mailboxes → 공개 사서함 + 로그인 사용자가 추가한 비공개 사서함.
// 앱은 내장 샘플 2개(오류신고·사용사례)와 합쳐 표시한다.
import { NextResponse } from "next/server";

import { getSessionUserId } from "@/lib/auth/getSessionUserId";
import { listMailboxes } from "@/lib/channels/server";
import { eventsDb } from "@/lib/events/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const db = eventsDb();
  if (!db) return NextResponse.json({ detail: "server_misconfigured" }, { status: 500 });
  const userId = await getSessionUserId().catch(() => null);
  const mailboxes = await listMailboxes(db, userId);
  return NextResponse.json({ mailboxes });
}
