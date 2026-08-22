import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  chargeWithBillingKeyAndGrant,
  isPlanId,
  type PlanId,
} from "@/lib/payment/subscriptionGrant";
import { assertCron } from "@/lib/security/cron";

const PORTONE_API_SECRET = process.env.PORTONE_API_SECRET ?? "";
const BATCH_SIZE = 200;

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * GET /api/cron/charge-subscriptions  (daily)
 *
 * 정기결제(빌링키) 월 자동청구. status=active 이고 billingKey가 있으며 현재 주기가
 * 만료된 구독을 골라, 저장된 billingKey로 다음 한 달을 청구한다. 청구 성공 시
 * chargeWithBillingKeyAndGrant가 주기 연장 + 크레딧 부여까지 멱등 처리한다.
 *
 * 멱등성: paymentId를 (userId, 만료주기 날짜)로 결정해, 같은 주기를 중복 청구하지
 * 않는다(같은 날 재실행/재시도해도 PortOne가 already-paid로 처리 → 멱등 부여).
 *
 * 실패(카드 거절 등)는 카운트만 하고 다음 실행에서 재시도된다(만료 주기가 유지되므로
 * 다음 cron이 다시 집계). 7일 재시도/다운그레이드 dunning은 후속 작업.
 */
export async function GET(req: NextRequest) {
  const denied = assertCron(req);
  if (denied) return denied;
  if (!PORTONE_API_SECRET) {
    return NextResponse.json({ detail: "portone_not_configured" }, { status: 500 });
  }

  let charged = 0;
  let alreadyDone = 0;
  let failed = 0;
  let downgraded = 0;
  const errors: string[] = [];

  // 0) 일반해지 예약(cancelAtPeriodEnd) 구독이 기간 만료된 경우: 청구 대신 종료 처리.
  //    status=canceled + tier=free. 크레딧은 renewCreditsIfDue가 다음 갱신 시점
  //    (creditsRenewAt=periodEnd로 정렬됨)에 free 정액(20)으로 리셋한다.
  try {
    const expired = await prisma.subscription.findMany({
      where: {
        status: "active",
        cancelAtPeriodEnd: true,
        currentPeriodEnd: { lte: new Date() },
      },
      select: { userId: true },
      take: BATCH_SIZE,
    });
    for (const sub of expired) {
      await prisma.$transaction([
        prisma.subscription.update({
          where: { userId: sub.userId },
          data: { status: "canceled" },
        }),
        prisma.user.update({
          where: { id: sub.userId },
          data: { tier: "free" },
        }),
        // 보관함 종료 → 무기한 보관(expires_at=null) 링크에 grace 만료 설정:
        // 30일 유예 + 7일 free 정책 = 37일 (pricing-policy §11.2, A-7③)
        prisma.$executeRaw`
          UPDATE public.links
          SET expires_at = now() + interval '37 days'
          WHERE user_id = ${sub.userId} AND expires_at IS NULL`,
      ]);
      downgraded++;
    }
  } catch (e: any) {
    errors.push(`downgrade: ${e?.message || e}`);
  }

  try {
    const due = await prisma.subscription.findMany({
      where: {
        status: "active",
        cancelAtPeriodEnd: false,
        billingKey: { not: null },
        currentPeriodEnd: { lte: new Date() },
      },
      select: {
        userId: true,
        plan: true,
        billingKey: true,
        currentPeriodEnd: true,
        user: { select: { name: true, email: true } },
      },
      take: BATCH_SIZE,
    });

    for (const sub of due) {
      const plan: PlanId = isPlanId(sub.plan) ? sub.plan : "pro_monthly";
      // 만료 주기(YYYYMMDD)로 결정적 paymentId → 같은 주기 중복청구 방지
      const cycle = sub.currentPeriodEnd.toISOString().slice(0, 10).replace(/-/g, "");
      const paymentId = `bk-renew-${String(sub.userId).slice(-8)}-${cycle}`;
      try {
        const result = await chargeWithBillingKeyAndGrant({
          billingKey: sub.billingKey as string,
          userId: sub.userId,
          plan,
          secret: PORTONE_API_SECRET,
          paymentId,
          customer: { fullName: sub.user?.name, email: sub.user?.email },
        });
        if (result.ok) {
          if (result.alreadyProcessed) alreadyDone++;
          else charged++;
        } else {
          failed++;
          errors.push(`${sub.userId}: ${result.code}`);
        }
      } catch (e: any) {
        failed++;
        errors.push(`${sub.userId}: ${e?.message || e}`);
      }
    }
  } catch (e: any) {
    return NextResponse.json(
      { detail: `charge_error:${e?.message || e}`, charged, alreadyDone, failed, downgraded, errors },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, charged, alreadyDone, failed, downgraded, errors: errors.slice(0, 20) });
}
