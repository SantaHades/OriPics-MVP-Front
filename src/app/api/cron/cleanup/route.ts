import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { prisma } from "@/lib/prisma";
import { assertCron } from "@/lib/security/cron";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY!;
const BUCKET_NAME = "oripics-proofs";
/** links row가 없는 고아 파일(업로드 후 publish 실패 등)의 보존 기간 */
const ORPHAN_RETENTION_DAYS = 7;
const BATCH = 500;

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * 보관 만료 정리 (pricing-policy §11.2 보관함 모델, A-7).
 *
 *  1. links.expires_at <= now 인 링크: Storage 파일(원본 + preview + PDF 캐시)
 *     제거 후 row 삭제. expires_at은 publish 시 tier로 결정된다
 *     (free: +7일 / pro·business: null=보관함 활성 중 무기한,
 *      다운그레이드 시 charge-subscriptions cron이 grace 만료를 설정).
 *  2. 고아 파일 정리: links row가 없는 Storage 파일 중 7일 경과분 삭제
 *     (publish 실패·미완 업로드 잔재). expires_at=null인 유료 링크 파일은
 *     row가 존재하므로 여기서 절대 삭제되지 않는다.
 */
export async function GET(req: NextRequest) {
  const denied = assertCron(req);
  if (denied) return denied;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return NextResponse.json({ detail: "server_misconfigured" }, { status: 500 });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  let expiredRemoved = 0;
  let orphansRemoved = 0;
  let scanned = 0;
  const errors: string[] = [];

  // 1) 만료 링크 정리 (DB 주도)
  try {
    const { data: expired, error: qErr } = await supabase
      .from("links")
      .select("link_id, storage_path, preview_path")
      .lte("expires_at", new Date().toISOString())
      .limit(BATCH);
    if (qErr) throw qErr;

    if (expired && expired.length > 0) {
      const paths: string[] = [];
      for (const l of expired) {
        if (l.storage_path) paths.push(l.storage_path);
        if (l.preview_path) paths.push(l.preview_path);
        paths.push(`certificates/${l.link_id}.pdf`); // PDF 캐시 (없으면 무시됨)
      }
      const { error: rmErr } = await supabase.storage.from(BUCKET_NAME).remove(paths);
      if (rmErr) errors.push(`expired remove: ${rmErr.message}`);

      const ids = expired.map((l) => l.link_id);
      const { error: delErr } = await supabase.from("links").delete().in("link_id", ids);
      if (delErr) errors.push(`expired db: ${delErr.message}`);
      else expiredRemoved = ids.length;
    }
  } catch (e: any) {
    errors.push(`expired pass: ${e?.message || e}`);
  }

  // 2) 고아 파일 정리 (Storage 주도 — links row가 없는 오래된 파일만)
  const cutoff = new Date(Date.now() - ORPHAN_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  try {
    const { data: folders, error: listFoldersErr } = await supabase.storage
      .from(BUCKET_NAME)
      .list();
    if (listFoldersErr) throw listFoldersErr;

    for (const folder of folders || []) {
      const folderName = folder.name;
      // certificates 폴더는 만료 링크 정리(1)에서만 다룸 — 유효 링크의 PDF 캐시 보호
      if (!folderName || folderName === "certificates") continue;

      const { data: files, error: listFilesErr } = await supabase.storage
        .from(BUCKET_NAME)
        .list(folderName);
      if (listFilesErr) {
        errors.push(`list ${folderName}: ${listFilesErr.message}`);
        continue;
      }

      const oldPaths: string[] = [];
      for (const f of files || []) {
        scanned++;
        const created = (f as any).created_at;
        if (!created) continue;
        const createdAt = new Date(created);
        if (isNaN(createdAt.getTime()) || createdAt >= cutoff) continue;
        oldPaths.push(`${folderName}/${f.name}`);
      }
      if (oldPaths.length === 0) continue;

      // links row가 존재하는 파일(원본·preview)은 보호 — 고아만 삭제
      const { data: rows, error: rowErr } = await supabase
        .from("links")
        .select("storage_path, preview_path")
        .or(
          `storage_path.in.(${oldPaths.map((p) => `"${p}"`).join(",")}),preview_path.in.(${oldPaths.map((p) => `"${p}"`).join(",")})`,
        );
      if (rowErr) {
        errors.push(`rowcheck ${folderName}: ${rowErr.message}`);
        continue; // 확인 실패 시 안전하게 skip (삭제하지 않음)
      }
      const protectedPaths = new Set<string>();
      for (const r of rows || []) {
        if (r.storage_path) protectedPaths.add(r.storage_path);
        if (r.preview_path) protectedPaths.add(r.preview_path);
      }
      const orphanPaths = oldPaths.filter((p) => !protectedPaths.has(p));
      if (orphanPaths.length === 0) continue;

      const { error: removeErr } = await supabase.storage.from(BUCKET_NAME).remove(orphanPaths);
      if (removeErr) {
        errors.push(`orphan remove ${folderName}: ${removeErr.message}`);
        continue;
      }
      orphansRemoved += orphanPaths.length;
    }
  } catch (e: any) {
    return NextResponse.json(
      { detail: `cleanup_error:${e?.message || e}`, scanned, expiredRemoved, orphansRemoved, errors },
      { status: 500 },
    );
  }

  // 레이트리밋 카운터 정리 (2026-08-22) — 윈도가 지난 행은 불필요. 최장 윈도(1h)+여유 24h 기준.
  let rateLimitsPurged = 0;
  try {
    rateLimitsPurged = await prisma.$executeRawUnsafe(
      `DELETE FROM public.rate_limits WHERE window_start < now() - interval '24 hours'`,
    );
  } catch (e: any) {
    errors.push(`rate_limits purge: ${e?.message || e}`);
  }

  return NextResponse.json({ ok: true, scanned, expiredRemoved, orphansRemoved, rateLimitsPurged, errors });
}
