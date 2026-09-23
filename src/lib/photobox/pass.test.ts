import { describe, it, expect } from "vitest";
import {
  generatePhotoboxCode,
  normalizePhotoboxCode,
  maskPhotoboxCode,
  canPaySeat,
  retainUntilFrom,
  COUPONS_PER_PASS,
  PHOTOBOX_PASS_PHOTOS,
} from "./pass";

describe("사진함 패스 코드 (A-108)", () => {
  it("generate: PB-XXXX-XXXX-XXXX, 혼동 문자 없음", () => {
    for (let i = 0; i < 50; i++) {
      const code = generatePhotoboxCode();
      expect(code).toMatch(/^PB-[2-9A-HJKMNP-TV-Z]{4}-[2-9A-HJKMNP-TV-Z]{4}-[2-9A-HJKMNP-TV-Z]{4}$/);
      expect(code.slice(3)).not.toMatch(/[01OILU]/);
    }
  });

  it("normalize: 소문자·공백·하이픈 생략 허용, 왕복 일치", () => {
    expect(normalizePhotoboxCode("pb-a2c4-e6g8-j2k4")).toBe("PB-A2C4-E6G8-J2K4");
    expect(normalizePhotoboxCode("  PB A2C4E6G8 J2K4 ")).toBe("PB-A2C4-E6G8-J2K4");
    const c = generatePhotoboxCode();
    expect(normalizePhotoboxCode(c)).toBe(c);
  });

  it("normalize: 원데이 패스(OP-) 코드·형식 불일치는 거부", () => {
    expect(normalizePhotoboxCode("OP-A2C4-E6G8-J2K4")).toBe("");
    expect(normalizePhotoboxCode("PB-SHORT")).toBe("");
    expect(normalizePhotoboxCode("")).toBe("");
  });

  it("mask: 가운데 그룹 가림", () => {
    expect(maskPhotoboxCode("PB-A2C4-E6G8-J2K4")).toBe("PB-A2C4-****-J2K4");
  });
});

describe("좌석 비용·보관 규칙 (A-108)", () => {
  it("패스 1장 = 100장, 할인권 2장 = 패스 1장", () => {
    expect(PHOTOBOX_PASS_PHOTOS).toBe(100);
    expect(COUPONS_PER_PASS).toBe(2);
  });

  it("canPaySeat: 미등록 패스 1장 이상 또는 할인권 2장 이상 (할인권 1장은 불가 — 혼합 금지)", () => {
    expect(canPaySeat({ unusedPasses: 1, reservedPasses: 0, coupons: 0 })).toBe(true);
    expect(canPaySeat({ unusedPasses: 0, reservedPasses: 0, coupons: 2 })).toBe(true);
    expect(canPaySeat({ unusedPasses: 0, reservedPasses: 0, coupons: 1 })).toBe(false);
    expect(canPaySeat({ unusedPasses: 0, reservedPasses: 3, coupons: 1 })).toBe(false); // 예약 중인 패스는 쓸 수 없음
  });

  it("retainUntilFrom: 등록 시각 + 5년", () => {
    const d = new Date("2026-09-23T10:00:00Z");
    expect(retainUntilFrom(d).toISOString()).toBe("2031-09-23T10:00:00.000Z");
    expect(d.toISOString()).toBe("2026-09-23T10:00:00.000Z"); // 원본 불변
  });
});
