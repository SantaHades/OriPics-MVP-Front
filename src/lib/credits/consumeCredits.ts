import { prisma } from "@/lib/prisma";
import type { CreditTransactionAction } from "@/lib/payment";

/**
 * 크레딧 차감 (race-safe).
 *
 * atomic UPDATE WHERE credits >= amount 패턴으로 동시 요청 방지.
 * - 잔액 부족: row 0개 갱신 → { ok: false, reason: "insufficient" }
 * - 차감 성공: { ok: true, balanceAfter }
 *
 * 호출 측은 ok=false 시 클라이언트에 402(Payment Required) 또는 403 반환 권장.
 *
 * pricing-policy.md §2 참조.
 */
export type ConsumeResult =
  | { ok: true; balanceAfter: number }
  | { ok: false; reason: "insufficient" | "user_not_found"; balance: number };

export async function consumeCredits(opts: {
  userId: string;
  amount: number;
  action: CreditTransactionAction;
  metadata?: Record<string, unknown>;
}): Promise<ConsumeResult> {
  if (opts.amount <= 0) {
    throw new Error(`consumeCredits: amount must be positive, got ${opts.amount}`);
  }

  // atomic decrement. updateMany count=0이면 잔액 부족 또는 사용자 없음
  const updated = await prisma.user.updateMany({
    where: { id: opts.userId, credits: { gte: opts.amount } },
    data: { credits: { decrement: opts.amount } },
  });

  if (updated.count === 0) {
    const user = await prisma.user.findUnique({
      where: { id: opts.userId },
      select: { credits: true },
    });
    if (!user) return { ok: false, reason: "user_not_found", balance: 0 };
    return { ok: false, reason: "insufficient", balance: user.credits };
  }

  // 차감 후 정확한 잔액 + 트랜잭션 기록
  const after = await prisma.user.findUnique({
    where: { id: opts.userId },
    select: { credits: true },
  });
  const balanceAfter = after?.credits ?? 0;

  await prisma.creditTransaction.create({
    data: {
      userId: opts.userId,
      delta: -opts.amount,
      action: opts.action,
      balanceAfter,
      metadata: (opts.metadata ?? null) as any,
    },
  });

  return { ok: true, balanceAfter };
}

/**
 * 크레딧 환불 (작업 실패 시 호출).
 *
 * atomic increment + 트랜잭션 기록.
 * action은 보통 원본 차감 액션과 동일 또는 "manual_adjust" + metadata.reason="refund".
 */
export async function refundCredits(opts: {
  userId: string;
  amount: number;
  action: CreditTransactionAction;
  metadata?: Record<string, unknown>;
}): Promise<{ balanceAfter: number }> {
  if (opts.amount <= 0) {
    throw new Error(`refundCredits: amount must be positive, got ${opts.amount}`);
  }

  const updated = await prisma.user.update({
    where: { id: opts.userId },
    data: { credits: { increment: opts.amount } },
    select: { credits: true },
  });

  await prisma.creditTransaction.create({
    data: {
      userId: opts.userId,
      delta: opts.amount,
      action: opts.action,
      balanceAfter: updated.credits,
      metadata: { ...(opts.metadata ?? {}), refund: true } as any,
    },
  });

  return { balanceAfter: updated.credits };
}
