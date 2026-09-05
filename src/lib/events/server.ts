// 이벤트 출품 서버 헬퍼 (A-72, 2026-09-05) — service role로 event_entries/event_likes 조회·가공.
// 응답의 image_url은 뷰어 경량본(preview_path, 1600px JPEG)을 우선하고 없으면 발행본(signed_url).
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

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
  const { data: links } = await db
    .from("links")
    .select("link_id, width, height, captured_at, tier, signed_url, preview_path, expires_at")
    .in("link_id", linkIds);
  const linkMap = new Map<string, NonNullable<typeof links>[number]>();
  for (const l of links ?? []) linkMap.set(l.link_id, l);

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
    return {
      id: r.id,
      event_id: r.event_id,
      link_id: r.link_id,
      caption: r.caption,
      status: r.status,
      like_count: r.like_count,
      liked: likedSet.has(r.id),
      mine: !!viewerUserId && r.user_id === viewerUserId,
      created_at: r.created_at,
      image_url,
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
