// 사진함 패스 좌석 (A-108 2단계) — 부동산사진함 전용
//   GET  /api/mailboxes/:id/seat                      → 내 좌석 잔여 + 지갑(보유 패스·할인권)
//   POST /api/mailboxes/:id/seat { seat_payment, for_user_id? }
//     - for_user_id 없음(또는 본인): 멤버 본인이 패스 추가(소진 전·후 모두 가능, 누적 100+100)
//     - for_user_id = 다른 멤버: 개설자 대납 추가(개설자 Pro 필요, 횟수 제한 없음 — 대표 9/23)
import { NextRequest, NextResponse } from "next/server";

import { getSessionUserId } from "@/lib/auth/getSessionUserId";
import { eventsDb } from "@/lib/events/server";
import { isActiveMember, isLocked, loadMailbox, loadMember } from "@/lib/mailboxes/server";
import { seatBalance } from "@/lib/photobox/pass";
import { chargeSeat, isProUser, isSeatMailbox, parseSeatPayment, photoboxWallet, seatPaymentRequired } from "@/lib/photobox/seat";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

async function guard(id: string) {
  const userId = await getSessionUserId();
  if (!userId) return { res: NextResponse.json({ detail: "unauthenticated" }, { status: 401 }) } as const;
  const db = eventsDb();
  if (!db) return { res: NextResponse.json({ detail: "server_misconfigured" }, { status: 500 }) } as const;
  const mb = await loadMailbox(db, id);
  if (!mb || mb.status !== "active") return { res: NextResponse.json({ detail: "not_found" }, { status: 404 }) } as const;
  if (!isSeatMailbox(mb.type)) return { res: NextResponse.json({ detail: "not_seat_mailbox" }, { status: 400 }) } as const;
  const me = await loadMember(db, id, userId);
  if (!isActiveMember(me)) return { res: NextResponse.json({ detail: "forbidden" }, { status: 403 }) } as const;
  return { userId, db, mb, me } as const;
}

export async function GET(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const g = await guard(id);
  if ("res" in g) return g.res;
  const [seat, wallet] = await Promise.all([seatBalance(prisma, id, g.userId), photoboxWallet(g.userId)]);
  return NextResponse.json({ seat, wallet });
}

export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const g = await guard(id);
  if ("res" in g) return g.res;
  if (isLocked(g.mb)) return NextResponse.json({ detail: "mailbox_locked" }, { status: 409 });
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ detail: "invalid_json" }, { status: 400 });
  }
  const payment = parseSeatPayment(body.seat_payment);
  if (!payment) return seatPaymentRequired(g.userId, "seat_payment_required");
  const target = typeof body.for_user_id === "string" && body.for_user_id ? body.for_user_id : g.userId;
  const sponsoring = target !== g.userId;
  if (sponsoring) {
    if (g.mb.owner_user_id !== g.userId) return NextResponse.json({ detail: "forbidden" }, { status: 403 });
    if (!(await isProUser(g.userId))) return NextResponse.json({ detail: "pro_required" }, { status: 403 });
    const t = await loadMember(g.db, id, target);
    if (!isActiveMember(t)) return NextResponse.json({ detail: "member_not_found" }, { status: 404 });
  }
  const r = await chargeSeat(g.userId, { mailboxId: id, userId: target, paidBy: sponsoring ? "owner" : "self" }, payment);
  if (!r.ok) return seatPaymentRequired(g.userId, r.reason);
  const seat = await seatBalance(prisma, id, target);
  console.log(`[photobox] seat add mailbox=${id} seat=${target} payer=${g.userId} pass=${r.passId}`);
  return NextResponse.json({ ok: true, seat });
}
