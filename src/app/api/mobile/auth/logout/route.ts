// 모바일 로그아웃 (A-38②, 2026-08-24) — 제시된 refresh 토큰을 서버측에서 폐기.
// 기존에는 클라이언트 토큰 삭제뿐이라 유출된 refresh가 90일간 유효했음.
// 다른 기기 세션은 유지 (해당 jti만 폐기). 항상 200 — 로그아웃은 실패시키지 않는다.
import { NextRequest, NextResponse } from "next/server";
import { verifyMobileToken } from "@/lib/auth/mobileTokens";
import { revokeRefreshToken } from "@/lib/auth/refreshStore";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  let body: { refresh_token?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: true });
  }
  const payload = body.refresh_token ? verifyMobileToken(body.refresh_token, "refresh") : null;
  if (payload) {
    try {
      await revokeRefreshToken(payload.jti, payload.sub);
    } catch {
      // best-effort — 폐기 실패해도 클라이언트 토큰 삭제는 진행됨
    }
  }
  return NextResponse.json({ ok: true });
}
