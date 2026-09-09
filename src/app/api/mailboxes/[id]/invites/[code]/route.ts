// 초대 대기 항목 수정·삭제 (A-81) — PATCH { invitee_name?, role_text?, can_capture?, capture_billing? } · DELETE = 무효화 (개설자)
import { NextRequest, NextResponse } from "next/server";

import { getSessionUserId } from "@/lib/auth/getSessionUserId";
import { eventsDb } from "@/lib/events/server";
import { INVITE_COLS, loadMailbox, normalizeInviteCode, type InviteRow } from "@/lib/mailboxes/server";

export const dynamic = "force-dynamic";

async function guard(id: string, rawCode: string) {
  const userId = await getSessionUserId();
  if (!userId) return { res: NextResponse.json({ detail: "unauthenticated" }, { status: 401 }) };
  const db = eventsDb();
  if (!db) return { res: NextResponse.json({ detail: "server_misconfigured" }, { status: 500 }) };
  const mb = await loadMailbox(db, id);
  if (!mb || mb.status !== "active") return { res: NextResponse.json({ detail: "not_found" }, { status: 404 }) };
  if (mb.owner_user_id !== userId) return { res: NextResponse.json({ detail: "forbidden" }, { status: 403 }) };
  const code = normalizeInviteCode(rawCode);
  if (!code) return { res: NextResponse.json({ detail: "invalid_code" }, { status: 400 }) };
  const { data } = await db.from("mailbox_invites").select(INVITE_COLS).eq("code", code).eq("mailbox_id", id).maybeSingle();
  if (!data) return { res: NextResponse.json({ detail: "invite_not_found" }, { status: 404 }) };
  return { db, inv: data as InviteRow, code };
}

export async function PATCH(req: NextRequest, props: { params: Promise<{ id: string; code: string }> }) {
  const { id, code: raw } = await props.params;
  const g = await guard(id, raw);
  if ("res" in g) return g.res;
  if (g.inv.used_at) return NextResponse.json({ detail: "already_used" }, { status: 409 });
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ detail: "invalid_json" }, { status: 400 });
  }
  const patch: Record<string, unknown> = {};
  if (typeof body.invitee_name === "string") {
    const n = body.invitee_name.trim().slice(0, 40);
    if (!n) return NextResponse.json({ detail: "invitee_name_required" }, { status: 400 });
    patch.invitee_name = n;
  }
  if (typeof body.role_text === "string") patch.role_text = body.role_text.trim().slice(0, 40) || null;
  if (typeof body.can_capture === "boolean") patch.can_capture = body.can_capture;
  if (body.capture_billing === "owner" || body.capture_billing === "self") patch.capture_billing = body.capture_billing;
  if (Object.keys(patch).length > 0) {
    const { error } = await g.db.from("mailbox_invites").update(patch).eq("code", g.code);
    if (error) return NextResponse.json({ detail: "db_error" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, props: { params: Promise<{ id: string; code: string }> }) {
  const { id, code: raw } = await props.params;
  const g = await guard(id, raw);
  if ("res" in g) return g.res;
  if (g.inv.used_at) return NextResponse.json({ detail: "already_used" }, { status: 409 });
  const { error } = await g.db.from("mailbox_invites").update({ revoked_at: new Date().toISOString() }).eq("code", g.code);
  if (error) return NextResponse.json({ detail: "db_error" }, { status: 500 });
  return NextResponse.json({ ok: true });
}
