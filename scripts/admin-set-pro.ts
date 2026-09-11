// 어드민: 결제 없이 계정을 Pro로 올리기 (comp / 베타 테스터 / 대표 계정). 2026-09-11 신설.
// 결제 부여(lib/payment/subscriptionGrant.ts grantSubscriptionTx)와 같은 순서로 처리한다:
//   Subscription upsert(gateway=manual, billingKey=null, cancelAtPeriodEnd=false) → user.tier=pro·credits=1000·creditsRenewAt=+30d
//   → CreditTransaction(subscription_grant, metadata.gateway=manual) → 유예 만료(links.expires_at>now)를 NULL로 복원.
// billingKey를 비우므로 charge-subscriptions 크론이 카드 청구를 시도하지 않고, cancelAtPeriodEnd=false라 다운그레이드 대상도 아니다
// (크론은 cancelAtPeriodEnd=true·만료된 구독만 종료 처리). 월 크레딧은 renewCreditsIfDue가 creditsRenewAt마다 pro 정액(1000)으로 리셋.
// 실행 위치: apps/web —  node --env-file=.env scripts/admin-set-pro.ts <email> [--months=12] [--apply]
//   --apply 없으면 현재 상태만 출력(dry-run).
import { loadEnvConfig } from "@next/env";
import { PrismaClient } from "@prisma/client";

// Next.js와 같은 로더로 apps/web/.env 를 읽는다 — 명령줄에 --env-file 이 필요 없음: npx --yes tsx scripts/admin-set-pro.ts <email>
if (!process.env.DATABASE_URL) loadEnvConfig(process.cwd());

// = PLAN_GRANTS.pro_monthly (src/lib/payment.ts). 스크립트는 Node로 직접 실행하므로 @ 경로·확장자 없는 import를 피해 상수로 둔다.
const PRO_MONTHLY_GRANT = 1000;

async function main() {
  const args = process.argv.slice(2);
  const email = args.find((a) => !a.startsWith("--"));
  const apply = args.includes("--apply");
  const monthsArg = args.find((a) => a.startsWith("--months="));
  const months = monthsArg ? parseInt(monthsArg.split("=")[1], 10) : 12;
  if (!email || !Number.isFinite(months) || months < 1) {
    console.error("Usage: node --env-file=.env scripts/admin-set-pro.ts <email> [--months=12] [--apply]");
    process.exit(1);
  }
  const prisma = new PrismaClient();
  try {
    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true, tier: true, credits: true, creditsRenewAt: true, subscription: true },
    });
    if (!user) { console.error(`user not found: ${email}`); process.exit(2); }
    const [expiring] = await prisma.$queryRaw<{ n: bigint }[]>`
      SELECT count(*)::bigint AS n FROM public.links WHERE user_id = ${user.id} AND expires_at > now()`;
    console.log("before:", {
      email: user.email, tier: user.tier, credits: user.credits, creditsRenewAt: user.creditsRenewAt,
      subscription: user.subscription
        ? { gateway: user.subscription.gateway, plan: user.subscription.plan, status: user.subscription.status,
            periodEnd: user.subscription.currentPeriodEnd, cancelAtPeriodEnd: user.subscription.cancelAtPeriodEnd,
            hasBillingKey: !!user.subscription.billingKey }
        : null,
      linksWithExpiry: Number(expiring.n),
    });
    if (!apply) { console.log("(dry-run — --apply 를 붙이면 적용)"); return; }

    const grant = PRO_MONTHLY_GRANT;
    const now = new Date();
    const periodEnd = new Date(now); periodEnd.setMonth(periodEnd.getMonth() + months);
    const renewAt = new Date(now); renewAt.setDate(renewAt.getDate() + 30);
    const ref = `manual-${now.toISOString().slice(0, 10)}`;

    await prisma.$transaction(async (tx) => {
      await tx.subscription.upsert({
        where: { userId: user.id },
        create: { userId: user.id, gateway: "manual", gatewayCustomerId: user.id, gatewaySubscriptionId: ref, billingKey: null,
          plan: "pro_monthly", status: "active", currentPeriodStart: now, currentPeriodEnd: periodEnd },
        update: { gateway: "manual", gatewaySubscriptionId: ref, billingKey: null, plan: "pro_monthly", status: "active",
          currentPeriodStart: now, currentPeriodEnd: periodEnd, cancelAtPeriodEnd: false, canceledAt: null },
      });
      const updated = await tx.user.update({
        where: { id: user.id }, data: { tier: "pro", credits: grant, creditsRenewAt: renewAt }, select: { credits: true },
      });
      await tx.creditTransaction.create({
        data: { userId: user.id, delta: grant - user.credits, action: "subscription_grant", balanceAfter: updated.credits,
          metadata: { plan: "pro_monthly", paymentId: ref, amount: 0, gateway: "manual", reason: "admin comp", granted_by: "admin-cli",
            months, previous_credits: user.credits } as any },
      });
      await tx.$executeRaw`UPDATE public.links SET expires_at = NULL WHERE user_id = ${user.id} AND expires_at > now()`;
    });

    const after = await prisma.user.findUnique({
      where: { id: user.id }, select: { tier: true, credits: true, creditsRenewAt: true, subscription: { select: { status: true, currentPeriodEnd: true, gateway: true } } },
    });
    const [left] = await prisma.$queryRaw<{ n: bigint }[]>`
      SELECT count(*)::bigint AS n FROM public.links WHERE user_id = ${user.id} AND expires_at > now()`;
    console.log("after: ", { ...after, linksWithExpiry: Number(left.n) });
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
