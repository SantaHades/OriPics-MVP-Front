// 어드민: 뷰어 경량본 누락 링크 즉시 백필 (2026-09-13). GET /api/admin/previews/backfill?limit=50
// ADMIN_EMAILS 세션만. cron/cleanup도 매 실행 20건씩 자동 처리하므로 이 엔드포인트는 급할 때 브라우저에서 호출하는 용도.
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { requireAdmin } from "@/lib/partner/admin";
import { backfillPreviews } from "@/lib/links/previewBackfill";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) {
    // 진단용: 세션 자체가 없는지(쿠키 미전송·미로그인) vs 로그인은 됐지만 ADMIN_EMAILS 밖인지 구분 (2026-09-13). 이메일은 노출하지 않음.
    const session = await getServerSession(authOptions);
    const reason = session?.user?.email ? "not_admin" : "no_session";
    return NextResponse.json({ detail: "forbidden", reason }, { status: 403 });
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return NextResponse.json({ detail: "setup_required" }, { status: 503 });
  const limit = Math.min(Math.max(parseInt(req.nextUrl.searchParams.get("limit") ?? "50", 10) || 50, 1), 100);
  try {
    const r = await backfillPreviews(createClient(url, key), url, limit);
    return NextResponse.json({ ok: true, by: admin.email, ...r });
  } catch (e: any) {
    return NextResponse.json({ detail: "backfill_failed", error: e?.message ?? String(e) }, { status: 500 });
  }
}
