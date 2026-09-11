// 초대코드로 참여 (A-81) — POST /api/mailboxes/invites/:code/accept (로그인 필수)
//   코드 상태(valid) 검사 → 내보내진 사용자 거부 → 참여자 한도 → 코드 사용 처리(원자 UPDATE) → members upsert(이름·역할·촬영 조건은 코드에 적힌 값 고정) → 개설자 알림
//   (2026-09-11 A-84①) 순서 변경: 이전엔 멤버 upsert 후 코드를 소비해, 경합에서 진 쪽이 신규 행만 삭제하고
//   과거 나간 사용자의 left_at=null 복귀는 되돌리지 못해 코드 없이 재참여가 성립했다. 지금은 코드를 먼저 소비하고
//   멤버 단계가 실패하면 코드를 되돌린다.
import { NextRequest, NextResponse } from "next/server";

import { getSessionUserId } from "@/lib/auth/getSessionUserId";
import { eventsDb } from "@/lib/events/server";
import { checkRateLimit, tooManyRequests } from "@/lib/security/rateLimit";
import {
  INVITE_COLS, MEMBER_COLS, inviteState, isActiveMember, limitsFor, listMembers, loadMailbox, loadMember, mailboxDto,
  normalizeInviteCode, notify, photoCounts, type InviteRow, type MemberRow,
} from "@/lib/mailboxes/server";

export const dynamic = "force-dynamic";
const RULE = { name: "mbinvite", windowSec: 3600, max: 30 };

export async function POST(_req: NextRequest, props: { params: Promise<{ code: string }> }) {
  const { code: raw } = await props.params;
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ detail: "unauthenticated" }, { status: 401 });
  const rl = await checkRateLimit(RULE, userId);
  if (!rl.allowed) return tooManyRequests(rl, "초대코드 시도가 너무 많습니다. 잠시 후 다시 시도해 주세요.");
  const code = normalizeInviteCode(raw);
  if (!code) return NextResponse.json({ detail: "invalid_code" }, { status: 400 });
  const db = eventsDb();
  if (!db) return NextResponse.json({ detail: "server_misconfigured" }, { status: 500 });
  const { data } = await db.from("mailbox_invites").select(INVITE_COLS).eq("code", code).maybeSingle();
  if (!data) return NextResponse.json({ detail: "invite_not_found" }, { status: 404 });
  const inv = data as InviteRow;
  const mb = await loadMailbox(db, inv.mailbox_id);
  if (!mb || mb.status !== "active") return NextResponse.json({ detail: "invite_not_found" }, { status: 404 });

  const existing = await loadMember(db, mb.id, userId);
  if (existing?.kicked_at) return NextResponse.json({ detail: "kicked" }, { status: 403 });
  if (isActiveMember(existing)) {
    return NextResponse.json({ mailbox: await dtoFor(db, mb, userId), already: true });
  }
  const state = inviteState(inv, mb);
  if (state === "used") return NextResponse.json({ detail: "invite_used" }, { status: 409 });
  if (state === "expired") return NextResponse.json({ detail: "invite_expired" }, { status: 410 });
  if (state === "revoked") return NextResponse.json({ detail: "invite_revoked" }, { status: 410 });
  if (state === "closed") return NextResponse.json({ detail: "invite_closed" }, { status: 403 });

  const members = await listMembers(db, mb.id);
  const limits = mb.owner_user_id ? await limitsFor(mb.owner_user_id) : { members: 20 };
  if (members.filter(isActiveMember).length >= limits.members) {
    return NextResponse.json({ detail: "member_limit", limit: limits.members }, { status: 403 });
  }

  const now = new Date().toISOString();
  // 1) 코드 1회 사용 처리 먼저 — 경합(같은 코드 동시 수락) 시 used_at IS NULL 조건으로 한 명만 통과 (A-84①)
  const { data: used, error: useErr } = await db
    .from("mailbox_invites").update({ used_by: userId, used_at: now }).eq("code", code).is("used_at", null).select("code");
  if (useErr) {
    console.error("[mailboxes] accept consume failed:", useErr.message);
    return NextResponse.json({ detail: "db_error" }, { status: 500 });
  }
  if (!used || used.length === 0) return NextResponse.json({ detail: "invite_used" }, { status: 409 });

  // 2) 멤버 upsert — 실패하면 코드를 되돌려 다시 쓸 수 있게 (used_by=본인 조건으로 남의 소비는 건드리지 않음)
  const fields = {
    display_name: inv.invitee_name, role_text: inv.role_text, can_capture: inv.can_capture, capture_billing: inv.capture_billing,
    left_at: null, accepted_at: now,
  };
  const { error: upErr } = existing
    ? await db.from("mailbox_members").update(fields).eq("mailbox_id", mb.id).eq("user_id", userId)
    : await db.from("mailbox_members").insert({ mailbox_id: mb.id, user_id: userId, kind: "member", ...fields });
  if (upErr) {
    console.error("[mailboxes] accept failed:", upErr.message);
    const { error: revErr } = await db
      .from("mailbox_invites").update({ used_by: null, used_at: null }).eq("code", code).eq("used_by", userId);
    if (revErr) console.error("[mailboxes] accept revert failed:", revErr.message);
    return NextResponse.json({ detail: "db_error" }, { status: 500 });
  }
  if (mb.owner_user_id) {
    await notify(db, [mb.owner_user_id], mb.id, "invite_accepted", { mailbox_name: mb.name, actor_name: inv.invitee_name, role_text: inv.role_text });
  }
  console.log(`[mailboxes] joined(code) user=${userId} mailbox=${mb.id}`);
  return NextResponse.json({ mailbox: await dtoFor(db, mb, userId) });
}

async function dtoFor(db: NonNullable<ReturnType<typeof eventsDb>>, mb: NonNullable<Awaited<ReturnType<typeof loadMailbox>>>, userId: string) {
  const { data } = await db.from("mailbox_members").select(MEMBER_COLS).eq("mailbox_id", mb.id);
  const counts = await photoCounts(db, [mb.id], userId);
  return mailboxDto(db, mb, (data ?? []) as MemberRow[], userId, counts.get(mb.id) ?? { photo_count: 0, unread_count: 0 });
}
