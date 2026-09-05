// 사설 이벤트 추가/제거 (A-72, 2026-09-05) — POST /api/events/join { query, password? } · DELETE { event_id } (내 목록에서 제거, 출품 기록은 유지)
import { NextRequest, NextResponse } from "next/server";

import { getSessionUserId } from "@/lib/auth/getSessionUserId";
import { customToDto, joinErrorStatus, type CustomEventRow } from "@/lib/channels/server";
import { eventsDb } from "@/lib/events/server";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ detail: "unauthenticated" }, { status: 401 });
  const db = eventsDb();
  if (!db) return NextResponse.json({ detail: "server_misconfigured" }, { status: 500 });
  let body: { query?: unknown; password?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ detail: "invalid_json" }, { status: 400 });
  }
  const query = typeof body.query === "string" ? body.query.trim().slice(0, 80) : "";
  const password = typeof body.password === "string" ? body.password.slice(0, 80) : "";
  if (!query) return NextResponse.json({ detail: "query_required" }, { status: 400 });
  const lang = req.nextUrl.searchParams.get("locale") === "en" ? "en" : "ko";

  const { data, error } = await db.rpc("join_event", { p_user_id: userId, p_query: query, p_password: password || null });
  if (error) {
    const m = joinErrorStatus(error.message);
    if (m.status === 500) console.error("[events] join failed:", error.message);
    return NextResponse.json({ detail: m.detail }, { status: m.status });
  }
  const id = data as string;
  const { data: row } = await db
    .from("custom_events")
    .select("id, name, summary, details, rules, period, ends_at, visibility, status, owner_user_id")
    .eq("id", id)
    .maybeSingle();
  if (!row) return NextResponse.json({ detail: "not_found" }, { status: 404 });
  console.log(`[events] joined user=${userId} event=${id}`);
  return NextResponse.json({ event: customToDto(row as CustomEventRow, lang) });
}

export async function DELETE(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ detail: "unauthenticated" }, { status: 401 });
  const db = eventsDb();
  if (!db) return NextResponse.json({ detail: "server_misconfigured" }, { status: 500 });
  let body: { event_id?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ detail: "invalid_json" }, { status: 400 });
  }
  const eventId = typeof body.event_id === "string" ? body.event_id.trim().slice(0, 80) : "";
  if (!eventId) return NextResponse.json({ detail: "event_id_required" }, { status: 400 });
  const { error } = await db.from("user_events").delete().eq("user_id", userId).eq("event_id", eventId);
  if (error) return NextResponse.json({ detail: "db_error" }, { status: 500 });
  console.log(`[events] left user=${userId} event=${eventId}`);
  return NextResponse.json({ ok: true });
}
