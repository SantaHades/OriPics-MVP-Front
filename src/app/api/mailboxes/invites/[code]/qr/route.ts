// 초대 QR (A-81) — GET /api/mailboxes/invites/:code/qr → PNG. 내용 = 초대 URL(https://ori.pics/{lang}/invite/XXXX-XXXX)
//   코드 자체가 1회용 비밀이므로 존재하는 코드만 그린다(무차별 조회로 유효 코드 탐색은 8자 영숫자 32^8로 비현실적).
import { NextRequest, NextResponse } from "next/server";
import QRCode from "qrcode";

import { eventsDb } from "@/lib/events/server";
import { inviteUrl, langOf, normalizeInviteCode } from "@/lib/mailboxes/server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, props: { params: Promise<{ code: string }> }) {
  const { code: raw } = await props.params;
  const code = normalizeInviteCode(raw);
  if (!code) return NextResponse.json({ detail: "invalid_code" }, { status: 400 });
  const db = eventsDb();
  if (!db) return NextResponse.json({ detail: "server_misconfigured" }, { status: 500 });
  const { data } = await db.from("mailbox_invites").select("code").eq("code", code).maybeSingle();
  if (!data) return NextResponse.json({ detail: "invite_not_found" }, { status: 404 });
  const lang = langOf(req.nextUrl.searchParams.get("locale"));
  const png = await QRCode.toBuffer(inviteUrl(code, lang), { type: "png", width: 512, margin: 1, errorCorrectionLevel: "M" });
  return new NextResponse(new Uint8Array(png), {
    headers: { "Content-Type": "image/png", "Cache-Control": "private, max-age=600" },
  });
}
