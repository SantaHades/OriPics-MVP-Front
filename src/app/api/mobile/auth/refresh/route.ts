// 모바일 토큰 갱신 (M1) — refresh 토큰 검증 후 새 쌍 발급 (무상태 회전).
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { issueMobileTokens, verifyMobileToken } from "@/lib/auth/mobileTokens";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  let body: { refresh_token?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ detail: "invalid_json" }, { status: 400 });
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

  const tokens = issueMobileTokens(user.id);
  return NextResponse.json({
    access_token: tokens.accessToken,
    refresh_token: tokens.refreshToken,
    access_expires_at: tokens.accessExpiresAt,
  });
}
