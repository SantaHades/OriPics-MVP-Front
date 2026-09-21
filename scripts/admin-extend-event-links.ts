// 어드민: 이벤트 출품작 링크의 보관 기간 연장 (2026-09-21 신설).
//
// 배경: 무료 발행 링크는 7일이면 만료되고 cleanup 크론이 스토리지 파일·row를 지운다.
// 10/31까지 열린 콘테스트에서 9/7~9/13 출품작 28/38건이 이미 사진 없이 남았고(복구 불가),
// 살아 있는 출품작도 며칠 내 같은 운명이었다. 출품 API는 이후 출품분을 자동 연장하지만,
// 이미 출품된 링크는 이 스크립트로 한 번 밀어준다.
//
// 규칙(출품 API eventLinkExpiry와 동일):
//   목표 만료 = min(이벤트 종료일 + 30일, now + 180일), 종료일 없으면 min(now + 90일, 상한)
//   - expires_at IS NULL(유료 무기한 보관)은 건드리지 않는다
//   - 이미 목표보다 긴 링크도 그대로 둔다 (연장 전용, 단축 없음)
//
// 실행: apps/web 에서  npx --yes tsx scripts/admin-extend-event-links.ts [--event=<id>] [--apply]
//   --apply 없으면 대상만 출력(dry-run).
//
// ⚠️ 공개 이벤트 2개는 DB 테이블이 아니라 코드 카탈로그(src/lib/events/catalog.ts)에 있다.
//    사설 이벤트만 custom_events 테이블에 있으므로 종료일을 두 곳에서 가져온다.
import { loadEnvConfig } from "@next/env";
import { PrismaClient } from "@prisma/client";

if (!process.env.DATABASE_URL) loadEnvConfig(process.cwd());

const GRACE_DAYS = 30;
const MAX_DAYS = 180;
const OPEN_ENDED_DAYS = 90;
const DAY = 86_400_000;

/** 코드 카탈로그(src/lib/events/catalog.ts)의 공개 이벤트 종료일 — DB에 없으므로 여기서 대조한다 */
const CATALOG_ENDS_AT: Record<string, Date> = {
  "real-photo-contest": new Date("2026-10-31T23:59:59+09:00"),
  "proof-shot-contest": new Date("2026-10-31T23:59:59+09:00"),
};

function targetExpiry(endsAt: Date | null): Date {
  const now = Date.now();
  const base = endsAt ? endsAt.getTime() + GRACE_DAYS * DAY : now + OPEN_ENDED_DAYS * DAY;
  return new Date(Math.min(base, now + MAX_DAYS * DAY));
}

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const only = args.find((a) => a.startsWith("--event="))?.slice("--event=".length);
  const prisma = new PrismaClient();

  try {
    // event_entries·custom_events는 Prisma 스키마 밖(Supabase 직접 생성)이라 raw로 조회한다.
    const rows = await prisma.$queryRawUnsafe<
      { event_id: string; ends_at: Date | null; link_id: string; expires_at: Date | null }[]
    >(
      `SELECT e.event_id, ce.ends_at, l.link_id, l.expires_at
         FROM public.event_entries e
         JOIN public.links l ON l.link_id = e.link_id
         LEFT JOIN public.custom_events ce ON ce.id = e.event_id
        WHERE e.status <> 'hidden'
          AND l.expires_at IS NOT NULL
          ${only ? "AND e.event_id = $1" : ""}
        ORDER BY e.event_id, l.expires_at`,
      ...(only ? [only] : []),
    );

    if (rows.length === 0) {
      console.log("대상 없음 (출품작이 없거나 전부 무기한 보관).");
      return;
    }

    const plan = rows
      .map((r) => ({ ...r, target: targetExpiry(r.ends_at ?? CATALOG_ENDS_AT[r.event_id] ?? null) }))
      .filter((r) => r.expires_at! < r.target);

    const byEvent = new Map<string, typeof plan>();
    for (const r of plan) {
      const list = byEvent.get(r.event_id) ?? [];
      list.push(r);
      byEvent.set(r.event_id, list);
    }

    console.log(`출품 링크 ${rows.length}건 중 연장 대상 ${plan.length}건${apply ? "" : " (dry-run)"}`);
    for (const [eventId, list] of byEvent) {
      const endsAt = list[0].ends_at ?? CATALOG_ENDS_AT[eventId] ?? null;
      const ends = endsAt ? endsAt.toISOString().slice(0, 10) : "종료일 없음";
      console.log(`  ${eventId} (종료 ${ends}) — ${list.length}건 → ${list[0].target.toISOString().slice(0, 10)} 까지`);
    }
    // 이미 만료돼 파일이 지워졌을 수 있는 건은 따로 표시 (연장해도 사진은 돌아오지 않음)
    const alreadyExpired = plan.filter((r) => r.expires_at! <= new Date());
    if (alreadyExpired.length) {
      console.log(`  ⚠️ 이 중 ${alreadyExpired.length}건은 이미 만료 시각을 지났습니다 — cleanup이 파일을 지웠다면 사진은 복구되지 않습니다.`);
    }

    if (!apply) {
      console.log("\n--apply 를 붙이면 실제로 갱신합니다.");
      return;
    }

    let updated = 0;
    for (const [, list] of byEvent) {
      const target = list[0].target;
      const ids = list.map((r) => r.link_id);
      const res = await prisma.$executeRawUnsafe(
        `UPDATE public.links SET expires_at = $1 WHERE link_id = ANY($2::text[]) AND expires_at IS NOT NULL AND expires_at < $1`,
        target,
        ids,
      );
      updated += Number(res);
    }
    console.log(`\n갱신 완료: ${updated}건`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
