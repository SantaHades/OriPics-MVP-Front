// 비공개 메모 (A-77, 2026-09-06) — GET/PUT /api/links/:id/private-note  (로그인 사용자 본인 것만)
// links 행 존재 여부와 무관(인증만 된 미발행 사진도 link_id로 저장). PUT { note: string | null } — null/빈값=삭제.
import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

import { getSessionUserId } from "@/lib/auth/getSessionUserId";
import { isMissingTable } from "@/lib/events/server";

export const dynamic = "force-dynamic";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const NOTE_MAX = 200;
const LINK_RE = /^[A-Za-z0-9_-]{6,64}$/;

function db() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return null;
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
}

export async function GET(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id: linkId } = await props.params;
  if (!LINK_RE.test(linkId)) return NextResponse.json({ detail: "invalid_link_id" }, { status: 400 });
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ detail: "unauthenticated" }, { status: 401 });
  const client = db();
  if (!client) return NextResponse.json({ detail: "server_misconfigured" }, { status: 500 });
  const { data, error } = await client
    .from("user_link_notes")
    .select("note, updated_at")
    .eq("user_id", userId)
    .eq("link_id", linkId)
    .maybeSingle();
  if (error) {
    if (isMissingTable(error)) return NextResponse.json({ note: null, setup_required: true });
    return NextResponse.json({ detail: "db_error" }, { status: 500 });
  }
  return NextResponse.json({ note: data?.note ?? null, updated_at: data?.updated_at ?? null });
}

export async function PUT(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id: linkId } = await props.params;
  if (!LINK_RE.test(linkId)) return NextResponse.json({ detail: "invalid_link_id" }, { status: 400 });
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ detail: "unauthenticated" }, { status: 401 });
  const client = db();
  if (!client) return NextResponse.json({ detail: "server_misconfigured" }, { status: 500 });
  let body: { note?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ detail: "invalid_json" }, { status: 400 });
  }
  const raw = typeof body.note === "string" ? body.note.replace(/\r\n?/g, "\n").replace(/\n{2,}/g, "\n").trim() : "";
  const note = Array.from(raw).slice(0, NOTE_MAX).join("");

  const { error } = note
    ? await client
        .from("user_link_notes")
        .upsert({ user_id: userId, link_id: linkId, note, updated_at: new Date().toISOString() }, { onConflict: "user_id,link_id" })
    : await client.from("user_link_notes").delete().eq("user_id", userId).eq("link_id", linkId);
  if (error) {
    if (isMissingTable(error)) return NextResponse.json({ detail: "setup_required" }, { status: 503 });
    console.error(`[private-note] save failed link_id=${linkId}:`, error.message);
    return NextResponse.json({ detail: "db_error" }, { status: 500 });
  }
  return NextResponse.json({ note: note || null });
}
