// 어드민: 이벤트 출품작 조회·삭제 (2026-09-13). Prisma raw SQL(DATABASE_URL) — 서비스 키 없이 실행 가능.
// 실행 위치: apps/web
//   npx --yes tsx scripts/admin-event-entries.ts --events                       # event_id별 출품 수
//   npx --yes tsx scripts/admin-event-entries.ts --event=real-photo-contest --latest=13          # 최신 13건 목록(dry-run)
//   npx --yes tsx scripts/admin-event-entries.ts --event=real-photo-contest --latest=13 --apply  # 그 13건 삭제(event_likes는 FK cascade)
// 삭제는 출품 기록만 제거한다 — 사진·공개링크(links)는 그대로 남는다.
import { loadEnvConfig } from "@next/env";
import { PrismaClient } from "@prisma/client";

if (!process.env.DATABASE_URL) loadEnvConfig(process.cwd());

type Row = { id: string; event_id: string; link_id: string; user_id: string; email: string | null; caption: string | null; status: string; like_count: number; created_at: Date };

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const eventArg = args.find((a) => a.startsWith("--event="))?.slice(8);
  const latest = parseInt(args.find((a) => a.startsWith("--latest="))?.slice(9) ?? "0", 10);
  const prisma = new PrismaClient();
  try {
    if (args.includes("--events") || !eventArg) {
      const rows = await prisma.$queryRaw<{ event_id: string; n: bigint; latest: Date }[]>`
        SELECT event_id, count(*)::bigint AS n, max(created_at) AS latest FROM public.event_entries GROUP BY event_id ORDER BY latest DESC`;
      for (const r of rows) console.log(`${r.event_id}\t${r.n}건\tlatest=${r.latest.toISOString()}`);
      if (!eventArg) return;
    }
    if (!latest || latest < 1) { console.error("--latest=N 필요"); process.exit(1); }
    const rows = await prisma.$queryRaw<Row[]>`
      SELECT e.id, e.event_id, e.link_id, e.user_id, u.email, e.caption, e.status, e.like_count, e.created_at
      FROM public.event_entries e LEFT JOIN public."User" u ON u.id = e.user_id
      WHERE e.event_id = ${eventArg}
      ORDER BY e.created_at DESC
      LIMIT ${latest}`;
    console.log(`event=${eventArg} 최신 ${rows.length}건:`);
    rows.forEach((r, i) =>
      console.log(`${String(i + 1).padStart(2)}. ${r.created_at.toISOString().replace("T", " ").slice(0, 16)}  ${r.email ?? r.user_id}  link=${r.link_id}  ♥${r.like_count}  ${r.status}${r.caption ? `  "${r.caption.slice(0, 30)}"` : ""}`),
    );
    if (!apply) { console.log("(dry-run — 삭제하려면 --apply)"); return; }
    const ids = rows.map((r) => r.id);
    const deleted = await prisma.$executeRaw`DELETE FROM public.event_entries WHERE id = ANY(${ids}::text[])`;
    console.log({ deleted });
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
