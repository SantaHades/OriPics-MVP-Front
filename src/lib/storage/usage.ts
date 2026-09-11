// 보관함 사용량·한도 (2026-09-11 A-87) — /api/user/storage 의 합산 쿼리를 사서함 백업 쿼터 검사와 공유하도록 분리.
// 크기 출처 = storage.objects.metadata->>'size' (Supabase Storage 메타데이터).
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

export const STORAGE_BUCKET = "oripics-proofs";

/** pricing-policy §11: Pro 보관함 5GB (확장 애드온은 미출시). Business는 별도 정책 확정 전까지 Pro와 동일 표기. */
export const STORAGE_LIMIT_BYTES: Record<string, number> = {
  pro: 5 * 1024 ** 3,
  business: 5 * 1024 ** 3,
};
/** 사서함 백업 복사 파일에 적용하는 기본 상한 — 요금제 한도가 없는 tier(무료)도 백업 복사는 이 값으로 제한 */
export const BACKUP_DEFAULT_LIMIT_BYTES = 5 * 1024 ** 3;

export interface StorageUsage {
  bytes: number;
  files: number;
  /** null = 요금제상 한도 없음 */
  limitBytes: number | null;
}

/**
 * 사용자 발행 자산의 실제 저장 크기 합산: 원본 PNG(links.storage_path) + 뷰어 프리뷰(links.preview_path)
 * + 인증서 PDF 캐시(ProofHistory.pdfStoragePath) + 사서함 백업 복사본(mailbox-backups/{id}/).
 * A-81 용량 귀속(대표 확정 9/9): 사서함 촬영분은 차감 주체(billing_user_id)의 보관함에 계산 —
 * 내 링크 중 남이 부담한 것은 제외, 남의 링크 중 내가 부담한 것은 포함. 마이그레이션 전이면 기존 쿼리로 폴백.
 */
export async function storageUsage(userId: string): Promise<StorageUsage> {
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
  const limitBytes = user ? (STORAGE_LIMIT_BYTES[user.tier] ?? null) : null;
  return { bytes, files, limitBytes };
}

/** 스토리지 객체 경로 집합의 크기 합(bytes) — 백업 복사 전 예상 용량 산출용 (2026-09-11 A-87) */
export async function objectBytes(paths: string[]): Promise<number> {
  const list = Array.from(new Set(paths.filter(Boolean)));
  if (list.length === 0) return 0;
  const rows = await prisma.$queryRaw<Array<{ bytes: bigint | null }>>`
    SELECT COALESCE(SUM((o.metadata->>'size')::bigint), 0) AS bytes
    FROM storage.objects o
    WHERE o.bucket_id = ${STORAGE_BUCKET} AND o.name IN (${Prisma.join(list)})`;
  return Number(rows?.[0]?.bytes ?? 0);
}
