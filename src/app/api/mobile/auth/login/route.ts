// 모바일 이메일 로그인 (M1) — NextAuth Credentials와 동일 검증, Bearer 토큰 발급.
import { NextRequest, NextResponse } from "next/server";
import * as bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { issueMobileTokens } from "@/lib/auth/mobileTokens";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  let body: { email?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ detail: "invalid_json" }, { status: 400 });
  }
  const email = typeof body.email === "string" ? body.email.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (!email || !password) {
    return NextResponse.json({ detail: "missing_credentials" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { email } });
  // 사용자 존재 여부를 노출하지 않기 위해 실패 사유를 구분하지 않는다.
  if (!user?.password || !(await bcrypt.compare(password, user.password))) {
    return NextResponse.json({ detail: "invalid_credentials" }, { status: 401 });
  }

  const tokens = issueMobileTokens(user.id);
  return NextResponse.json({
    access_token: tokens.accessToken,
    refresh_token: tokens.refreshToken,
    access_expires_at: tokens.accessExpiresAt,
    user: { id: user.id, name: user.name, email: user.email, image: user.image, tier: user.tier, credits: user.credits },
  });
}
