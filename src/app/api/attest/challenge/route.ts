import { NextResponse } from "next/server";
import { issueChallenge } from "@/lib/attest/challenge";

export const runtime = "nodejs";

/**
 * GET /api/attest/challenge
 *
 * 모바일 앱이 attest token 발급 전 호출. nonce는 stateless HMAC.
 * 응답: { nonce, exp }
 *
 * 인증 불필요 (베타). 어뷰즈 시 추후 rate-limit 추가.
 */
export async function GET() {
  try {
    const challenge = issueChallenge();
    return NextResponse.json(challenge);
  } catch (e: any) {
    return NextResponse.json(
      { detail: e?.message || "challenge_failed" },
      { status: 500 },
    );
  }
}
