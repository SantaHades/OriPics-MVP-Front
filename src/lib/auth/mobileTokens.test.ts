import { describe, it, expect, beforeAll } from "vitest";
import { issueMobileTokens, verifyMobileToken } from "./mobileTokens";

beforeAll(() => {
  process.env.NEXTAUTH_SECRET = "test-secret-for-mobile-tokens";
});

describe("mobileTokens", () => {
  it("access 토큰 발급·검증 roundtrip", () => {
    const { accessToken, accessExpiresAt } = issueMobileTokens("user_123");
    const payload = verifyMobileToken(accessToken, "access");
    expect(payload?.sub).toBe("user_123");
    expect(payload?.typ).toBe("access");
    expect(payload?.exp).toBe(accessExpiresAt);
  });

  it("refresh 토큰은 access로 검증 불가 (typ 강제)", () => {
    const { refreshToken } = issueMobileTokens("user_123");
    expect(verifyMobileToken(refreshToken, "access")).toBeNull();
    expect(verifyMobileToken(refreshToken, "refresh")?.sub).toBe("user_123");
  });

  it("서명 변조 거부", () => {
    const { accessToken } = issueMobileTokens("user_123");
    const [h, b, s] = accessToken.split(".");
    const flipped = s.slice(0, -1) + (s.endsWith("A") ? "B" : "A");
    expect(verifyMobileToken(`${h}.${b}.${flipped}`, "access")).toBeNull();
  });

  it("페이로드 변조(sub 교체) 거부", () => {
    const { accessToken } = issueMobileTokens("user_123");
    const [h, , s] = accessToken.split(".");
    const forgedBody = Buffer.from(
      JSON.stringify({ sub: "attacker", typ: "access", aud: "oripics-mobile", iat: 0, exp: 9999999999, jti: "x" }),
    )
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    expect(verifyMobileToken(`${h}.${forgedBody}.${s}`, "access")).toBeNull();
  });

  it("만료 토큰 거부", () => {
    // exp를 과거로 조작한 토큰은 서명이 깨지므로, 정상 발급 토큰의 검증 시점만 이동해 확인 불가 —
    // 대신 verify가 exp<=now를 거부하는 경계는 직접 서명 생성으로 검증한다.
    const { createHmac } = require("crypto") as typeof import("crypto");
    const b64url = (buf: Buffer) => buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    const head = b64url(Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })));
    const body = b64url(
      Buffer.from(
        JSON.stringify({
          sub: "user_123",
          typ: "access",
          aud: "oripics-mobile",
          iat: 0,
          exp: Math.floor(Date.now() / 1000) - 10,
          jti: "expired",
        }),
      ),
    );
    const sig = b64url(createHmac("sha256", Buffer.from(process.env.NEXTAUTH_SECRET!, "utf8")).update(`${head}.${body}`).digest());
    expect(verifyMobileToken(`${head}.${body}.${sig}`, "access")).toBeNull();
  });

  it("잘못된 형식 거부", () => {
    expect(verifyMobileToken("not-a-jwt", "access")).toBeNull();
    expect(verifyMobileToken("", "access")).toBeNull();
  });
});
