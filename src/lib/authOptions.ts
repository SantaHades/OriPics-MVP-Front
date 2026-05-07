import { NextAuthOptions } from "next-auth";
import { PrismaAdapter } from "@next-auth/prisma-adapter";
import { prisma } from "@/lib/prisma";
import CredentialsProvider from "next-auth/providers/credentials";
import GoogleProvider from "next-auth/providers/google";
import KakaoProvider from "next-auth/providers/kakao";
import NaverProvider from "next-auth/providers/naver";
import * as bcrypt from "bcryptjs";

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
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          throw new Error("MissingCredentials");
        }

        const user = await prisma.user.findUnique({
          where: { email: credentials.email },
        });

        if (!user || !user.password) {
          throw new Error("UserNotFound");
        }

        const isValid = await bcrypt.compare(credentials.password, user.password);

        if (!isValid) {
          throw new Error("InvalidPassword");
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
          throw new Error(`OAuthAccountNotLinked_${usedProvider}`);
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
        token.name = user.name;
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
  pages: {
    signIn: "/login",
    error: "/login",
  },
  secret: process.env.NEXTAUTH_SECRET,
};
