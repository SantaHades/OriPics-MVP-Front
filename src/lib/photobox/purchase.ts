// 사진함 패스 결제 검증·발급·환불 (A-108 4단계, 2026-09-23). 원데이 패스(lib/pass/passPurchase.ts)와 같은 골격:
// 클라이언트 정보는 믿지 않고 paymentId로 PortOne에 재질의해 PAID·정확한 금액·상품 마커·소유권을 확인한 뒤 발급한다.
// complete 라우트와 webhook이 동시에 올 수 있어 advisory lock + photobox_passes.payment_id로 멱등 처리.
//
// 환불 정책(설계 §5): 등록하지 않은(issued) 코드만 구매 후 7일 이내 전액 환불. 사진함에 등록(사용 시작)한 뒤에는 환불 불가.
import * as PortOne from "@portone/server-sdk";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import { generatePhotoboxCode, PHOTOBOX_CODE_VALID_DAYS, PHOTOBOX_PASS_PHOTOS, PHOTOBOX_PASS_PRICE_KRW } from "./pass";

export const PHOTOBOX_ORDER_NAME = "OriPics 사진함 패스";
/** checkout customData.product 마커 — 타 상품 결제 재사용(교차 리플레이) 차단 */
export const PHOTOBOX_PRODUCT_MARKER = "photobox_pass";
export const PHOTOBOX_REFUND_DAYS = 7;

export type PhotoboxPurchaseResult =
  | { ok: true; testChannel?: false; alreadyProcessed: boolean; code: string; codeExpiresAt: Date }
  | { ok: true; testChannel: true }
  | {
      ok: false;
      code: "portone_lookup_failed" | "payment_not_paid" | "amount_mismatch" | "wrong_product" | "ownership_mismatch" | "db_update_failed";
      httpStatus: number;
      detail?: unknown;
    };

export async function verifyAndIssuePhotoboxPass(opts: { paymentId: string; userId: string; secret: string }): Promise<PhotoboxPurchaseResult> {
  const { paymentId, userId, secret } = opts;
  const client = PortOne.PaymentClient({ secret });
  let payment: any;
  try {
    payment = await client.getPayment({ paymentId });
  } catch (e: any) {
    return { ok: false, code: "portone_lookup_failed", httpStatus: 502, detail: e?.message };
  }
  if (payment.status !== "PAID") return { ok: false, code: "payment_not_paid", httpStatus: 402, detail: payment.status };
  // 테스트 채널(PG 심사) — 청구가 없으므로 발급하면 무료 패스 구멍. 성공 화면만 정상 노출.
  if (payment.channel?.type === "TEST") {
    console.warn("[photoboxPurchase] TEST channel payment — verified but not issuing", { paymentId, userId });
    return { ok: true, testChannel: true };
  }
  const paidAmount = payment.amount?.total;
  if (paidAmount !== PHOTOBOX_PASS_PRICE_KRW) {
    return { ok: false, code: "amount_mismatch", httpStatus: 400, detail: { expected: PHOTOBOX_PASS_PRICE_KRW, paid: paidAmount } };
  }
  let payUser: string | undefined;
  let product: string | undefined;
  try {
    if (payment.customData) {
      const parsed = JSON.parse(payment.customData);
      if (typeof parsed?.userId === "string") payUser = parsed.userId;
      if (typeof parsed?.product === "string") product = parsed.product;
    }
  } catch {
    /* 아래 검증으로 흡수 */
  }
  // 사진함 패스는 신규 상품이라 마커 필수(원데이처럼 미주입 결제 하위호환이 필요 없음)
  if (product !== PHOTOBOX_PRODUCT_MARKER) return { ok: false, code: "wrong_product", httpStatus: 400 };
  if (payUser && payUser !== userId) return { ok: false, code: "ownership_mismatch", httpStatus: 403 };

  try {
    return await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`portone:photobox:${paymentId}`}))`;
      const existing = await tx.$queryRaw<Array<{ code: string; code_expires_at: Date }>>`
        SELECT code, code_expires_at FROM public.photobox_passes WHERE payment_id = ${paymentId} LIMIT 1`;
      if (existing.length) {
        return { ok: true as const, alreadyProcessed: true, code: existing[0].code, codeExpiresAt: new Date(existing[0].code_expires_at) };
      }
      const code = generatePhotoboxCode();
      const rows = await tx.$queryRaw<Array<{ code_expires_at: Date }>>`
        INSERT INTO public.photobox_passes (id, code, status, source, purchaser_id, payment_id, code_expires_at, total)
        VALUES (${randomUUID()}, ${code}, 'issued', 'purchase', ${userId}, ${paymentId},
                now() + make_interval(days => ${PHOTOBOX_CODE_VALID_DAYS}::int), ${PHOTOBOX_PASS_PHOTOS})
        RETURNING code_expires_at`;
      // 프로필 최근 내역용 기록(크레딧 변동 없음) — webhook 경로로만 발급된 경우에도 본인이 코드를 되찾는 경로
      const u = await tx.user.findUnique({ where: { id: userId }, select: { credits: true } });
      await tx.creditTransaction.create({
        data: {
          userId, delta: 0, action: "photobox_purchase", balanceAfter: u?.credits ?? 0,
          metadata: { paymentId, code, amount: paidAmount, gateway: "portone", pgProvider: payment.channel?.pgProvider ?? "unknown" },
        },
      });
      return { ok: true as const, alreadyProcessed: false, code, codeExpiresAt: new Date(rows[0].code_expires_at) };
    });
  } catch (e: any) {
    console.error("[photoboxPurchase] DB update failed after payment verification", { userId, paymentId, error: e?.message });
    return { ok: false, code: "db_update_failed", httpStatus: 500, detail: paymentId };
  }
}

export type PhotoboxRevokeResult = "revoked" | "not_found" | "already_used";

/** 결제 취소 webhook — 해당 결제의 미등록 코드를 refunded로. 등록 후(좌석 연결) 상태는 건드리지 않고 경고만. */
export async function revokePhotoboxForPayment(paymentId: string): Promise<PhotoboxRevokeResult> {
  const n = await prisma.$executeRaw`
    UPDATE public.photobox_passes SET status = 'refunded', updated_at = now()
    WHERE payment_id = ${paymentId} AND status = 'issued'`;
  if (n > 0) return "revoked";
  const rows = await prisma.$queryRaw<Array<{ status: string }>>`
    SELECT status FROM public.photobox_passes WHERE payment_id = ${paymentId} LIMIT 1`;
  if (!rows.length) return "not_found";
  return rows[0].status === "refunded" || rows[0].status === "revoked" ? "revoked" : "already_used";
}

export type PhotoboxRefundResult =
  | { ok: true; amount: number }
  | { ok: false; reason: "not_found" | "not_owner" | "not_refundable" | "window_passed" | "pg_cancel_failed"; detail?: unknown };

/**
 * 미등록 코드 7일 내 원클릭 환불. 먼저 코드를 refunded로 잠가(동시에 사진함 등록되는 것 차단) PG 전액 취소,
 * PG 취소가 실패하면 issued로 되돌린다. webhook 반향(취소 이벤트)은 revokePhotoboxForPayment가 멱등 처리.
 */
export async function refundPhotoboxPass(opts: { code: string; userId: string; secret: string }): Promise<PhotoboxRefundResult> {
  const rows = await prisma.$queryRaw<Array<{ id: string; status: string; purchaser_id: string | null; payment_id: string | null; issued_at: Date }>>`
    SELECT id, status, purchaser_id, payment_id, issued_at FROM public.photobox_passes WHERE code = ${opts.code} LIMIT 1`;
  const p = rows[0];
  if (!p) return { ok: false, reason: "not_found" };
  if (p.purchaser_id !== opts.userId) return { ok: false, reason: "not_owner" };
  if (p.status !== "issued" || !p.payment_id) return { ok: false, reason: "not_refundable" };
  if (Date.now() - new Date(p.issued_at).getTime() > PHOTOBOX_REFUND_DAYS * 86400_000) return { ok: false, reason: "window_passed" };

  const locked = await prisma.$executeRaw`
    UPDATE public.photobox_passes SET status = 'refunded', updated_at = now() WHERE id = ${p.id} AND status = 'issued'`;
  if (locked !== 1) return { ok: false, reason: "not_refundable" };
  try {
    const client = PortOne.PaymentClient({ secret: opts.secret });
    await client.cancelPayment({
      paymentId: p.payment_id,
      amount: PHOTOBOX_PASS_PRICE_KRW,
      reason: "사진함 패스 미사용 청약철회 (구매 후 7일 이내)",
    });
  } catch (e: any) {
    await prisma.$executeRaw`UPDATE public.photobox_passes SET status = 'issued', updated_at = now() WHERE id = ${p.id} AND status = 'refunded'`;
    console.error("[photoboxRefund] cancelPayment failed", { paymentId: p.payment_id, error: e?.message, type: e?.data?.type });
    return { ok: false, reason: "pg_cancel_failed", detail: e?.data?.type ?? e?.message };
  }
  try {
    const u = await prisma.user.findUnique({ where: { id: opts.userId }, select: { credits: true } });
    await prisma.creditTransaction.create({
      data: {
        userId: opts.userId, delta: 0, action: "photobox_refund", balanceAfter: u?.credits ?? 0,
        metadata: { paymentId: p.payment_id, code: opts.code, amount: PHOTOBOX_PASS_PRICE_KRW },
      },
    });
  } catch {
    /* 내역 기록은 best-effort */
  }
  return { ok: true, amount: PHOTOBOX_PASS_PRICE_KRW };
}

/** 내 사진함 패스 목록(웹 프로필·/pass/photobox) — 코드는 본인에게만 */
export async function listMyPhotoboxPasses(userId: string) {
  const rows = await prisma.$queryRaw<Array<{
    code: string; status: string; source: string; issued_at: Date; code_expires_at: Date; payment_id: string | null;
    mailbox_id: string | null; seat_user_id: string | null; paid_by: string | null; total: number; used: number;
  }>>`
    SELECT code, status, source, issued_at, code_expires_at, payment_id, mailbox_id, seat_user_id, paid_by, total, used
    FROM public.photobox_passes WHERE purchaser_id = ${userId}
    ORDER BY issued_at DESC LIMIT 100`;
  const now = Date.now();
  return rows.map((r) => ({
    code: r.code,
    status: r.status,
    source: r.source,
    issued_at: new Date(r.issued_at).toISOString(),
    code_expires_at: new Date(r.code_expires_at).toISOString(),
    mailbox_id: r.mailbox_id,
    for_other: !!r.seat_user_id && r.seat_user_id !== userId,
    total: Number(r.total),
    used: Number(r.used),
    refundable: r.status === "issued" && !!r.payment_id && now - new Date(r.issued_at).getTime() <= PHOTOBOX_REFUND_DAYS * 86400_000,
  }));
}
