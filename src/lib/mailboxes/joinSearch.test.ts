import { describe, expect, it } from "vitest";
import { MAILBOX_ID_RE, likePrefixPattern } from "./joinSearch";

describe("A-83 join search", () => {
  it("likePrefixPattern — 와일드카드 이스케이프·접두어", () => {
    expect(likePrefixPattern("현장A")).toBe("현장A%");
    expect(likePrefixPattern("%")).toBe("\\%%");
    expect(likePrefixPattern("a_b")).toBe("a\\_b%");
    expect(likePrefixPattern("a\\b")).toBe("a\\\\b%");
    expect(likePrefixPattern("*")).toBe("%"); // `*`는 제거 → 빈 접두어(=전체)지만 limit 10 + 마스킹으로 노출 제한
    expect(likePrefixPattern("100%_*")).toBe("100\\%\\_%");
  });
  it("MAILBOX_ID_RE — 번호 형식", () => {
    expect(MAILBOX_ID_RE.test("MB-1001")).toBe(true);
    expect(MAILBOX_ID_RE.test("mb-1001")).toBe(true);
    expect(MAILBOX_ID_RE.test("MB-")).toBe(false);
    expect(MAILBOX_ID_RE.test("MB-10%")).toBe(false);
    expect(MAILBOX_ID_RE.test("현장")).toBe(false);
  });
});
