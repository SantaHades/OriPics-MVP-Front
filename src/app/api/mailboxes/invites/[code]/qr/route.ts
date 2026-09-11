// 초대 QR (A-81) — GET /api/mailboxes/invites/:code/qr → PNG. 내용 = 초대 URL(https://ori.pics/{lang}/invite/XXXX-XXXX)
//   코드 자체가 1회용 비밀이므로 존재하는 코드만 그린다(무차별 조회로 유효 코드 탐색은 8자 영숫자 32^8로 비현실적).
import { NextRequest, NextResponse } from "next/server";
import QRCode from "qrcode";

import { eventsDb } from "@/lib/events/server";
import { inviteUrl, langOf, normalizeInviteCode } from "@/lib/mailboxes/server";
import { RATE_LIMITS, checkRateLimit, clientIp, tooManyRequests } from "@/lib/security/rateLimit";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, props: { params: Promise<{ code: string }> }) {
  const { code: raw } = await props.params;
  const code = normalizeInviteCode(raw);
  if (!code) return NextResponse.json({ detail: "invalid_code" }, { status: 400 });
  // A-83: 공개 QR — 조회 라우트와 같은 IP별 카운터(시간당 60회)를 공유해 코드 존재 여부 오라클 억제
  const rl = await checkRateLimit(RATE_LIMITS.mailboxInviteLookup, clientIp(req));
  if (!rl.allowed) return tooManyRequests(rl, "조회가 너무 많습니다. 잠시 후 다시 시도해 주세요.");
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
