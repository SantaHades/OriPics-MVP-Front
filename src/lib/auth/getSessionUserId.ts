// 세션 사용자 식별 통합 헬퍼 (M1, 2026-08-07).
// 우선순위: Authorization Bearer(모바일 access 토큰) → NextAuth 쿠키 세션(웹).
// Bearer 헤더가 제시됐는데 무효인 경우 쿠키로 폴백하지 않는다 — 만료를 명확한 401로 돌려
// 모바일 클라이언트의 refresh 흐름을 트리거하기 위함.
import { headers } from "next/headers";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { verifyMobileToken } from "./mobileTokens";

export async function getSessionUserId(): Promise<string | null> {
  const auth = headers().get("authorization");
  if (auth && auth.toLowerCase().startsWith("bearer ")) {
    const payload = verifyMobileToken(auth.slice(7).trim(), "access");
    return payload?.sub ?? null;
  }
  const session = await getServerSession(authOptions);
  return ((session?.user as { id?: string } | undefined)?.id) ?? null;
}
