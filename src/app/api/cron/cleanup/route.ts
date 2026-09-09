import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { prisma } from "@/lib/prisma";
import { assertCron } from "@/lib/security/cron";
import { purgeExpiredRefreshTokens } from "@/lib/auth/refreshStore";
import { lockedLinkIds } from "@/lib/mailboxes/server";

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

    // A-81: 사서함 소속 링크는 만료 정리에서 제외 (삭제 잠금). 사서함 삭제 시 함께 정리된다.
    const locked = await lockedLinkIds(supabase, (expired ?? []).map((l) => l.link_id as string));
    const expiredFree = (expired ?? []).filter((l) => !locked.has(l.link_id as string));
    if (expiredFree.length > 0) {
      const paths: string[] = [];
      for (const l of expiredFree) {
        if (l.storage_path) paths.push(l.storage_path);
        if (l.preview_path) paths.push(l.preview_path);
        paths.push(`certificates/${l.link_id}.pdf`); // PDF 캐시 (없으면 무시됨)
      }
      const { error: rmErr } = await supabase.storage.from(BUCKET_NAME).remove(paths);
      if (rmErr) errors.push(`expired remove: ${rmErr.message}`);

      const ids = expiredFree.map((l) => l.link_id);
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
      // mailbox-backups 폴더(A-81 2차 백업 복사본)는 links 행이 없어 고아로 보이지만 백업 영구삭제 때만 지운다
      if (!folderName || folderName === "certificates" || folderName === "mailbox-backups") continue;

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

  // A-81: 삭제 예고 유예(7일) 지난 사서함 정리 — 사서함 촬영분(source=capture) 링크·파일은 삭제,
  // 제출분(source=submit)은 mailbox_photos 행만 사라져 올린 사람의 일반 링크로 복귀. 사서함 행 삭제 시 참여자·초대·열람은 CASCADE.
  let mailboxesDeleted = 0;
  try {
    const { data: due, error: dueErr } = await supabase
      .from("mailboxes")
      .select("id, name")
      .lte("delete_after", new Date().toISOString())
      .limit(20);
    if (dueErr) throw dueErr;
    for (const mb of due ?? []) {
      const { data: photos } = await supabase.from("mailbox_photos").select("link_id, source").eq("mailbox_id", mb.id);
      const captureLinks = (photos ?? []).filter((p) => p.source === "capture").map((p) => p.link_id as string);
      if (captureLinks.length > 0) {
        // 다른 사서함에도 들어간 링크는 남긴다
        const { data: elsewhere } = await supabase.from("mailbox_photos").select("link_id").in("link_id", captureLinks).neq("mailbox_id", mb.id);
        const keep = new Set((elsewhere ?? []).map((r) => r.link_id as string));
        const toDelete = captureLinks.filter((id) => !keep.has(id));
        if (toDelete.length > 0) {
          const { data: rows } = await supabase.from("links").select("link_id, storage_path, preview_path").in("link_id", toDelete);
          const paths: string[] = [];
          for (const l of rows ?? []) {
            if (l.storage_path) paths.push(l.storage_path);
            if (l.preview_path) paths.push(l.preview_path);
            paths.push(`certificates/${l.link_id}.pdf`);
          }
          if (paths.length > 0) {
            const { error: rmErr } = await supabase.storage.from(BUCKET_NAME).remove(paths);
            if (rmErr) errors.push(`mailbox ${mb.id} remove: ${rmErr.message}`);
          }
          const { error: lErr } = await supabase.from("links").delete().in("link_id", toDelete);
          if (lErr) errors.push(`mailbox ${mb.id} links: ${lErr.message}`);
          try {
            await prisma.proofHistory.deleteMany({ where: { linkId: { in: toDelete } } });
          } catch (e: any) {
            errors.push(`mailbox ${mb.id} history: ${e?.message || e}`);
          }
        }
      }
      const { error: mbErr } = await supabase.from("mailboxes").delete().eq("id", mb.id);
      if (mbErr) errors.push(`mailbox ${mb.id} delete: ${mbErr.message}`);
      else mailboxesDeleted++;
    }
  } catch (e: any) {
    // 마이그레이션 전(테이블 없음)은 조용히 건너뜀
    if (!/does not exist|schema cache/i.test(String(e?.message || e))) errors.push(`mailboxes pass: ${e?.message || e}`);
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

  // 만료된 모바일 refresh 토큰 정리 (A-38②, 2026-08-24) — 폐기분도 만료 후에는 재사용 감지 가치 없음
  let refreshTokensPurged = 0;
  try {
    refreshTokensPurged = await purgeExpiredRefreshTokens();
  } catch (e: any) {
    errors.push(`refresh_tokens purge: ${e?.message || e}`);
  }

  return NextResponse.json({ ok: true, scanned, expiredRemoved, orphansRemoved, mailboxesDeleted, rateLimitsPurged, refreshTokensPurged, errors });
}
