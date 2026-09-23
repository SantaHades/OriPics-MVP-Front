// 사진함 패스 어드민 발급 (A-108) — 실결제(U-44) 전 e2e 테스트·베타 테스터용.
//
// Usage: npx --yes tsx scripts/admin-issue-photobox.ts [count=1] [ownerEmail]
//   count       발급 매수 (기본 1, 최대 20)
//   ownerEmail  (선택) 소유자(purchaser)로 기록할 계정 이메일 — 지정하면 그 계정의 '보유한 사진함 패스'로 바로 보인다.
//               없으면 소유자 없는 어드민 코드(처음 코드를 입력해 등록하는 사람이 소유자가 됨).
// 실행 위치: apps/web — .env는 스크립트 안에서 로드(@next/env)
import { loadEnvConfig } from "@next/env";
import { PrismaClient } from "@prisma/client";
import { randomBytes, randomUUID } from "crypto";

if (!process.env.DATABASE_URL) loadEnvConfig(process.cwd());

const CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTVWXYZ"; // lib/photobox/pass.ts와 동일
function code(): string {
  const b = randomBytes(12);
  let s = "";
  for (let i = 0; i < 12; i++) {
    s += CODE_ALPHABET[b[i] % CODE_ALPHABET.length];
    if (i === 3 || i === 7) s += "-";
  }
  return `PB-${s}`;
}

async function main() {
  const count = Math.min(20, Math.max(1, parseInt(process.argv[2] || "1", 10) || 1));
  const email = process.argv[3];
  const prisma = new PrismaClient();
  try {
    let ownerId: string | null = null;
    if (email) {
      const u = await prisma.user.findUnique({ where: { email }, select: { id: true } });
      if (!u) throw new Error(`user not found: ${email}`);
      ownerId = u.id;
    }
    const codes: string[] = [];
    for (let i = 0; i < count; i++) {
      const c = code();
      await prisma.$executeRaw`
        INSERT INTO public.photobox_passes (id, code, status, source, purchaser_id, payment_id, code_expires_at, total)
        VALUES (${randomUUID()}, ${c}, 'issued', 'admin', ${ownerId}, NULL, now() + make_interval(days => 365), 100)`;
      codes.push(c);
    }
    console.log(`issued ${codes.length} photobox pass(es)${email ? ` → ${email}` : " (unowned)"}:`);
    for (const c of codes) console.log("  " + c);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
