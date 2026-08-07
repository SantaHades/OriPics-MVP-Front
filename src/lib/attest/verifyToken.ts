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
    const packageName = process.env.ANDROID_PACKAGE_NAME;
    if (!serviceAccountJson || !packageName) throw new AttestVerifierNotImplementedError("android");

    const result = await verifyPlayIntegrity(input.token, input.nonce, {
      serviceAccountJson,
      packageName,
      allowUnrecognizedApp: process.env.GOOGLE_PLAY_INTEGRITY_ALLOW_UNRECOGNIZED === "true",
    });
    if (!result.ok) return { ok: false, reason: result.reason };
    return {
      ok: true,
      verifier: "google_play_integrity",
      attestTokenHash: result.attestTokenHash ?? tokenHash(input.token),
      deviceIntegrity: result.deviceIntegrity,
    };
  }

  return { ok: false, reason: "unsupported_platform" };
}
