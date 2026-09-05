// 이벤트 정의 조회 (A-72, 2026-09-05) — GET /api/events/:eventId?locale= → 코드 카탈로그 또는 사설 이벤트.
// 사설(private) 이벤트는 추가한 사용자·소유자만(403).
import { NextRequest, NextResponse } from "next/server";

import { getSessionUserId } from "@/lib/auth/getSessionUserId";
import { resolveEvent } from "@/lib/channels/server";
import { eventsDb } from "@/lib/events/server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, props: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await props.params;
  const lang = req.nextUrl.searchParams.get("locale") === "en" ? "en" : "ko";
  const db = eventsDb();
  if (!db) return NextResponse.json({ detail: "server_misconfigured" }, { status: 500 });
  const userId = await getSessionUserId().catch(() => null);
  const ev = await resolveEvent(db, eventId, userId, lang);
  if (ev === null) return NextResponse.json({ detail: "event_not_found" }, { status: 404 });
  if (ev === "forbidden") return NextResponse.json({ detail: "forbidden" }, { status: 403 });
  return NextResponse.json({ event: ev });
}
