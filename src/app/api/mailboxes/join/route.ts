// 사서함 참여 — 이름(또는 번호)+비밀번호 (A-81 v2, 2026-09-09) — POST { query, password?, display_name, mailbox_id? }
// 이름이 여러 사서함과 겹치면 409 ambiguous + 후보(id·이름·개설자) → 앱이 고른 mailbox_id로 재요청.
// 초대코드 참여는 /api/mailboxes/invites/:code/accept.
import { NextRequest, NextResponse } from "next/server";

import { getSessionUserId } from "@/lib/auth/getSessionUserId";
import { eventsDb, isMissingTable } from "@/lib/events/server";
import {
  MAILBOX_COLS, MEMBER_COLS, isActiveMember, isLocked, limitsFor, listMembers, loadMember, mailboxDto, notify, photoCounts,
  verifyPassword, type MailboxRow, type MemberRow,
} from "@/lib/mailboxes/server";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ detail: "unauthenticated" }, { status: 401 });
  const db = eventsDb();
  if (!db) return NextResponse.json({ detail: "server_misconfigured" }, { status: 500 });
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ detail: "invalid_json" }, { status: 400 });
  }
  const query = typeof body.query === "string" ? body.query.trim().slice(0, 80) : "";
  const password = typeof body.password === "string" ? body.password.slice(0, 80) : "";
  const displayName = typeof body.display_name === "string" ? body.display_name.trim().slice(0, 40) : "";
  const pickedId = typeof body.mailbox_id === "string" ? body.mailbox_id.trim() : "";
  if (!query && !pickedId) return NextResponse.json({ detail: "query_required" }, { status: 400 });

  let candidates: MailboxRow[] = [];
  if (pickedId) {
    const { data } = await db.from("mailboxes").select(MAILBOX_COLS).eq("id", pickedId).eq("status", "active");
    candidates = (data ?? []) as MailboxRow[];
  } else {
    const { data, error } = await db
      .from("mailboxes")
      .select(MAILBOX_COLS)
      .eq("status", "active")
      .or(`id.ilike."${query.replace(/["\\]/g, "")}",name.ilike."${query.replace(/["\\]/g, "")}"`); // 값에 공백·쉼표가 있어도 안전하게 인용
    if (error) {
      if (isMissingTable(error)) return NextResponse.json({ detail: "setup_required" }, { status: 503 });
      return NextResponse.json({ detail: "db_error" }, { status: 500 });
    }
    candidates = (data ?? []) as MailboxRow[];
    // 번호가 정확히 맞으면 그것 하나
    const exact = candidates.find((c) => c.id.toLowerCase() === query.toLowerCase());
    if (exact) candidates = [exact];
  }
  if (candidates.length === 0) return NextResponse.json({ detail: "not_found" }, { status: 404 });
  if (candidates.length > 1) {
    const owners = await Promise.all(
      candidates.map(async (c) => {
        const { data } = await db.from("mailbox_members").select("display_name").eq("mailbox_id", c.id).eq("kind", "owner").maybeSingle();
        return { id: c.id, name: c.name, owner_name: (data?.display_name as string | undefined) ?? "" };
      }),
    );
    return NextResponse.json({ detail: "ambiguous", candidates: owners }, { status: 409 });
  }
  const mb = candidates[0];

  const existing = await loadMember(db, mb.id, userId);
  if (existing?.kicked_at) return NextResponse.json({ detail: "kicked" }, { status: 403 });
  const prevName = existing?.display_name ?? null;
  const prevRole = existing?.role_text ?? null;
  if (isActiveMember(existing)) {
    // 이미 참여 중 — 멱등
    return NextResponse.json({ mailbox: await dtoFor(db, mb, userId), already: true });
  }
  if (mb.invite_status !== "open" || isLocked(mb)) return NextResponse.json({ detail: "invite_closed" }, { status: 403 });
  if (!(await verifyPassword(password, mb.password_hash))) return NextResponse.json({ detail: "wrong_password" }, { status: 403 });
  if (!displayName && !existing) return NextResponse.json({ detail: "display_name_required" }, { status: 400 });

  const members = await listMembers(db, mb.id);
  const limits = mb.owner_user_id ? await limitsFor(mb.owner_user_id) : { members: 20 };
  if (members.filter(isActiveMember).length >= limits.members) {
    return NextResponse.json({ detail: "member_limit", limit: limits.members }, { status: 403 });
  }

  const row: Partial<MemberRow> = existing
    ? { left_at: null, accepted_at: new Date().toISOString() } // 나갔던 참여자 복귀 (이름·권한 유지)
    : { mailbox_id: mb.id, user_id: userId, display_name: displayName, kind: "member", capture_billing: "owner", can_capture: true };
  const { error: upErr } = existing
    ? await db.from("mailbox_members").update(row).eq("mailbox_id", mb.id).eq("user_id", userId)
    : await db.from("mailbox_members").insert(row);
  if (upErr) {
    console.error("[mailboxes] join failed:", upErr.message);
    return NextResponse.json({ detail: "db_error" }, { status: 500 });
  }
  if (mb.owner_user_id) {
    await notify(db, [mb.owner_user_id], mb.id, "invite_accepted", {
      mailbox_name: mb.name,
      actor_name: prevName ?? displayName,
      role_text: prevRole,
    });
  }
  console.log(`[mailboxes] joined(password) user=${userId} mailbox=${mb.id}`);
  return NextResponse.json({ mailbox: await dtoFor(db, mb, userId) });
}

async function dtoFor(db: NonNullable<ReturnType<typeof eventsDb>>, mb: MailboxRow, userId: string) {
  const { data } = await db.from("mailbox_members").select(MEMBER_COLS).eq("mailbox_id", mb.id);
  const counts = await photoCounts(db, [mb.id], userId);
  return mailboxDto(db, mb, (data ?? []) as MemberRow[], userId, counts.get(mb.id) ?? { photo_count: 0, unread_count: 0 });
}
