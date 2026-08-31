import { NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/auth/getSessionUserId";
import { getActivePass, maskPassCode } from "@/lib/pass/dayPass";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/pass/active — 현재 활성 원데이 패스 조회 (A-60).
 * 앱 홈탭 카드·웹 프로필 내 계정 정보 표시용.
 */
export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json({ detail: "unauthenticated" }, { status: 401 });
  }

  const pass = await getActivePass(userId);
  if (!pass) {
    return NextResponse.json({ active: false });
  }
  return NextResponse.json({
    active: true,
    pass: {
      code_masked: maskPassCode(pass.code),
      redeemed_at: pass.redeemedAt.toISOString(),
      expires_at: pass.expiresAt.toISOString(),
      total_proofs: pass.totalProofs,
      used_proofs: pass.usedProofs,
      remaining: pass.totalProofs - pass.usedProofs,
    },
  });
}
