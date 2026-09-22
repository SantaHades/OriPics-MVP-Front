// 뷰어 경량본(preview_path, 긴 변 1600px JPEG) 누락 링크 백필 (2026-09-13).
// 배경: preview는 앱이 publish 본문에 base64로 보내면 저장되는데(A-36), 옛 빌드·웹 발행·전송 실패 건은 null →
//   이벤트 갤러리·뷰어가 원본 PNG(수 MB)를 매번 받아 큰 사진이 스피너 뒤에 늦게 열림(대표 실측).
// 서비스 키는 Vercel에만 있어(로컬 pull 불가 — Sensitive) 서버에서 실행: cron/cleanup(매 실행 소량) + /api/admin/previews/backfill(즉시).
// (2026-09-13 A-96) 목록 썸네일(thumb_path, 긴 변 320px JPEG q75)도 같은 배치에서 생성 — 사진함·이벤트 그리드가 1600px 경량본(300~900KB)을
//   100장씩 받던 것을 수십 KB로. links.thumb_path 컬럼은 대표가 SQL(2026_09_13_links_thumb_path.sql)을 실행해야 생기므로
//   존재 여부를 프로세스 단위로 캐시해 두고, 없으면 preview만 처리(옛 동작 유지).
import type { SupabaseClient } from "@supabase/supabase-js";

import { isMissingColumn } from "@/lib/links/memo";

const BUCKET = "oripics-proofs";
const MAX_EDGE = 1600;
/** (2026-09-13 A-96) 목록 썸네일 긴 변 — 앱 3열 그리드(~120px@3x=360) · 웹 4열 카드(~180px@2x=360)에 충분 */
export const THUMB_EDGE = 320;
const IMMUTABLE_CACHE_SECONDS = "31536000";

export type PreviewBackfillResult = {
  candidates: number;
  done: number;
  /** (2026-09-13 A-96) 이번 배치에서 새로 생성한 썸네일 수 (컬럼 없으면 항상 0) */
  thumbs: number;
  failed: number;
  failures: { link_id: string; error: string }[];
};

type SharpFn = typeof import("sharp").default;
async function loadSharp(): Promise<SharpFn> {
  const sharpMod = await import("sharp");
  return (sharpMod.default ?? sharpMod) as SharpFn;
}

/** 원본 경로 → 경량본 경로 규칙 (publish 라우트와 동일: .png → _preview.jpg) */
export function previewPathFor(storagePath: string): string {
  return storagePath.replace(/\.[a-z0-9]+$/i, "") + "_preview.jpg";
}
/** (2026-09-13 A-96) 원본 경로 → 썸네일 경로 규칙 (.png → _thumb.jpg) */
export function thumbPathFor(storagePath: string): string {
  return storagePath.replace(/\.[a-z0-9]+$/i, "") + "_thumb.jpg";
}

/** 뷰어 경량본 — 긴 변 1600px JPEG q82 */
export async function makePreview(buf: Buffer): Promise<Buffer> {
  const sharp = await loadSharp();
  return sharp(buf)
    .resize({ width: MAX_EDGE, height: MAX_EDGE, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 82, mozjpeg: true })
    .toBuffer();
}

/** (2026-09-13 A-96) 목록 썸네일 — 긴 변 320px JPEG q75. 입력은 원본 PNG든 1600px 경량본이든 무관(경량본을 넣으면 훨씬 빠름) */
export async function makeThumb(buf: Buffer): Promise<Buffer> {
  const sharp = await loadSharp();
  return sharp(buf)
    .rotate() // EXIF 방향 반영(경량본은 이미 반영돼 있어 no-op)
    .resize({ width: THUMB_EDGE, height: THUMB_EDGE, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 75, mozjpeg: true })
    .toBuffer();
}

// ── links.thumb_path 컬럼 존재 여부 캐시 (2026-09-13 A-96) ─────────────────────────────────────────
// information_schema는 PostgREST에 노출되지 않으므로 `select thumb_path limit 1`을 던져 42703/PGRST204이면 없음으로 판정.
// 있음 → 프로세스 수명 동안 캐시. 없음 → 5분만 캐시(대표가 SQL을 실행하면 재배포 없이 다음 주기부터 반영).
const THUMB_COL_RECHECK_MS = 5 * 60 * 1000;
let thumbColCache: { has: boolean; at: number } | null = null;
export async function hasThumbColumn(db: SupabaseClient): Promise<boolean> {
  const now = Date.now();
  if (thumbColCache && (thumbColCache.has || now - thumbColCache.at < THUMB_COL_RECHECK_MS)) return thumbColCache.has;
  const { error } = await db.from("links").select("thumb_path").limit(1);
  if (error && !isMissingColumn(error)) {
    // 일시 오류(네트워크 등)는 판정 보류 — 캐시하지 않고 이번엔 없음으로 취급
    return thumbColCache?.has ?? false;
  }
  thumbColCache = { has: !error, at: now };
  return !error;
}
/** 테스트·오류 복구용 캐시 초기화 */
export function resetThumbColumnCache(): void {
  thumbColCache = null;
}

/** 공개 URL (thumb_url·image_url 공용) */
export function publicObjectUrl(supabaseUrl: string | undefined, path: string): string {
  return `${supabaseUrl}/storage/v1/object/public/${BUCKET}/${path}`;
}

async function fetchBuffer(url: string): Promise<Buffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

async function uploadJpeg(db: SupabaseClient, dest: string, jpeg: Buffer): Promise<void> {
  const { error } = await db.storage.from(BUCKET).upload(dest, jpeg, { contentType: "image/jpeg", upsert: true, cacheControl: IMMUTABLE_CACHE_SECONDS });
  if (error) throw new Error(`upload: ${error.message}`);
}

type Row = { link_id: string; storage_path: string; preview_path: string | null; thumb_path?: string | null };

export async function backfillPreviews(db: SupabaseClient, supabaseUrl: string, limit = 20): Promise<PreviewBackfillResult> {
  const nowIso = new Date().toISOString();
  const withThumb = await hasThumbColumn(db);
  // 컬럼 있으면 preview 또는 thumb 둘 중 하나라도 비어 있는 행, 없으면 preview 누락 행만 (옛 동작)
  let q = db
    .from("links")
    .select(withThumb ? "link_id, storage_path, preview_path, thumb_path" : "link_id, storage_path, preview_path")
    .not("storage_path", "is", null)
    .or(`expires_at.is.null,expires_at.gt.${nowIso}`);
  q = withThumb ? q.or("preview_path.is.null,thumb_path.is.null") : q.is("preview_path", null);
  const { data, error } = await q.order("timestamp", { ascending: false }).limit(limit);
  if (error) throw new Error(`query: ${error.message}`);
  const rows = (data ?? []) as unknown as Row[];
  const result: PreviewBackfillResult = { candidates: rows.length, done: 0, thumbs: 0, failed: 0, failures: [] };
  if (rows.length === 0) return result;

  for (const r of rows) {
    try {
      const update: Record<string, string> = {};
      let previewBuf: Buffer | null = null;
      if (!r.preview_path) {
        const original = await fetchBuffer(publicObjectUrl(supabaseUrl, r.storage_path));
        previewBuf = await makePreview(original);
        const dest = previewPathFor(r.storage_path);
        await uploadJpeg(db, dest, previewBuf);
        update.preview_path = dest;
      }
      if (withThumb && !r.thumb_path) {
        // 썸네일은 1600px 경량본에서 축소(원본 PNG 디코드 회피) — 경량본이 이미 있던 행은 저장소에서 받아 쓴다
        const src = previewBuf ?? (await fetchBuffer(publicObjectUrl(supabaseUrl, r.preview_path!)));
        const thumb = await makeThumb(src);
        const dest = thumbPathFor(r.storage_path);
        await uploadJpeg(db, dest, thumb);
        update.thumb_path = dest;
      }
      if (Object.keys(update).length === 0) continue;
      const { error: dbErr } = await db.from("links").update(update).eq("link_id", r.link_id);
      if (dbErr) throw new Error(`db: ${dbErr.message}`);
      if (update.preview_path) result.done++;
      if (update.thumb_path) result.thumbs++;
    } catch (e: any) {
      result.failed++;
      result.failures.push({ link_id: r.link_id, error: e?.message ?? String(e) });
    }
  }
  return result;
}
