// 사서함 상세·설정·삭제 예고 (A-81, 2026-09-09)
//   GET    /api/mailboxes/:id            — 참여자용 상세(사서함·참여자 목록·내 정보). 개설자는 초대 대기 목록 포함
//   PATCH  /api/mailboxes/:id            — 개설자: name·description·memo·report_title·invite_status·password('' = 제거)
//   DELETE /api/mailboxes/:id            — 개설자: 삭제 예고(7일 유예) → 전원 알림. 취소는 actions cancel_delete
import { NextRequest, NextResponse } from "next/server";

import { getSessionUserId } from "@/lib/auth/getSessionUserId";
import { eventsDb } from "@/lib/events/server";
import {
  DELETE_GRACE_DAYS, INVITE_COLS, formatInviteCode, hashPassword, inviteState, inviteUrl, isActiveMember, langOf,
  listMembers, loadMailbox, loadMember, mailboxDto, memberDto, notify, photoCounts, type InviteRow,
} from "@/lib/mailboxes/server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ detail: "unauthenticated" }, { status: 401 });
  const db = eventsDb();
  if (!db) return NextResponse.json({ detail: "server_misconfigured" }, { status: 500 });
  const mb = await loadMailbox(db, id);
  if (!mb || mb.status !== "active") return NextResponse.json({ detail: "not_found" }, { status: 404 });
  const me = await loadMember(db, id, userId);
  if (!me) return NextResponse.json({ detail: "forbidden" }, { status: 403 });
  if (me.kicked_at) return NextResponse.json({ detail: "kicked" }, { status: 403 });
  if (me.left_at) return NextResponse.json({ detail: "left" }, { status: 403 });

  const lang = langOf(req.nextUrl.searchParams.get("locale"));
  const members = await listMembers(db, id);
  const counts = await photoCounts(db, [id], userId);
  const isOwner = mb.owner_user_id === userId;
  const dto = await mailboxDto(db, mb, members, userId, counts.get(id) ?? { photo_count: 0, unread_count: 0 });
  // 참여자 화면: 참여 중(나가지 않은) 사람만. 개설자 화면: 내보낸 사람도(해제용) — 나간 사람은 제외
  const visible = members.filter((m) => !m.left_at && (isOwner || isActiveMember(m)));
  const out: Record<string, unknown> = { mailbox: dto, members: visible.map((m) => memberDto(m, userId, isOwner)) };
  if (isOwner) {
    const { data } = await db
      .from("mailbox_invites")
      .select(INVITE_COLS)
      .eq("mailbox_id", id)
      .is("used_at", null)
      .order("created_at", { ascending: false })
      .limit(50);
    out.invites = ((data ?? []) as InviteRow[]).map((inv) => ({
      code: inv.code,
      code_display: formatInviteCode(inv.code),
      url: inviteUrl(inv.code, lang),
      invitee_name: inv.invitee_name,
      role_text: inv.role_text,
      can_capture: inv.can_capture,
      capture_billing: inv.capture_billing,
      created_at: inv.created_at,
      expires_at: inv.expires_at,
      state: inviteState(inv, mb),
    }));
  }
  return NextResponse.json(out);
}

export async function PATCH(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ detail: "unauthenticated" }, { status: 401 });
  const db = eventsDb();
  if (!db) return NextResponse.json({ detail: "server_misconfigured" }, { status: 500 });
  const mb = await loadMailbox(db, id);
  if (!mb || mb.status !== "active") return NextResponse.json({ detail: "not_found" }, { status: 404 });
  if (mb.owner_user_id !== userId) return NextResponse.json({ detail: "forbidden" }, { status: 403 });
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ detail: "invalid_json" }, { status: 400 });
  }
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof body.name === "string") {
    const name = body.name.trim().slice(0, 60);
    if (!name) return NextResponse.json({ detail: "name_required" }, { status: 400 });
    const { data: dup } = await db
      .from("mailboxes").select("id").eq("owner_user_id", userId).eq("status", "active").ilike("name", name).neq("id", id).maybeSingle();
    if (dup) return NextResponse.json({ detail: "name_taken" }, { status: 409 });
    patch.name = name;
  }
  if (typeof body.description === "string") patch.description = body.description.trim().slice(0, 500) || null;
  if (typeof body.memo === "string") patch.memo = body.memo.trim().slice(0, 500) || null;
  // 확인서 PDF 제목 (2026-09-10 대표) — 빈 문자열이면 기본 문구로 복귀(null)
  if (typeof body.report_title === "string") patch.report_title = body.report_title.replace(/\s+/g, " ").trim().slice(0, 80) || null;
  if (typeof body.password === "string") patch.password_hash = body.password.trim() ? await hashPassword(body.password.trim().slice(0, 80)) : null;
  let closingInvites = false;
  if (body.invite_status === "open" || body.invite_status === "closed") {
    patch.invite_status = body.invite_status;
    closingInvites = body.invite_status === "closed" && mb.invite_status !== "closed";
  }
  const { error } = await db.from("mailboxes").update(patch).eq("id", id);
  if (error) {
    console.error("[mailboxes] patch failed:", error.message);
    return NextResponse.json({ detail: "db_error" }, { status: 500 });
  }
  if (closingInvites) {
    // 초대 종료 → 미수락 코드 전부 무효화 (재개해도 되살리지 않음 — 새 코드 발급)
    await db.from("mailbox_invites").update({ revoked_at: new Date().toISOString() }).eq("mailbox_id", id).is("used_at", null).is("revoked_at", null);
  }
  const fresh = await loadMailbox(db, id);
  const members = await listMembers(db, id);
  const counts = await photoCounts(db, [id], userId);
  return NextResponse.json({ mailbox: await mailboxDto(db, fresh!, members, userId, counts.get(id) ?? { photo_count: 0, unread_count: 0 }) });
}

export async function DELETE(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ detail: "unauthenticated" }, { status: 401 });
  const db = eventsDb();
  if (!db) return NextResponse.json({ detail: "server_misconfigured" }, { status: 500 });
  const mb = await loadMailbox(db, id);
  if (!mb || mb.status !== "active") return NextResponse.json({ detail: "not_found" }, { status: 404 });
  if (mb.owner_user_id !== userId) return NextResponse.json({ detail: "forbidden" }, { status: 403 });
  if (mb.delete_after) return NextResponse.json({ delete_after: mb.delete_after, already: true });
  const deleteAfter = new Date(Date.now() + DELETE_GRACE_DAYS * 86400_000).toISOString();
  const { error } = await db.from("mailboxes").update({ delete_after: deleteAfter, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) return NextResponse.json({ detail: "db_error" }, { status: 500 });
  // 미수락 초대 무효화 + 전원 알림
  await db.from("mailbox_invites").update({ revoked_at: new Date().toISOString() }).eq("mailbox_id", id).is("used_at", null).is("revoked_at", null);
  const members = await listMembers(db, id);
  await notify(db, members.filter(isActiveMember).map((m) => m.user_id), id, "delete_scheduled", { mailbox_name: mb.name, delete_after: deleteAfter });
  console.log(`[mailboxes] delete scheduled ${id} at ${deleteAfter}`);
  return NextResponse.json({ delete_after: deleteAfter });
}
