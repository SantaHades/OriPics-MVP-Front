// 사진함 패스 좌석 — 사진함 API용 상위 동작 (A-108 2단계, 2026-09-23). 설계: docs/photobox-pass-design.md §4
// pass.ts의 원시 동작(acquire/bind/reserve/release)을 한 트랜잭션으로 묶고, 라우트가 그대로 돌려줄 오류 코드로 변환한다.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  acquirePass, bindPass, canPaySeat, photoboxWallet, releaseReservedPass, reservePassForInvite,
  type AcquireFailure, type SeatPayment, type PhotoboxWallet,
} from "./pass";

/** 사진함 종류 — 부동산만 활성, 나머지 3종은 "준비 중" (대표 2026-09-23) */
export const MAILBOX_TYPES = ["general", "real_estate", "accident", "rental_car", "construction"] as const;
export type MailboxType = (typeof MAILBOX_TYPES)[number];
export const ACTIVE_MAILBOX_TYPES: readonly MailboxType[] = ["general", "real_estate"];

export function parseMailboxType(v: unknown): MailboxType | null {
  return typeof v === "string" && (MAILBOX_TYPES as readonly string[]).includes(v) ? (v as MailboxType) : null;
}

/** 좌석 비용(사진함 패스)이 필요한 종류 — 현재 부동산만 */
export function isSeatMailbox(type: string | null | undefined): boolean {
  return type === "real_estate";
}

export async function isProUser(userId: string): Promise<boolean> {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { tier: true } });
  return u?.tier === "pro" || u?.tier === "business";
}

/** 요청 본문의 seat_payment → SeatPayment. 없으면 null(호출측이 402 안내) */
export function parseSeatPayment(v: unknown): SeatPayment | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  if (o.kind === "owned") return { kind: "owned" };
  if (o.kind === "coupon") return { kind: "coupon" };
  if (o.kind === "code" && typeof o.code === "string" && o.code.trim()) return { kind: "code", code: o.code };
  return null;
}

/** 좌석 비용 부족·수단 오류 응답 — 앱·웹이 지갑 상태로 안내(앱은 코드 입력만, 웹은 구매 링크) */
export async function seatPaymentRequired(userId: string, reason: AcquireFailure | "seat_payment_required"): Promise<NextResponse> {
  const wallet = await photoboxWallet(userId);
  const status = reason === "seat_payment_required" || reason === "no_pass" || reason === "not_enough_coupons" ? 402 : 409;
  return NextResponse.json({ detail: reason === "seat_payment_required" ? reason : `seat_${reason}`, wallet }, { status });
}

export type SeatChargeResult = { ok: true; passId: string } | { ok: false; reason: AcquireFailure };

/** 결제 수단으로 패스 1장을 확보해 좌석에 묶는다 (개설자 개설·본인 부담 수락·본인 추가·개설자 추가 대납) */
export async function chargeSeat(
  payerId: string,
  seat: { mailboxId: string; userId: string; paidBy: "self" | "owner" },
  payment: SeatPayment,
): Promise<SeatChargeResult> {
  return prisma.$transaction(async (tx) => {
    const a = await acquirePass(tx, payerId, payment);
    if (!a.ok) return a;
    const bound = await bindPass(tx, a.passId, seat);
    if (!bound) throw new Error("photobox_bind_failed");
    return { ok: true as const, passId: a.passId };
  });
}

/** 대납 초대: 개설자 패스 1장을 초대 코드에 예약 */
export async function reserveSponsorPass(ownerId: string, inviteCode: string, payment: SeatPayment): Promise<SeatChargeResult> {
  return prisma.$transaction(async (tx) => {
    const a = await acquirePass(tx, ownerId, payment);
    if (!a.ok) return a;
    const ok = await reservePassForInvite(tx, a.passId, inviteCode);
    if (!ok) throw new Error("photobox_reserve_failed");
    return { ok: true as const, passId: a.passId };
  });
}

/** 예약 패스를 초대받은 사람 좌석으로 확정 */
export async function bindSponsorPass(passId: string, mailboxId: string, userId: string): Promise<boolean> {
  return prisma.$transaction((tx) => bindPass(tx, passId, { mailboxId, userId, paidBy: "owner" }));
}

/** 초대 취소·만료·재참여(차감 불필요) 시 예약 패스를 개설자에게 반환 */
export async function releaseSponsorPass(passId: string | null | undefined): Promise<void> {
  if (!passId) return;
  try {
    await releaseReservedPass(prisma, passId);
  } catch (e: any) {
    console.error("[photobox] release sponsor pass failed:", passId, e?.message ?? e);
  }
}

/** 좌석 바인딩을 되돌린다(좌석 연결 후 멤버 등록이 실패한 드문 경우). 사용 이력이 없을 때만. */
export async function unbindPass(passId: string, back: "issued" | "reserved", inviteCode?: string | null): Promise<void> {
  try {
    await prisma.$executeRaw`
      UPDATE public.photobox_passes
      SET status = ${back}, mailbox_id = NULL, seat_user_id = NULL, paid_by = NULL, bound_at = NULL,
          reserved_invite = ${back === "reserved" ? inviteCode ?? null : null}, updated_at = now()
      WHERE id = ${passId} AND status = 'bound' AND used = 0`;
  } catch (e: any) {
    console.error("[photobox] unbind failed:", passId, e?.message ?? e);
  }
}

export { canPaySeat, photoboxWallet, type PhotoboxWallet, type SeatPayment };
