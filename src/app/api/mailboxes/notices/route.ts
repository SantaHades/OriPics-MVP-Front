// 인앱 알림 (A-81) — GET /api/mailboxes/notices → 최근 50건 + 미확인 수 · POST { ids?: number[], all?: true } 읽음 처리
import { NextRequest, NextResponse } from "next/server";

import { getSessionUserId } from "@/lib/auth/getSessionUserId";
import { eventsDb, isMissingTable } from "@/lib/events/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ detail: "unauthenticated" }, { status: 401 });
  const db = eventsDb();
  if (!db) return NextResponse.json({ detail: "server_misconfigured" }, { status: 500 });
  const [{ data, error }, { count }] = await Promise.all([
    db.from("mailbox_notices").select("id, mailbox_id, kind, payload, created_at, read_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(50),
    db.from("mailbox_notices").select("id", { count: "exact", head: true }).eq("user_id", userId).is("read_at", null),
  ]);
  if (error) {
    if (isMissingTable(error)) return NextResponse.json({ notices: [], unread_count: 0, setup_required: true });
    return NextResponse.json({ detail: "db_error" }, { status: 500 });
  }
  return NextResponse.json({ notices: data ?? [], unread_count: count ?? 0 });
}

export async function POST(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ detail: "unauthenticated" }, { status: 401 });
  const db = eventsDb();
  if (!db) return NextResponse.json({ detail: "server_misconfigured" }, { status: 500 });
  let body: { ids?: unknown; all?: unknown };
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const now = new Date().toISOString();
  let q = db.from("mailbox_notices").update({ read_at: now }).eq("user_id", userId).is("read_at", null);
  if (body.all !== true) {
    const ids = Array.isArray(body.ids) ? (body.ids as unknown[]).filter((x): x is number => typeof x === "number").slice(0, 200) : [];
    if (ids.length === 0) return NextResponse.json({ ok: true, updated: 0 });
    q = q.in("id", ids);
  }
  const { error } = await q;
  if (error) return NextResponse.json({ detail: "db_error" }, { status: 500 });
  return NextResponse.json({ ok: true });
}
