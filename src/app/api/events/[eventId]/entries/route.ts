// 이벤트 출품 목록/등록 (A-72, 2026-09-05)
//   GET  /api/events/:eventId/entries?sort=likes|new&limit=&offset=&locale=  — 공개. 로그인 시 liked/mine 포함.
//   POST /api/events/:eventId/entries { link_ids: string[], caption? }        — 로그인 필수(웹 쿠키·모바일 Bearer).
//        출품 = 본인 소유·미만료 공개링크. 같은 이벤트에 같은 링크는 1회(UNIQUE) — 중복은 무시하고 기존 반환.
import { NextRequest, NextResponse } from "next/server";

import { getSessionUserId } from "@/lib/auth/getSessionUserId";
import { resolveEvent } from "@/lib/channels/server";
import { eventsDb, isMissingTable, newEntryId, toDtos, type EntryRow } from "@/lib/events/server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, props: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await props.params;
  const db = eventsDb();
  if (!db) return NextResponse.json({ detail: "server_misconfigured" }, { status: 500 });

  const sp = req.nextUrl.searchParams;
  const sort = sp.get("sort") === "new" ? "new" : "likes";
  const limit = Math.min(Math.max(Number(sp.get("limit") ?? 60), 1), 100);
  const offset = Math.max(Number(sp.get("offset") ?? 0), 0);
  const locale = sp.get("locale") ?? "ko";
  const viewer = await getSessionUserId().catch(() => null);
  // 코드 카탈로그(공개 2개) 또는 사설 이벤트 — 사설은 추가한 사용자만
  const event = await resolveEvent(db, eventId, viewer, locale === "en" ? "en" : "ko");
  if (event === null) return NextResponse.json({ detail: "event_not_found" }, { status: 404 });
  if (event === "forbidden") return NextResponse.json({ detail: "forbidden" }, { status: 403 });

  let q = db
    .from("event_entries")
    .select("id, event_id, link_id, user_id, caption, status, like_count, created_at", { count: "exact" })
    .eq("event_id", eventId)
    .neq("status", "hidden");
  q = sort === "likes"
    ? q.order("like_count", { ascending: false }).order("created_at", { ascending: false })
    : q.order("created_at", { ascending: false });
  const { data, error, count } = await q.range(offset, offset + limit - 1);
  if (error) {
    if (isMissingTable(error)) {
      // 마이그레이션 전 — 빈 목록 + 안내 플래그 (UI는 "아직 출품작이 없습니다"로 표시)
      return NextResponse.json({ entries: [], total: 0, open: event.open, setup_required: true });
    }
    console.error("[events] list failed:", error.message);
    return NextResponse.json({ detail: "db_error" }, { status: 500 });
  }
  const entries = await toDtos(db, (data ?? []) as EntryRow[], viewer, locale);
  return NextResponse.json({ entries, total: count ?? entries.length, open: event.open, ends_at: event.ends_at });
}

export async function POST(req: NextRequest, props: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await props.params;
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ detail: "unauthenticated" }, { status: 401 });
  const db = eventsDb();
  if (!db) return NextResponse.json({ detail: "server_misconfigured" }, { status: 500 });
  const lang0 = req.nextUrl.searchParams.get("locale") === "en" ? "en" : "ko";
  const event = await resolveEvent(db, eventId, userId, lang0);
  if (event === null) return NextResponse.json({ detail: "event_not_found" }, { status: 404 });
  if (event === "forbidden") return NextResponse.json({ detail: "forbidden" }, { status: 403 });
  if (!event.open) return NextResponse.json({ detail: "event_closed" }, { status: 403 });

  let body: { link_ids?: unknown; caption?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ detail: "invalid_json" }, { status: 400 });
  }
  const linkIds = Array.isArray(body.link_ids)
    ? (body.link_ids as unknown[]).filter((x): x is string => typeof x === "string" && /^[A-Za-z0-9_-]{6,64}$/.test(x)).slice(0, 20)
    : [];
  if (linkIds.length === 0) return NextResponse.json({ detail: "link_ids_required" }, { status: 400 });
  const caption = typeof body.caption === "string" ? body.caption.trim().slice(0, 200) || null : null;

  // 본인 소유·미만료 링크만 출품 가능
  const { data: links, error: linkErr } = await db
    .from("links")
    .select("link_id, user_id, expires_at")
    .in("link_id", linkIds);
  if (linkErr) return NextResponse.json({ detail: "db_error" }, { status: 500 });
  const owned = (links ?? []).filter(
    (l) => l.user_id === userId && (!l.expires_at || new Date(l.expires_at) > new Date()),
  );
  if (owned.length === 0) return NextResponse.json({ detail: "no_eligible_links" }, { status: 403 });

  const rows = owned.map((l) => ({
    id: newEntryId(),
    event_id: eventId,
    link_id: l.link_id as string,
    user_id: userId,
    caption,
  }));
  // 중복(UNIQUE event_id+link_id)은 무시 — 이미 출품된 링크는 기존 행 유지
  const { error: insErr } = await db.from("event_entries").upsert(rows, { onConflict: "event_id,link_id", ignoreDuplicates: true });
  if (insErr) {
    if (isMissingTable(insErr)) return NextResponse.json({ detail: "setup_required" }, { status: 503 });
    console.error("[events] insert failed:", insErr.message);
    return NextResponse.json({ detail: "db_error" }, { status: 500 });
  }
  const { data: mine } = await db
    .from("event_entries")
    .select("id, event_id, link_id, user_id, caption, status, like_count, created_at")
    .eq("event_id", eventId)
    .in("link_id", owned.map((l) => l.link_id as string));
  const locale = req.nextUrl.searchParams.get("locale") ?? "ko";
  const entries = await toDtos(db, (mine ?? []) as EntryRow[], userId, locale);
  console.log(`[events] entries added event=${eventId} user=${userId} n=${owned.length}`);
  return NextResponse.json({ entries, skipped: linkIds.length - owned.length });
}
