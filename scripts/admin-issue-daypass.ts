// 원데이 패스 어드민 발급 (A-60) — 결제 연동(Phase 3) 전 e2e 테스트·베타 테스터 선물용.
//
// Usage: npx tsx scripts/admin-issue-daypass.ts [count=1] [purchaserEmail]
//   count          발급 매수 (기본 1, 최대 20)
//   purchaserEmail (선택) 구매자로 기록할 계정 이메일 — 없으면 어드민 발급으로만 기록
//
// 실행 위치: apps/web (DATABASE_URL 필요 — .env 로드는 tsx --env-file=.env 또는 dotenv)
import { PrismaClient } from "@prisma/client";
import { randomBytes } from "crypto";

const CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTVWXYZ";
function generatePassCode(): string {
  const bytes = randomBytes(12);
  let s = "";
  for (let i = 0; i < 12; i++) {
    s += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
    if (i === 3 || i === 7) s += "-";
  }
  return `OP-${s}`;
}

async function main() {
  const count = Math.min(20, Math.max(1, parseInt(process.argv[2] || "1", 10) || 1));
  const purchaserEmail = process.argv[3];

  const prisma = new PrismaClient();
  try {
    let purchaserId: string | undefined;
    if (purchaserEmail) {
      const user = await prisma.user.findUnique({
        where: { email: purchaserEmail },
        select: { id: true },
      });
      if (!user) {
        console.error(`purchaser not found: ${purchaserEmail}`);
        process.exit(2);
      }
      purchaserId = user.id;
    }

    const codeExpiresAt = new Date();
    codeExpiresAt.setFullYear(codeExpiresAt.getFullYear() + 1); // 미등록 유효기간 1년

    const codes: string[] = [];
    for (let i = 0; i < count; i++) {
      const code = generatePassCode();
      await prisma.dayPass.create({
        data: {
          code,
          status: "issued",
          purchaserId,
          codeExpiresAt,
          paymentId: null, // 어드민 발급 (결제 없음)
        },
      });
      codes.push(code);
    }

    console.log(`issued ${codes.length} pass(es), code valid until ${codeExpiresAt.toISOString().slice(0, 10)}:`);
    for (const c of codes) console.log(`  ${c}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
