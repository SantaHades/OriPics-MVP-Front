// 내 사서함 백업 목록 (A-81 2차) — GET /api/mailboxes/backups
import { NextResponse } from "next/server";

import { getSessionUserId } from "@/lib/auth/getSessionUserId";
import { eventsDb, isMissingTable } from "@/lib/events/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ detail: "unauthenticated" }, { status: 401 });
  const db = eventsDb();
  if (!db) return NextResponse.json({ detail: "server_misconfigured" }, { status: 500 });
  const { data, error } = await db
    .from("mailbox_backups")
    .select("id, mailbox_id, mailbox_name, taken_at, copied_files, photo_count, member_count, bytes, snapshot->mailbox->>owner_name")
    .eq("owner_user_id", userId)
    .order("taken_at", { ascending: false })
    .limit(200);
  if (error) {
    if (isMissingTable(error)) return NextResponse.json({ backups: [], setup_required: true });
    return NextResponse.json({ detail: "db_error" }, { status: 500 });
  }
  return NextResponse.json({ backups: (data ?? []).map((r) => ({ ...r, owner_name: (r as Record<string, unknown>).owner_name ?? "" })) });
}
