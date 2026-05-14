import { PrismaClient } from "@prisma/client";

async function main() {
  const email = process.argv[2];
  const amount = parseInt(process.argv[3] || "1000", 10);
  if (!email) {
    console.error("Usage: tsx admin-grant-credits.ts <email> [amount=1000]");
    process.exit(1);
  }

  const prisma = new PrismaClient();
  try {
    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true, tier: true, credits: true, creditsRenewAt: true },
    });
    if (!user) {
      console.error(`user not found: ${email}`);
      process.exit(2);
    }
    console.log(`before: ${user.email} tier=${user.tier} credits=${user.credits}`);

    const updated = await prisma.user.update({
      where: { id: user.id },
      data: { credits: { increment: amount } },
      select: { credits: true },
    });

    await prisma.creditTransaction.create({
      data: {
        userId: user.id,
        delta: amount,
        action: "manual_adjust",
        balanceAfter: updated.credits,
        metadata: { reason: "admin grant (sandbox C2PA PoC test)", granted_by: "admin-cli" } as any,
      },
    });

    console.log(`after:  ${user.email} credits=${updated.credits} (+${amount})`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
