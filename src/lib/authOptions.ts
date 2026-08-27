import { NextAuthOptions } from "next-auth";
import { PrismaAdapter } from "@next-auth/prisma-adapter";
import { prisma } from "@/lib/prisma";
import CredentialsProvider from "next-auth/providers/credentials";
import GoogleProvider from "next-auth/providers/google";
import KakaoProvider from "next-auth/providers/kakao";
import NaverProvider from "next-auth/providers/naver";
import AppleProvider from "next-auth/providers/apple";
import * as bcrypt from "bcryptjs";
import { appleClientSecret } from "@/lib/auth/appleClientSecret";
import { grantSignupCredits } from "@/lib/credits/grantSignupCredits";
import { checkRateLimit, RATE_LIMITS } from "@/lib/security/rateLimit";

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID || "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
    }),
    KakaoProvider({
      clientId: process.env.KAKAO_CLIENT_ID || "",
      clientSecret: process.env.KAKAO_CLIENT_SECRET || "",
      profile(profile) {
        return {
          id: profile.id.toString(),
          name: profile.kakao_account?.profile?.nickname,
          email: profile.kakao_account?.email,
          image: profile.kakao_account?.profile?.profile_image_url,
        };
      },
    }),
    // Apple (2026-08-26) — clientSecret은 팀 키로 서명한 JWT(appleClientSecret).
    // 이메일 가리기(Private Relay) 선택 시 relay 이메일이 와서 기존 소셜 계정과
    // 이메일 매칭이 안 될 수 있음 — 그 경우 신규 계정으로 생성됨(알려진 한계).
    AppleProvider({
      clientId: process.env.APPLE_CLIENT_ID || "",
      clientSecret: appleClientSecret(),
      // scope에서 name 제외 (2026-08-27 실측): grant 재사용(재로그인) 화면에서 name이 있으면
      // Apple이 오류 배너("오류로 인해 요청을 완료할 수 없습니다")를 띄우고 오류를 콜백으로
      // auto-POST해 재로그인이 실패한다. scope=email·무scope는 정상. name은 어차피 최초 인증의
      // user POST 필드로만 오고 NextAuth v4는 미파싱 — 기본 이름은 createUser 이벤트가 백필.
      // form_post는 scope 존재 시 Apple 필수라 유지.
      authorization: { params: { scope: "email", response_mode: "form_post" } },
      // NextAuth 기본 pkce는 Apple 미문서 파라미터(code_challenge) — state로 교체(Apple 공식 지원.
      // state 쿠키는 form_post cross-site POST 대응 SameSite=None — 아래 cookies)
      checks: ["state"],
    }),
    NaverProvider({
      clientId: process.env.NAVER_CLIENT_ID || "",
      clientSecret: process.env.NAVER_CLIENT_SECRET || "",
      profile(profile) {
        console.log("=== NAVER PROFILE DATA ===", JSON.stringify(profile, null, 2));
        return {
          id: profile.response.id,
          name: profile.response.name || profile.response.nickname,
          email: profile.response.email,
          image: profile.response.profile_image,
        };
      },
    }),
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials, req) {
        if (!credentials?.email || !credentials?.password) {
          throw new Error("MissingCredentials");
        }

        // 레이트리밋 (2026-08-22 보안 점검) — IP+이메일 조합. 초과 시 UI는
        // 일반 로그인 실패로 표시되지만 시도 자체가 차단된다.
        const xff = (req?.headers?.["x-forwarded-for"] as string | undefined) ?? "";
        const ip = xff.split(",")[0].trim() || "unknown";
        const rl = await checkRateLimit(
          RATE_LIMITS.login,
          `${ip}|${credentials.email.toLowerCase()}`,
        );
        if (!rl.allowed) {
          throw new Error("RateLimited");
        }

        const user = await prisma.user.findUnique({
          where: { email: credentials.email },
        });

        // M-5: 계정 열거 방지 — "미가입"과 "비밀번호 불일치"를 구분하지 않고
        // 동일한 CredentialsSignin 오류로 통일한다(로그인 페이지 번역 재사용).
        if (!user || !user.password) {
          throw new Error("CredentialsSignin");
        }

        const isValid = await bcrypt.compare(credentials.password, user.password);

        if (!isValid) {
          throw new Error("CredentialsSignin");
        }

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          image: user.image,
        };
      },
    }),
  ],
  session: {
    strategy: "jwt",
  },
  // Apple은 콜백을 cross-site POST(form_post)로 보내므로 검증 쿠키가 SameSite=Lax면
  // 전송되지 않아 실패 — None으로 완화 (짧은 수명·httpOnly 유지. state=apple, pkce=미사용 잔존 대비)
  cookies: {
    state: {
      name: "next-auth.state",
      options: { httpOnly: true, sameSite: "none", path: "/", secure: true },
    },
    pkceCodeVerifier: {
      name: "next-auth.pkce.code_verifier",
      options: { httpOnly: true, sameSite: "none", path: "/", secure: true },
    },
  },
  callbacks: {
    async signIn({ user, account, profile }) {
      if (account?.provider === "credentials") return true;

      // 소셜 로그인 시 이메일 중복 체크 (이메일이 있는 경우에만)
      let existingUserByEmail = null;
      if (user.email) {
        existingUserByEmail = await prisma.user.findUnique({
          where: { email: user.email as string },
          include: { accounts: true },
        });

        if (existingUserByEmail && !existingUserByEmail.accounts.some(acc => acc.provider === account?.provider)) {
          const usedProvider = existingUserByEmail.accounts[0]?.provider || "credentials";
          // 이메일을 함께 전달 — 로그인 페이지가 "어떤 이메일이 어디에 가입돼 있는지" 표시
          // (형식: OAuthAccountNotLinked_<provider>_<email>. provider명엔 _가 없어 파싱 안전)
          throw new Error(`OAuthAccountNotLinked_${usedProvider}_${user.email}`);
        }
      }

      // 닉네임 강제 업데이트 (이메일 유무와 상관없이 ID로 조회)
      const accountRecord = await prisma.account.findUnique({
        where: {
          provider_providerAccountId: {
            provider: account?.provider as string,
            providerAccountId: account?.providerAccountId as string,
          },
        },
        include: { user: true },
      });

      if (accountRecord?.user) {
        console.log("=== FINAL ATTEMPT: UPDATE USER ===", { 
          id: accountRecord.user.id, 
          newName: user.name, 
          newImage: user.image,
          provider: account?.provider 
        });
        await prisma.user.update({
          where: { id: accountRecord.user.id },
          data: {
            name: user.name || accountRecord.user.name,
            image: user.image || accountRecord.user.image,
          },
        });
      }

      return true;
    },
    async jwt({ token, user, trigger, session }) {
      if (user) {
        token.id = user.id;
        // 이름 미제공 provider(Apple 등): createUser의 이메일 앞부분 백필은 DB에만 반영되고
        // 최초 세션 토큰엔 늦음 → 동일 규칙으로 토큰에도 즉시 폴백 (2026-08-27, "님"만 표시 증상)
        token.name = user.name || (user.email ? user.email.split("@")[0] : null);
        token.email = user.email;
        token.picture = user.image;
      }
      
      // 세션을 수동으로 업데이트할 때(update() 호출 시)
      if (trigger === "update" && session) {
        token.name = session.name;
        token.picture = session.image;
      }

      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as any).id = token.id;
        session.user.name = token.name;
        session.user.email = token.email;
        session.user.image = token.picture as string;
      }
      return session;
    },
  },
  events: {
    // OAuth 가입(PrismaAdapter가 User 레코드 생성) 직후 Free 가입 보너스 부여 (J-2).
    // 이메일 가입은 /api/register 라우트에서 직접 호출.
    async createUser({ user }) {
      if (!user.id) return;
      try {
        await grantSignupCredits(user.id);
      } catch (e) {
        console.error("[authOptions] grantSignupCredits failed:", e);
      }
      // Apple 등 이름 미제공 provider — 이메일 앞부분을 기본 이름으로 (UI "님" 공백 방지, 2026-08-26)
      if (!user.name && user.email) {
        try {
          await prisma.user.update({
            where: { id: user.id },
            data: { name: user.email.split("@")[0] },
          });
        } catch (e) {
          console.error("[authOptions] default name backfill failed:", e);
        }
      }
    },
  },
  pages: {
    signIn: "/login",
    error: "/login",
  },
  secret: process.env.NEXTAUTH_SECRET,
};
