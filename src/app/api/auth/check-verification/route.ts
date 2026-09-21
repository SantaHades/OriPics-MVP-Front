import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkRateLimit, clientIp, tooManyRequests, RATE_LIMITS } from "@/lib/security/rateLimit";

export const runtime = "nodejs";

/**
 * POST /api/auth/check-verification — 가입 전 인증 코드 사전 확인 (2026-09-21 대표 요청).
 *
 * 가입 폼에서 6자리를 다 입력한 시점에 "인증됨"을 바로 보여주기 위한 조회 전용 엔드포인트.
 * register와 달리 **토큰을 소비(삭제)하지 않는다** — 실제 가입은 여전히 register가 검증한다.
 *
 * 보안: 6자리 = 100만 조합이라 그대로 두면 코드 추측 오라클이 된다.
 * IP+이메일 기준으로 10분 10회로 제한한다.
 */
export async function POST(req: NextRequest) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ code: "invalid_json" }, { status: 400 });
  }

  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const code = typeof body?.code === "string" ? body.code.trim() : "";
  if (!email || !/^\d{6}$/.test(code)) {
    return NextResponse.json({ code: "invalid_code" }, { status: 400 });
  }

  const rl = await checkRateLimit(RATE_LIMITS.checkVerification, `${clientIp(req)}:${email}`);
  if (!rl.allowed) {
    return tooManyRequests(rl, "확인 시도가 너무 잦습니다. 잠시 후 다시 시도해 주세요.");
  }

  const token = await prisma.verificationToken.findFirst({
    where: { identifier: email, token: code },
  });
  if (!token) {
    return NextResponse.json({ code: "invalid_code" }, { status: 400 });
  }
  if (token.expires < new Date()) {
    return NextResponse.json({ code: "expired_code" }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
