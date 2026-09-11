// 사서함 사진 (A-81) — GET /api/mailboxes/:id/photos?locale= (참여자) · POST { link_ids } 인증 사진 제출 (참여자, 본인 소유·발행된 링크만)
//   제출된 링크는 사서함 삭제 전까지 삭제 잠금 + 만료 해제(expires_at=null — 무료 7일 만료로 사서함 사진이 사라지지 않게).
import { NextRequest, NextResponse } from "next/server";

import { getSessionUserId } from "@/lib/auth/getSessionUserId";
import { eventsDb, isMissingTable } from "@/lib/events/server";
import {
  PHOTO_COLS, isActiveMember, isLocked, langOf, listMembers, loadMailbox, loadMember, newPhotoId, notify, photoDtos,
  type PhotoRow,
} from "@/lib/mailboxes/server";

export const dynamic = "force-dynamic";

async function guard(id: string) {
  const userId = await getSessionUserId();
  if (!userId) return { res: NextResponse.json({ detail: "unauthenticated" }, { status: 401 }) };
  const db = eventsDb();
  if (!db) return { res: NextResponse.json({ detail: "server_misconfigured" }, { status: 500 }) };
  const mb = await loadMailbox(db, id);
  if (!mb || mb.status !== "active") return { res: NextResponse.json({ detail: "not_found" }, { status: 404 }) };
  const me = await loadMember(db, id, userId);
  const kicked = !!me?.kicked_at;
  if (!isActiveMember(me)) return { res: NextResponse.json({ detail: kicked ? "kicked" : "forbidden" }, { status: 403 }) };
  return { userId, db, mb, me };
}

export async function GET(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const g = await guard(id);
  if ("res" in g) return g.res;
  const { data, error } = await g.db.from("mailbox_photos").select(PHOTO_COLS).eq("mailbox_id", id).order("created_at", { ascending: false }).limit(500);
  if (error) {
    if (isMissingTable(error)) return NextResponse.json({ photos: [], setup_required: true });
    return NextResponse.json({ detail: "db_error" }, { status: 500 });
  }
  const members = await listMembers(g.db, id);
  const photos = await photoDtos(g.db, (data ?? []) as PhotoRow[], members, g.userId, langOf(req.nextUrl.searchParams.get("locale")));
  return NextResponse.json({ photos });
}

export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const g = await guard(id);
  if ("res" in g) return g.res;
  if (isLocked(g.mb)) return NextResponse.json({ detail: "mailbox_locked" }, { status: 403 });
  let body: { link_ids?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ detail: "invalid_json" }, { status: 400 });
  }
  const linkIds = Array.isArray(body.link_ids)
    ? (body.link_ids as unknown[]).filter((x): x is string => typeof x === "string" && /^[A-Za-z0-9_-]{6,64}$/.test(x)).slice(0, 50)
    : [];
  if (linkIds.length === 0) return NextResponse.json({ detail: "link_ids_required" }, { status: 400 });

  // 본인 소유 + 발행(links 행 존재) + 미만료
  // A-85③ (2026-09-11): 이미 어떤 사서함에든 등록된 링크는 만료 검사를 건너뛴다 — 다운그레이드 cron(charge-subscriptions)이
  //   NULL 링크 전체에 37일 만료를 찍어 사서함 링크에도 과거 expires_at이 남을 수 있고, 그 링크는 삭제 잠금으로 실제 파일이 살아 있다.
  //   (아래 update에서 expires_at=NULL로 다시 풀린다)
  const { data: links, error: linkErr } = await g.db.from("links").select("link_id, user_id, expires_at").in("link_id", linkIds);
  if (linkErr) return NextResponse.json({ detail: "db_error" }, { status: 500 });
  const { data: anyMailboxRows } = await g.db.from("mailbox_photos").select("link_id, mailbox_id").in("link_id", linkIds);
  const inAnyMailbox = new Set((anyMailboxRows ?? []).map((r) => r.link_id as string));
  const owned = (links ?? []).filter(
    (l) => l.user_id === g.userId && (!l.expires_at || inAnyMailbox.has(l.link_id as string) || new Date(l.expires_at) > new Date()),
  );
  if (owned.length === 0) return NextResponse.json({ detail: "no_eligible_links" }, { status: 403 });
  const ownedIds = owned.map((l) => l.link_id as string);
  const existing = new Set((anyMailboxRows ?? []).filter((r) => r.mailbox_id === id && ownedIds.includes(r.link_id as string)).map((r) => r.link_id as string));
  const rows = ownedIds
    .filter((lid) => !existing.has(lid))
    .map((lid) => ({ id: newPhotoId(), mailbox_id: id, link_id: lid, uploaded_by: g.userId, billing_user_id: g.userId, source: "submit" }));
  if (rows.length > 0) {
    const { error: insErr } = await g.db.from("mailbox_photos").upsert(rows, { onConflict: "mailbox_id,link_id", ignoreDuplicates: true });
    if (insErr) {
      if (isMissingTable(insErr)) return NextResponse.json({ detail: "setup_required" }, { status: 503 });
      console.error("[mailboxes] submit failed:", insErr.message);
      return NextResponse.json({ detail: "db_error" }, { status: 500 });
    }
    // 올린 사람은 자동 열람 + 무료 만료 해제(사서함 보존)
    await g.db.from("mailbox_reads").upsert(rows.map((r) => ({ photo_id: r.id, user_id: g.userId })), { onConflict: "photo_id,user_id", ignoreDuplicates: true });
    const members = await listMembers(g.db, id);
    await notify(
      g.db,
      members.filter(isActiveMember).filter((m) => m.user_id !== g.userId).map((m) => m.user_id),
      id,
      "new_photos",
      { mailbox_name: g.mb.name, actor_name: g.me.display_name, count: rows.length },
    );
  }
  // 제출 사진의 만료 해제(사서함 보존) — 새로 넣은 것뿐 아니라 이 사서함에 이미 있던 중복 링크도 포함:
  // 다운그레이드 cron이 찍은 과거 만료(A-85③)가 남아 있으면 재제출로 NULL로 되돌린다
  await g.db.from("links").update({ expires_at: null }).in("link_id", ownedIds).not("expires_at", "is", null);
  const ineligible = linkIds.length - owned.length;
  console.log(`[mailboxes] submit mailbox=${id} user=${g.userId} added=${rows.length} dup=${existing.size} ineligible=${ineligible}`);
  return NextResponse.json({ added: rows.length, duplicates: existing.size, ineligible });
}
