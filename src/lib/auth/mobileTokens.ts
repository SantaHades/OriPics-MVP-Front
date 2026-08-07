// 모바일 앱 전용 Bearer 토큰 (M1, 2026-08-07).
// NextAuth 쿠키 세션과 별개로, 모바일은 자체 서명 JWT(HS256, NEXTAUTH_SECRET)를 사용한다.
// access 7일 / refresh 90일, refresh는 무상태 회전(rotation) — 서버측 폐기 목록 없음(MVP 트레이드오프,
// 유출 대응은 NEXTAUTH_SECRET 로테이션. 개별 폐기가 필요해지면 jti 블랙리스트 테이블 추가).
import { createHmac, timingSafeEqual, randomUUID } from "crypto";

export const MOBILE_TOKEN_AUD = "oripics-mobile";
const ACCESS_TTL_S = 60 * 60 * 24 * 7;
const REFRESH_TTL_S = 60 * 60 * 24 * 90;

export type MobileTokenType = "access" | "refresh";

export interface MobileTokenPayload {
  sub: string;
  typ: MobileTokenType;
  aud: typeof MOBILE_TOKEN_AUD;
  iat: number;
  exp: number;
  jti: string;
}

function secret(): Buffer {
  const s = process.env.NEXTAUTH_SECRET;
  if (!s) throw new Error("NEXTAUTH_SECRET is not set");
  return Buffer.from(s, "utf8");
}

function b64url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlJson(obj: unknown): string {
  return b64url(Buffer.from(JSON.stringify(obj), "utf8"));
}

function hmac(data: string): Buffer {
  return createHmac("sha256", secret()).update(data).digest();
}

function signToken(payload: MobileTokenPayload): string {
  const head = b64urlJson({ alg: "HS256", typ: "JWT" });
  const body = b64urlJson(payload);
  const sig = b64url(hmac(`${head}.${body}`));
  return `${head}.${body}.${sig}`;
}

export function issueMobileTokens(userId: string): {
  accessToken: string;
  refreshToken: string;
  accessExpiresAt: number; // epoch seconds
} {
  const now = Math.floor(Date.now() / 1000);
  const base = { sub: userId, aud: MOBILE_TOKEN_AUD, iat: now } as const;
  const accessExp = now + ACCESS_TTL_S;
  return {
    accessToken: signToken({ ...base, typ: "access", exp: accessExp, jti: randomUUID() }),
    refreshToken: signToken({ ...base, typ: "refresh", exp: now + REFRESH_TTL_S, jti: randomUUID() }),
    accessExpiresAt: accessExp,
  };
}

export function verifyMobileToken(token: string, expectedTyp: MobileTokenType): MobileTokenPayload | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [head, body, sig] = parts;

  const expected = b64url(hmac(`${head}.${body}`));
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  let payload: MobileTokenPayload;
  try {
    payload = JSON.parse(Buffer.from(body.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"));
  } catch {
    return null;
  }

  if (payload.aud !== MOBILE_TOKEN_AUD) return null;
  if (payload.typ !== expectedTyp) return null;
  if (typeof payload.sub !== "string" || !payload.sub) return null;
  if (typeof payload.exp !== "number" || payload.exp <= Math.floor(Date.now() / 1000)) return null;
  return payload;
}
