// 이벤트 목록 (A-72, 2026-09-05) — GET /api/events?locale= → 공개 카탈로그 + (로그인 시) 추가한 사설 이벤트, 출품 수 포함. 앱·웹 공용.
import { NextRequest, NextResponse } from "next/server";

import { getSessionUserId } from "@/lib/auth/getSessionUserId";
import { catalogToDto, customToDto, listCustomEvents } from "@/lib/channels/server";
import { EVENTS } from "@/lib/events/catalog";
import { eventsDb, isMissingTable } from "@/lib/events/server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const lang = req.nextUrl.searchParams.get("locale") === "en" ? "en" : "ko";
  const counts = new Map<string, number>();
  const db = eventsDb();
  const userId = await getSessionUserId().catch(() => null);
  const custom = db ? await listCustomEvents(db, userId) : [];
  if (db) {
    const { data, error } = await db.from("event_entries").select("event_id").neq("status", "hidden");
    if (!error) for (const r of data ?? []) counts.set(r.event_id, (counts.get(r.event_id) ?? 0) + 1);
    else if (!isMissingTable(error)) console.error("[events] count failed:", error.message);
  }
  const events = [
    ...EVENTS.map((e) => catalogToDto(e, lang)),
    ...custom.map((r) => customToDto(r, lang)),
  ].map((e) => ({ ...e, entry_count: counts.get(e.id) ?? 0 }));
  return NextResponse.json({ events });
}
