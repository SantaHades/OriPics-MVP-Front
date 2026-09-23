// 사진함 패스 (A-108, 2026-09-23) — 도메인 로직. 설계: docs/photobox-pass-design.md (v0.2)
//
// 핵심 개념 "좌석(seat)": 패스는 (mailbox_id, seat_user_id) 한 쌍에 묶이고, 좌석 잔여 = 묶인 패스들의 (total - used) 합.
//   - 패스 1장 = 100장, 사이즈 무관. 여러 장을 묶으면 누적(100+100).
//   - Pro 50% 할인권 2장 → source=coupon 패스 1장으로 전환(동일 100장). 할인권 1장+다른 수단 혼합 불가.
//   - 나가기·강퇴 = 좌석 정지(행은 그대로), 재참여 시 복구 — 이 모듈은 멤버십을 모른다(호출측이 멤버 상태 검사).
//   - 차감은 link_id당 1회(photobox_pass_uses PK) — A-100 confirm 멱등·재시도와 같은 기준.
//   - 대납: 초대 생성 시 개설자 패스를 reserved로 예약 → 수락 시 bound, 취소·만료 시 issued로 반환(횟수 제한 없음).
//
// 모든 변경 함수는 Tx(Prisma 트랜잭션)를 받아 사진함 생성·초대 수락 등 호출측 쓰기와 한 트랜잭션으로 묶인다.
// 테이블은 Prisma 스키마 밖(db_migrations/2026_09_23_a108_photobox_pass.sql) — raw SQL만 사용.
import { Prisma } from "@prisma/client";
import { randomBytes, randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";

type Tx = Prisma.TransactionClient;

export const PHOTOBOX_PASS_PHOTOS = 100;
export const PHOTOBOX_PASS_PRICE_KRW = 9900;
export const PHOTOBOX_CODE_VALID_DAYS = 365; // 미등록 코드 유효기간 (원데이와 동일)
export const PHOTOBOX_RETENTION_YEARS = 5;
/** 할인권 2장 = 패스 1장 */
export const COUPONS_PER_PASS = 2;

// ───────────────────────── 코드 ─────────────────────────

const CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTVWXYZ"; // dayPass와 동일(혼동 문자 제외)
export function generatePhotoboxCode(): string {
  const bytes = randomBytes(12);
  let s = "";
  for (let i = 0; i < 12; i++) {
    s += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
    if (i === 3 || i === 7) s += "-";
  }
  return `PB-${s}`;
}

/** 입력 코드 정규화 — 대소문자/공백/하이픈 허용. 원데이(OP-) 코드는 거부("" 반환) */
export function normalizePhotoboxCode(raw: string): string {
  const up = (raw ?? "").toUpperCase().replace(/[^0-9A-Z]/g, "");
  if (!up.startsWith("PB")) return "";
  const body = up.slice(2);
  if (body.length !== 12) return "";
  return `PB-${body.slice(0, 4)}-${body.slice(4, 8)}-${body.slice(8, 12)}`;
}

export function maskPhotoboxCode(code: string): string {
  const parts = code.split("-");
  if (parts.length !== 4) return code;
  return `${parts[0]}-${parts[1]}-****-${parts[3]}`;
}

// ───────────────────────── 결제 수단(좌석 비용) ─────────────────────────

/** 좌석 비용을 치르는 방법 — 셋 중 하나만(혼합 불가) */
export type SeatPayment =
  | { kind: "owned" }                 // 보유한 미등록 패스 중 코드 만료가 가까운 것
  | { kind: "code"; code: string }    // 입력한 코드
  | { kind: "coupon" };               // Pro 50% 할인권 2장

export type AcquireFailure =
  | "no_pass"            // owned: 보유 미등록 패스 없음
  | "invalid_code"
  | "code_already_used"
  | "code_expired"
  | "code_revoked"
  | "not_owner"          // 판매분은 구매 계정 전용
  | "not_enough_coupons";

export type AcquireResult = { ok: true; passId: string } | { ok: false; reason: AcquireFailure };

/**
 * 좌석 비용용 패스 1장 확보 → status='issued' 그대로 passId 반환(호출측이 bind/reserve).
 * 행 잠금(FOR UPDATE)으로 같은 패스를 두 요청이 동시에 쓰는 것을 막는다.
 */
export async function acquirePass(tx: Tx, payerId: string, payment: SeatPayment): Promise<AcquireResult> {
  if (payment.kind === "owned") {
    const rows = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM public.photobox_passes
      WHERE purchaser_id = ${payerId} AND status = 'issued' AND code_expires_at > now()
      ORDER BY code_expires_at ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED`;
    return rows.length ? { ok: true, passId: rows[0].id } : { ok: false, reason: "no_pass" };
  }

  if (payment.kind === "code") {
    const code = normalizePhotoboxCode(payment.code);
    if (!code) return { ok: false, reason: "invalid_code" };
    const rows = await tx.$queryRaw<Array<{
      id: string; status: string; code_expires_at: Date; payment_id: string | null; purchaser_id: string | null;
    }>>`
      SELECT id, status, code_expires_at, payment_id, purchaser_id FROM public.photobox_passes
      WHERE code = ${code}
      FOR UPDATE`;
    if (!rows.length) return { ok: false, reason: "invalid_code" };
    const p = rows[0];
    if (p.status === "revoked" || p.status === "refunded") return { ok: false, reason: "code_revoked" };
    if (p.status !== "issued") return { ok: false, reason: "code_already_used" };
    if (new Date(p.code_expires_at) <= new Date()) return { ok: false, reason: "code_expired" };
    // 판매분 = 구매 계정 전용(원데이 A안 변형과 동일). 어드민 발급분(payment_id NULL)은 등록하는 사람이 소유자가 된다.
    if (p.payment_id && p.purchaser_id !== payerId) return { ok: false, reason: "not_owner" };
    if (!p.payment_id && p.purchaser_id !== payerId) {
      await tx.$executeRaw`UPDATE public.photobox_passes SET purchaser_id = ${payerId}, updated_at = now() WHERE id = ${p.id}`;
    }
    return { ok: true, passId: p.id };
  }

  // coupon: 사용 가능한 pro_50 할인권 2장(만료 임박 순) → used 처리 + source=coupon 패스 발급
  const coupons = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM public.partner_benefits
    WHERE user_id = ${payerId} AND type = 'pro_50' AND status = 'available' AND expires_at > now()
    ORDER BY expires_at ASC
    LIMIT ${COUPONS_PER_PASS}::int
    FOR UPDATE SKIP LOCKED`;
  if (coupons.length < COUPONS_PER_PASS) return { ok: false, reason: "not_enough_coupons" };
  const passId = randomUUID();
  const ids = coupons.map((c) => c.id);
  await tx.$executeRaw`
    UPDATE public.partner_benefits
    SET status = 'used', used_at = now(), payment_id = ${`photobox:${passId}`}, updated_at = now()
    WHERE id = ANY(${ids}::text[]) AND status = 'available'`;
  await tx.$executeRaw`
    INSERT INTO public.photobox_passes (id, code, status, source, purchaser_id, benefit_ids, code_expires_at, total)
    VALUES (${passId}, ${generatePhotoboxCode()}, 'issued', 'coupon', ${payerId}, ${ids}::text[],
            now() + make_interval(days => ${PHOTOBOX_CODE_VALID_DAYS}::int), ${PHOTOBOX_PASS_PHOTOS})`;
  return { ok: true, passId };
}

/** issued 패스를 좌석에 묶는다(개설자 개설·본인 부담 수락·개설자 추가 대납). */
export async function bindPass(
  tx: Tx,
  passId: string,
  seat: { mailboxId: string; userId: string; paidBy: "self" | "owner" },
): Promise<boolean> {
  const n = await tx.$executeRaw`
    UPDATE public.photobox_passes
    SET status = 'bound', mailbox_id = ${seat.mailboxId}, seat_user_id = ${seat.userId},
        paid_by = ${seat.paidBy}, bound_at = now(), reserved_invite = NULL, updated_at = now()
    WHERE id = ${passId} AND status IN ('issued', 'reserved')`;
  return n === 1;
}

/** 대납 초대 생성: issued 패스를 초대에 예약 */
export async function reservePassForInvite(tx: Tx, passId: string, inviteCode: string): Promise<boolean> {
  const n = await tx.$executeRaw`
    UPDATE public.photobox_passes
    SET status = 'reserved', reserved_invite = ${inviteCode}, updated_at = now()
    WHERE id = ${passId} AND status = 'issued'`;
  return n === 1;
}

/** 대납 초대 취소·만료: 예약 패스를 개설자에게 반환(issued). 할인권에서 전환된 패스도 패스로 남는다. */
export async function releaseReservedPass(tx: Tx | typeof prisma, passId: string): Promise<boolean> {
  const n = await tx.$executeRaw`
    UPDATE public.photobox_passes
    SET status = 'issued', reserved_invite = NULL, updated_at = now()
    WHERE id = ${passId} AND status = 'reserved'`;
  return n === 1;
}

// ───────────────────────── 좌석 ─────────────────────────

export interface SeatBalance {
  total: number;
  used: number;
  remaining: number;
  passes: number;
  /** 좌석에 개설자 대납 패스가 하나라도 있으면 true (안내문·확인서 표기) */
  sponsored: boolean;
}

export async function seatBalance(client: Tx | typeof prisma, mailboxId: string, userId: string): Promise<SeatBalance> {
  const rows = await client.$queryRaw<Array<{ total: bigint | null; used: bigint | null; n: bigint; sponsored: boolean | null }>>`
    SELECT COALESCE(SUM(total), 0)::bigint AS total, COALESCE(SUM(used), 0)::bigint AS used, COUNT(*)::bigint AS n,
           BOOL_OR(paid_by = 'owner') AS sponsored
    FROM public.photobox_passes
    WHERE mailbox_id = ${mailboxId} AND seat_user_id = ${userId} AND status IN ('bound', 'exhausted')`;
  const r = rows[0];
  const total = Number(r?.total ?? 0);
  const used = Number(r?.used ?? 0);
  return { total, used, remaining: total - used, passes: Number(r?.n ?? 0), sponsored: !!r?.sponsored };
}

export type ConsumeSeatResult =
  | { ok: true; passId: string; replay: boolean; remaining: number }
  | { ok: false; reason: "seat_exhausted" };

/**
 * 좌석에서 사진 1장 차감(원자적·link_id 멱등).
 *  - 같은 link_id가 이미 차감됐으면 재차감 없이 replay=true (confirm 재시도·응답 유실).
 *  - 잔여가 있는 패스 중 먼저 묶인 것부터 사용, 마지막 장이면 exhausted로 전이.
 */
export async function consumeSeatPhoto(
  tx: Tx,
  opts: { mailboxId: string; userId: string; linkId: string; source: "capture" | "submit" },
): Promise<ConsumeSeatResult> {
  const prior = await tx.$queryRaw<Array<{ pass_id: string }>>`
    SELECT pass_id FROM public.photobox_pass_uses WHERE link_id = ${opts.linkId}`;
  if (prior.length) {
    const bal = await seatBalance(tx, opts.mailboxId, opts.userId);
    return { ok: true, passId: prior[0].pass_id, replay: true, remaining: bal.remaining };
  }
  const rows = await tx.$queryRaw<Array<{ id: string }>>`
    UPDATE public.photobox_passes
    SET used = used + 1,
        status = CASE WHEN used + 1 >= total THEN 'exhausted' ELSE status END,
        updated_at = now()
    WHERE id = (
      SELECT id FROM public.photobox_passes
      WHERE mailbox_id = ${opts.mailboxId} AND seat_user_id = ${opts.userId}
        AND status = 'bound' AND used < total
      ORDER BY bound_at ASC
      LIMIT 1
      FOR UPDATE)
    RETURNING id`;
  if (!rows.length) return { ok: false, reason: "seat_exhausted" };
  await tx.$executeRaw`
    INSERT INTO public.photobox_pass_uses (link_id, pass_id, mailbox_id, user_id, source)
    VALUES (${opts.linkId}, ${rows[0].id}, ${opts.mailboxId}, ${opts.userId}, ${opts.source})`;
  const bal = await seatBalance(tx, opts.mailboxId, opts.userId);
  return { ok: true, passId: rows[0].id, replay: false, remaining: bal.remaining };
}

// ───────────────────────── 보유 현황(설정 탭·개설/수락 화면) ─────────────────────────

export interface PhotoboxWallet {
  /** 등록 안 된(사용 전) 패스 수 */
  unusedPasses: number;
  /** 대납 초대에 예약 중인 패스 수 */
  reservedPasses: number;
  /** 사용 가능한 Pro 50% 할인권 수 (2장 = 패스 1장) */
  coupons: number;
}

export async function photoboxWallet(userId: string): Promise<PhotoboxWallet> {
  const [p] = await prisma.$queryRaw<Array<{ unused: bigint; reserved: bigint }>>`
    SELECT COUNT(*) FILTER (WHERE status = 'issued' AND code_expires_at > now())::bigint AS unused,
           COUNT(*) FILTER (WHERE status = 'reserved')::bigint AS reserved
    FROM public.photobox_passes WHERE purchaser_id = ${userId}`;
  const coupons = await prisma.partnerBenefit.count({
    where: { userId, type: "pro_50", status: "available", expiresAt: { gt: new Date() } },
  });
  return { unusedPasses: Number(p?.unused ?? 0), reservedPasses: Number(p?.reserved ?? 0), coupons };
}

/** 좌석 비용을 낼 수단이 하나라도 있는지(개설·수락 화면의 버튼 활성·안내 분기용) */
export function canPaySeat(w: PhotoboxWallet): boolean {
  return w.unusedPasses > 0 || w.coupons >= COUPONS_PER_PASS;
}

// ───────────────────────── 발급(어드민·구매) ─────────────────────────

export async function issuePhotoboxPasses(opts: {
  count: number;
  purchaserId?: string | null;
  paymentId?: string | null;
  source?: "purchase" | "admin";
}): Promise<string[]> {
  const codes: string[] = [];
  for (let i = 0; i < opts.count; i++) {
    const code = generatePhotoboxCode();
    await prisma.$executeRaw`
      INSERT INTO public.photobox_passes (id, code, status, source, purchaser_id, payment_id, code_expires_at, total)
      VALUES (${randomUUID()}, ${code}, 'issued', ${opts.source ?? (opts.paymentId ? "purchase" : "admin")},
              ${opts.purchaserId ?? null}, ${opts.paymentId ?? null},
              now() + make_interval(days => ${PHOTOBOX_CODE_VALID_DAYS}::int), ${PHOTOBOX_PASS_PHOTOS})`;
    codes.push(code);
  }
  return codes;
}

/** 부동산사진함 사진 보관 기한 = 등록 시각 + 5년 */
export function retainUntilFrom(date: Date): Date {
  const d = new Date(date);
  d.setFullYear(d.getFullYear() + PHOTOBOX_RETENTION_YEARS);
  return d;
}
