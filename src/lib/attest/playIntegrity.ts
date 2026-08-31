// Android Play Integrity 검증 (A-5 본 구현, 2026-08-07).
// 서버 → Google decodeIntegrityToken API 호출(서비스 계정 OAuth2 JWT-bearer, googleapis SDK 없이 직접).
// 판정은 순수 함수 evaluatePlayIntegrityVerdict로 분리 — 유닛테스트 대상.
//
// 필요 설정:
//  - GOOGLE_PLAY_INTEGRITY_SERVICE_ACCOUNT_JSON: GCP 서비스 계정 키 JSON 전체
//    (Play Console → 설정 → Google Cloud 프로젝트 연결 후, playintegrity 권한 부여)
//  - ANDROID_PACKAGE_NAME: 예) com.santahades.oripics
import { createHash, createSign } from "crypto";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SCOPE = "https://www.googleapis.com/auth/playintegrity";
const VERDICT_MAX_AGE_MS = 10 * 60 * 1000;

export interface PlayIntegrityConfig {
  serviceAccountJson: string;
  packageName: string;
  /** 사이드로드/미인식 앱 허용 (dev build 테스트용 — 운영에서는 false) */
  allowUnrecognizedApp: boolean;
  /** A-49①: MEETS_STRONG_INTEGRITY 요구 상향 (env 플래그, 기본 false — 구형 기기 탈락 트레이드오프) */
  requireStrong?: boolean;
}

export interface PlayVerdictPayload {
  requestDetails?: {
    /** classic 요청의 nonce 또는 standard 요청의 requestHash — 클라이언트가 전달한 challenge */
    nonce?: string;
    requestHash?: string;
    requestPackageName?: string;
    timestampMillis?: string | number;
  };
  appIntegrity?: { appRecognitionVerdict?: string; packageName?: string };
  deviceIntegrity?: { deviceRecognitionVerdict?: string[] };
}

export type PlayEvalResult =
  | { ok: true; deviceIntegrity: "MEETS_DEVICE_INTEGRITY" | "MEETS_BASIC_INTEGRITY" | "MEETS_STRONG_INTEGRITY" }
  | { ok: false; reason: string };

/** verdict payload 판정 (순수 함수 — now 주입 가능) */
export function evaluatePlayIntegrityVerdict(
  payload: PlayVerdictPayload,
  expected: { nonce: string; packageName: string; allowUnrecognizedApp: boolean; requireStrong?: boolean },
  now: number = Date.now(),
): PlayEvalResult {
  const req = payload.requestDetails;
  if (!req) return { ok: false, reason: "request_details_missing" };

  // challenge 바인딩: standard 요청은 requestHash, classic 요청은 nonce 필드로 돌아온다.
  // base64/base64url 재인코딩 표현까지 수용.
  const returned = req.requestHash ?? req.nonce ?? "";
  const candidates = [
    expected.nonce,
    Buffer.from(expected.nonce, "utf8").toString("base64"),
    Buffer.from(expected.nonce, "utf8").toString("base64url"),
  ];
  if (!candidates.includes(returned)) return { ok: false, reason: "nonce_mismatch" };

  if (req.requestPackageName && req.requestPackageName !== expected.packageName) {
    return { ok: false, reason: "package_name_mismatch" };
  }
  const ts = Number(req.timestampMillis ?? 0);
  if (!Number.isFinite(ts) || ts <= 0 || now - ts > VERDICT_MAX_AGE_MS || ts - now > 60_000) {
    return { ok: false, reason: "verdict_stale" };
  }

  const appVerdict = payload.appIntegrity?.appRecognitionVerdict;
  if (appVerdict !== "PLAY_RECOGNIZED" && !expected.allowUnrecognizedApp) {
    return { ok: false, reason: `app_not_recognized:${appVerdict ?? "missing"}` };
  }
  if (payload.appIntegrity?.packageName && payload.appIntegrity.packageName !== expected.packageName) {
    return { ok: false, reason: "app_package_mismatch" };
  }

  const verdicts = payload.deviceIntegrity?.deviceRecognitionVerdict ?? [];
  if (verdicts.includes("MEETS_STRONG_INTEGRITY")) return { ok: true, deviceIntegrity: "MEETS_STRONG_INTEGRITY" };
  if (expected.requireStrong) {
    return { ok: false, reason: `strong_integrity_required:${verdicts.join(",") || "none"}` };
  }
  if (verdicts.includes("MEETS_DEVICE_INTEGRITY")) return { ok: true, deviceIntegrity: "MEETS_DEVICE_INTEGRITY" };
  return { ok: false, reason: `device_integrity_failed:${verdicts.join(",") || "none"}` };
}

function b64urlJson(obj: unknown): string {
  return Buffer.from(JSON.stringify(obj)).toString("base64url");
}

// Google API 호출 타임아웃 — verified sign이 Google 장애/지연에 무한정 끌려가지 않도록.
const GOOGLE_FETCH_TIMEOUT_MS = 5_000;

// OAuth access token 캐시 (모듈 레벨) — warm 인스턴스에서 verified sign마다
// 토큰 재발급 왕복 1회를 절약한다. 만료 60초 전에 갱신. SA 교체(client_email
// 기준) 시 무효화. 서버리스 인스턴스별 독립 캐시라 동시성 이슈 없음.
let tokenCache: { email: string; token: string; expiresAtSec: number } | null = null;

async function getAccessToken(serviceAccountJson: string): Promise<string> {
  const sa = JSON.parse(serviceAccountJson);
  const now = Math.floor(Date.now() / 1000);
  if (tokenCache && tokenCache.email === sa.client_email && tokenCache.expiresAtSec - 60 > now) {
    return tokenCache.token;
  }
  const header = b64urlJson({ alg: "RS256", typ: "JWT" });
  const claims = b64urlJson({
    iss: sa.client_email,
    scope: SCOPE,
    aud: TOKEN_URL,
    iat: now,
    exp: now + 3600,
  });
  const signer = createSign("RSA-SHA256");
  signer.update(`${header}.${claims}`);
  const signature = signer.sign(sa.private_key).toString("base64url");
  const assertion = `${header}.${claims}.${signature}`;

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=${encodeURIComponent("urn:ietf:params:oauth:grant-type:jwt-bearer")}&assertion=${assertion}`,
    signal: AbortSignal.timeout(GOOGLE_FETCH_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`google_oauth_failed:${res.status}`);
  const data = await res.json();
  if (!data.access_token) throw new Error("google_oauth_no_token");
  tokenCache = {
    email: sa.client_email,
    token: data.access_token,
    expiresAtSec: now + (typeof data.expires_in === "number" ? data.expires_in : 3600),
  };
  return data.access_token;
}

export type PlayVerifyResult = PlayEvalResult & { attestTokenHash?: string };

export async function verifyPlayIntegrity(
  integrityToken: string,
  nonce: string,
  config: PlayIntegrityConfig,
): Promise<PlayVerifyResult> {
  let accessToken: string;
  try {
    accessToken = await getAccessToken(config.serviceAccountJson);
  } catch (e: any) {
    return { ok: false, reason: e?.message ?? "google_oauth_failed" };
  }

  let res: Response;
  try {
    res = await fetch(
      `https://playintegrity.googleapis.com/v1/${encodeURIComponent(config.packageName)}:decodeIntegrityToken`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ integrityToken }),
        signal: AbortSignal.timeout(GOOGLE_FETCH_TIMEOUT_MS),
      },
    );
  } catch (e: any) {
    // 타임아웃/네트워크 오류 — 403 attest_* 로 내려가면 모바일이 1회 재시도한다(certify.ts)
    return { ok: false, reason: e?.name === "TimeoutError" ? "decode_timeout" : `decode_network:${e?.message}` };
  }
  if (!res.ok) {
    return { ok: false, reason: `decode_failed:${res.status}` };
  }
  const data = await res.json();
  const payload: PlayVerdictPayload | undefined = data.tokenPayloadExternal;
  if (!payload) return { ok: false, reason: "payload_missing" };

  const evaluated = evaluatePlayIntegrityVerdict(payload, {
    nonce,
    packageName: config.packageName,
    allowUnrecognizedApp: config.allowUnrecognizedApp,
    requireStrong: config.requireStrong,
  });
  if (!evaluated.ok) return evaluated;
  return {
    ...evaluated,
    attestTokenHash: createHash("sha256").update(integrityToken).digest("hex").slice(0, 32),
  };
}
