// 어드민: 해시 원장(A-109) 상태 점검 — DB 버전·bit_count 지원·테이블·최근 행·배치. 읽기 전용. 2026-10-01 신설.
// 실행 위치: apps/web —  npx --yes tsx scripts/admin-ledger-check.ts
import { loadEnvConfig } from "@next/env";
import { PrismaClient } from "@prisma/client";

if (!process.env.DATABASE_URL) loadEnvConfig(process.cwd());
const prisma = new PrismaClient();

async function main() {
  const [{ server_version }] = await prisma.$queryRaw<{ server_version: string }[]>`SHOW server_version`;
  const [{ bc }] = await prisma.$queryRaw<{ bc: number }[]>`SELECT bit_count(B'1011')::int AS bc`;
  const tables = await prisma.$queryRaw<{ table_name: string; rls: boolean }[]>`
    SELECT c.relname AS table_name, c.relrowsecurity AS rls FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname IN ('proof_ledger', 'ledger_batches')`;
  console.log({ server_version, bit_count_1011: bc, tables });
  const rows = await prisma.proofLedger.count();
  const withFp = await prisma.proofLedger.count({ where: { phash256: { not: null } } });
  const unbatched = await prisma.proofLedger.count({ where: { batchId: null } });
  const recent = await prisma.proofLedger.findMany({
    orderBy: { certifiedAt: "desc" }, take: 5,
    select: { linkId: true, tier: true, certifiedAt: true, publishedAt: true, phash256: true, dhash64: true, fileSha256: true, publishedSha256: true, batchId: true },
  });
  const batches = await prisma.ledgerBatch.findMany({
    orderBy: { createdAt: "desc" }, take: 5,
    select: { day: true, leafCount: true, merkleRoot: true, tsaTime: true, tsaError: true },
  });
  console.log({ rows, withFp, unbatched });
  console.log("recent:", recent.map((r) => ({ ...r, phash256: r.phash256?.slice(0, 12), fileSha256: r.fileSha256?.slice(0, 12), publishedSha256: r.publishedSha256?.slice(0, 12) })));
  console.log("batches:", batches);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
