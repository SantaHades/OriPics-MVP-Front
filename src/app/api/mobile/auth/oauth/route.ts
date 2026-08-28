// 모바일 소셜 로그인 (M1) — 네이티브/AuthSession으로 얻은 provider 토큰을 서버에서 검증하고
// Bearer 토큰을 발급한다. authOptions의 signIn 콜백과 동일한 계정 연결 규칙을 따른다:
//  - Account(provider, providerAccountId) 기존 연결 → 해당 사용자
//  - 미연결인데 동일 이메일 사용자가 존재 → 409 OAuthAccountNotLinked_<기존 provider>_<email>
//  - 신규 → User+Account 생성 + 가입 보너스(grantSignupCredits)
// google은 id_token(aud 허용 목록 검증), kakao/naver는 access_token으로 프로필 조회.
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { issueMobileTokens } from "@/lib/auth/mobileTokens";
import { persistRefreshToken } from "@/lib/auth/refreshStore";
import { grantSignupCredits } from "@/lib/credits/grantSignupCredits";

export const runtime = "nodejs";

interface ProviderProfile {
  providerAccountId: string;
  email: string | null;
  name: string | null;
  image: string | null;
}

async function verifyGoogle(idToken: string): Promise<ProviderProfile | null> {
  const res = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`);
  if (!res.ok) return null;
  const p = await res.json();
  const allowed = [
    process.env.GOOGLE_CLIENT_ID,
    ...(process.env.GOOGLE_MOBILE_CLIENT_IDS?.split(",").map((s) => s.trim()) ?? []),
  ].filter(Boolean);
  if (!p.aud || !allowed.includes(p.aud)) return null;
  if (!p.sub) return null;
  return { providerAccountId: String(p.sub), email: p.email ?? null, name: p.name ?? null, image: p.picture ?? null };
}

async function verifyKakao(accessToken: string): Promise<ProviderProfile | null> {
  const res = await fetch("https://kapi.kakao.com/v2/user/me", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return null;
  const p = await res.json();
  if (!p.id) return null;
  return {
    providerAccountId: String(p.id),
    email: p.kakao_account?.email ?? null,
    name: p.kakao_account?.profile?.nickname ?? null,
    image: p.kakao_account?.profile?.profile_image_url ?? null,
  };
}

// Apple (2026-08-26, A-50) — 네이티브 앱의 identityToken(JWT)을 Apple 공개키(JWKS)로 검증.
// aud=앱 번들 ID (웹 Services ID와 다름 — 네이티브 토큰은 번들 ID로 발급됨).
// 이메일 가리기(Private Relay) 시 relay 주소가 옴 — 동일 이메일 매칭 실패 가능(웹과 동일 한계).
const APPLE_ISS = "https://appleid.apple.com";
const APPLE_NATIVE_AUD = "com.santahades.oripics";

function b64urlToBuf(s: string): Buffer {
  return Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

async function verifyApple(idToken: string): Promise<ProviderProfile | null> {
  try {
    const parts = idToken.split(".");
    if (parts.length !== 3) return null;
    const header = JSON.parse(b64urlToBuf(parts[0]).toString("utf8"));
    if (header.alg !== "RS256" || !header.kid) return null;

    const jwksRes = await fetch(`${APPLE_ISS}/auth/keys`);
    if (!jwksRes.ok) return null;
    const jwks = await jwksRes.json();
    const jwk = (jwks.keys as any[]).find((k) => k.kid === header.kid);
    if (!jwk) return null;

    const { createPublicKey, verify } = await import("crypto");
    const key = createPublicKey({ key: jwk, format: "jwk" });
    const ok = verify(
      "sha256",
      Buffer.from(`${parts[0]}.${parts[1]}`, "utf8"),
      key,
      b64urlToBuf(parts[2]),
    );
    if (!ok) return null;

    const claims = JSON.parse(b64urlToBuf(parts[1]).toString("utf8"));
    if (claims.iss !== APPLE_ISS) return null;
    if (claims.aud !== APPLE_NATIVE_AUD) return null;
    if (typeof claims.exp !== "number" || claims.exp <= Math.floor(Date.now() / 1000)) return null;
    if (!claims.sub) return null;
    return {
      providerAccountId: String(claims.sub),
      email: typeof claims.email === "string" ? claims.email : null,
      name: null, // Apple은 id_token에 이름을 담지 않음 (최초 승인 시 클라이언트에만 전달)
      image: null,
    };
  } catch (e) {
    console.error("[mobile/auth/oauth] apple verify failed:", e);
    return null;
  }
}

async function verifyNaver(accessToken: string): Promise<ProviderProfile | null> {
  const res = await fetch("https://openapi.naver.com/v1/nid/me", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return null;
  const p = await res.json();
  const r = p.response;
  if (!r?.id) return null;
  return {
    providerAccountId: String(r.id),
    email: r.email ?? null,
    name: r.name ?? r.nickname ?? null,
    image: r.profile_image ?? null,
  };
}

export async function POST(req: NextRequest) {
  let body: { provider?: string; id_token?: string; access_token?: string; refresh_token?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ detail: "invalid_json" }, { status: 400 });
  }

  const provider = body.provider;
  let profile: ProviderProfile | null = null;
  if (provider === "google" && body.id_token) profile = await verifyGoogle(body.id_token);
  else if (provider === "apple" && body.id_token) profile = await verifyApple(body.id_token);
  else if (provider === "kakao" && body.access_token) profile = await verifyKakao(body.access_token);
  else if (provider === "naver" && body.access_token) profile = await verifyNaver(body.access_token);
  else return NextResponse.json({ detail: "unsupported_provider_or_missing_token" }, { status: 400 });

  if (!profile) {
    return NextResponse.json({ detail: "provider_token_invalid" }, { status: 401 });
  }

  // 1) 기존 연결 계정
  const account = await prisma.account.findUnique({
    where: { provider_providerAccountId: { provider, providerAccountId: profile.providerAccountId } },
    include: { user: true },
  });

  let userId: string;
  if (account?.user) {
    userId = account.user.id;
    // 웹 signIn 콜백과 동일하게 이름/이미지 최신화
    await prisma.user.update({
      where: { id: userId },
      data: {
        name: profile.name || account.user.name,
        image: profile.image || account.user.image,
      },
    });
    // 탈퇴 시 연동(grant) 서버측 철회용 토큰 최신화 (2026-08-28) — kakao/naver만 해당
    if (body.access_token || body.refresh_token) {
      await prisma.account.update({
        where: { provider_providerAccountId: { provider, providerAccountId: profile.providerAccountId } },
        data: {
          access_token: body.access_token ?? undefined,
          refresh_token: body.refresh_token ?? undefined,
        },
      });
    }
  } else {
    // 2) 동일 이메일 기존 사용자 → 자동 연결하지 않음 (웹과 동일 정책)
    if (profile.email) {
      const existing = await prisma.user.findUnique({
        where: { email: profile.email },
        include: { accounts: true },
      });
      if (existing) {
        const usedProvider = existing.accounts[0]?.provider || "credentials";
        // 이메일 포함(웹 signIn 콜백과 동일 형식) — 앱이 provider별 안내 메시지 표시.
        // 구버전 앱은 startsWith 매칭이라 일반 메시지로 하위호환.
        return NextResponse.json(
          { detail: `OAuthAccountNotLinked_${usedProvider}_${profile.email}` },
          { status: 409 },
        );
      }
    }
    // 3) 신규 가입 (PrismaAdapter가 만드는 형태를 미러링).
    // Apple은 이름 미제공 — null이면 이메일 앞부분을 기본 이름으로 (UI "님" 공백 방지, 2026-08-26)
    const created = await prisma.user.create({
      data: {
        email: profile.email,
        name: profile.name ?? (profile.email ? profile.email.split("@")[0] : null),
        image: profile.image,
        accounts: {
          create: {
            type: "oauth",
            provider,
            providerAccountId: profile.providerAccountId,
            // 웹 탈퇴 시 연동 철회용 (2026-08-28) — kakao/naver는 SDK 토큰을 저장
            access_token: body.access_token ?? null,
            refresh_token: body.refresh_token ?? null,
          },
        },
      },
      select: { id: true },
    });
    userId = created.id;
    try {
      await grantSignupCredits(userId);
    } catch (e) {
      console.error("[mobile/auth/oauth] grantSignupCredits failed:", e);
    }
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, email: true, image: true, tier: true, credits: true },
  });
  const tokens = issueMobileTokens(userId);
  await persistRefreshToken(userId, tokens.refreshJti, tokens.refreshExpiresAt); // A-38② 서버측 폐기 목록
  return NextResponse.json({
    access_token: tokens.accessToken,
    refresh_token: tokens.refreshToken,
    access_expires_at: tokens.accessExpiresAt,
    user,
  });
}
