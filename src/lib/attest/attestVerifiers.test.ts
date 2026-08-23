import { describe, it, expect } from "vitest";
import { createHash } from "crypto";
import { cborDecode } from "./cbor";
import {
  parseAuthData,
  extractNonceFromLeafDer,
  verifyAppleAppAttest,
  AAGUID_PROD,
  AAGUID_DEV,
} from "./appleAppAttest";
import { evaluatePlayIntegrityVerdict } from "./playIntegrity";

// ── CBOR ──────────────────────────────────────────────────────────
describe("cbor minimal decoder", () => {
  it("attestation 형태의 map/array/bytes/text 디코드", () => {
    // {"fmt": "apple-appattest", "attStmt": {"x5c": [h'0102']}, "authData": h'AABB'}
    const hex =
      "a3" + // map(3)
      "63666d74" + // "fmt"
      "6f6170706c652d617070617474657374" + // "apple-appattest"
      "6761747453746d74" + // "attStmt"
      "a1" + "63783563" + "81" + "420102" + // {"x5c": [bytes(0102)]}
      "686175746844617461" + // "authData"
      "42aabb";
    const v = cborDecode(new Uint8Array(Buffer.from(hex, "hex"))) as any;
    expect(v.fmt).toBe("apple-appattest");
    expect(Array.isArray(v.attStmt.x5c)).toBe(true);
    expect(Buffer.from(v.attStmt.x5c[0]).toString("hex")).toBe("0102");
    expect(Buffer.from(v.authData).toString("hex")).toBe("aabb");
  });

  it("uint 길이 인코딩 (24/25) 처리", () => {
    const text30 = "x".repeat(30);
    const hex = "78" + "1e" + Buffer.from(text30).toString("hex"); // text, len=24-encoding
    expect(cborDecode(new Uint8Array(Buffer.from(hex, "hex")))).toBe(text30);
  });

  it("미지원 major type 거부", () => {
    expect(() => cborDecode(new Uint8Array([0xf5]))).toThrow(); // simple(true)
  });

  it("잘린 입력 거부", () => {
    expect(() => cborDecode(new Uint8Array([0x42, 0x01]))).toThrow("cbor_truncated");
  });
});

// ── App Attest authData ───────────────────────────────────────────
function makeAuthData(opts: { rpIdHash?: Buffer; counter?: number; aaguid?: string; credId?: Buffer }) {
  const rpIdHash = opts.rpIdHash ?? createHash("sha256").update("TEAM123456.com.example.app").digest();
  const credId = opts.credId ?? Buffer.alloc(32, 7);
  const buf = Buffer.alloc(55 + credId.length);
  rpIdHash.copy(buf, 0);
  buf[32] = 0x40; // flags
  buf.writeUInt32BE(opts.counter ?? 0, 33);
  Buffer.from((opts.aaguid ?? "appattest").padEnd(16, "\0")).copy(buf, 37);
  buf.writeUInt16BE(credId.length, 53);
  credId.copy(buf, 55);
  return buf;
}

describe("apple app attest — 구조 파싱", () => {
  it("authData 필드 파싱", () => {
    const auth = makeAuthData({ counter: 0 });
    const parsed = parseAuthData(auth)!;
    expect(parsed.counter).toBe(0);
    expect(parsed.credentialId.length).toBe(32);
    expect(parsed.aaguid.subarray(0, 9).toString()).toBe("appattest");
  });

  it("짧은 authData 거부", () => {
    expect(parseAuthData(Buffer.alloc(10))).toBeNull();
  });

  // 회귀 고정: aaguid는 16바이트 필드 — 12바이트 상수 버그로 production
  // attestation이 전부 거부됐던 사고 재발 방지 (2026-08-23 실기기 e2e)
  it("AAGUID 상수는 정확히 16바이트, authData의 aaguid와 일치", () => {
    expect(AAGUID_PROD.length).toBe(16);
    expect(AAGUID_DEV.length).toBe(16);
    const prodAuth = parseAuthData(makeAuthData({ aaguid: "appattest" }))!;
    expect(prodAuth.aaguid.equals(AAGUID_PROD)).toBe(true);
    const devAuth = parseAuthData(makeAuthData({ aaguid: "appattestdevelop" }))!;
    expect(devAuth.aaguid.equals(AAGUID_DEV)).toBe(true);
  });

  it("leaf DER에서 nonce 확장 추출", () => {
    const nonce = Buffer.alloc(32, 0xab);
    const der = Buffer.concat([
      Buffer.alloc(20, 1),
      Buffer.from("06092a86488886f7636408", "hex"), // 유사 OID (불일치 — 매칭 안 되어야 함)
      Buffer.alloc(4, 0),
      Buffer.from("06092a864886f763640802", "hex"), // 실제 OID
      Buffer.from("0101ff", "hex"),
      Buffer.from("0422", "hex"), // OCTET STRING(34) wrapper 유사
      Buffer.from("0420", "hex"), // OCTET STRING(32)
      nonce,
      Buffer.alloc(8, 2),
    ]);
    const got = extractNonceFromLeafDer(der);
    expect(got?.equals(nonce)).toBe(true);
  });
});

describe("apple app attest — 거부 경로", () => {
  const config = { teamId: "TEAM123456", bundleId: "com.example.app", allowDevelopmentEnvironment: true };

  it("잘못된 토큰 포맷 거부", async () => {
    expect((await verifyAppleAppAttest("not-base64-json", "nonce", config))).toEqual({
      ok: false,
      reason: "token_malformed",
    });
  });

  it("keyId 길이 오류 거부", async () => {
    const token = Buffer.from(
      JSON.stringify({ key_id: Buffer.alloc(8).toString("base64"), attestation: Buffer.from("a0", "hex").toString("base64") }),
    ).toString("base64");
    expect((await verifyAppleAppAttest(token, "nonce", config)).ok).toBe(false);
  });

  it("CBOR 아닌 attestation 거부", async () => {
    const token = Buffer.from(
      JSON.stringify({ key_id: Buffer.alloc(32).toString("base64"), attestation: Buffer.from([0xf5]).toString("base64") }),
    ).toString("base64");
    expect(await verifyAppleAppAttest(token, "nonce", config)).toEqual({
      ok: false,
      reason: "attestation_cbor_invalid",
    });
  });
});

// ── Play Integrity verdict ────────────────────────────────────────
describe("play integrity verdict 판정", () => {
  const NOW = 1_800_000_000_000;
  const base = {
    requestDetails: { nonce: "the-nonce", requestPackageName: "com.santahades.oripics", timestampMillis: String(NOW - 5000) },
    appIntegrity: { appRecognitionVerdict: "PLAY_RECOGNIZED", packageName: "com.santahades.oripics" },
    deviceIntegrity: { deviceRecognitionVerdict: ["MEETS_DEVICE_INTEGRITY"] },
  };
  const expected = { nonce: "the-nonce", packageName: "com.santahades.oripics", allowUnrecognizedApp: false };

  it("정상 통과", () => {
    const r = evaluatePlayIntegrityVerdict(base, expected, NOW);
    expect(r).toEqual({ ok: true, deviceIntegrity: "MEETS_DEVICE_INTEGRITY" });
  });

  it("base64url 재인코딩된 nonce 수용", () => {
    const p = { ...base, requestDetails: { ...base.requestDetails, nonce: Buffer.from("the-nonce").toString("base64url") } };
    expect(evaluatePlayIntegrityVerdict(p, expected, NOW).ok).toBe(true);
  });

  it("standard 요청의 requestHash 필드 수용", () => {
    const p = { ...base, requestDetails: { requestHash: "the-nonce", requestPackageName: base.requestDetails.requestPackageName, timestampMillis: base.requestDetails.timestampMillis } };
    expect(evaluatePlayIntegrityVerdict(p, expected, NOW).ok).toBe(true);
  });

  it("nonce 불일치 거부 (replay)", () => {
    const p = { ...base, requestDetails: { ...base.requestDetails, nonce: "other" } };
    expect(evaluatePlayIntegrityVerdict(p, expected, NOW)).toEqual({ ok: false, reason: "nonce_mismatch" });
  });

  it("오래된 verdict 거부 (10분 초과)", () => {
    const p = { ...base, requestDetails: { ...base.requestDetails, timestampMillis: String(NOW - 11 * 60_000) } };
    expect(evaluatePlayIntegrityVerdict(p, expected, NOW)).toEqual({ ok: false, reason: "verdict_stale" });
  });

  it("패키지 불일치 거부", () => {
    const p = { ...base, requestDetails: { ...base.requestDetails, requestPackageName: "com.evil.app" } };
    expect(evaluatePlayIntegrityVerdict(p, expected, NOW)).toEqual({ ok: false, reason: "package_name_mismatch" });
  });

  it("미인식 앱 거부 / dev 플래그로 허용", () => {
    const p = { ...base, appIntegrity: { ...base.appIntegrity, appRecognitionVerdict: "UNRECOGNIZED_VERSION" } };
    expect(evaluatePlayIntegrityVerdict(p, expected, NOW).ok).toBe(false);
    expect(evaluatePlayIntegrityVerdict(p, { ...expected, allowUnrecognizedApp: true }, NOW).ok).toBe(true);
  });

  it("기기 무결성 미충족 거부", () => {
    const p = { ...base, deviceIntegrity: { deviceRecognitionVerdict: [] } };
    expect(evaluatePlayIntegrityVerdict(p, expected, NOW).ok).toBe(false);
  });

  it("STRONG 우선 반환", () => {
    const p = { ...base, deviceIntegrity: { deviceRecognitionVerdict: ["MEETS_DEVICE_INTEGRITY", "MEETS_STRONG_INTEGRITY"] } };
    const r = evaluatePlayIntegrityVerdict(p, expected, NOW);
    expect(r.ok && r.deviceIntegrity).toBe("MEETS_STRONG_INTEGRITY");
  });
});
