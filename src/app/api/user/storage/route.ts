import { NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/auth/getSessionUserId";
import { storageUsage } from "@/lib/storage/usage";

export const runtime = "nodejs";

/**
 * GET /api/user/storage — 보관함 사용량 (온디맨드 조회, 2026-08-31 대표 결정: 버튼 클릭 시에만)
 *
 * 합산 쿼리·한도 표는 src/lib/storage/usage.ts 로 분리 — 사서함 백업 쿼터 검사와 공유 (2026-09-11 A-87)
 */
export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json({ detail: "unauthenticated" }, { status: 401 });
  }

  try {
    const { bytes, files, limitBytes } = await storageUsage(userId);
    return NextResponse.json({ bytes, files, limit_bytes: limitBytes });
  } catch (e: any) {
    console.error("[user/storage] failed:", e?.message || e);
    return NextResponse.json({ detail: "storage_query_failed" }, { status: 500 });
  }
}
