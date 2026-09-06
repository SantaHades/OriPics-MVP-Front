// 공개 메모 수정 (A-76, 2026-09-06) — PATCH /api/links/:id/memo { memo: string | null }
// 소유자만(웹 쿠키·앱 Bearer 공용). 인증 후·발행 후 언제든 수정 가능. 최초 입력 후 변경되면 memo_edited=true.
import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

import { getSessionUserId } from "@/lib/auth/getSessionUserId";
import { isMissingColumn, normalizeMemo } from "@/lib/links/memo";

export const dynamic = "force-dynamic";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

export async function PATCH(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id: linkId } = await props.params;
  if (!/^[A-Za-z0-9_-]{6,64}$/.test(linkId)) return NextResponse.json({ detail: "invalid_link_id" }, { status: 400 });
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ detail: "unauthenticated" }, { status: 401 });
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return NextResponse.json({ detail: "server_misconfigured" }, { status: 500 });

  let body: { memo?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ detail: "invalid_json" }, { status: 400 });
  }
  const memo = normalizeMemo(body.memo);
  if (memo === undefined) return NextResponse.json({ detail: "memo_required" }, { status: 400 });

  const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const { data: row, error } = await db.from("links").select("link_id, user_id, memo").eq("link_id", linkId).maybeSingle();
  if (error) {
    if (isMissingColumn(error)) return NextResponse.json({ detail: "setup_required" }, { status: 503 });
    return NextResponse.json({ detail: "db_error" }, { status: 500 });
  }
  if (!row) return NextResponse.json({ detail: "not_found" }, { status: 404 });
  if (row.user_id !== userId) return NextResponse.json({ detail: "forbidden" }, { status: 403 });

  const prev = (row.memo as string | null) ?? null;
  const edited = prev !== null && prev !== memo; // 최초 입력은 '수정'이 아님
  const patch: Record<string, unknown> = { memo, memo_updated_at: new Date().toISOString() };
  if (edited) patch.memo_edited = true;
  const { data: updated, error: upErr } = await db
    .from("links")
    .update(patch)
    .eq("link_id", linkId)
    .select("memo, memo_updated_at, memo_edited")
    .single();
  if (upErr) {
    if (isMissingColumn(upErr)) return NextResponse.json({ detail: "setup_required" }, { status: 503 });
    console.error(`[memo] update failed link_id=${linkId}:`, upErr.message);
    return NextResponse.json({ detail: "db_error" }, { status: 500 });
  }
  return NextResponse.json({ memo: updated.memo, memo_updated_at: updated.memo_updated_at, memo_edited: !!updated.memo_edited });
}
