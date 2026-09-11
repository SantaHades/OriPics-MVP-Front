// 어드민: 파트너 참여 원장(partner_join_ledger) 정규화 해시 백필 (2026-09-11 A-91 ⑤).
// 배경: 원장 키가 sha256(lower(trim(email))) 이라 gmail 점(a.b@gmail.com)·`+tag`(a+1@x.com) 별칭으로 '이메일당 평생 1회'를 우회할 수 있었다.
// 이제 코드는 sha256(normalizeEmailForLedger(email)) 로 기록·조회(레거시 해시도 함께 조회)한다. 이 스크립트는
// referredById 가 있는(=참여한) 모든 회원에 대해 **정규화 해시 행을 추가**한다. 기존 행은 지우지 않는다(조회 호환).
// 실행 위치: apps/web —  npx --yes tsx scripts/admin-partner-ledger-backfill.ts [--apply]
//   --apply 없으면 추가될 행만 출력(dry-run).
import { loadEnvConfig } from "@next/env";
import { createHash } from "crypto";
import { PrismaClient } from "@prisma/client";
import { normalizeEmailForLedger } from "../src/lib/partner/config";

// Next.js와 같은 로더로 apps/web/.env 를 읽는다 — 명령줄에 --env-file 이 필요 없음
if (!process.env.DATABASE_URL) loadEnvConfig(process.cwd());

const sha = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");

async function main() {
  const apply = process.argv.includes("--apply");
  const prisma = new PrismaClient();
  try {
    const users = await prisma.user.findMany({
      where: { referredById: { not: null }, email: { not: null } },
      select: { id: true, email: true, referredById: true, partnerJoinedAt: true, referredBy: { select: { partnerCode: true } } },
    });
    console.log(`participants with referredById: ${users.length}`);

    let inserted = 0;
    let unchanged = 0;
    let existing = 0;
    for (const u of users) {
      const email = u.email as string;
      const legacyHash = sha(email.trim().toLowerCase());
      const normHash = sha(normalizeEmailForLedger(email));
      if (normHash === legacyHash) {
        // 별칭 없는 이메일 — 09/10 백필 행과 동일 키. 없으면 만들어 둔다.
        const row = await prisma.partnerJoinLedger.findUnique({ where: { emailHash: normHash }, select: { emailHash: true } });
        if (row) { unchanged++; continue; }
      } else {
        const row = await prisma.partnerJoinLedger.findUnique({ where: { emailHash: normHash }, select: { emailHash: true } });
        if (row) { existing++; continue; }
      }
      const legacy = await prisma.partnerJoinLedger.findUnique({ where: { emailHash: legacyHash } });
      const data = {
        emailHash: normHash,
        firstUserId: legacy?.firstUserId ?? u.id,
        referrerId: legacy?.referrerId ?? u.referredById,
        referrerCode: legacy?.referrerCode ?? u.referredBy?.partnerCode ?? null,
        joinedAt: legacy?.joinedAt ?? u.partnerJoinedAt ?? new Date(),
        rejoinAttempts: legacy?.rejoinAttempts ?? 0,
        lastAttemptAt: legacy?.lastAttemptAt ?? null,
      };
      console.log(`${apply ? "insert" : "would insert"}: user=${u.id} normalized=${normalizeEmailForLedger(email)} hash=${normHash.slice(0, 12)}…`);
      if (apply) {
        await prisma.partnerJoinLedger.upsert({ where: { emailHash: normHash }, create: data, update: {} });
      }
      inserted++;
    }
    console.log({ inserted, alreadyNormalized: existing, unchanged, apply });
    if (!apply) console.log("dry-run — 실제 반영하려면 --apply");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
