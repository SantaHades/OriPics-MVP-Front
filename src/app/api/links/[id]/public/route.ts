// 공개 뷰어용 링크 조회 (2026-08-22 보안 조치).
//
// 기존에는 뷰어 페이지가 브라우저에서 공개 anon 키로 PostgREST를 직접 호출했다.
// links의 anon SELECT 정책이 행 전체를 허용하므로 `?select=*` 한 번으로 **전 사용자의
// 인증 목록·GPS 좌표·user_id가 열거**됐다(실측). "링크를 아는 사람만 본다"는 전제가 깨진다.
//
// → 서버가 link_id 하나만 조회해 뷰어에 필요한 필드만 반환하고, links의 anon 권한은 회수한다.
//   user_id는 내려주지 않고 소유자 여부(is_owner)만 서버에서 판정한다.
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { createClient } from "@supabase/supabase-js";
import { authOptions } from "@/lib/authOptions";
import { verifyLinkId } from "@/lib/oripics-stamp/common";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

export async function GET(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const linkId = params.id;
  if (!verifyLinkId(linkId)) {
    return NextResponse.json({ detail: "not_found" }, { status: 404 });
  }
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return NextResponse.json({ detail: "server_misconfigured" }, { status: 500 });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const { data: row, error } = await supabase
    .from("links")
    .select(
      "link_id, timestamp, width, height, lat, lng, captured_at, storage_path, signed_url, preview_path, expires_at, user_id",
    )
    .eq("link_id", linkId)
    .single();

  if (error || !row) {
    return NextResponse.json({ detail: "not_found" }, { status: 404 });
  }
  // 만료 링크는 미존재와 동일 처리 (cleanup cron 실행 전 시간차 방어)
  if (row.expires_at && new Date(row.expires_at) <= new Date()) {
    return NextResponse.json({ detail: "not_found" }, { status: 404 });
  }

  const session = await getServerSession(authOptions);
  const sessionUserId = (session?.user as any)?.id ?? null;
  const { user_id, ...publicFields } = row;

  return NextResponse.json({
    link: { ...publicFields, is_owner: !!user_id && !!sessionUserId && user_id === sessionUserId },
  });
}
