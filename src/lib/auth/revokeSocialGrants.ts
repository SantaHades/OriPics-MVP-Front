// 회원탈퇴 시 소셜 provider 연동(grant) 서버측 철회 (2026-08-28, 전부 best-effort).
// 배경: 탈퇴 후에도 provider 서버의 grant가 남으면 재로그인이 동의·계정 확인 화면 없이
// 자동 진행돼 즉시 재가입됨(모바일은 SDK 철회로 기해결 — 웹 탈퇴엔 서버 철회가 필요.
// grant는 provider 계정 단위라 여기서 지우면 웹·앱 어느 쪽 재로그인이든 동의가 다시 뜸).
// 토큰은 Account 행에 저장된 것을 사용 — 로그인 시마다 최신화됨(authOptions·mobile oauth).
import { appleClientSecret } from "@/lib/auth/appleClientSecret";

export interface SocialAccountTokens {
  provider: string;
  access_token: string | null;
  refresh_token: string | null;
  expires_at: number | null;
}

const FRESH_MARGIN_SEC = 60;

function isFresh(expiresAt: number | null): boolean {
  return typeof expiresAt === "number" && expiresAt * 1000 > Date.now() + FRESH_MARGIN_SEC * 1000;
}

async function freshNaverToken(a: SocialAccountTokens): Promise<string | null> {
  if (a.access_token && isFresh(a.expires_at)) return a.access_token;
  if (!a.refresh_token) return a.access_token; // 만료됐어도 delete 시도는 해봄
  const params = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: process.env.NAVER_CLIENT_ID || "",
    client_secret: process.env.NAVER_CLIENT_SECRET || "",
    refresh_token: a.refresh_token,
  });
  const res = await fetch(`https://nid.naver.com/oauth2.0/token?${params.toString()}`);
  if (!res.ok) return a.access_token;
  const data = await res.json();
  return data.access_token ?? a.access_token;
}

async function revokeNaver(a: SocialAccountTokens): Promise<void> {
  const token = await freshNaverToken(a);
  if (!token) return;
  // 토큰 삭제 = 네이버 로그인 연동 해제 (사용자의 '연결된 서비스' 목록에서도 제거)
  const params = new URLSearchParams({
    grant_type: "delete",
    client_id: process.env.NAVER_CLIENT_ID || "",
    client_secret: process.env.NAVER_CLIENT_SECRET || "",
    access_token: token,
    service_provider: "NAVER",
  });
  await fetch(`https://nid.naver.com/oauth2.0/token?${params.toString()}`);
}

async function revokeKakao(a: SocialAccountTokens): Promise<void> {
  const unlink = (token: string) =>
    fetch("https://kapi.kakao.com/v1/user/unlink", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
  if (a.access_token) {
    const res = await unlink(a.access_token);
    if (res.ok) return;
  }
  if (!a.refresh_token) return;
  const res = await fetch("https://kauth.kakao.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: process.env.KAKAO_CLIENT_ID || "",
      client_secret: process.env.KAKAO_CLIENT_SECRET || "",
      refresh_token: a.refresh_token,
    }),
  });
  if (!res.ok) return;
  const data = await res.json();
  if (data.access_token) await unlink(data.access_token);
}

async function revokeGoogle(a: SocialAccountTokens): Promise<void> {
  // refresh_token revoke가 grant 전체를 철회. 없으면 access_token으로 시도.
  const token = a.refresh_token || a.access_token;
  if (!token) return;
  await fetch("https://oauth2.googleapis.com/revoke", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ token }),
  });
}

async function revokeApple(a: SocialAccountTokens): Promise<void> {
  const token = a.refresh_token || a.access_token;
  if (!token) return;
  await fetch("https://appleid.apple.com/auth/revoke", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.APPLE_CLIENT_ID || "",
      client_secret: appleClientSecret(),
      token,
      token_type_hint: a.refresh_token ? "refresh_token" : "access_token",
    }),
  });
}

export async function revokeSocialGrants(accounts: SocialAccountTokens[]): Promise<void> {
  await Promise.all(
    accounts.map(async (a) => {
      try {
        if (a.provider === "naver") await revokeNaver(a);
        else if (a.provider === "kakao") await revokeKakao(a);
        else if (a.provider === "google") await revokeGoogle(a);
        else if (a.provider === "apple") await revokeApple(a);
      } catch (e) {
        console.error(`[revokeSocialGrants] ${a.provider} 철회 실패 (무시):`, e);
      }
    }),
  );
}
