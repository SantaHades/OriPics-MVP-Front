// iOS App Attest attestation 검증 (A-4 본 구현, 2026-08-07).
// 절차(Apple 문서 "Validating apps that connect to your server" 기준):
//  1. attestation CBOR 디코드 → {fmt:'apple-appattest', attStmt:{x5c, receipt}, authData}
//  2. x5c 체인을 Apple App Attestation Root CA까지 검증 (유효기간 포함)
//  3. clientDataHash = SHA256(challenge) → expectedNonce = SHA256(authData ‖ clientDataHash)
//     → leaf 인증서 확장 OID 1.2.840.113635.100.8.2 안의 32바이트와 일치해야 함 (nonce 바인딩)
//  4. leaf 공개키의 SHA256 == keyId, authData의 credentialId == keyId (키 바인딩)
//  5. authData rpIdHash == SHA256(`${TEAM_ID}.${BUNDLE_ID}`) (앱 바인딩)
//  6. counter == 0 (최초 attestation), aaguid ∈ {appattest, appattestdevelop(개발 허용 시)}
//
// 토큰 포맷(모바일 클라이언트와의 계약): base64(JSON { key_id: string(b64), attestation: string(b64) })
import { createHash, X509Certificate } from "crypto";
import { cborDecode } from "./cbor";
import { APPLE_APP_ATTEST_ROOT_CA_PEM } from "./appleRootCa";

const NONCE_EXTENSION_OID_DER = Buffer.from("06092a864886f76364080205", "hex").subarray(0, 11);
// 1.2.840.113635.100.8.2 = DER 06 09 2A 86 48 86 F7 63 64 08 02

const AAGUID_PROD = Buffer.from("617070617474657374000000", "hex"); // "appattest" + padding
const AAGUID_DEV = Buffer.from("617070617474657374646576656c6f70", "hex"); // "appattestdevelop"

export interface AppleVerifyConfig {
  teamId: string;
  bundleId: string;
  allowDevelopmentEnvironment: boolean;
}

export type AppleVerifyResult = { ok: true } | { ok: false; reason: string };

function sha256(buf: Uint8Array | string): Buffer {
  return createHash("sha256").update(buf).digest();
}

/** leaf 인증서 raw DER에서 App Attest nonce 확장(OID …8.2)의 32바이트 값을 찾는다. */
export function extractNonceFromLeafDer(der: Buffer): Buffer | null {
  const idx = der.indexOf(NONCE_EXTENSION_OID_DER);
  if (idx < 0) return null;
  // 확장 구조: OID | OCTET STRING( SEQUENCE( [1] OCTET STRING(32) ) ) — 관용적 파싱:
  // OID 뒤에서 0x04 0x20(32바이트 OCTET STRING) 패턴을 탐색 (확장 영역 내 첫 등장)
  const window = der.subarray(idx, idx + 64);
  for (let i = NONCE_EXTENSION_OID_DER.length; i < window.length - 34; i++) {
    if (window[i] === 0x04 && window[i + 1] === 0x20) {
      return Buffer.from(window.subarray(i + 2, i + 34));
    }
  }
  return null;
}

export interface ParsedAuthData {
  rpIdHash: Buffer;
  counter: number;
  aaguid: Buffer;
  credentialId: Buffer;
}

export function parseAuthData(authData: Buffer): ParsedAuthData | null {
  // rpIdHash(32) | flags(1) | counter(4) | aaguid(16) | credIdLen(2) | credId(L) | ...
  if (authData.length < 55) return null;
  const rpIdHash = authData.subarray(0, 32);
  const counter = authData.readUInt32BE(33);
  const aaguid = authData.subarray(37, 53);
  const credIdLen = authData.readUInt16BE(53);
  if (authData.length < 55 + credIdLen) return null;
  const credentialId = authData.subarray(55, 55 + credIdLen);
  return { rpIdHash: Buffer.from(rpIdHash), counter, aaguid: Buffer.from(aaguid), credentialId: Buffer.from(credentialId) };
}

export async function verifyAppleAppAttest(
  token: string,
  challenge: string,
  config: AppleVerifyConfig,
): Promise<AppleVerifyResult> {
  // 0. 토큰 언팩
  let keyIdB64: string;
  let attestationB64: string;
  try {
    const parsed = JSON.parse(Buffer.from(token, "base64").toString("utf8"));
    keyIdB64 = parsed.key_id;
    attestationB64 = parsed.attestation;
    if (typeof keyIdB64 !== "string" || typeof attestationB64 !== "string") throw new Error();
  } catch {
    return { ok: false, reason: "token_malformed" };
  }
  const keyId = Buffer.from(keyIdB64, "base64");
  if (keyId.length !== 32) return { ok: false, reason: "key_id_invalid" };

  // 1. CBOR 디코드
  let fmt: unknown, attStmt: any, authDataRaw: unknown;
  try {
    const obj = cborDecode(new Uint8Array(Buffer.from(attestationB64, "base64"))) as any;
    fmt = obj.fmt;
    attStmt = obj.attStmt;
    authDataRaw = obj.authData;
  } catch {
    return { ok: false, reason: "attestation_cbor_invalid" };
  }
  if (fmt !== "apple-appattest") return { ok: false, reason: "attestation_fmt_invalid" };
  if (!(authDataRaw instanceof Uint8Array)) return { ok: false, reason: "auth_data_missing" };
  const authData = Buffer.from(authDataRaw);
  const x5c: unknown = attStmt?.x5c;
  if (!Array.isArray(x5c) || x5c.length < 2 || !x5c.every((c) => c instanceof Uint8Array)) {
    return { ok: false, reason: "x5c_invalid" };
  }

  // 2. 인증서 체인 검증 (leaf → intermediates → Apple root)
  let certs: X509Certificate[];
  let root: X509Certificate;
  try {
    certs = (x5c as Uint8Array[]).map((der) => new X509Certificate(Buffer.from(der)));
    root = new X509Certificate(APPLE_APP_ATTEST_ROOT_CA_PEM);
  } catch {
    return { ok: false, reason: "certificate_parse_failed" };
  }
  const now = Date.now();
  for (const cert of certs) {
    if (now < new Date(cert.validFrom).getTime() || now > new Date(cert.validTo).getTime()) {
      return { ok: false, reason: "certificate_expired" };
    }
  }
  for (let i = 0; i < certs.length; i++) {
    const issuer = i + 1 < certs.length ? certs[i + 1] : root;
    if (!certs[i].verify(issuer.publicKey)) {
      return { ok: false, reason: "certificate_chain_invalid" };
    }
  }
  const leaf = certs[0];

  // 3. nonce 바인딩
  const clientDataHash = sha256(challenge);
  const expectedNonce = sha256(Buffer.concat([authData, clientDataHash]));
  const certNonce = extractNonceFromLeafDer(leaf.raw);
  if (!certNonce || !certNonce.equals(expectedNonce)) {
    return { ok: false, reason: "nonce_mismatch" };
  }

  // 4. 키 바인딩 — leaf 공개키(SPKI uncompressed point)의 SHA256 == keyId
  const spki = leaf.publicKey.export({ type: "spki", format: "der" });
  // SPKI 마지막 65바이트 = uncompressed EC P-256 point (0x04 || X || Y)
  const point = spki.subarray(spki.length - 65);
  if (point[0] !== 0x04 || !sha256(point).equals(keyId)) {
    return { ok: false, reason: "key_id_mismatch" };
  }

  // 5. 앱 바인딩 + counter + 환경
  const parsedAuth = parseAuthData(authData);
  if (!parsedAuth) return { ok: false, reason: "auth_data_invalid" };
  if (!parsedAuth.credentialId.equals(keyId)) return { ok: false, reason: "credential_id_mismatch" };
  const appIdHash = sha256(`${config.teamId}.${config.bundleId}`);
  if (!parsedAuth.rpIdHash.equals(appIdHash)) return { ok: false, reason: "app_id_mismatch" };
  if (parsedAuth.counter !== 0) return { ok: false, reason: "counter_nonzero" };
  const isProd = parsedAuth.aaguid.equals(AAGUID_PROD);
  const isDev = parsedAuth.aaguid.equals(AAGUID_DEV);
  if (!isProd && !(isDev && config.allowDevelopmentEnvironment)) {
    return { ok: false, reason: isDev ? "development_environment_not_allowed" : "aaguid_invalid" };
  }

  return { ok: true };
}
