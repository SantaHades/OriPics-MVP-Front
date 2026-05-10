// Attestation token 검증 — 골격 (D-pre-5에서 본 구현).
//
// iOS App Attest: DCAppAttestService.shared.attestKey() / generateAssertion() 토큰
//   - 검증: Apple 공개 인증서 체인 + clientDataHash + counter
//   - 라이브러리: @peculiar/asn1-schema 기반 자체 구현 또는 `appattest` npm 패키지
//
// Android Play Integrity: IntegrityManager.requestIntegrityToken() 토큰
//   - 검증: Google API로 decodeIntegrityToken (서버 to 서버) 또는 JWT 자체 디코드 + 공개키 검증
//   - 라이브러리: googleapis (공식 SDK)
//
// 본 구현 시 환경변수:
//   - APPLE_APP_ATTEST_TEAM_ID, APPLE_APP_ATTEST_BUNDLE_ID
//   - GOOGLE_PLAY_INTEGRITY_PROJECT_NUMBER, GOOGLE_SERVICE_ACCOUNT_JSON

export type VerifiedPlatform = "ios" | "android";

export interface VerifyTokenInput {
  platform: VerifiedPlatform;
  token: string;
  /** 서버 발급 nonce — token이 이 nonce를 clientDataHash로 사용했는지 검증 */
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
  /** 검증 시점의 검증자 (예: "apple_app_attest" / "google_play_integrity") */
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
    super(`Attest verifier for ${platform} not implemented yet — D-pre-5 본 구현 대기`);
    this.name = "AttestVerifierNotImplementedError";
  }
}

/**
 * 모바일 attest token 검증.
 *
 * 현재: stub. 본 구현은 D-pre-5에서.
 * 호출 측은 ok=false 시 401/403 반환 권장.
 */
export async function verifyAttestToken(_input: VerifyTokenInput): Promise<VerifyTokenResult> {
  throw new AttestVerifierNotImplementedError(_input.platform);
}
