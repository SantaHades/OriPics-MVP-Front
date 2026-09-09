// 사서함 v2 (A-81, 2026-09-09) — GET /api/mailboxes: 내가 개설한 사서함 + 초대받은 사서함 (사진 수·미열람 수 포함)
//                               POST /api/mailboxes: 개설 { name, description?, memo?, invite_status?, password? }
import { NextRequest, NextResponse } from "next/server";

import { getSessionUserId } from "@/lib/auth/getSessionUserId";
import { eventsDb, isMissingTable } from "@/lib/events/server";
import {
  MAILBOX_COLS, MEMBER_COLS, hashPassword, isActiveMember, limitsFor, mailboxDto, photoCounts, userDisplayName,
  type MailboxRow, type MemberRow,
} from "@/lib/mailboxes/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ detail: "unauthenticated" }, { status: 401 });
  const db = eventsDb();
  if (!db) return NextResponse.json({ detail: "server_misconfigured" }, { status: 500 });

  const { data: myRows, error } = await db.from("mailbox_members").select(MEMBER_COLS).eq("user_id", userId);
  if (error) {
    if (isMissingTable(error)) return NextResponse.json({ mine: [], invited: [], setup_required: true });
    console.error("[mailboxes] list failed:", error.message);
    return NextResponse.json({ detail: "db_error" }, { status: 500 });
  }
  const mine = ((myRows ?? []) as MemberRow[]).filter((m) => !m.left_at); // 내보내진 사서함은 목록에서 숨김(알림만)
  const ids = mine.filter((m) => !m.kicked_at).map((m) => m.mailbox_id);
  if (ids.length === 0) return NextResponse.json({ mine: [], invited: [] });

  const [{ data: mbs }, { data: allMembers }, counts] = await Promise.all([
    db.from("mailboxes").select(MAILBOX_COLS).in("id", ids).eq("status", "active").order("created_at", { ascending: false }),
    db.from("mailbox_members").select(MEMBER_COLS).in("mailbox_id", ids),
    photoCounts(db, ids, userId),
  ]);
  const membersBy = new Map<string, MemberRow[]>();
  for (const m of (allMembers ?? []) as MemberRow[]) {
    const arr = membersBy.get(m.mailbox_id) ?? [];
    arr.push(m);
    membersBy.set(m.mailbox_id, arr);
  }
  const dtos = await Promise.all(
    ((mbs ?? []) as MailboxRow[]).map((mb) =>
      mailboxDto(db, mb, membersBy.get(mb.id) ?? [], userId, counts.get(mb.id) ?? { photo_count: 0, unread_count: 0 }),
    ),
  );
  return NextResponse.json({ mine: dtos.filter((d) => d.mine), invited: dtos.filter((d) => !d.mine) });
}

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
  const name = typeof body.name === "string" ? body.name.trim().slice(0, 60) : "";
  if (!name) return NextResponse.json({ detail: "name_required" }, { status: 400 });
  const description = typeof body.description === "string" ? body.description.trim().slice(0, 500) || null : null;
  const memo = typeof body.memo === "string" ? body.memo.trim().slice(0, 500) || null : null;
  const inviteStatus = body.invite_status === "closed" ? "closed" : "open";
  const password = typeof body.password === "string" ? body.password.trim().slice(0, 80) : "";

  // 한도: 무료 1개 / Pro 무제한 (활성 사서함만 계산)
  const limits = await limitsFor(userId);
  const { count } = await db
    .from("mailboxes")
    .select("id", { count: "exact", head: true })
    .eq("owner_user_id", userId)
    .eq("status", "active");
  if ((count ?? 0) >= limits.mailboxes) {
    return NextResponse.json({ detail: "mailbox_limit", limit: limits.mailboxes, paid: limits.paid }, { status: 403 });
  }
  // 내 계정 안에서 이름 중복 금지 (참여 검색 키)
  const { data: dup } = await db
    .from("mailboxes")
    .select("id")
    .eq("owner_user_id", userId)
    .eq("status", "active")
    .ilike("name", name)
    .maybeSingle();
  if (dup) return NextResponse.json({ detail: "name_taken" }, { status: 409 });

  // 번호 발급 — 시퀀스(MB-1001~)가 A-72 때 운영자가 수동 등재한 번호(예: MB-1001)와 겹칠 수 있어(9/9 실기기 실측 duplicate key),
  // 충돌(23505)이면 다음 번호를 다시 받아 재시도한다.
  const passwordHash = password ? await hashPassword(password) : null;
  let id = "";
  let inserted = false;
  for (let attempt = 0; attempt < 30 && !inserted; attempt++) {
    const { data: idData, error: idErr } = await db.rpc("next_mailbox_id");
    if (idErr || typeof idData !== "string") {
      if (isMissingTable(idErr)) return NextResponse.json({ detail: "setup_required" }, { status: 503 });
      console.error("[mailboxes] id rpc failed:", idErr?.message);
      return NextResponse.json({ detail: "db_error" }, { status: 500 });
    }
    id = idData;
    const { error: insErr } = await db.from("mailboxes").insert({
      id,
      name,
      description,
      memo,
      email: null,
      password_hash: passwordHash,
      visibility: "private",
      invite_status: inviteStatus,
      status: "active",
      owner_user_id: userId,
    });
    if (!insErr) {
      inserted = true;
      break;
    }
    if (insErr.code === "23505" || /duplicate key/i.test(insErr.message)) continue;
    console.error("[mailboxes] create failed:", insErr.message);
    return NextResponse.json({ detail: "db_error" }, { status: 500 });
  }
  if (!inserted) {
    console.error("[mailboxes] create failed: id collision persists");
    return NextResponse.json({ detail: "db_error" }, { status: 500 });
  }
  const ownerName = await userDisplayName(userId);
  const member = { mailbox_id: id, user_id: userId, display_name: ownerName, kind: "owner", capture_billing: "owner" };
  await db.from("mailbox_members").insert(member);
  const { data: mb } = await db.from("mailboxes").select(MAILBOX_COLS).eq("id", id).single();
  const { data: members } = await db.from("mailbox_members").select(MEMBER_COLS).eq("mailbox_id", id);
  const dto = await mailboxDto(db, mb as MailboxRow, ((members ?? []) as MemberRow[]).filter(isActiveMember), userId, { photo_count: 0, unread_count: 0 });
  console.log(`[mailboxes] created ${id} owner=${userId}`);
  return NextResponse.json({ mailbox: dto }, { status: 201 });
}
