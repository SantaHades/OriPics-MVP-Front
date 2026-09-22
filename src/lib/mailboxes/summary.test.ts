// (2026-09-13 A-98) 사진함 요약 산식·변경 감지
import { describe, expect, it } from "vitest";

import { summarize, summaryChanged } from "./summary";

describe("summarize", () => {
  it("unread_total = photo_count - 내 열람 수", () => {
    expect(summarize(12, 5, "2026-09-13T01:00:00Z")).toEqual({ photo_count: 12, unread_total: 7, latest_at: "2026-09-13T01:00:00Z" });
  });
  it("빈 사진함·null 입력은 0/null", () => {
    expect(summarize(null, null, undefined)).toEqual({ photo_count: 0, unread_total: 0, latest_at: null });
  });
  it("열람 수가 사진 수를 넘어도 음수로 내려가지 않음", () => {
    expect(summarize(3, 9, null).unread_total).toBe(0);
    expect(summarize(-1, -4, null)).toEqual({ photo_count: 0, unread_total: 0, latest_at: null });
  });
});

describe("summaryChanged", () => {
  const base = { photo_count: 4, unread_total: 1, latest_at: "2026-09-13T00:00:00Z" };
  it("이전 값 없음 → 변경", () => expect(summaryChanged(null, base)).toBe(true));
  it("동일 → 변경 없음", () => expect(summaryChanged({ ...base }, base)).toBe(false));
  it("사진 수·미열람·최신 시각 중 하나라도 다르면 변경", () => {
    expect(summaryChanged(base, { ...base, photo_count: 5 })).toBe(true);
    expect(summaryChanged(base, { ...base, unread_total: 0 })).toBe(true);
    expect(summaryChanged(base, { ...base, latest_at: "2026-09-13T00:00:01Z" })).toBe(true);
  });
});
