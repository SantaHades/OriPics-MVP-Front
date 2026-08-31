import { describe, it, expect } from "vitest";
import { generatePassCode, normalizePassCode, maskPassCode } from "./dayPass";

describe("dayPass code helpers (A-60)", () => {
  it("generatePassCode: OP-XXXX-XXXX-XXXX, 혼동 문자(0/1/O/I/L/U) 없음", () => {
    for (let i = 0; i < 50; i++) {
      const code = generatePassCode();
      expect(code).toMatch(/^OP-[2-9A-HJKMNP-TV-Z]{4}-[2-9A-HJKMNP-TV-Z]{4}-[2-9A-HJKMNP-TV-Z]{4}$/);
      // 혼동 문자 검사는 랜덤 본문만 (OP- 접두사의 O는 고정 표기)
      expect(code.slice(3)).not.toMatch(/[01OILU]/);
    }
  });

  it("normalizePassCode: 소문자·하이픈 생략·공백 허용", () => {
    expect(normalizePassCode("op-a2c4-e6g8-j2k4")).toBe("OP-A2C4-E6G8-J2K4");
    expect(normalizePassCode("OPA2C4E6G8J2K4")).toBe("OP-A2C4-E6G8-J2K4");
    expect(normalizePassCode("  op a2c4 e6g8 j2k4 ")).toBe("OP-A2C4-E6G8-J2K4");
    expect(normalizePassCode(generatePassCode())).toMatch(/^OP-/);
  });

  it("normalizePassCode: 형식 불일치는 빈 문자열", () => {
    expect(normalizePassCode("")).toBe("");
    expect(normalizePassCode("OP-SHORT")).toBe("");
    expect(normalizePassCode("완전히다른문자열")).toBe("");
  });

  it("maskPassCode: 가운데 그룹 마스킹", () => {
    expect(maskPassCode("OP-A2C4-E6G8-J2K4")).toBe("OP-A2C4-****-J2K4");
  });

  it("normalize(generate()) 왕복 일치", () => {
    const code = generatePassCode();
    expect(normalizePassCode(code)).toBe(code);
  });
});
