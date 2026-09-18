// 원데이 패스 결제 검증 + 코드 발급 (A-60 Phase 3, 2026-09-01).
//
// subscriptionGrant.ts와 같은 골격: 클라이언트가 보낸 정보는 신뢰하지 않고
// paymentId로 PortOne에 재질의해 "PAID + 정확한 금액"을 확인한 뒤 발급한다.
// 두 진입점(complete 라우트·webhook)이 동시에 처리할 수 있어 advisory lock으로
// 직렬화하고, day_passes.payment_id 존재 여부로 멱등성을 확보한다.
import * as PortOne from "@portone/server-sdk";
import { prisma } from "@/lib/prisma";
import { generatePassCode, PASS_CODE_VALID_DAYS } from "./dayPass";

/** 판매가 (VAT 포함) — /pass 페이지 표시가·checkout totalAmount와 일치해야 함 */
export const PASS_PRICE_KRW = 3300;
export const PASS_ORDER_NAME = "OriPics 원데이 패스";
/** checkout customData.product 마커 — 타 상품 결제 재사용(교차 리플레이) 차단 */
export const PASS_PRODUCT_MARKER = "day_pass";

export type PassPurchaseResult =
  | {
      ok: true;
      testChannel?: false;
      alreadyProcessed: boolean;
      code: string;
      codeExpiresAt: Date;
    }
  | {
      /** 테스트 채널(PG 상점 심사용) 결제 — 검증은 통과했지만 코드는 발급하지 않음 */
      ok: true;
      testChannel: true;
    }
  | {
      ok: false;
      code:
        | "portone_lookup_failed"
        | "payment_not_paid"
        | "amount_mismatch"
        | "wrong_product"
        | "ownership_mismatch"
        | "db_update_failed";
      httpStatus: number;
      detail?: any;
    };

/**
 * paymentId를 PortOne에 재질의해 PAID·금액·소유권을 검증한 뒤, 멱등적으로
 * 패스 코드를 발급한다. 반환 코드는 구매자에게만 노출할 것.
 */
export async function verifyAndIssueDayPass(opts: {
  paymentId: string;
  userId: string;
  secret: string;
}): Promise<PassPurchaseResult> {
  const { paymentId, userId, secret } = opts;

  // 1) PortOne 결제 조회 (네트워크 호출은 트랜잭션 밖에서)
  const client = PortOne.PaymentClient({ secret });
  let payment: any;
  try {
    payment = await client.getPayment({ paymentId });
  } catch (e: any) {
    return { ok: false, code: "portone_lookup_failed", httpStatus: 502, detail: e?.message };
  }

  if (payment.status !== "PAID") {
    return { ok: false, code: "payment_not_paid", httpStatus: 402, detail: payment.status };
  }

  // 테스트 채널 결제(KG이니시스 상점·카드사 심사 기간에 운영 사이트에 테스트 채널키를
  // 거는 경우) — PG 승인은 나지만 실제 청구가 없으므로 패스를 발급하면 무료 패스 구멍.
  // PAID 확인 후, 금액 검증 전에 차단해 심사 담당자의 성공 화면은 정상 노출되게 한다.
  if (payment.channel?.type === "TEST") {
    console.warn("[passPurchase] TEST channel payment — verified but not issuing", { paymentId, userId });
    return { ok: true, testChannel: true };
  }

  const paidAmount = payment.amount?.total;
  if (paidAmount !== PASS_PRICE_KRW) {
    return {
      ok: false,
      code: "amount_mismatch",
      httpStatus: 400,
      detail: { expected: PASS_PRICE_KRW, paid: paidAmount },
    };
  }

  // customData 검증 (H-1 정합): checkout이 항상 {userId, product:"day_pass"}를
  // 주입하므로 ①product가 있는데 day_pass가 아니면 타 상품 결제 재사용 → 거부
  // ②userId가 있는데 호출자와 다르면 남의 결제 도용 → 거부. 미주입 결제는
  // 위조 대상이 아니므로 경고 로깅 후 통과 (subscriptionGrant와 동일 규칙).
  let paymentUserId: string | undefined;
  let paymentProduct: string | undefined;
  try {
    if (payment.customData) {
      const parsed = JSON.parse(payment.customData);
      if (typeof parsed?.userId === "string") paymentUserId = parsed.userId;
      if (typeof parsed?.product === "string") paymentProduct = parsed.product;
    }
  } catch {
    /* 파싱 실패는 아래 미검증 경고로 흡수 */
  }
  if (paymentProduct && paymentProduct !== PASS_PRODUCT_MARKER) {
    console.warn("[passPurchase] product marker mismatch — refusing", { paymentId, paymentProduct });
    return { ok: false, code: "wrong_product", httpStatus: 400 };
  }
  if (paymentUserId && paymentUserId !== userId) {
    console.warn("[passPurchase] payment ownership mismatch — refusing", { paymentId, caller: userId });
    return { ok: false, code: "ownership_mismatch", httpStatus: 403 };
  }
  if (!paymentUserId) {
    console.warn("[passPurchase] payment has no customData.userId — ownership unverified", {
      paymentId,
      caller: userId,
    });
  }

  // 2) 멱등 발급 — advisory lock으로 동일 paymentId 동시처리(complete↔webhook) 직렬화
  try {
    return await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`portone:daypass:${paymentId}`}))`;

      const existing = await tx.dayPass.findFirst({
        where: { paymentId },
        select: { code: true, codeExpiresAt: true },
      });
      if (existing) {
        return {
          ok: true as const,
          alreadyProcessed: true,
          code: existing.code,
          codeExpiresAt: existing.codeExpiresAt,
        };
      }

      const codeExpiresAt = new Date();
      codeExpiresAt.setDate(codeExpiresAt.getDate() + PASS_CODE_VALID_DAYS);

      // 코드 유니크 충돌(60bit 랜덤이라 사실상 없음)은 재생성으로 흡수
      let created: { code: string } | null = null;
      for (let attempt = 0; attempt < 3 && !created; attempt++) {
        try {
          created = await tx.dayPass.create({
            data: {
              code: generatePassCode(),
              status: "issued",
              purchaserId: userId,
              codeExpiresAt,
              paymentId,
            },
            select: { code: true },
          });
        } catch (e: any) {
          if (e?.code !== "P2002" || attempt === 2) throw e;
        }
      }

      // 프로필 최근 내역 노출용 기록 (크레딧 변동 없음 — delta 0).
      // code를 metadata에 보존: webhook 경로로만 발급된 경우(success 미복귀)에도
      // 구매자 본인이 내역에서 코드를 되찾을 수 있는 마지막 경로 (본인 전용 데이터).
      const user = await tx.user.findUnique({ where: { id: userId }, select: { credits: true } });
      await tx.creditTransaction.create({
        data: {
          userId,
          delta: 0,
          action: "day_pass_purchase",
          balanceAfter: user?.credits ?? 0,
          metadata: {
            paymentId,
            code: created!.code,
            amount: paidAmount,
            gateway: "portone",
            pgProvider: payment.channel?.pgProvider ?? "unknown",
          },
        },
      });

      return {
        ok: true as const,
        alreadyProcessed: false,
        code: created!.code,
        codeExpiresAt,
      };
    });
  } catch (e: any) {
    console.error("[passPurchase] DB update failed after payment verification", {
      userId,
      paymentId,
      error: e?.message,
    });
    return { ok: false, code: "db_update_failed", httpStatus: 500, detail: paymentId };
  }
}

export type RevokeByPaymentResult = "revoked" | "not_found" | "already_redeemed";

/**
 * 결제 취소(환불) webhook 대응 — 해당 결제로 발급된 미등록 코드를 무효화한다.
 * 정책상 등록(사용 개시) 후에는 환불 불가이므로, redeemed 이후 상태는 건드리지
 * 않고 경고만 남긴다 (콘솔 강제 환불 등 예외 상황은 수동 판단).
 */
export async function revokeDayPassForPayment(paymentId: string): Promise<RevokeByPaymentResult> {
  const revoked = await prisma.dayPass.updateMany({
    where: { paymentId, status: "issued" },
    data: { status: "revoked" },
  });
  if (revoked.count > 0) return "revoked";

  const existing = await prisma.dayPass.findFirst({
    where: { paymentId },
    select: { status: true },
  });
  if (!existing) return "not_found";
  if (existing.status === "revoked") return "revoked"; // 멱등
  return "already_redeemed";
}
