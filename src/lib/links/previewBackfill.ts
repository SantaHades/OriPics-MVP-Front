// 뷰어 경량본(preview_path, 긴 변 1600px JPEG) 누락 링크 백필 (2026-09-13).
// 배경: preview는 앱이 publish 본문에 base64로 보내면 저장되는데(A-36), 옛 빌드·웹 발행·전송 실패 건은 null →
//   이벤트 갤러리·뷰어가 원본 PNG(수 MB)를 매번 받아 큰 사진이 스피너 뒤에 늦게 열림(대표 실측).
// 서비스 키는 Vercel에만 있어(로컬 pull 불가 — Sensitive) 서버에서 실행: cron/cleanup(매 실행 소량) + /api/admin/previews/backfill(즉시).
import type { SupabaseClient } from "@supabase/supabase-js";

const BUCKET = "oripics-proofs";
const MAX_EDGE = 1600;
const IMMUTABLE_CACHE_SECONDS = "31536000";

export type PreviewBackfillResult = { candidates: number; done: number; failed: number; failures: { link_id: string; error: string }[] };

export async function backfillPreviews(db: SupabaseClient, supabaseUrl: string, limit = 20): Promise<PreviewBackfillResult> {
  const nowIso = new Date().toISOString();
  const { data, error } = await db
    .from("links")
    .select("link_id, storage_path, expires_at")
    .is("preview_path", null)
    .not("storage_path", "is", null)
    .or(`expires_at.is.null,expires_at.gt.${nowIso}`)
    .order("timestamp", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`query: ${error.message}`);
  const rows = (data ?? []) as { link_id: string; storage_path: string }[];
  const result: PreviewBackfillResult = { candidates: rows.length, done: 0, failed: 0, failures: [] };
  if (rows.length === 0) return result;

  const sharpMod = await import("sharp");
  const sharp = (sharpMod.default ?? sharpMod) as typeof import("sharp").default;

  for (const r of rows) {
    const src = `${supabaseUrl}/storage/v1/object/public/${BUCKET}/${r.storage_path}`;
    const dest = r.storage_path.replace(/\.[a-z0-9]+$/i, "") + "_preview.jpg"; // publish 라우트와 같은 경로 규칙(.png → _preview.jpg)
    try {
      const res = await fetch(src);
      if (!res.ok) throw new Error(`fetch ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      const jpeg = await sharp(buf)
        .resize({ width: MAX_EDGE, height: MAX_EDGE, fit: "inside", withoutEnlargement: true })
        .jpeg({ quality: 82, mozjpeg: true })
        .toBuffer();
      const { error: upErr } = await db.storage.from(BUCKET).upload(dest, jpeg, { contentType: "image/jpeg", upsert: true, cacheControl: IMMUTABLE_CACHE_SECONDS });
      if (upErr) throw new Error(`upload: ${upErr.message}`);
      const { error: dbErr } = await db.from("links").update({ preview_path: dest }).eq("link_id", r.link_id);
      if (dbErr) throw new Error(`db: ${dbErr.message}`);
      result.done++;
    } catch (e: any) {
      result.failed++;
      result.failures.push({ link_id: r.link_id, error: e?.message ?? String(e) });
    }
  }
  return result;
}
