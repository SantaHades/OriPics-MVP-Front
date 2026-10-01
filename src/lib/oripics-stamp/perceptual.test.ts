import { describe, it, expect } from "vitest";
import {
  computePerceptualFingerprint,
  hammingHex,
  PHASH_MAX_DISTANCE,
  DHASH_MAX_DISTANCE,
  HEX_PHASH256,
  HEX_DHASH64,
} from "@oripics/stamp";

// 결정적 의사난수 (테스트 이미지·노이즈 재현용)
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

/** 그라데이션 + 원·사각형 + 약한 질감 — 실사진처럼 저주파 구조가 있는 합성 이미지 */
function scene(w: number, h: number, variant = 0): Uint8ClampedArray {
  const px = new Uint8ClampedArray(w * h * 4);
  const r = rng(7 + variant);
  const cx = w * (0.35 + variant * 0.3);
  const cy = h * 0.45;
  const rad = Math.min(w, h) * 0.22;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      let v = 40 + (180 * y) / h; // 위 어둡고 아래 밝은 하늘·땅
      if ((x - cx) ** 2 + (y - cy) ** 2 < rad * rad) v = 230 - v * 0.5;
      if (x > w * 0.7 && y > h * 0.6) v = 20; // 오른쪽 아래 어두운 건물
      v += (r() - 0.5) * 12; // 질감
      px[i] = v;
      px[i + 1] = v * 0.9;
      px[i + 2] = v * 0.8;
      px[i + 3] = 255;
    }
  }
  return px;
}

/** 박스 평균 축소 (리사이즈 사본 흉내) */
function shrink(src: Uint8ClampedArray, w: number, h: number, f: number) {
  const nw = Math.floor(w / f);
  const nh = Math.floor(h / f);
  const out = new Uint8ClampedArray(nw * nh * 4);
  for (let y = 0; y < nh; y++) {
    for (let x = 0; x < nw; x++) {
      for (let c = 0; c < 4; c++) {
        let s = 0;
        for (let dy = 0; dy < f; dy++)
          for (let dx = 0; dx < f; dx++) s += src[((y * f + dy) * w + x * f + dx) * 4 + c];
        out[(y * nw + x) * 4 + c] = s / (f * f);
      }
    }
  }
  return { px: out, w: nw, h: nh };
}

/** 재압축 흉내 — 픽셀마다 ±noise + 8단계 양자화 */
function degrade(src: Uint8ClampedArray, noise: number, shift = 0) {
  const r = rng(99);
  const out = new Uint8ClampedArray(src.length);
  for (let i = 0; i < src.length; i += 4) {
    for (let c = 0; c < 3; c++) {
      const v = src[i + c] + shift + (r() - 0.5) * 2 * noise;
      out[i + c] = Math.round(v / 8) * 8;
    }
    out[i + 3] = 255;
  }
  return out;
}

describe("perceptual fingerprint", () => {
  const W = 600;
  const H = 400;
  const base = scene(W, H);
  const fp = computePerceptualFingerprint(base, W, H);

  it("형식: pHash 256비트(hex 64) · dHash 64비트(hex 16)", () => {
    expect(fp.phash256).toMatch(HEX_PHASH256);
    expect(fp.dhash64).toMatch(HEX_DHASH64);
    expect(fp.lowInfo).toBe(false);
  });

  it("같은 픽셀이면 항상 같은 지문 (결정적)", () => {
    const again = computePerceptualFingerprint(new Uint8ClampedArray(base), W, H);
    expect(again).toEqual(fp);
  });

  it("크기 변경 사본은 기준 안", () => {
    const s = shrink(base, W, H, 3);
    const f2 = computePerceptualFingerprint(s.px, s.w, s.h);
    expect(hammingHex(fp.phash256, f2.phash256)).toBeLessThanOrEqual(PHASH_MAX_DISTANCE);
    expect(hammingHex(fp.dhash64, f2.dhash64)).toBeLessThanOrEqual(DHASH_MAX_DISTANCE);
  });

  it("재압축(노이즈·양자화)·밝기 조정 사본은 기준 안", () => {
    const f2 = computePerceptualFingerprint(degrade(base, 10, 15), W, H);
    expect(hammingHex(fp.phash256, f2.phash256)).toBeLessThanOrEqual(PHASH_MAX_DISTANCE);
    expect(hammingHex(fp.dhash64, f2.dhash64)).toBeLessThanOrEqual(DHASH_MAX_DISTANCE);
  });

  it("구도가 다른 사진은 기준 밖", () => {
    const other = computePerceptualFingerprint(scene(W, H, 1), W, H);
    const dp = hammingHex(fp.phash256, other.phash256);
    const dd = hammingHex(fp.dhash64, other.dhash64);
    expect(dp > PHASH_MAX_DISTANCE || dd > DHASH_MAX_DISTANCE).toBe(true);
  });

  it("단색 이미지는 저정보량으로 표시", () => {
    const flat = new Uint8ClampedArray(200 * 200 * 4).fill(128);
    expect(computePerceptualFingerprint(flat, 200, 200).lowInfo).toBe(true);
  });

  it("그리드보다 작은 이미지도 계산", () => {
    const tiny = scene(20, 10);
    const f = computePerceptualFingerprint(tiny, 20, 10);
    expect(f.phash256).toMatch(HEX_PHASH256);
  });

  it("골든 벡터 — 형식이 바뀌면 원장 호환이 깨지므로 실패해야 한다", () => {
    expect(fp.phash256).toBe(GOLDEN.phash256);
    expect(fp.dhash64).toBe(GOLDEN.dhash64);
  });

  it("hammingHex", () => {
    expect(hammingHex("00", "ff")).toBe(8);
    expect(hammingHex("a5", "a5")).toBe(0);
    expect(() => hammingHex("0", "00")).toThrow();
  });
});

const GOLDEN = {
  phash256: "cb4924b65b5938d9a4e446c64b43a737a738595838d8b4e658c74b47a737c719",
  dhash64: "8b66e6c2e019c899",
};
