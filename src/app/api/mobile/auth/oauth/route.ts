// 모바일 소셜 로그인 (M1) — 네이티브/AuthSession으로 얻은 provider 토큰을 서버에서 검증하고
// Bearer 토큰을 발급한다. authOptions의 signIn 콜백과 동일한 계정 연결 규칙을 따른다:
//  - Account(provider, providerAccountId) 기존 연결 → 해당 사용자
//  - 미연결인데 동일 이메일 사용자가 존재 → 409 OAuthAccountNotLinked_<기존 provider>
//  - 신규 → User+Account 생성 + 가입 보너스(grantSignupCredits)
// google은 id_token(aud 허용 목록 검증), kakao/naver는 access_token으로 프로필 조회.
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { issueMobileTokens } from "@/lib/auth/mobileTokens";
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
  let body: { provider?: string; id_token?: string; access_token?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ detail: "invalid_json" }, { status: 400 });
  }

  const provider = body.provider;
  let profile: ProviderProfile | null = null;
  if (provider === "google" && body.id_token) profile = await verifyGoogle(body.id_token);
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
  } else {
    // 2) 동일 이메일 기존 사용자 → 자동 연결하지 않음 (웹과 동일 정책)
    if (profile.email) {
      const existing = await prisma.user.findUnique({
        where: { email: profile.email },
        include: { accounts: true },
      });
      if (existing) {
        const usedProvider = existing.accounts[0]?.provider || "credentials";
        return NextResponse.json({ detail: `OAuthAccountNotLinked_${usedProvider}` }, { status: 409 });
      }
    }
    // 3) 신규 가입 (PrismaAdapter가 만드는 형태를 미러링)
    const created = await prisma.user.create({
      data: {
        email: profile.email,
        name: profile.name,
        image: profile.image,
        accounts: {
          create: {
            type: "oauth",
            provider,
            providerAccountId: profile.providerAccountId,
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
  return NextResponse.json({
    access_token: tokens.accessToken,
    refresh_token: tokens.refreshToken,
    access_expires_at: tokens.accessExpiresAt,
    user,
  });
}
