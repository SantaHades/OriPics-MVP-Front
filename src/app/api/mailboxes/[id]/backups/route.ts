// 사서함 백업 (A-81 2차) — POST /api/mailboxes/:id/backups (참여자) → 그 시점 스냅샷을 내 웹 저장소에 저장.
//   삭제 예고 상태면 사서함 촬영분 파일(원본·프리뷰)을 mailbox-backups/{backupId}/ 로 복사해 사서함 삭제 후에도 사진이 남게 한다.
import { NextRequest, NextResponse } from "next/server";

import { getSessionUserId } from "@/lib/auth/getSessionUserId";
import { eventsDb, isMissingTable } from "@/lib/events/server";
import { buildSnapshot, isActiveMember, langOf, listMembers, loadMailbox, loadMember, newBackupId } from "@/lib/mailboxes/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
const BUCKET = "oripics-proofs";

export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ detail: "unauthenticated" }, { status: 401 });
  const db = eventsDb();
  if (!db) return NextResponse.json({ detail: "server_misconfigured" }, { status: 500 });
  const mb = await loadMailbox(db, id);
  if (!mb || mb.status !== "active") return NextResponse.json({ detail: "not_found" }, { status: 404 });
  const me = await loadMember(db, id, userId);
  if (!isActiveMember(me)) return NextResponse.json({ detail: "forbidden" }, { status: 403 });
  const lang = langOf(req.nextUrl.searchParams.get("locale"));
  const members = await listMembers(db, id);
  const snapshot = await buildSnapshot(db, mb, members, userId, lang);
  const backupId = newBackupId();
  let copied = false;
  let bytes = 0;
  if (mb.delete_after) {
    // 사서함 촬영분만 복사(제출분은 올린 사람의 일반 링크로 남음)
    for (const p of snapshot.photos) {
      if (p.source !== "capture") continue;
      for (const key of ["storage_path", "preview_path"] as const) {
        const src = p[key];
        if (!src) continue;
        const dest = `mailbox-backups/${backupId}/${src.split("/").pop()}`;
        const { error } = await db.storage.from(BUCKET).copy(src, dest);
        if (!error) {
          if (key === "preview_path") p.backup_preview_path = dest;
          else p.backup_storage_path = dest;
          copied = true;
        }
      }
    }
    if (copied) {
      const { data: objs } = await db.storage.from(BUCKET).list(`mailbox-backups/${backupId}`, { limit: 1000 });
      for (const o of objs ?? []) bytes += Number((o as { metadata?: { size?: number } }).metadata?.size ?? 0);
    }
  }
  const row = {
    id: backupId,
    mailbox_id: mb.id,
    mailbox_name: mb.name,
    owner_user_id: userId,
    snapshot,
    copied_files: copied,
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
  console.log(`[mailboxes] backup ${backupId} mailbox=${id} user=${userId} photos=${row.photo_count} copied=${copied}`);
  return NextResponse.json({ backup: { id: data.id, taken_at: data.taken_at, photo_count: row.photo_count, member_count: row.member_count, copied_files: copied } }, { status: 201 });
}
