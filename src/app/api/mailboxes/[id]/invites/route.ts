// 1회용 초대코드 생성 (A-81) — POST /api/mailboxes/:id/invites { invitee_name, role_text?, can_capture?, capture_billing? } (개설자)
//   응답: 코드·표시형·URL·만료·초대문·QR URL. 초대 종료·잠금·삭제 예고 상태면 403 invite_closed. 참여자 한도 초과 403 member_limit.
import { NextRequest, NextResponse } from "next/server";
import { isProUser, isSeatMailbox, parseSeatPayment, releaseSponsorPass, reserveSponsorPass, seatPaymentRequired } from "@/lib/photobox/seat";

import { getSessionUserId } from "@/lib/auth/getSessionUserId";
import { eventsDb } from "@/lib/events/server";
import {
  INVITE_TTL_DAYS, formatInviteCode, generateInviteCode, inviteMessage, inviteUrl, isActiveMember, isLocked, langOf,
  limitsFor, listMembers, loadMailbox, ownerPartnerRef,
} from "@/lib/mailboxes/server";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ detail: "unauthenticated" }, { status: 401 });
  const db = eventsDb();
  if (!db) return NextResponse.json({ detail: "server_misconfigured" }, { status: 500 });
  const mb = await loadMailbox(db, id);
  if (!mb || mb.status !== "active") return NextResponse.json({ detail: "not_found" }, { status: 404 });
  if (mb.owner_user_id !== userId) return NextResponse.json({ detail: "forbidden" }, { status: 403 });
  if (mb.invite_status !== "open" || isLocked(mb)) return NextResponse.json({ detail: "invite_closed" }, { status: 403 });
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ detail: "invalid_json" }, { status: 400 });
  }
  const inviteeName = typeof body.invitee_name === "string" ? body.invitee_name.trim().slice(0, 40) : "";
  if (!inviteeName) return NextResponse.json({ detail: "invitee_name_required" }, { status: 400 });
  const roleText = typeof body.role_text === "string" ? body.role_text.trim().slice(0, 40) || null : null;
  const canCapture = body.can_capture !== false;
  // A-108 부동산사진함: 촬영은 항상 본인 좌석에서 차감(capture_billing=self 고정). 참여 비용은 대납 토글(sponsor)로 개설자가 전액 부담 가능.
  const seatMailbox = isSeatMailbox(mb.type);
  const captureBilling = seatMailbox ? "self" : body.capture_billing === "self" ? "self" : "owner";
  const sponsor = seatMailbox && body.sponsor === true;
  const sponsorPayment = sponsor ? parseSeatPayment(body.sponsor_payment) ?? { kind: "owned" as const } : null;
  if (seatMailbox && !(await isProUser(userId))) {
    // 개설자 Pro 해지 후: 보관·촬영은 유지, 새 초대·대납은 Pro 재가입 시 (§9-4)
    return NextResponse.json({ detail: "pro_required" }, { status: 403 });
  }

  const members = await listMembers(db, id);
  const limits = await limitsFor(userId);
  if (members.filter(isActiveMember).length >= limits.members) {
    return NextResponse.json({ detail: "member_limit", limit: limits.members, paid: limits.paid }, { status: 403 });
  }

  const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 86400_000).toISOString();
  let code = generateInviteCode();
  // A-108 대납 초대: 초대를 만들기 전에 개설자 패스 1장(또는 할인권 2장)을 이 코드에 예약. 초대 저장 실패 시 반환.
  let sponsorPassId: string | null = null;
  if (sponsorPayment) {
    const r = await reserveSponsorPass(userId, code, sponsorPayment);
    if (!r.ok) return seatPaymentRequired(userId, r.reason);
    sponsorPassId = r.passId;
  }
  for (let attempt = 0; attempt < 5; attempt++) {
    const { error } = await db.from("mailbox_invites").insert({
      code, mailbox_id: id, invitee_name: inviteeName, role_text: roleText, can_capture: canCapture,
      capture_billing: captureBilling, created_by: userId, expires_at: expiresAt,
      ...(sponsorPassId ? { sponsor_pass_id: sponsorPassId } : {}),
    });
    if (!error) break;
    if (error.code === "23505" && attempt < 4 && !sponsorPassId) {
      code = generateInviteCode();
      continue;
    }
    console.error("[mailboxes] invite insert failed:", error.message);
    await releaseSponsorPass(sponsorPassId);
    return NextResponse.json({ detail: "db_error" }, { status: 500 });
  }
  const lang = langOf(req.nextUrl.searchParams.get("locale"));
  const owner = members.find((m) => m.kind === "owner");
  // (2026-09-11 A-94) 개설자 파트너코드 → 초대 URL·초대문에 ?ref= (없으면 미부착). 1회 조회
  const ref = await ownerPartnerRef(userId);
  console.log(`[mailboxes] invite created mailbox=${id} code=${code}`);
  return NextResponse.json(
    {
      invite: {
        code,
        code_display: formatInviteCode(code),
        url: inviteUrl(code, lang, ref),
        qr_url: `/api/mailboxes/invites/${code}/qr`,
        invitee_name: inviteeName,
        role_text: roleText,
        can_capture: canCapture,
        capture_billing: captureBilling,
        sponsored: !!sponsorPassId,
        created_at: new Date().toISOString(),
        expires_at: expiresAt,
        state: "valid",
        message: inviteMessage(lang, {
          inviteeName, roleText, ownerName: owner?.display_name ?? "", mailboxName: mb.name, code, expiresAt, ref,
        }),
      },
    },
    { status: 201 },
  );
}
