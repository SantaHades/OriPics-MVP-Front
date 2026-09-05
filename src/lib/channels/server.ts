// 비공개 사서함·이벤트(사설 채널) 서버 헬퍼 (A-72, 2026-09-05)
// 공개 이벤트 2개는 코드 카탈로그(lib/events/catalog), 사설 이벤트·사서함은 DB(custom_events/mailboxes).
import type { SupabaseClient } from "@supabase/supabase-js";

import { getEvent, type EventDef } from "@/lib/events/catalog";
import { isMissingTable } from "@/lib/events/server";

export interface MailboxDto {
  id: string;
  name: string;
  description: string | null;
  email: string;
  visibility: string;
  status: string;
  private: boolean;
}

export interface CustomEventRow {
  id: string;
  name: string;
  summary: string | null;
  details: string | null;
  rules: string[] | null;
  period: string | null;
  ends_at: string | null;
  visibility: string;
  status: string;
  owner_user_id: string | null;
}

export interface EventDefDto {
  id: string;
  name: string;
  summary: string;
  details: string;
  rules: string[];
  period: string;
  ends_at: string | null;
  open: boolean;
  private: boolean;
}

export function catalogToDto(e: EventDef, lang: "ko" | "en"): EventDefDto {
  return {
    id: e.id,
    name: e.name[lang],
    summary: e.summary[lang],
    details: e.details[lang],
    rules: e.rules[lang],
    period: e.period[lang],
    ends_at: e.endsAt,
    open: new Date(e.endsAt).getTime() > Date.now(),
    private: false,
  };
}

export function customToDto(r: CustomEventRow, lang: "ko" | "en"): EventDefDto {
  return {
    id: r.id,
    name: r.name,
    summary: r.summary ?? "",
    details: r.details ?? "",
    rules: r.rules ?? [],
    period: r.period ?? (lang === "en" ? "Entry period: ongoing" : "접수 기간: 상시"),
    ends_at: r.ends_at,
    open: r.status === "active" && (!r.ends_at || new Date(r.ends_at).getTime() > Date.now()),
    private: r.visibility !== "public",
  };
}

/** 사용자가 추가한 사설 이벤트 + 공개(visibility=public) 사설 이벤트 */
export async function listCustomEvents(db: SupabaseClient, userId: string | null): Promise<CustomEventRow[]> {
  const ids = new Set<string>();
  if (userId) {
    const { data } = await db.from("user_events").select("event_id").eq("user_id", userId);
    for (const r of data ?? []) ids.add(r.event_id as string);
  }
  let q = db
    .from("custom_events")
    .select("id, name, summary, details, rules, period, ends_at, visibility, status, owner_user_id")
    .eq("status", "active");
  q = ids.size > 0 ? q.or(`visibility.eq.public,id.in.(${Array.from(ids).map((x) => `"${x}"`).join(",")})`) : q.eq("visibility", "public");
  const { data, error } = await q.order("created_at", { ascending: false });
  if (error) {
    if (!isMissingTable(error)) console.error("[channels] custom events failed:", error.message);
    return [];
  }
  return (data ?? []) as CustomEventRow[];
}

/**
 * 이벤트 해석 — 코드 카탈로그 우선, 없으면 custom_events. 사설(private)은 추가한 사용자·소유자만 접근 가능.
 * 반환 null=없음, "forbidden"=비공개 미가입.
 */
export async function resolveEvent(
  db: SupabaseClient,
  eventId: string,
  userId: string | null,
  lang: "ko" | "en",
): Promise<EventDefDto | null | "forbidden"> {
  const c = getEvent(eventId);
  if (c) return catalogToDto(c, lang);
  const { data, error } = await db
    .from("custom_events")
    .select("id, name, summary, details, rules, period, ends_at, visibility, status, owner_user_id")
    .eq("id", eventId)
    .maybeSingle();
  if (error || !data) return null;
  const row = data as CustomEventRow;
  if (row.visibility !== "public") {
    if (!userId) return "forbidden";
    if (row.owner_user_id !== userId) {
      const { data: m } = await db.from("user_events").select("event_id").eq("user_id", userId).eq("event_id", eventId).maybeSingle();
      if (!m) return "forbidden";
    }
  }
  return customToDto(row, lang);
}

/** 사용자의 사서함 목록 — 공개 사서함 + 추가한 비공개 사서함 */
export async function listMailboxes(db: SupabaseClient, userId: string | null): Promise<MailboxDto[]> {
  const ids = new Set<string>();
  if (userId) {
    const { data } = await db.from("user_mailboxes").select("mailbox_id").eq("user_id", userId);
    for (const r of data ?? []) ids.add(r.mailbox_id as string);
  }
  let q = db.from("mailboxes").select("id, name, description, email, visibility, status").eq("status", "active");
  q = ids.size > 0 ? q.or(`visibility.eq.public,id.in.(${Array.from(ids).map((x) => `"${x}"`).join(",")})`) : q.eq("visibility", "public");
  const { data, error } = await q.order("created_at", { ascending: false });
  if (error) {
    if (!isMissingTable(error)) console.error("[channels] mailboxes failed:", error.message);
    return [];
  }
  return (data ?? []).map((r) => ({
    id: r.id as string,
    name: r.name as string,
    description: (r.description as string | null) ?? null,
    email: r.email as string,
    visibility: r.visibility as string,
    status: r.status as string,
    private: r.visibility !== "public",
  }));
}

/** join RPC 예외 메시지 → API 상태 */
export function joinErrorStatus(message: string): { status: number; detail: string } {
  if (/wrong_password/.test(message)) return { status: 403, detail: "wrong_password" };
  if (/not_found/.test(message)) return { status: 404, detail: "not_found" };
  if (/closed/.test(message)) return { status: 410, detail: "closed" };
  if (/does not exist|could not find/i.test(message)) return { status: 503, detail: "setup_required" };
  return { status: 500, detail: "db_error" };
}
