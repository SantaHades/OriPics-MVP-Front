// 중도해지 환불 산식 (A-34) — 약관 제11조·refund-credits-policy-research.md §4.
//
// "사용 횟수" 단위 = **사진 인증 건수** (2026-08-22 대표 확정):
//   CreditTransaction action ∈ {image_proof, verified_proof} 1건 = 1회.
//   사이즈 배율·공개링크(-2)·검증 조회(-1)·PDF(-10)는 횟수에 포함하지 않는다
//   ("1회 인증(공개링크 포함) 정가 ₩1,000" 고지와 정합 — 사용자에게 유리한 해석).
import { prisma } from "@/lib/prisma";

/** 회당(사진인증 1건) 정가 — VAT 포함, 약관 제11조·요금제 페이지 고지 */
export const PROOF_UNIT_PRICE = 1000;
/** 청약철회 기간 (전상법 제17조) */
export const WITHDRAWAL_WINDOW_DAYS = 7;
/** 7일 후 중도해지 시 잔여분 공제율 (소비자분쟁해결기준 인터넷콘텐츠업) */
export const REMAINDER_PENALTY_RATE = 0.1;

const DAY_MS = 24 * 60 * 60 * 1000;

export interface RefundQuoteInput {
  /** 결제액 (KRW, VAT 포함) */
  amount: number;
  /** 결제 시각 (= 현재 구독 기간 시작) */
  paidAt: Date;
  /** 구독 기간 종료 */
  periodEnd: Date;
  /** 결제 이후 사진 인증 건수 */
  usedProofs: number;
  now?: Date;
}

export interface RefundQuote {
  refundable: boolean;
  /** 환불액 (KRW, 0 이상 정수) */
  refundAmount: number;
  basis: "full" | "within7d_usage" | "after7d";
  usedProofs: number;
  /** 사용분 정가 환산 공제액 */
  usageDeduction: number;
  /** after7d에서의 경과 일할액 (그 외 0) */
  proratedElapsed: number;
  /** 잔여분 10% 공제액 (after7d 외 0) */
  penalty: number;
}

export function computeRefundQuote(i: RefundQuoteInput): RefundQuote {
  const now = i.now ?? new Date();
  const usageDeduction = i.usedProofs * PROOF_UNIT_PRICE;
  const withinWindow = now.getTime() - i.paidAt.getTime() < WITHDRAWAL_WINDOW_DAYS * DAY_MS;

  if (withinWindow && i.usedProofs === 0) {
    // 7일 내 + 전부 미사용 → 전액 환불 (자동 승인)
    return {
      refundable: i.amount > 0,
      refundAmount: i.amount,
      basis: "full",
      usedProofs: 0,
      usageDeduction: 0,
      proratedElapsed: 0,
      penalty: 0,
    };
  }

  if (withinWindow) {
    // 7일 내 + 일부 사용 → 결제액 − 사용횟수×정가, 위약금 없음
    const refundAmount = Math.max(0, i.amount - usageDeduction);
    return {
      refundable: refundAmount > 0,
      refundAmount,
      basis: "within7d_usage",
      usedProofs: i.usedProofs,
      usageDeduction,
      proratedElapsed: 0,
      penalty: 0,
    };
  }

  // 7일 후 중도해지 → 결제액 − max(사용분 정가, 경과 일할) − 잔여분 10%
  const periodDays = Math.max(1, Math.ceil((i.periodEnd.getTime() - i.paidAt.getTime()) / DAY_MS));
  const elapsedDays = Math.min(
    periodDays,
    Math.max(1, Math.ceil((now.getTime() - i.paidAt.getTime()) / DAY_MS)),
  );
  const proratedElapsed = Math.round((i.amount * elapsedDays) / periodDays);
  const base = i.amount - Math.max(usageDeduction, proratedElapsed);
  const penalty = base > 0 ? Math.round(base * REMAINDER_PENALTY_RATE) : 0;
  const refundAmount = Math.max(0, base - penalty);
  return {
    refundable: refundAmount > 0,
    refundAmount,
    basis: "after7d",
    usedProofs: i.usedProofs,
    usageDeduction,
    proratedElapsed,
    penalty,
  };
}

/** 결제 이후 사진 인증 건수 (image_proof + verified_proof TX 개수) */
export async function countProofUsage(userId: string, since: Date): Promise<number> {
  return prisma.creditTransaction.count({
    where: {
      userId,
      action: { in: ["image_proof", "verified_proof"] },
      createdAt: { gte: since },
    },
  });
}
