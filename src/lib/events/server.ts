// 이벤트 출품 서버 헬퍼 (A-72, 2026-09-05) — service role로 event_entries/event_likes 조회·가공.
// 응답의 image_url은 뷰어 경량본(preview_path, 1600px JPEG)을 우선하고 없으면 발행본(signed_url).
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { isMissingColumn } from "@/lib/links/memo";
import { hasThumbColumn, publicObjectUrl } from "@/lib/links/previewBackfill";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const SITE_URL = "https://ori.pics";

export function eventsDb(): SupabaseClient | null {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return null;
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
}

export interface EntryRow {
  id: string;
  event_id: string;
  link_id: string;
  user_id: string;
  caption: string | null;
  status: string;
  like_count: number;
  created_at: string;
}

export interface EntryDto {
  id: string;
  event_id: string;
  link_id: string;
  caption: string | null;
  status: string;
  like_count: number;
  liked: boolean;
  mine: boolean;
  created_at: string;
  image_url: string | null;
  /** (2026-09-13 A-96) 갤러리 썸네일(320px JPEG) 공개 URL — 없으면 null, 클라이언트는 image_url로 폴백 */
  thumb_url: string | null;
  link_url: string;
  width: number | null;
  height: number | null;
  captured_at: string | null;
  tier: string | null;
}

/** 테이블/함수 미생성(마이그레이션 전) 여부 — PostgREST: PGRST205(table not in schema cache)·PGRST202(function), PG: 42P01·42883 */
export function isMissingTable(err: { code?: string; message?: string } | null | undefined): boolean {
  if (!err) return false;
  if (err.code === "42P01" || err.code === "42883" || err.code === "PGRST205" || err.code === "PGRST202") return true;
  return /does not exist|could not find the (table|function)/i.test(err.message ?? "");
}

export async function toDtos(
  db: SupabaseClient,
  rows: EntryRow[],
  viewerUserId: string | null,
  locale: string,
): Promise<EntryDto[]> {
  if (rows.length === 0) return [];
  const linkIds = Array.from(new Set(rows.map((r) => r.link_id)));
  const LINK_COLS = "link_id, width, height, captured_at, tier, signed_url, preview_path, expires_at";
  // (2026-09-13 A-96) thumb_path는 컬럼이 있을 때만 select — 판정이 어긋나면 memo 포함 컬럼으로 재시도
  const withThumb = await hasThumbColumn(db);
  const FULL_COLS = withThumb ? `${LINK_COLS}, memo, thumb_path` : `${LINK_COLS}, memo`;
  // A-76: 출품 캡션이 없으면 공개 메모를 캡션으로 — memo 컬럼 부재(마이그레이션 전)면 기본 컬럼으로 재시도
  let { data: links, error: linkErr } = await db.from("links").select(FULL_COLS).in("link_id", linkIds);
  if (linkErr && withThumb && isMissingColumn(linkErr)) {
    const fb = await db.from("links").select(`${LINK_COLS}, memo`).in("link_id", linkIds);
    links = fb.data as unknown as typeof links;
    linkErr = fb.error;
  }
  if (linkErr && isMissingColumn(linkErr)) {
    const fb = await db.from("links").select(LINK_COLS).in("link_id", linkIds);
    links = fb.data as unknown as typeof links;
  }
  type LinkRec = { link_id: string; width: number | null; height: number | null; captured_at: string | null; tier: string | null; signed_url: string | null; preview_path: string | null; expires_at: string | null; memo?: string | null; thumb_path?: string | null };
  const linkMap = new Map<string, LinkRec>();
  for (const l of (links ?? []) as unknown as LinkRec[]) linkMap.set(l.link_id, l);

  let likedSet = new Set<string>();
  if (viewerUserId) {
    const { data: likes } = await db
      .from("event_likes")
      .select("entry_id")
      .eq("user_id", viewerUserId)
      .in("entry_id", rows.map((r) => r.id));
    likedSet = new Set((likes ?? []).map((l) => l.entry_id as string));
  }

  const lang = locale === "en" ? "en" : "ko";
  return rows.map((r) => {
    const l = linkMap.get(r.link_id);
    const expired = !!l?.expires_at && new Date(l.expires_at) <= new Date();
    const image_url = !l || expired
      ? null
      : l.preview_path
        ? `${SUPABASE_URL}/storage/v1/object/public/oripics-proofs/${l.preview_path}`
        : (l.signed_url as string | null);
    const thumb_url = !l || expired || !l.thumb_path ? null : publicObjectUrl(SUPABASE_URL, l.thumb_path);
    return {
      id: r.id,
      event_id: r.event_id,
      link_id: r.link_id,
      caption: r.caption ?? ((l as { memo?: string | null } | undefined)?.memo ?? null),
      status: r.status,
      like_count: r.like_count,
      liked: likedSet.has(r.id),
      mine: !!viewerUserId && r.user_id === viewerUserId,
      created_at: r.created_at,
      image_url,
      thumb_url,
      link_url: `${SITE_URL}/${lang}/${r.link_id}`,
      width: (l?.width as number | null) ?? null,
      height: (l?.height as number | null) ?? null,
      captured_at: (l?.captured_at as string | null) ?? null,
      tier: (l?.tier as string | null) ?? null,
    };
  });
}

export function newEntryId(): string {
  return `E${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}
