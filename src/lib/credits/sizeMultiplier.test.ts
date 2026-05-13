import { describe, it, expect } from "vitest";
import { getProofMultiplier } from "./sizeMultiplier";

describe("getProofMultiplier", () => {
  it("returns 1 for images with longest side <= 1800", () => {
    expect(getProofMultiplier(1800, 1200)).toBe(1);
    expect(getProofMultiplier(1200, 1800)).toBe(1);
    expect(getProofMultiplier(1800, 1800)).toBe(1);
    expect(getProofMultiplier(800, 600)).toBe(1);
    expect(getProofMultiplier(1, 1)).toBe(1);
  });

  it("returns 2 for images with longest > 1800 but pixels <= 100M", () => {
    // 1801×1800 = 3.2MP — 1801px가 임계 초과
    expect(getProofMultiplier(1801, 1800)).toBe(2);
    // 4K: 3840×2160 = 8.3MP
    expect(getProofMultiplier(3840, 2160)).toBe(2);
    // iPhone 50MP: 8160×6120 = 49.9MP
    expect(getProofMultiplier(8160, 6120)).toBe(2);
    // 정확히 100MP: 10000×10000 = 100MP — 경계 (≤100M이므로 2×)
    expect(getProofMultiplier(10000, 10000)).toBe(2);
  });

  it("returns 3 for images with pixels > 100M", () => {
    // 100MP + 1
    expect(getProofMultiplier(10001, 10000)).toBe(3);
    // 200MP Samsung Galaxy: 16320×12240 = 200MP
    expect(getProofMultiplier(16320, 12240)).toBe(3);
    // gigapixel: 50000×30000 = 1.5GP
    expect(getProofMultiplier(50000, 30000)).toBe(3);
  });

  it("handles narrow/tall aspect ratios", () => {
    // 100×100000 = 10MP, 긴 변 100000 > 1800 → 2×
    expect(getProofMultiplier(100, 100000)).toBe(2);
    // 100000×100 = 같은 동작
    expect(getProofMultiplier(100000, 100)).toBe(2);
  });
});
