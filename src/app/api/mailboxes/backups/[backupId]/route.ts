// 백업 상세·영구삭제 (A-81 2차) — GET /api/mailboxes/backups/:backupId · DELETE (복사 파일까지 제거, 복구 불가)
import { NextRequest, NextResponse } from "next/server";

import { getSessionUserId } from "@/lib/auth/getSessionUserId";
import { eventsDb } from "@/lib/events/server";
import { BACKUP_COLS, type BackupRow } from "@/lib/mailboxes/server";

export const dynamic = "force-dynamic";
const BUCKET = "oripics-proofs";
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;

async function load(backupId: string, userId: string) {
  const db = eventsDb();
  if (!db) return { res: NextResponse.json({ detail: "server_misconfigured" }, { status: 500 }) };
  const { data } = await db.from("mailbox_backups").select(BACKUP_COLS).eq("id", backupId).maybeSingle();
  if (!data) return { res: NextResponse.json({ detail: "not_found" }, { status: 404 }) };
  const row = data as BackupRow;
  if (row.owner_user_id !== userId) return { res: NextResponse.json({ detail: "forbidden" }, { status: 403 }) };
  return { db, row };
}

export async function GET(_req: NextRequest, props: { params: Promise<{ backupId: string }> }) {
  const { backupId } = await props.params;
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ detail: "unauthenticated" }, { status: 401 });
  const g = await load(backupId, userId);
  if ("res" in g) return g.res;
  const { row } = g;
  // 복사된 프리뷰가 있으면 그것을 표시(사서함 삭제 후에도 유효), 없으면 스냅샷 당시 image_url
  const photos = row.snapshot.photos.map((p) => ({
    ...p,
    image_url: p.backup_preview_path ? `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${p.backup_preview_path}` : p.image_url,
  }));
  return NextResponse.json({
    backup: {
      id: row.id, mailbox_id: row.mailbox_id, mailbox_name: row.mailbox_name, taken_at: row.taken_at, copied_files: row.copied_files,
      photo_count: row.photo_count, member_count: row.member_count, bytes: row.bytes,
      // 백업 시 복사 실패 건수 — 부분 백업 표시용 (2026-09-11 A-87)
      copy_failed: row.snapshot.copy_failed ?? 0,
      mailbox: row.snapshot.mailbox, members: row.snapshot.members, photos,
    },
  });
}

export async function DELETE(_req: NextRequest, props: { params: Promise<{ backupId: string }> }) {
  const { backupId } = await props.params;
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ detail: "unauthenticated" }, { status: 401 });
  const g = await load(backupId, userId);
  if ("res" in g) return g.res;
  const { db, row } = g;
  if (row.copied_files) {
    const { data: objs } = await db.storage.from(BUCKET).list(`mailbox-backups/${backupId}`, { limit: 1000 });
    const paths = (objs ?? []).map((o) => `mailbox-backups/${backupId}/${o.name}`);
    if (paths.length > 0) {
      const { error } = await db.storage.from(BUCKET).remove(paths);
      if (error) console.warn(`[mailboxes] backup files remove warning ${backupId}:`, error.message);
    }
  }
  const { error } = await db.from("mailbox_backups").delete().eq("id", backupId);
  if (error) return NextResponse.json({ detail: "db_error" }, { status: 500 });
  console.log(`[mailboxes] backup deleted ${backupId} user=${userId}`);
  return NextResponse.json({ ok: true });
}
