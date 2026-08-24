// 모바일 토큰 갱신 (M1) — refresh 토큰 검증 후 새 쌍 발급.
// A-38② (2026-08-24): 무상태 회전 → 서버측 상태 회전으로 전환.
//  - jti가 DB에 있고 미폐기일 때만 회전 (구 jti는 폐기)
//  - 폐기된 jti 재사용 = 탈취 신호 → 사용자 전체 refresh 폐기
//  - A-38 이전 발급분(DB에 없음)은 거부 — 재로그인 1회 유도 (의도된 컷오버)
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { issueMobileTokens, verifyMobileToken } from "@/lib/auth/mobileTokens";
import { consumeRefreshToken, persistRefreshToken } from "@/lib/auth/refreshStore";
import { checkRateLimit, clientIp, RATE_LIMITS } from "@/lib/security/rateLimit";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  let body: { refresh_token?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ detail: "invalid_json" }, { status: 400 });
  }

  // 서명 검증 전 IP 레이트리밋 — 위조 토큰 대량 시도(오라클화) 억제
  const rl = await checkRateLimit(RATE_LIMITS.refresh, clientIp(req));
  if (!rl.allowed) {
    return NextResponse.json(
      { detail: "rate_limited", retryAfter: rl.retryAfterSec },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } },
    );
  }

  const payload = body.refresh_token ? verifyMobileToken(body.refresh_token, "refresh") : null;
  if (!payload) {
    return NextResponse.json({ detail: "invalid_refresh_token" }, { status: 401 });
  }

  // 탈퇴 계정 차단
  const user = await prisma.user.findUnique({ where: { id: payload.sub }, select: { id: true } });
  if (!user) {
    return NextResponse.json({ detail: "user_not_found" }, { status: 401 });
  }

  const result = await consumeRefreshToken(payload);
  if (result !== "ok") {
    // reused: 전 기기 세션 무효화됨 / unknown: 구버전 발급분·위조 — 모두 재로그인
    return NextResponse.json(
      { detail: result === "reused" ? "refresh_token_reused" : "invalid_refresh_token" },
      { status: 401 },
    );
  }

  const tokens = issueMobileTokens(user.id);
  await persistRefreshToken(user.id, tokens.refreshJti, tokens.refreshExpiresAt);
  return NextResponse.json({
    access_token: tokens.accessToken,
    refresh_token: tokens.refreshToken,
    access_expires_at: tokens.accessExpiresAt,
  });
}
