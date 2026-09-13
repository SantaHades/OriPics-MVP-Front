// 어드민: 뷰어 경량본(preview_path, 긴 변 1600px JPEG) 누락 링크 백필 (2026-09-13).
// 배경: preview는 앱이 publish 본문에 base64로 보내면 저장되는데(A-36), 옛 빌드·웹 발행·전송 실패 건은 null →
//   이벤트 갤러리·뷰어가 원본 PNG(수 MB)를 매번 받아 큰 사진이 스피너 뒤에 늦게 열림(2026-09-13 대표 실측).
// 동작: links에서 preview_path IS NULL AND storage_path IS NOT NULL (만료 안 된 것) → 공개 URL로 원본 받아 sharp 1600px JPEG →
//   같은 버킷 `<storage_path 확장자 제거>_preview.jpg`에 업로드(upsert) → links.preview_path 갱신. publish 라우트와 같은 경로 규칙.
// 실행 위치: apps/web —  npx --yes tsx scripts/admin-backfill-previews.ts [--limit=50] [--apply]
//   --apply 없으면 대상 목록·개수만 출력(dry-run).
import { loadEnvConfig } from "@next/env";
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";

import { readFileSync } from "fs";

// 로컬 .env에는 서비스 키가 없음(Vercel에만) → `--env=<vercel env pull 파일>`로 보충 (2026-09-13). 값은 출력하지 않는다.
const envArg = process.argv.find((a) => a.startsWith("--env="));
if (envArg) {
  for (const line of readFileSync(envArg.slice(6), "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)="?(.*?)"?$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}
if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) loadEnvConfig(process.cwd());

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY ?? "";
const BUCKET = "oripics-proofs";
const MAX_EDGE = 1600;

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const limitArg = args.find((a) => a.startsWith("--limit="));
  const limit = limitArg ? parseInt(limitArg.split("=")[1], 10) : 50;
  if (!SUPABASE_URL || !SERVICE_KEY) {
    console.error("env NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 필요");
    process.exit(1);
  }
  const db = createClient(SUPABASE_URL, SERVICE_KEY);
  const nowIso = new Date().toISOString();
  const { data, error } = await db
    .from("links")
    .select("link_id, storage_path, expires_at, width, height")
    .is("preview_path", null)
    .not("storage_path", "is", null)
    .or(`expires_at.is.null,expires_at.gt.${nowIso}`)
    .order("timestamp", { ascending: false })
    .limit(limit);
  if (error) {
    console.error("query failed:", error.message);
    process.exit(1);
  }
  const rows = (data ?? []) as { link_id: string; storage_path: string; expires_at: string | null; width: number | null; height: number | null }[];
  console.log(`preview 누락 링크(만료 제외, limit ${limit}): ${rows.length}`);
  let done = 0;
  let failed = 0;
  for (const r of rows) {
    const src = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${r.storage_path}`;
    const dest = r.storage_path.replace(/\.[a-z0-9]+$/i, "") + "_preview.jpg";
    console.log(`${apply ? "process" : "would process"}: ${r.link_id} ${r.width ?? "?"}×${r.height ?? "?"} → ${dest}`);
    if (!apply) continue;
    try {
      const res = await fetch(src);
      if (!res.ok) throw new Error(`fetch ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      const jpeg = await sharp(buf)
        .rotate()
        .resize({ width: MAX_EDGE, height: MAX_EDGE, fit: "inside", withoutEnlargement: true })
        .jpeg({ quality: 82, mozjpeg: true })
        .toBuffer();
      const { error: upErr } = await db.storage.from(BUCKET).upload(dest, jpeg, { contentType: "image/jpeg", upsert: true, cacheControl: "31536000" });
      if (upErr) throw new Error(`upload: ${upErr.message}`);
      const { error: dbErr } = await db.from("links").update({ preview_path: dest }).eq("link_id", r.link_id);
      if (dbErr) throw new Error(`db: ${dbErr.message}`);
      done++;
      console.log(`  ok ${(jpeg.length / 1024).toFixed(0)}KB`);
    } catch (e: any) {
      failed++;
      console.warn(`  FAIL ${r.link_id}: ${e?.message ?? e}`);
    }
  }
  console.log({ candidates: rows.length, done, failed, apply });
  if (!apply) console.log("dry-run — 실제 반영하려면 --apply");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
