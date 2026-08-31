import { NextRequest, NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/auth/getSessionUserId";
import { checkRateLimit, tooManyRequests, RATE_LIMITS } from "@/lib/security/rateLimit";
import { normalizePassCode, maskPassCode, redeemPass } from "@/lib/pass/dayPass";

export const runtime = "nodejs";

/**
 * POST /api/pass/redeem — 원데이 패스 코드 등록 (A-60).
 *
 * 입력: JSON { code }
 * 정책: 로그인만 하면 티어 무관 등록 가능. 계정당 활성 패스 1장(DB 강제).
 *       등록 시점부터 24시간 · 촬영 인증 10회.
 * 오류: 404 invalid_code · 409 code_already_used/pass_already_active ·
 *       410 code_expired/code_revoked · 429 rate_limited
 */
export async function POST(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json({ detail: "unauthenticated" }, { status: 401 });
  }

  // 코드 무차별 대입 방어 — 사용자별 시간당 10회
  const rl = await checkRateLimit(RATE_LIMITS.passRedeem, userId);
  if (!rl.allowed) {
    return tooManyRequests(rl, "등록 시도가 너무 많습니다. 잠시 후 다시 시도해 주세요.");
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ detail: "invalid_json" }, { status: 400 });
  }
  const code = typeof body?.code === "string" ? normalizePassCode(body.code) : "";
  if (!code) {
    return NextResponse.json({ detail: "invalid_code_format" }, { status: 400 });
  }

  const result = await redeemPass(code, userId);
  if (!result.ok) {
    const status =
      result.reason === "invalid_code" ? 404 :
      result.reason === "code_expired" || result.reason === "code_revoked" ? 410 : 409;
    return NextResponse.json({ detail: result.reason }, { status });
  }

  console.log(`[pass] redeemed pass_id=${result.pass.id} user=${userId}`);
  return NextResponse.json({
    pass: {
      code_masked: maskPassCode(result.pass.code),
      redeemed_at: result.pass.redeemedAt.toISOString(),
      expires_at: result.pass.expiresAt.toISOString(),
      total_proofs: result.pass.totalProofs,
      used_proofs: result.pass.usedProofs,
      remaining: result.pass.totalProofs - result.pass.usedProofs,
    },
  });
}
