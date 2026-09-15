// 어드민: 기존 데모 계정과 같은 자격(tier·크레딧·구독)을 가진 테스트 계정을 하나 더 만든다. 2026-09-15 신설.
// 원본 계정(기본 demo-screenshots@ori.pics)의 tier/credits/creditsRenewAt/subscription을 읽어 새 이메일로 복제한다.
//   - 비밀번호는 bcrypt cost 10 (register 라우트와 동일), emailVerified=now (인증 코드 절차 생략)
//   - 구독은 admin-set-pro.ts와 같은 manual 구독(billingKey null)으로 복제 → 크론이 카드 청구·다운그레이드를 시도하지 않음
//   - CreditTransaction(subscription_grant, gateway=manual, reason=admin clone) 1건 기록
// 실행 위치: apps/web —  npx --yes tsx scripts/admin-clone-demo-account.ts <new-email> <password> [--from=demo-screenshots@ori.pics] [--apply]
//   --apply 없으면 원본 상태와 생성 예정 값만 출력(dry-run).
import { loadEnvConfig } from "@next/env";
import { PrismaClient } from "@prisma/client";
import * as bcrypt from "bcryptjs";

if (!process.env.DATABASE_URL) loadEnvConfig(process.cwd());

async function main() {
  const args = process.argv.slice(2);
  const positional = args.filter((a) => !a.startsWith("--"));
  const [email, password] = positional;
  const apply = args.includes("--apply");
  const fromArg = args.find((a) => a.startsWith("--from="));
  const fromEmail = fromArg ? fromArg.split("=")[1] : "demo-screenshots@ori.pics";
  if (!email || !password || password.length < 6) {
    console.error("Usage: npx --yes tsx scripts/admin-clone-demo-account.ts <new-email> <password(6+)> [--from=<email>] [--apply]");
    process.exit(1);
  }
  const prisma = new PrismaClient();
  try {
    const src = await prisma.user.findUnique({
      where: { email: fromEmail },
      select: { id: true, email: true, name: true, emailVerified: true, tier: true, credits: true, creditsRenewAt: true, partnerCode: true, subscription: true },
    });
    if (!src) { console.error(`source user not found: ${fromEmail}`); process.exit(2); }
    console.log("source:", {
      email: src.email, name: src.name, emailVerified: src.emailVerified, tier: src.tier, credits: src.credits,
      creditsRenewAt: src.creditsRenewAt, partnerCode: src.partnerCode,
      subscription: src.subscription
        ? { gateway: src.subscription.gateway, plan: src.subscription.plan, status: src.subscription.status,
            periodStart: src.subscription.currentPeriodStart, periodEnd: src.subscription.currentPeriodEnd,
            cancelAtPeriodEnd: src.subscription.cancelAtPeriodEnd, hasBillingKey: !!src.subscription.billingKey }
        : null,
    });

    const existing = await prisma.user.findUnique({ where: { email }, select: { id: true, tier: true, credits: true } });
    if (existing) { console.error(`target already exists: ${email}`, existing); process.exit(3); }

    const now = new Date();
    const plan = {
      email, name: src.name ?? "Test", emailVerified: now, tier: src.tier, credits: src.credits,
      creditsRenewAt: src.creditsRenewAt ?? new Date(now.getTime() + 30 * 86400_000),
      subscription: src.subscription
        ? { gateway: "manual", plan: src.subscription.plan, status: src.subscription.status,
            currentPeriodStart: src.subscription.currentPeriodStart, currentPeriodEnd: src.subscription.currentPeriodEnd }
        : null,
    };
    console.log("will create:", plan);
    if (!apply) { console.log("(dry-run — --apply 를 붙이면 생성)"); return; }

    const hash = await bcrypt.hash(password, 10);
    const ref = `manual-clone-${now.toISOString().slice(0, 10)}`;
    const created = await prisma.$transaction(async (tx) => {
      const u = await tx.user.create({
        data: { email, name: plan.name, emailVerified: now, password: hash, tier: plan.tier, credits: plan.credits, creditsRenewAt: plan.creditsRenewAt },
        select: { id: true, email: true, tier: true, credits: true, creditsRenewAt: true },
      });
      if (plan.subscription) {
        await tx.subscription.create({
          data: { userId: u.id, gateway: "manual", gatewayCustomerId: u.id, gatewaySubscriptionId: ref, billingKey: null,
            plan: plan.subscription.plan, status: plan.subscription.status,
            currentPeriodStart: plan.subscription.currentPeriodStart, currentPeriodEnd: plan.subscription.currentPeriodEnd },
        });
      }
      await tx.creditTransaction.create({
        data: { userId: u.id, delta: plan.credits, action: "subscription_grant", balanceAfter: plan.credits,
          metadata: { plan: plan.subscription?.plan ?? plan.tier, paymentId: ref, amount: 0, gateway: "manual",
            reason: "admin clone", cloned_from: fromEmail, granted_by: "admin-cli" } as any },
      });
      return u;
    });
    const check = await bcrypt.compare(password, hash);
    console.log("created:", created, "| password hash verifies:", check);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
