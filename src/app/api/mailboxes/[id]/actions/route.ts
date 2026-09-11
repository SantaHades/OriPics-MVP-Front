// 사서함 상태 동작 (A-81) — POST /api/mailboxes/:id/actions { action: 'lock' | 'unlock' | 'cancel_delete' | 'leave' | 'transfer_owner', user_id? }
//   transfer_owner(2차): 개설자 권한을 참여 중인 다른 참여자에게 이전 — 이후 참여자 촬영의 기본 부담·설정 권한이 새 개설자에게
//   lock/unlock/cancel_delete = 개설자, leave = 참여자(개설자 불가). 각 동작은 해당자에게 인앱 알림.
import { NextRequest, NextResponse } from "next/server";

import { getSessionUserId } from "@/lib/auth/getSessionUserId";
import { eventsDb } from "@/lib/events/server";
import { isActiveMember, isLocked, limitsFor, listMembers, loadMailbox, loadMember, notify } from "@/lib/mailboxes/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ detail: "unauthenticated" }, { status: 401 });
  const db = eventsDb();
  if (!db) return NextResponse.json({ detail: "server_misconfigured" }, { status: 500 });
  const mb = await loadMailbox(db, id);
  if (!mb || mb.status !== "active") return NextResponse.json({ detail: "not_found" }, { status: 404 });
  let body: { action?: unknown; user_id?: unknown; keep_memo?: unknown };
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
  if (action === "transfer_owner") {
    const targetId = typeof body.user_id === "string" ? body.user_id : "";
    const target = members.find((m) => m.user_id === targetId);
    if (!target || !isActiveMember(target) || target.kind === "owner") return NextResponse.json({ detail: "member_not_found" }, { status: 404 });
    // A-84③: 잠금·삭제 예고 중에는 개설자 이전 불가 (잠금 해제/삭제 취소 후 진행)
    if (isLocked(mb)) return NextResponse.json({ detail: "mailbox_locked" }, { status: 409 });
    const meRow = members.find((m) => m.user_id === userId);
    // 받는 사람의 개설 한도(무료 1개) 검사 — 초과면 거절. 참여자 한도(무료 20)는 기존 인원 유지, 새 초대만 막힘(초대 생성 시 검사)
    const recipientLimits = await limitsFor(targetId);
    const { count: owned } = await db.from("mailboxes").select("id", { count: "exact", head: true }).eq("owner_user_id", targetId).eq("status", "active");
    if ((owned ?? 0) >= recipientLimits.mailboxes) {
      return NextResponse.json({ detail: "recipient_mailbox_limit", limit: recipientLimits.mailboxes }, { status: 403 });
    }
    const ownerBilled = members.filter(isActiveMember).filter((m) => m.user_id !== targetId && m.kind !== "owner" && m.can_capture && m.capture_billing !== "self").length + 1; // +1 = 이전 개설자(본인 부담으로 바뀌지만 알림 시점 표기) 제외 → 아래에서 조정
    // 나만 보는 사서함 메모: 기본은 삭제(개인 기록), 개설자가 넘기기를 선택하면 유지 (9/10 대표)
    const keepMemo = body.keep_memo === true;
    // A-84③: 3개 UPDATE를 한 트랜잭션으로 — Prisma는 Supabase와 같은 Postgres에 붙어 있어(rate_limits·links 쿼터 조회와 동일)
    // 전용 RPC 없이 원자성을 얻는다. 첫 UPDATE는 "지금도 내가 개설자·잠금/삭제예고 아님"을 조건으로 걸어 동시 요청·상태 변경 경합을 막고,
    // 대상이 그 사이 나감/내보내짐이면 두 번째 UPDATE가 0행 → 전체 롤백.
    try {
      await prisma.$transaction(async (tx) => {
        const n1 = await tx.$executeRaw`
          UPDATE public.mailboxes
          SET owner_user_id = ${targetId}, updated_at = now(),
              memo = CASE WHEN ${keepMemo}::boolean THEN memo ELSE NULL END
          WHERE id = ${id} AND owner_user_id = ${userId} AND locked_at IS NULL AND delete_after IS NULL`;
        if (n1 !== 1) throw new Error("transfer_conflict");
        const n2 = await tx.$executeRaw`
          UPDATE public.mailbox_members
          SET kind = 'owner', capture_billing = 'owner', can_capture = TRUE
          WHERE mailbox_id = ${id} AND user_id = ${targetId} AND kicked_at IS NULL AND left_at IS NULL`;
        if (n2 !== 1) throw new Error("transfer_conflict");
        await tx.$executeRaw`
          UPDATE public.mailbox_members
          SET kind = 'member', capture_billing = 'self'
          WHERE mailbox_id = ${id} AND user_id = ${userId}`;
      });
    } catch (e: any) {
      if (e?.message === "transfer_conflict") return NextResponse.json({ detail: "transfer_conflict" }, { status: 409 });
      console.error("[mailboxes] transfer_owner failed:", e?.message || e);
      return NextResponse.json({ detail: "db_error" }, { status: 500 });
    }
    await notify(db, [targetId], id, "owner_transferred", {
      mailbox_name: mb.name,
      actor_name: meRow?.display_name ?? "",
      owner_billed_count: Math.max(ownerBilled - 1, 0), // 이전 개설자는 본인 부담으로 전환되므로 제외
      recipient_paid: recipientLimits.paid,
    });
    console.log(`[mailboxes] owner transferred ${id}: ${userId} -> ${targetId}`);
    return NextResponse.json({ ok: true, owner_user_id: targetId });
  }
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
