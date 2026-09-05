// 이벤트 목록 (A-72, 2026-09-05) — GET /api/events?locale= → 카탈로그 + 출품 수. 앱·웹 공용.
import { NextRequest, NextResponse } from "next/server";

import { EVENTS, isEventOpen } from "@/lib/events/catalog";
import { eventsDb, isMissingTable } from "@/lib/events/server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const lang = req.nextUrl.searchParams.get("locale") === "en" ? "en" : "ko";
  const counts = new Map<string, number>();
  const db = eventsDb();
  if (db) {
    const { data, error } = await db.from("event_entries").select("event_id").neq("status", "hidden");
    if (!error) for (const r of data ?? []) counts.set(r.event_id, (counts.get(r.event_id) ?? 0) + 1);
    else if (!isMissingTable(error)) console.error("[events] count failed:", error.message);
  }
  return NextResponse.json({
    events: EVENTS.map((e) => ({
      id: e.id,
      name: e.name[lang],
      summary: e.summary[lang],
      period: e.period[lang],
      ends_at: e.endsAt,
      open: isEventOpen(e),
      entry_count: counts.get(e.id) ?? 0,
    })),
  });
}
