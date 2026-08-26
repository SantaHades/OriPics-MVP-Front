// Apple 로그인 client_secret 생성 (2026-08-26, A-50 선행 웹 트랙).
// Apple은 고정 secret 대신 팀 키(.p8, ES256)로 서명한 단기 JWT를 client_secret으로 요구한다.
// 부팅(콜드 스타트) 시 1회 생성해 캐시 — exp 180일이라 서버리스 인스턴스 수명 내 만료 없음.
// env: APPLE_TEAM_ID, APPLE_KEY_ID, APPLE_CLIENT_ID(Services ID), APPLE_PRIVATE_KEY(p8 PEM, \n 이스케이프 허용)
import { createPrivateKey, sign } from "crypto";

const SIX_MONTHS_S = 60 * 60 * 24 * 180; // Apple 최대 15777000초(~6개월) 이내

function b64url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

let cached: string | null = null;

/** env 미설정이면 빈 문자열 (provider는 등록되지만 사용 불가 — 다른 provider와 동일 패턴) */
export function appleClientSecret(): string {
  if (cached) return cached;
  const teamId = process.env.APPLE_TEAM_ID;
  const keyId = process.env.APPLE_KEY_ID;
  const clientId = process.env.APPLE_CLIENT_ID;
  const pem = process.env.APPLE_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (!teamId || !keyId || !clientId || !pem) return "";

  try {
    const now = Math.floor(Date.now() / 1000);
    const header = b64url(Buffer.from(JSON.stringify({ alg: "ES256", kid: keyId }), "utf8"));
    const payload = b64url(
      Buffer.from(
        JSON.stringify({
          iss: teamId,
          iat: now,
          exp: now + SIX_MONTHS_S,
          aud: "https://appleid.apple.com",
          sub: clientId,
        }),
        "utf8",
      ),
    );
    // JWT ES256 서명은 DER이 아닌 raw R||S (ieee-p1363)
    const sig = sign("sha256", Buffer.from(`${header}.${payload}`, "utf8"), {
      key: createPrivateKey(pem),
      dsaEncoding: "ieee-p1363",
    });
    cached = `${header}.${payload}.${b64url(sig)}`;
    return cached;
  } catch (e) {
    console.error("[appleClientSecret] 생성 실패:", e);
    return "";
  }
}
