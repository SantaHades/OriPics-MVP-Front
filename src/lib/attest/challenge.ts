// 모바일 attestation challenge — stateless HMAC nonce.
//
// 흐름:
//  1. 모바일 앱 → GET /api/attest/challenge → { nonce, exp }
//  2. 모바일 → App Attest / Play Integrity API로 nonce를 clientDataHash 등으로 사용 → token 발급
//  3. 모바일 → POST /api/sign { tier:'verified', nonce, attest_token, ... }
//  4. 서버 → nonce HMAC 서명 검증 + 만료 확인 + token 검증(D-pre-5)
//
// 왜 stateless인가:
//  - DB·Redis 없이 검증 가능 → Vercel Edge에서도 동작
//  - replay 공격: 만료(TTL 5분) + token에 nonce 포함되므로 token 자체가 일회용
//
// Format: `${exp_seconds}.${random_hex}.${hmac_b64url}`
//  - exp_seconds: 만료 unix timestamp
//  - random_hex: 32 hex chars (16 bytes random)
//  - hmac_b64url: HMAC-SHA256(secret, `${exp}.${random}`).b64url

import { createHmac, randomBytes, timingSafeEqual } from "crypto";

const TTL_SECONDS = 300; // 5분
const SECRET = process.env.ORIPICS_ATTEST_SECRET || process.env.ORIPICS_JWT_SECRET || "";

function sign(payload: string): string {
  return createHmac("sha256", SECRET).update(payload).digest("base64url");
}

export interface IssuedChallenge {
  nonce: string;
  exp: number; // unix seconds
}

export function issueChallenge(): IssuedChallenge {
  if (!SECRET) throw new Error("attest_secret_missing");
  const exp = Math.floor(Date.now() / 1000) + TTL_SECONDS;
  const random = randomBytes(16).toString("hex");
  const payload = `${exp}.${random}`;
  const sig = sign(payload);
  return { nonce: `${payload}.${sig}`, exp };
}

export type ChallengeVerifyResult =
  | { ok: true; exp: number }
  | { ok: false; reason: "malformed" | "invalid_signature" | "expired" };

export function verifyChallenge(nonce: string): ChallengeVerifyResult {
  if (!SECRET) return { ok: false, reason: "malformed" };
  const parts = nonce.split(".");
  if (parts.length !== 3) return { ok: false, reason: "malformed" };
  const [expStr, random, sig] = parts;
  const exp = parseInt(expStr, 10);
  if (!Number.isFinite(exp)) return { ok: false, reason: "malformed" };

  const expected = sign(`${expStr}.${random}`);
  // base64url is variable length per environment; pad before timingSafeEqual
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, reason: "invalid_signature" };
  }
  if (exp < Math.floor(Date.now() / 1000)) {
    return { ok: false, reason: "expired" };
  }
  return { ok: true, exp };
}
