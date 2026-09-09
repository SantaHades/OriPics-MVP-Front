// 초대문 텍스트 (A-81) — GET /api/mailboxes/invites/:code/message?locale= (개설자만) → { message }
import { NextRequest, NextResponse } from "next/server";

import { getSessionUserId } from "@/lib/auth/getSessionUserId";
import { eventsDb } from "@/lib/events/server";
import { INVITE_COLS, inviteMessage, langOf, loadMailbox, normalizeInviteCode, type InviteRow } from "@/lib/mailboxes/server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, props: { params: Promise<{ code: string }> }) {
  const { code: raw } = await props.params;
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ detail: "unauthenticated" }, { status: 401 });
  const code = normalizeInviteCode(raw);
  if (!code) return NextResponse.json({ detail: "invalid_code" }, { status: 400 });
  const db = eventsDb();
  if (!db) return NextResponse.json({ detail: "server_misconfigured" }, { status: 500 });
  const { data } = await db.from("mailbox_invites").select(INVITE_COLS).eq("code", code).maybeSingle();
  if (!data) return NextResponse.json({ detail: "invite_not_found" }, { status: 404 });
  const inv = data as InviteRow;
  const mb = await loadMailbox(db, inv.mailbox_id);
  if (!mb || mb.owner_user_id !== userId) return NextResponse.json({ detail: "forbidden" }, { status: 403 });
  const { data: owner } = await db.from("mailbox_members").select("display_name").eq("mailbox_id", mb.id).eq("kind", "owner").maybeSingle();
  const lang = langOf(req.nextUrl.searchParams.get("locale"));
  return NextResponse.json({
    message: inviteMessage(lang, {
      inviteeName: inv.invitee_name, roleText: inv.role_text, ownerName: (owner?.display_name as string | undefined) ?? "",
      mailboxName: mb.name, code, expiresAt: inv.expires_at,
    }),
  });
}
