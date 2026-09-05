// 출품 취소 (A-72, 2026-09-05) — DELETE /api/events/entries/:entryId  (본인 출품만)
import { NextRequest, NextResponse } from "next/server";

import { getSessionUserId } from "@/lib/auth/getSessionUserId";
import { eventsDb } from "@/lib/events/server";

export const dynamic = "force-dynamic";

export async function DELETE(_req: NextRequest, props: { params: Promise<{ entryId: string }> }) {
  const { entryId } = await props.params;
  if (!/^[A-Za-z0-9_-]{4,64}$/.test(entryId)) return NextResponse.json({ detail: "invalid_entry" }, { status: 400 });
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ detail: "unauthenticated" }, { status: 401 });
  const db = eventsDb();
  if (!db) return NextResponse.json({ detail: "server_misconfigured" }, { status: 500 });

  const { data, error } = await db
    .from("event_entries")
    .delete()
    .eq("id", entryId)
    .eq("user_id", userId)
    .select("id");
  if (error) return NextResponse.json({ detail: "db_error" }, { status: 500 });
  if (!data || data.length === 0) return NextResponse.json({ detail: "not_found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
