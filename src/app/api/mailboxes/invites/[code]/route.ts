// 초대코드 공개 조회 (A-81) — GET /api/mailboxes/invites/:code — 로그인 불필요 (웹 랜딩·앱 미리보기)
//   사서함 내용(사진·참여자)은 절대 노출하지 않는다. 이름·개설자·초대받는 이름·역할·촬영 조건·만료·상태만.
import { NextRequest, NextResponse } from "next/server";

import { eventsDb, isMissingTable } from "@/lib/events/server";
import { INVITE_COLS, formatInviteCode, inviteState, loadMailbox, normalizeInviteCode, type InviteRow } from "@/lib/mailboxes/server";
import { RATE_LIMITS, checkRateLimit, clientIp, tooManyRequests } from "@/lib/security/rateLimit";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, props: { params: Promise<{ code: string }> }) {
  const { code: raw } = await props.params;
  const code = normalizeInviteCode(raw);
  if (!code) return NextResponse.json({ detail: "invalid_code" }, { status: 400 });
  // A-83: 비로그인 공개 조회 — IP별 시간당 60회. 코드 존재 여부 오라클(무차별 조회) 억제
  const rl = await checkRateLimit(RATE_LIMITS.mailboxInviteLookup, clientIp(req));
  if (!rl.allowed) return tooManyRequests(rl, "조회가 너무 많습니다. 잠시 후 다시 시도해 주세요.");
  const db = eventsDb();
  if (!db) return NextResponse.json({ detail: "server_misconfigured" }, { status: 500 });
  const { data, error } = await db.from("mailbox_invites").select(INVITE_COLS).eq("code", code).maybeSingle();
  if (error) return NextResponse.json({ detail: isMissingTable(error) ? "setup_required" : "db_error" }, { status: isMissingTable(error) ? 503 : 500 });
  if (!data) return NextResponse.json({ detail: "invite_not_found" }, { status: 404 });
  const inv = data as InviteRow;
  const mb = await loadMailbox(db, inv.mailbox_id);
  if (!mb) return NextResponse.json({ detail: "invite_not_found" }, { status: 404 });
  const { data: owner } = await db.from("mailbox_members").select("display_name").eq("mailbox_id", mb.id).eq("kind", "owner").maybeSingle();
  return NextResponse.json({
    invite: {
      code,
      code_display: formatInviteCode(code),
      state: inviteState(inv, mb),
      mailbox_id: mb.id,
      mailbox_name: mb.name,
      owner_name: (owner?.display_name as string | undefined) ?? "",
      invitee_name: inv.invitee_name,
      role_text: inv.role_text,
      can_capture: inv.can_capture,
      capture_billing: inv.capture_billing,
      expires_at: inv.expires_at,
    },
  });
}
