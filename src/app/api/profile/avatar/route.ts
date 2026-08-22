// 아바타 업로드 (2026-08-22 보안 수정) — 기존에는 브라우저가 공개 anon 키로 Storage에
// 직접 업로드했다. avatars 버킷의 "Public Access" 정책이 ALL을 익명 허용해, 누구나 임의
// 파일 업로드·타인 아바타 삭제가 가능했다(실측). 서버 경유(서비스 키)로 전환하고,
// 파일명은 세션 userId로 강제해 타인 파일 덮어쓰기를 차단한다.
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { createClient } from "@supabase/supabase-js";
import { authOptions } from "@/lib/authOptions";

export const runtime = "nodejs";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const BUCKET = "avatars";
const MAX_BYTES = 2 * 1024 * 1024;
const ALLOWED: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as any)?.id;
  if (!userId) {
    return NextResponse.json({ detail: "unauthenticated" }, { status: 401 });
  }
  if (!SUPABASE_SERVICE_KEY || !SUPABASE_URL) {
    return NextResponse.json({ detail: "storage_not_configured" }, { status: 503 });
  }

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ detail: "file_required" }, { status: 400 });
  }
  const ext = ALLOWED[file.type];
  if (!ext) {
    return NextResponse.json({ detail: "unsupported_type" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ detail: "size_limit" }, { status: 413 });
  }

  // 경로를 userId로 고정 — 타인 파일 덮어쓰기 불가 (기존 랜덤 파일명은 잔재 누적도 유발)
  const path = `${userId}.${ext}`;
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, Buffer.from(await file.arrayBuffer()), {
      contentType: file.type,
      cacheControl: "3600",
      upsert: true,
    });
  if (error) {
    console.error("[avatar] upload failed", { userId, error: error.message });
    return NextResponse.json({ detail: "upload_failed" }, { status: 502 });
  }

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  // 캐시 무효화용 쿼리 — 같은 경로에 덮어쓰므로 URL이 동일해 브라우저가 옛 이미지를 보일 수 있음
  return NextResponse.json({ url: `${data.publicUrl}?v=${Date.now()}` });
}
