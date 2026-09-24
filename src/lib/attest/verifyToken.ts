// Attestation token 검증 — A-4(iOS)/A-5(Android) 본 구현 (2026-08-07, M4).
//
// 설정 게이트: 플랫폼별 필수 env가 없으면 AttestVerifierNotImplementedError를 던져
// /api/sign의 기존 개발 폴백(token 해시만 기록)이 유지된다. env가 설정되는 순간 실검증으로 전환.
//
// 환경변수:
//  iOS  — APPLE_APP_ATTEST_TEAM_ID, APPLE_APP_ATTEST_BUNDLE_ID,
//         APPLE_APP_ATTEST_ALLOW_DEV=true(개발 빌드 attestation 허용, 운영에서는 미설정)
//  And  — GOOGLE_PLAY_INTEGRITY_SERVICE_ACCOUNT_JSON, ANDROID_PACKAGE_NAME,
//         GOOGLE_PLAY_INTEGRITY_ALLOW_UNRECOGNIZED=true(사이드로드 허용, 운영 미설정)
import { createHash } from "crypto";
import { verifyAppleAppAttest } from "./appleAppAttest";
import { verifyPlayIntegrity } from "./playIntegrity";

export type VerifiedPlatform = "ios" | "android";

export interface VerifyTokenInput {
  platform: VerifiedPlatform;
  token: string;
  /** 서버 발급 nonce — token이 이 nonce에 바인딩되었는지 검증 */
  nonce: string;
}

export interface VerifyTokenSuccess {
  ok: true;
  /**
   * Token의 SHA-256 해시 (16 bytes truncated → hex 32자).
   * C2PA `com.oripics.verified.attest_token_hash`로 사용.
   * Token 자체는 PII 가능성 있어 저장 X.
   */
  attestTokenHash: string;
  verifier: "apple_app_attest" | "google_play_integrity";
  /** 디바이스 무결성 등급 (Android Play Integrity 응답) */
  deviceIntegrity?: "MEETS_DEVICE_INTEGRITY" | "MEETS_BASIC_INTEGRITY" | "MEETS_STRONG_INTEGRITY";
}

export interface VerifyTokenFailure {
  ok: false;
  reason: string;
}

export type VerifyTokenResult = VerifyTokenSuccess | VerifyTokenFailure;

export class AttestVerifierNotImplementedError extends Error {
  constructor(platform: string) {
    super(`Attest verifier for ${platform} not configured — 필수 env 미설정 (verifyToken.ts 주석 참조)`);
    this.name = "AttestVerifierNotImplementedError";
  }
}

function tokenHash(token: string): string {
  return createHash("sha256").update(token).digest("hex").slice(0, 32);
}

export async function verifyAttestToken(input: VerifyTokenInput): Promise<VerifyTokenResult> {
  if (input.platform === "ios") {
    const teamId = process.env.APPLE_APP_ATTEST_TEAM_ID;
    const bundleId = process.env.APPLE_APP_ATTEST_BUNDLE_ID;
    if (!teamId || !bundleId) throw new AttestVerifierNotImplementedError("ios");

    const result = await verifyAppleAppAttest(input.token, input.nonce, {
      teamId,
      bundleId,
      allowDevelopmentEnvironment: process.env.APPLE_APP_ATTEST_ALLOW_DEV === "true",
    });
    if (!result.ok) return { ok: false, reason: result.reason };
    return { ok: true, verifier: "apple_app_attest", attestTokenHash: tokenHash(input.token) };
  }

  if (input.platform === "android") {
    const serviceAccountJson = process.env.GOOGLE_PLAY_INTEGRITY_SERVICE_ACCOUNT_JSON;
    // (2026-09-24) Android 새 앱 전환(com.santahades.oripics → ori.pics.app) 기간에는 두 패키지를 모두 받는다.
    // ANDROID_PACKAGE_NAME = 쉼표 구분 목록, 앞쪽이 우선(새 패키지를 먼저 두면 대부분 한 번에 끝남).
    // decodeIntegrityToken은 URL의 패키지와 토큰의 앱이 다르면 실패하므로 순서대로 시도하고 첫 성공을 쓴다.
    const packageNames = (process.env.ANDROID_PACKAGE_NAME ?? "").split(",").map((x) => x.trim()).filter(Boolean);
    if (!serviceAccountJson || packageNames.length === 0) throw new AttestVerifierNotImplementedError("android");

    let result: Awaited<ReturnType<typeof verifyPlayIntegrity>> | null = null;
    for (const packageName of packageNames) {
      result = await verifyPlayIntegrity(input.token, input.nonce, {
        serviceAccountJson,
        packageName,
        allowUnrecognizedApp: process.env.GOOGLE_PLAY_INTEGRITY_ALLOW_UNRECOGNIZED === "true",
        requireStrong: process.env.PLAY_INTEGRITY_REQUIRE_STRONG === "true",
      });
      if (result.ok) break;
      // 패키지가 맞지 않아 생긴 실패만 다음 후보로 넘어간다(무결성 판정 실패는 그대로 반환)
      if (!/^decode_failed|package_name_mismatch|app_package_mismatch/.test(result.reason)) break;
    }
    if (!result || !result.ok) return { ok: false, reason: result?.reason ?? "android_verify_failed" };
    return {
      ok: true,
      verifier: "google_play_integrity",
      attestTokenHash: result.attestTokenHash ?? tokenHash(input.token),
      deviceIntegrity: result.deviceIntegrity,
    };
  }

  return { ok: false, reason: "unsupported_platform" };
}
