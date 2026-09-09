import { NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/auth/getSessionUserId";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const LIMIT_BYTES: Record<string, number> = {
  // pricing-policy §11: Pro 보관함 5GB (확장 애드온은 미출시). Business는 별도 정책
  // 확정 전까지 Pro와 동일 표기.
  pro: 5 * 1024 ** 3,
  business: 5 * 1024 ** 3,
};

/**
 * GET /api/user/storage — 보관함 사용량 (온디맨드 조회, 2026-08-31 대표 결정: 버튼 클릭 시에만)
 *
 * 사용자 발행 자산의 실제 저장 크기 합산: 원본 PNG(links.storage_path) +
 * 뷰어 프리뷰(links.preview_path) + 인증서 PDF 캐시(ProofHistory.pdfStoragePath).
 * 크기 출처 = storage.objects.metadata->>'size' (Supabase Storage 메타데이터).
 */
export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json({ detail: "unauthenticated" }, { status: 401 });
  }

  try {
    // A-81 용량 귀속(대표 확정 9/9): 사서함 촬영분은 차감 주체(billing_user_id)의 보관함에 계산 —
    // 내 링크 중 남이 부담한 것은 제외, 남의 링크 중 내가 부담한 것은 포함. 마이그레이션 전이면 기존 쿼리로 폴백.
    const attributed = async () => prisma.$queryRaw<Array<{ bytes: bigint | null; files: bigint | null }>>`
      SELECT COALESCE(SUM((o.metadata->>'size')::bigint), 0) AS bytes, COUNT(*) AS files
      FROM storage.objects o
      WHERE o.bucket_id = 'oripics-proofs'
        AND o.name IN (
          SELECT l.storage_path FROM public.links l WHERE l.user_id = ${userId} AND l.storage_path IS NOT NULL
            AND NOT EXISTS (SELECT 1 FROM public.mailbox_photos mp WHERE mp.link_id = l.link_id AND mp.billing_user_id IS NOT NULL AND mp.billing_user_id <> ${userId})
          UNION
          SELECT l.preview_path FROM public.links l WHERE l.user_id = ${userId} AND l.preview_path IS NOT NULL
            AND NOT EXISTS (SELECT 1 FROM public.mailbox_photos mp WHERE mp.link_id = l.link_id AND mp.billing_user_id IS NOT NULL AND mp.billing_user_id <> ${userId})
          UNION
          SELECT l.storage_path FROM public.links l JOIN public.mailbox_photos mp ON mp.link_id = l.link_id
            WHERE mp.billing_user_id = ${userId} AND l.user_id <> ${userId} AND l.storage_path IS NOT NULL
          UNION
          SELECT l.preview_path FROM public.links l JOIN public.mailbox_photos mp ON mp.link_id = l.link_id
            WHERE mp.billing_user_id = ${userId} AND l.user_id <> ${userId} AND l.preview_path IS NOT NULL
          UNION
          SELECT "pdfStoragePath" FROM public."ProofHistory" WHERE "userId" = ${userId} AND "pdfStoragePath" IS NOT NULL
          UNION
          SELECT o2.name FROM storage.objects o2 JOIN public.mailbox_backups b ON o2.name LIKE 'mailbox-backups/' || b.id || '/%'
            WHERE o2.bucket_id = 'oripics-proofs' AND b.owner_user_id = ${userId}
        )`;
    const legacy = async () => prisma.$queryRaw<Array<{ bytes: bigint | null; files: bigint | null }>>`
      SELECT COALESCE(SUM((o.metadata->>'size')::bigint), 0) AS bytes, COUNT(*) AS files
      FROM storage.objects o
      WHERE o.bucket_id = 'oripics-proofs'
        AND o.name IN (
          SELECT storage_path FROM public.links WHERE user_id = ${userId} AND storage_path IS NOT NULL
          UNION
          SELECT preview_path FROM public.links WHERE user_id = ${userId} AND preview_path IS NOT NULL
          UNION
          SELECT "pdfStoragePath" FROM public."ProofHistory" WHERE "userId" = ${userId} AND "pdfStoragePath" IS NOT NULL
        )`;
    let rows: Array<{ bytes: bigint | null; files: bigint | null }>;
    try {
      rows = await attributed();
    } catch (e: any) {
      if (!/does not exist/i.test(String(e?.message || e))) throw e;
      rows = await legacy();
    }
    const bytes = Number(rows?.[0]?.bytes ?? 0);
    const files = Number(rows?.[0]?.files ?? 0);

    const user = await prisma.user.findUnique({ where: { id: userId }, select: { tier: true } });
    const limitBytes = user ? (LIMIT_BYTES[user.tier] ?? null) : null;

    return NextResponse.json({ bytes, files, limit_bytes: limitBytes });
  } catch (e: any) {
    console.error("[user/storage] failed:", e?.message || e);
    return NextResponse.json({ detail: "storage_query_failed" }, { status: 500 });
  }
}
