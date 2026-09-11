// 사서함 백업 (A-81 2차) — POST /api/mailboxes/:id/backups (참여자) → 그 시점 스냅샷을 내 웹 저장소에 저장.
//   삭제 예고 상태면 사서함 촬영분 파일(원본·프리뷰)을 mailbox-backups/{backupId}/ 로 복사해 사서함 삭제 후에도 사진이 남게 한다.
//   2026-09-11 A-87: 파일명 link_id 접두어(동명 덮어쓰기 방지) · 복사 실패 집계(copied/failed, snapshot.copy_failed)
//                    · 보관함 쿼터(5GB, 409 storage_quota) · 사용자별 시간당 5회(429 rate_limited)
import { NextRequest, NextResponse } from "next/server";

import { getSessionUserId } from "@/lib/auth/getSessionUserId";
import { eventsDb, isMissingTable } from "@/lib/events/server";
import { buildSnapshot, isActiveMember, langOf, listMembers, loadMailbox, loadMember, newBackupId } from "@/lib/mailboxes/server";
import { RATE_LIMITS, checkRateLimit } from "@/lib/security/rateLimit";
import { BACKUP_DEFAULT_LIMIT_BYTES, objectBytes, storageUsage } from "@/lib/storage/usage";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
const BUCKET = "oripics-proofs";

export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ detail: "unauthenticated" }, { status: 401 });
  const db = eventsDb();
  if (!db) return NextResponse.json({ detail: "server_misconfigured" }, { status: 500 });
  // 횟수 제한 — 사용자별 시간당 5회 (실패 포함). 사서함 API의 detail 형식 유지 + Retry-After
  const rl = await checkRateLimit(RATE_LIMITS.mailboxBackup, userId);
  if (!rl.allowed) {
    return NextResponse.json({ detail: "rate_limited", retry_after: rl.retryAfterSec }, { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } });
  }
  const mb = await loadMailbox(db, id);
  if (!mb || mb.status !== "active") return NextResponse.json({ detail: "not_found" }, { status: 404 });
  const me = await loadMember(db, id, userId);
  if (!isActiveMember(me)) return NextResponse.json({ detail: "forbidden" }, { status: 403 });
  const lang = langOf(req.nextUrl.searchParams.get("locale"));
  const members = await listMembers(db, id);
  const snapshot = await buildSnapshot(db, mb, members, userId, lang);
  const backupId = newBackupId();
  let copied = 0;
  let failed = 0;
  let bytes = 0;
  if (mb.delete_after) {
    // 사서함 촬영분만 복사(제출분은 올린 사람의 일반 링크로 남음)
    const jobs: { p: (typeof snapshot.photos)[number]; key: "storage_path" | "preview_path"; src: string }[] = [];
    for (const p of snapshot.photos) {
      if (p.source !== "capture") continue;
      for (const key of ["storage_path", "preview_path"] as const) {
        const src = p[key];
        if (src) jobs.push({ p, key, src });
      }
    }
    if (jobs.length > 0) {
      // 보관함 쿼터 — 복사 예상 용량 + 현재 사용량이 한도를 넘으면 거절 (실패 시 fail-open: 쿼터 조회 오류로 백업이 막히지 않게)
      try {
        const [usage, estimate] = await Promise.all([storageUsage(userId), objectBytes(jobs.map((j) => j.src))]);
        const limit = usage.limitBytes ?? BACKUP_DEFAULT_LIMIT_BYTES;
        if (usage.bytes + estimate > limit) {
          return NextResponse.json({ detail: "storage_quota", used_bytes: usage.bytes, estimate_bytes: estimate, limit_bytes: limit }, { status: 409 });
        }
      } catch (e: any) {
        console.warn("[mailboxes] backup quota check skipped:", e?.message || e);
      }
      for (const { p, key, src } of jobs) {
        // 같은 파일명(예: preview.jpg)이 링크마다 반복돼 덮어써지던 문제 → link_id 접두어
        const dest = `mailbox-backups/${backupId}/${p.link_id}_${src.split("/").pop()}`;
        const { error } = await db.storage.from(BUCKET).copy(src, dest);
        if (error) {
          failed += 1;
          console.warn(`[mailboxes] backup copy failed ${src} → ${dest}: ${error.message}`);
          continue;
        }
        if (key === "preview_path") p.backup_preview_path = dest;
        else p.backup_storage_path = dest;
        copied += 1;
      }
    }
    if (copied > 0) {
      const { data: objs } = await db.storage.from(BUCKET).list(`mailbox-backups/${backupId}`, { limit: 1000 });
      for (const o of objs ?? []) bytes += Number((o as { metadata?: { size?: number } }).metadata?.size ?? 0);
    }
  }
  if (failed > 0) snapshot.copy_failed = failed; // 스키마 변경 없이 JSONB 안에 기록 — 부분 백업 표시용
  const row = {
    id: backupId,
    mailbox_id: mb.id,
    mailbox_name: mb.name,
    owner_user_id: userId,
    snapshot,
    copied_files: copied > 0,
    photo_count: snapshot.photos.length,
    member_count: snapshot.members.filter((m) => m.state === "active").length,
    bytes,
  };
  const { data, error } = await db.from("mailbox_backups").insert(row).select("id, taken_at").single();
  if (error) {
    if (isMissingTable(error)) return NextResponse.json({ detail: "setup_required" }, { status: 503 });
    console.error("[mailboxes] backup failed:", error.message);
    return NextResponse.json({ detail: "db_error" }, { status: 500 });
  }
  console.log(`[mailboxes] backup ${backupId} mailbox=${id} user=${userId} photos=${row.photo_count} copied=${copied} failed=${failed}`);
  return NextResponse.json(
    { backup: { id: data.id, taken_at: data.taken_at, photo_count: row.photo_count, member_count: row.member_count, copied_files: copied > 0, copied, failed } },
    { status: 201 },
  );
}
