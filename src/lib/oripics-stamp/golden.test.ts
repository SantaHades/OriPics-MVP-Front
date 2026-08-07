import { describe, it, expect } from "vitest";
import { bytesToHex, selectEmbedMode, selectEmbedModeV4, PAYLOAD_LENGTH, PAYLOAD_LENGTH_V3, PAYLOAD_LENGTH_V4 } from "./common";
import { computeInnerHash, computeBorderHash, embedPayload, extractPayload, splitPayload, buildPayload } from "./v2";
import { selectEmbedModeV3, computeBorderHashV3, embedPayloadV3, extractPayloadV3 } from "./v3";
import { computeBorderHashV4, embedPayloadV4, extractPayloadV4 } from "./v4";

// 모노레포 추출(M0-2) 회귀 고정 테스트.
// 기준값은 추출 전 구현(2026-08-07, apps/web/src/lib/oripics-stamp)에서 기록.
// 이 값이 바뀌면 웹·모바일 간 검증 호환성이 깨진 것이다 — 절대 갱신 금지, 코드를 고쳐라.

const W = 150;
const H = 150;

function makePixels(): Uint8ClampedArray {
  // 결정적 LCG로 의사난수 픽셀 생성 (플랫폼 무관 재현)
  const out = new Uint8ClampedArray(W * H * 4);
  let s = 0x12345678;
  for (let i = 0; i < out.length; i++) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    out[i] = i % 4 === 3 ? 255 : s & 0xff;
  }
  return out;
}

function makePayload(len: number): Uint8Array {
  const p = new Uint8Array(len);
  let s = 0x9e3779b9;
  for (let i = 0; i < len; i++) {
    s = (Math.imul(s, 22695477) + 1) >>> 0;
    p[i] = (s >>> 16) & 0xff;
  }
  return p;
}

const GOLDEN = {
  innerHash: "b5a2a15d5bc14eda4ae2fc794c36d125306bf496b1d18b3898e0ad0486cf0cdf",
  modeV2: "b_only",
  modeV3: "rgb_lsb",
  modeV4: "rgb_lsb",
  borderV2: "87531d6bdc7cbd94a8fe7cc7be9b8bdac27fecdcb873215feb3a0e600e278a10",
  borderV3: "848b14d7b51256f6095e9cb07d3decf45a33137258e94f1ac72e6f01d54914b3",
  borderV4: "a7961026b07625fb35bb4eb1230eebcc2a5d832b59a018465b6e4d694807c221",
  stampedV2: "eca4d4a4f2ab1d60f3a6a2e259d6eecd21404ea7d7b2a6358517c7669078f89c",
  stampedV4: "5319299061ede16fb3c9648a7d4617a6bf915f93348eea49fc3570a4e189cc6e",
};

async function sha256hex(buf: Uint8Array): Promise<string> {
  const h = await crypto.subtle.digest("SHA-256", buf as unknown as BufferSource);
  return bytesToHex(new Uint8Array(h));
}

describe("stamp golden regression (extraction must not change bits)", () => {
  it("embed modes", () => {
    expect(selectEmbedMode(W, H)).toBe(GOLDEN.modeV2);
    expect(selectEmbedModeV3(W, H)).toBe(GOLDEN.modeV3);
    expect(selectEmbedModeV4(W, H)).toBe(GOLDEN.modeV4);
  });

  it("inner hash", async () => {
    const px = makePixels();
    const hex = bytesToHex(await computeInnerHash(px, W, H));
    expect(hex).toBe(GOLDEN.innerHash);
  });

  it("border hashes v2/v3/v4", async () => {
    const px = makePixels();
    const v2 = bytesToHex(await computeBorderHash(px, W, H, "b_only"));
    const v3 = bytesToHex(await computeBorderHashV3(px, W, H, "rgb_lsb"));
    const v4 = bytesToHex(await computeBorderHashV4(px, W, H, "rgb_lsb"));
    expect(v2).toBe(GOLDEN.borderV2);
    expect(v3).toBe(GOLDEN.borderV3);
    expect(v4).toBe(GOLDEN.borderV4);
  });

  it("v2 embed → stamped pixels stable + extract roundtrip", async () => {
    const px = makePixels();
    const payload = makePayload(PAYLOAD_LENGTH);
    embedPayload(px, W, H, payload, "b_only");
    const stamped = await sha256hex(new Uint8Array(px.buffer.slice(0)));
    expect(stamped).toBe(GOLDEN.stampedV2);
    expect(bytesToHex(extractPayload(px, W, H, "b_only"))).toBe(bytesToHex(payload));
    const { meta, finalHash } = splitPayload(payload);
    expect(bytesToHex(buildPayload(meta, finalHash))).toBe(bytesToHex(payload));
  });

  it("v3 embed/extract roundtrip", () => {
    const px = makePixels();
    const payload = makePayload(PAYLOAD_LENGTH_V3);
    embedPayloadV3(px, W, H, payload, "rgb_lsb");
    expect(bytesToHex(extractPayloadV3(px, W, H, "rgb_lsb"))).toBe(bytesToHex(payload));
  });

  it("v4 embed → stamped pixels stable + extract roundtrip", async () => {
    const px = makePixels();
    const payload = makePayload(PAYLOAD_LENGTH_V4);
    embedPayloadV4(px, W, H, payload, "rgb_lsb");
    const stamped = await sha256hex(new Uint8Array(px.buffer.slice(0)));
    expect(stamped).toBe(GOLDEN.stampedV4);
    expect(bytesToHex(extractPayloadV4(px, W, H, "rgb_lsb"))).toBe(bytesToHex(payload));
  });
});
