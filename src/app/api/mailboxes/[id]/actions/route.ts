// 사서함 상태 동작 (A-81) — POST /api/mailboxes/:id/actions { action: 'lock' | 'unlock' | 'cancel_delete' | 'leave' }
//   lock/unlock/cancel_delete = 개설자, leave = 참여자(개설자 불가). 각 동작은 해당자에게 인앱 알림.
import { NextRequest, NextResponse } from "next/server";

import { getSessionUserId } from "@/lib/auth/getSessionUserId";
import { eventsDb } from "@/lib/events/server";
import { isActiveMember, listMembers, loadMailbox, loadMember, notify } from "@/lib/mailboxes/server";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ detail: "unauthenticated" }, { status: 401 });
  const db = eventsDb();
  if (!db) return NextResponse.json({ detail: "server_misconfigured" }, { status: 500 });
  const mb = await loadMailbox(db, id);
  if (!mb || mb.status !== "active") return NextResponse.json({ detail: "not_found" }, { status: 404 });
  let body: { action?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ detail: "invalid_json" }, { status: 400 });
  }
  const action = body.action;
  const now = new Date().toISOString();
  const members = await listMembers(db, id);
  const others = members.filter(isActiveMember).filter((m) => m.user_id !== userId).map((m) => m.user_id);

  if (action === "leave") {
    const me = await loadMember(db, id, userId);
    if (!isActiveMember(me)) return NextResponse.json({ detail: "forbidden" }, { status: 403 });
    if (me.kind === "owner") return NextResponse.json({ detail: "owner_cannot_leave" }, { status: 400 });
    const { error } = await db.from("mailbox_members").update({ left_at: now }).eq("mailbox_id", id).eq("user_id", userId);
    if (error) return NextResponse.json({ detail: "db_error" }, { status: 500 });
    if (mb.owner_user_id) await notify(db, [mb.owner_user_id], id, "left", { mailbox_name: mb.name, actor_name: me.display_name, role_text: me.role_text });
    return NextResponse.json({ ok: true });
  }

  if (mb.owner_user_id !== userId) return NextResponse.json({ detail: "forbidden" }, { status: 403 });
  if (action === "lock" || action === "unlock") {
    const { error } = await db.from("mailboxes").update({ locked_at: action === "lock" ? now : null, updated_at: now }).eq("id", id);
    if (error) return NextResponse.json({ detail: "db_error" }, { status: 500 });
    await notify(db, others, id, action === "lock" ? "locked" : "unlocked", { mailbox_name: mb.name });
    return NextResponse.json({ ok: true, locked: action === "lock" });
  }
  if (action === "cancel_delete") {
    if (!mb.delete_after) return NextResponse.json({ ok: true, already: true });
    const { error } = await db.from("mailboxes").update({ delete_after: null, updated_at: now }).eq("id", id);
    if (error) return NextResponse.json({ detail: "db_error" }, { status: 500 });
    await notify(db, others, id, "delete_cancelled", { mailbox_name: mb.name });
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ detail: "invalid_action" }, { status: 400 });
}
