import { describe, it, expect, beforeAll } from "vitest";

// 테스트용 secret 설정 (모듈 import 전)
beforeAll(() => {
  process.env.ORIPICS_ATTEST_SECRET = "test-secret-do-not-use-in-prod-0123456789";
});

// dynamic import로 env가 먼저 set되도록
const importChallenge = () => import("./challenge");

describe("attest/challenge", () => {
  it("issue → verify round-trip", async () => {
    const { issueChallenge, verifyChallenge } = await importChallenge();
    const c = issueChallenge();
    expect(c.nonce).toMatch(/^\d+\.[0-9a-f]{32}\.[A-Za-z0-9_-]+$/);
    expect(c.exp).toBeGreaterThan(Math.floor(Date.now() / 1000));

    const v = verifyChallenge(c.nonce);
    expect(v.ok).toBe(true);
    if (v.ok) expect(v.exp).toBe(c.exp);
  });

  it("rejects malformed nonce (wrong segment count)", async () => {
    const { verifyChallenge } = await importChallenge();
    expect(verifyChallenge("only-one-segment")).toEqual({ ok: false, reason: "malformed" });
    expect(verifyChallenge("two.segments")).toEqual({ ok: false, reason: "malformed" });
    expect(verifyChallenge("a.b.c.d")).toEqual({ ok: false, reason: "malformed" });
  });

  it("rejects malformed nonce (non-numeric exp)", async () => {
    const { verifyChallenge } = await importChallenge();
    expect(verifyChallenge("notanumber.aaaa.bbbb")).toEqual({ ok: false, reason: "malformed" });
  });

  it("rejects tampered signature", async () => {
    const { issueChallenge, verifyChallenge } = await importChallenge();
    const c = issueChallenge();
    const parts = c.nonce.split(".");
    // 마지막 시그니처를 바꾼다 (길이 유지하기 위해 같은 길이의 다른 문자열)
    const tampered = `${parts[0]}.${parts[1]}.${"A".repeat(parts[2].length)}`;
    expect(verifyChallenge(tampered)).toEqual({ ok: false, reason: "invalid_signature" });
  });

  it("rejects tampered random (signature mismatch)", async () => {
    const { issueChallenge, verifyChallenge } = await importChallenge();
    const c = issueChallenge();
    const parts = c.nonce.split(".");
    // random을 바꾸면 signature가 안 맞아서 invalid_signature
    const tampered = `${parts[0]}.${"f".repeat(parts[1].length)}.${parts[2]}`;
    expect(verifyChallenge(tampered)).toEqual({ ok: false, reason: "invalid_signature" });
  });

  it("rejects expired nonce", async () => {
    const { verifyChallenge } = await importChallenge();
    // 직접 만료된 nonce를 만들기 위해 secret으로 서명
    const { createHmac } = await import("crypto");
    const expiredExp = Math.floor(Date.now() / 1000) - 1; // 1초 전 만료
    const random = "abcd1234abcd1234abcd1234abcd1234";
    const payload = `${expiredExp}.${random}`;
    const sig = createHmac("sha256", process.env.ORIPICS_ATTEST_SECRET!)
      .update(payload)
      .digest("base64url");
    const expired = `${payload}.${sig}`;
    expect(verifyChallenge(expired)).toEqual({ ok: false, reason: "expired" });
  });

  it("two issued nonces are different (random component)", async () => {
    const { issueChallenge } = await importChallenge();
    const a = issueChallenge();
    const b = issueChallenge();
    expect(a.nonce).not.toBe(b.nonce);
  });
});
