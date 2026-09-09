// 열람 기록 (A-81) — POST /api/mailboxes/:id/photos/:photoId/read — 사진 상세(전체화면)를 연 순간 앱이 호출. 멱등.
import { NextRequest, NextResponse } from "next/server";

import { getSessionUserId } from "@/lib/auth/getSessionUserId";
import { eventsDb } from "@/lib/events/server";
import { isActiveMember, loadMailbox, loadMember } from "@/lib/mailboxes/server";

export const dynamic = "force-dynamic";

export async function POST(_req: NextRequest, props: { params: Promise<{ id: string; photoId: string }> }) {
  const { id, photoId } = await props.params;
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ detail: "unauthenticated" }, { status: 401 });
  const db = eventsDb();
  if (!db) return NextResponse.json({ detail: "server_misconfigured" }, { status: 500 });
  const mb = await loadMailbox(db, id);
  if (!mb || mb.status !== "active") return NextResponse.json({ detail: "not_found" }, { status: 404 });
  const me = await loadMember(db, id, userId);
  if (!isActiveMember(me)) return NextResponse.json({ detail: "forbidden" }, { status: 403 });
  const { data: photo } = await db.from("mailbox_photos").select("id").eq("id", photoId).eq("mailbox_id", id).maybeSingle();
  if (!photo) return NextResponse.json({ detail: "photo_not_found" }, { status: 404 });
  const { error } = await db.from("mailbox_reads").upsert({ photo_id: photoId, user_id: userId }, { onConflict: "photo_id,user_id", ignoreDuplicates: true });
  if (error) return NextResponse.json({ detail: "db_error" }, { status: 500 });
  return NextResponse.json({ ok: true });
}
