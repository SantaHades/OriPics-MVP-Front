// 사서함 사진 상세 (A-81) — GET /api/mailboxes/:id/photos/:photoId?locale= → 속성 + 참여자별 열람 시각 (참여자)
import { NextRequest, NextResponse } from "next/server";

import { getSessionUserId } from "@/lib/auth/getSessionUserId";
import { eventsDb } from "@/lib/events/server";
import { PHOTO_COLS, isActiveMember, langOf, listMembers, loadMailbox, loadMember, photoDtos, type PhotoRow } from "@/lib/mailboxes/server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, props: { params: Promise<{ id: string; photoId: string }> }) {
  const { id, photoId } = await props.params;
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ detail: "unauthenticated" }, { status: 401 });
  const db = eventsDb();
  if (!db) return NextResponse.json({ detail: "server_misconfigured" }, { status: 500 });
  const mb = await loadMailbox(db, id);
  if (!mb || mb.status !== "active") return NextResponse.json({ detail: "not_found" }, { status: 404 });
  const me = await loadMember(db, id, userId);
  if (!isActiveMember(me)) return NextResponse.json({ detail: "forbidden" }, { status: 403 });
  const { data } = await db.from("mailbox_photos").select(PHOTO_COLS).eq("id", photoId).eq("mailbox_id", id).maybeSingle();
  if (!data) return NextResponse.json({ detail: "photo_not_found" }, { status: 404 });
  const members = await listMembers(db, id);
  const [dto] = await photoDtos(db, [data as PhotoRow], members, userId, langOf(req.nextUrl.searchParams.get("locale")), true);
  return NextResponse.json({ photo: dto });
}
