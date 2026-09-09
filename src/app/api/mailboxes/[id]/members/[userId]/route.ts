// 참여자 편집 (A-81) — PATCH /api/mailboxes/:id/members/:userId (개설자)
//   { display_name?, role_text?, can_capture?, capture_billing?: 'owner'|'self', kicked?: boolean }
//   내보내기/해제·건수 부담 변경은 대상자에게 인앱 알림. 개설자 본인 행은 이름·역할만.
import { NextRequest, NextResponse } from "next/server";

import { getSessionUserId } from "@/lib/auth/getSessionUserId";
import { eventsDb } from "@/lib/events/server";
import { loadMailbox, loadMember, memberDto, notify } from "@/lib/mailboxes/server";

export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest, props: { params: Promise<{ id: string; userId: string }> }) {
  const { id, userId: targetId } = await props.params;
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ detail: "unauthenticated" }, { status: 401 });
  const db = eventsDb();
  if (!db) return NextResponse.json({ detail: "server_misconfigured" }, { status: 500 });
  const mb = await loadMailbox(db, id);
  if (!mb || mb.status !== "active") return NextResponse.json({ detail: "not_found" }, { status: 404 });
  if (mb.owner_user_id !== userId) return NextResponse.json({ detail: "forbidden" }, { status: 403 });
  const target = await loadMember(db, id, targetId);
  if (!target || target.left_at) return NextResponse.json({ detail: "member_not_found" }, { status: 404 });
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ detail: "invalid_json" }, { status: 400 });
  }
  const patch: Record<string, unknown> = {};
  if (typeof body.display_name === "string") {
    const n = body.display_name.trim().slice(0, 40);
    if (!n) return NextResponse.json({ detail: "display_name_required" }, { status: 400 });
    patch.display_name = n;
  }
  if (typeof body.role_text === "string") patch.role_text = body.role_text.trim().slice(0, 40) || null;
  const isSelf = target.kind === "owner";
  const notices: Array<{ kind: "kicked" | "unkicked" | "billing_changed"; payload: Record<string, unknown> }> = [];
  if (!isSelf) {
    if (typeof body.can_capture === "boolean") patch.can_capture = body.can_capture;
    if (body.capture_billing === "owner" || body.capture_billing === "self") {
      patch.capture_billing = body.capture_billing;
      if (body.capture_billing !== target.capture_billing) {
        notices.push({ kind: "billing_changed", payload: { mailbox_name: mb.name, capture_billing: body.capture_billing } });
      }
    }
    if (typeof body.kicked === "boolean") {
      const nowKicked = !!target.kicked_at;
      if (body.kicked !== nowKicked) {
        patch.kicked_at = body.kicked ? new Date().toISOString() : null;
        notices.push({ kind: body.kicked ? "kicked" : "unkicked", payload: { mailbox_name: mb.name } });
      }
    }
  }
  if (Object.keys(patch).length === 0) return NextResponse.json({ member: memberDto(target, userId, true) });
  const { error } = await db.from("mailbox_members").update(patch).eq("mailbox_id", id).eq("user_id", targetId);
  if (error) {
    console.error("[mailboxes] member patch failed:", error.message);
    return NextResponse.json({ detail: "db_error" }, { status: 500 });
  }
  for (const n of notices) await notify(db, [targetId], id, n.kind, n.payload);
  const fresh = await loadMember(db, id, targetId);
  return NextResponse.json({ member: memberDto(fresh!, userId, true) });
}
