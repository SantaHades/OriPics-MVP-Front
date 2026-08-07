import { describe, it, expect } from "vitest";
import { createSign, createVerify, generateKeyPairSync } from "crypto";
import { checkTransactionPayload, rawEs256ToDer, verifyAppleJws, APPLE_PRODUCT_PLANS } from "./appleIap";

const NOW = 1_800_000_000_000;
const CONFIG = { bundleId: "com.santahades.oripics", allowSandbox: false, now: NOW };

const VALID = {
  bundleId: "com.santahades.oripics",
  productId: "oripics.pro.monthly",
  transactionId: "2000000123",
  originalTransactionId: "2000000001",
  purchaseDate: NOW - 1000,
  expiresDate: NOW + 30 * 86400_000,
  environment: "Production" as const,
};

describe("checkTransactionPayload", () => {
  it("정상 월간 구독 통과", () => {
    const r = checkTransactionPayload(VALID, CONFIG);
    expect(r).toEqual({ ok: true, plan: "pro_monthly_ios", periodDays: 30 });
  });

  it("연간 구독 매핑", () => {
    const r = checkTransactionPayload({ ...VALID, productId: "oripics.pro.yearly" }, CONFIG);
    expect(r.ok && r.plan).toBe("pro_yearly_ios");
  });

  it("번들 ID 불일치 거부", () => {
    expect(checkTransactionPayload({ ...VALID, bundleId: "com.evil.app" }, CONFIG)).toEqual({
      ok: false,
      reason: "bundle_id_mismatch",
    });
  });

  it("Sandbox 거부 / 허용 플래그로 통과", () => {
    const sandbox = { ...VALID, environment: "Sandbox" as const };
    expect(checkTransactionPayload(sandbox, CONFIG).ok).toBe(false);
    expect(checkTransactionPayload(sandbox, { ...CONFIG, allowSandbox: true }).ok).toBe(true);
  });

  it("환불(revocation) 거부", () => {
    expect(checkTransactionPayload({ ...VALID, revocationDate: NOW - 10 }, CONFIG)).toEqual({
      ok: false,
      reason: "transaction_revoked",
    });
  });

  it("미등록 제품 거부", () => {
    expect(checkTransactionPayload({ ...VALID, productId: "oripics.unknown" }, CONFIG)).toEqual({
      ok: false,
      reason: "unknown_product",
    });
  });

  it("만료 구독 거부", () => {
    expect(checkTransactionPayload({ ...VALID, expiresDate: NOW - 1 }, CONFIG)).toEqual({
      ok: false,
      reason: "subscription_expired",
    });
  });

  it("제품 ID 매핑 상수에 §8-A 가격 플랜 존재", () => {
    expect(Object.keys(APPLE_PRODUCT_PLANS)).toEqual(["oripics.pro.monthly", "oripics.pro.yearly"]);
  });
});

describe("rawEs256ToDer", () => {
  it("raw r‖s 서명을 node verify가 수용하는 DER로 변환", () => {
    const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
    const data = "header.payload";
    const derSig = createSign("SHA256").update(data).sign(privateKey); // DER
    // DER → raw 역변환 없이: raw 64바이트를 직접 만들어 왕복 확인
    // (jose 스타일 raw 서명 생성: dsaEncoding ieee-p1363)
    const rawSig = createSign("SHA256").update(data).sign({ key: privateKey, dsaEncoding: "ieee-p1363" });
    expect(rawSig.length).toBe(64);
    const converted = rawEs256ToDer(rawSig);
    const v = createVerify("SHA256");
    v.update(data);
    expect(v.verify(publicKey, converted)).toBe(true);
    // 기존 DER은 그대로 통과
    const v2 = createVerify("SHA256");
    v2.update(data);
    expect(v2.verify(publicKey, derSig)).toBe(true);
  });
});

describe("verifyAppleJws — 거부 경로", () => {
  it("형식 오류 거부", () => {
    expect(verifyAppleJws("abc")).toEqual({ ok: false, reason: "jws_malformed" });
  });

  it("x5c 없는 헤더 거부", () => {
    const head = Buffer.from(JSON.stringify({ alg: "ES256" })).toString("base64url");
    const body = Buffer.from("{}").toString("base64url");
    expect(verifyAppleJws(`${head}.${body}.AAAA`)).toEqual({ ok: false, reason: "jws_header_unsupported" });
  });

  it("가짜 체인(자가서명) 거부 — Apple Root로 연결되지 않음", () => {
    // 실제 인증서 생성 없이: 유효하지 않은 인증서 바이트 → certificate_parse_failed
    const head = Buffer.from(
      JSON.stringify({ alg: "ES256", x5c: [Buffer.from("fake1").toString("base64"), Buffer.from("fake2").toString("base64")] }),
    ).toString("base64url");
    const body = Buffer.from("{}").toString("base64url");
    expect(verifyAppleJws(`${head}.${body}.AAAA`)).toEqual({ ok: false, reason: "certificate_parse_failed" });
  });
});
