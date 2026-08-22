// CS 수동 환불 처리용 견적 스크립트 (A-34 ③).
// 사용: npx tsx scripts/admin-refund-quote.ts <email>
// 출력: 현재 구독·결제, 사용횟수(사진인증당 — 2026-08-22 확정), 제11조 산식 분해, 환불액.
// 자동화(refund_cancel API) 장애 시: 아래 출력값으로 admin.portone.io에서 부분 취소 →
// DB 수동 원복(previous_credits로 SET, tier=free, subscription canceled, links grace 37일).
import { PrismaClient } from "@prisma/client";
import { computeRefundQuote, PROOF_UNIT_PRICE } from "../src/lib/payment/refund";

async function main() {
  const email = process.argv[2];
  if (!email) {
    console.error("Usage: tsx admin-refund-quote.ts <email>");
    process.exit(1);
  }
  const prisma = new PrismaClient();
  try {
    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true, tier: true, credits: true },
    });
    if (!user) {
      console.error(`user not found: ${email}`);
      process.exit(2);
    }
    const sub = await prisma.subscription.findUnique({ where: { userId: user.id } });
    console.log(`user: ${user.email} tier=${user.tier} credits=${user.credits}`);
    if (!sub || sub.status !== "active") {
      console.log(`구독: ${sub ? sub.status : "없음"} — 환불 대상 아님`);
      return;
    }
    const grant = await prisma.creditTransaction.findFirst({
      where: { userId: user.id, action: "subscription_grant" },
      orderBy: { createdAt: "desc" },
    });
    const meta = (grant?.metadata ?? {}) as Record<string, unknown>;
    const paymentId = meta.paymentId as string | undefined;
    const amount = typeof meta.amount === "number" ? meta.amount : 9900;
    const usedProofs = await prisma.creditTransaction.count({
      where: {
        userId: user.id,
        action: { in: ["image_proof", "verified_proof"] },
        createdAt: { gte: sub.currentPeriodStart },
      },
    });
    const quote = computeRefundQuote({
      amount,
      paidAt: sub.currentPeriodStart,
      periodEnd: sub.currentPeriodEnd,
      usedProofs,
    });
    console.log(`구독: ${sub.plan} ${sub.currentPeriodStart.toISOString()} ~ ${sub.currentPeriodEnd.toISOString()}`);
    console.log(`결제: paymentId=${paymentId} amount=₩${amount.toLocaleString()}`);
    console.log(`사용횟수(사진인증): ${usedProofs}건 × ₩${PROOF_UNIT_PRICE} = ₩${quote.usageDeduction.toLocaleString()}`);
    console.log(`산식(basis=${quote.basis}): 경과일할=₩${quote.proratedElapsed.toLocaleString()} 잔여10%공제=₩${quote.penalty.toLocaleString()}`);
    console.log(`→ 환불액: ₩${quote.refundAmount.toLocaleString()} (refundable=${quote.refundable})`);
    console.log(`크레딧 원복값(previous_credits): ${meta.previous_credits ?? "(기록 없음→0)"}`);
    console.log(`수동 절차: admin.portone.io → 결제 ${paymentId} → 부분취소 ₩${quote.refundAmount.toLocaleString()}`);
  } finally {
    await prisma.$disconnect();
  }
}
main();
