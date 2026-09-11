// 사서함 확인서 PDF 스모크 (2026-09-11 A-87) — 장문·긴 URL(문자 단위 줄바꿈)·제목 maxLines·시간대 라벨·잘림 고지가 렌더를 깨지 않는지,
// 그리고 시간대 검증 헬퍼. 썸네일 fetch는 하지 않는다(buildReportData는 네트워크 필요 → 여기서는 렌더 계층만).
import { describe, expect, it } from "vitest";
import { renderMailboxReportPdf, type MailboxReportData } from "@oripics/certificate";

import { safeTimeZone } from "./report";

const TINY_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

function data(over: Partial<MailboxReportData> = {}): MailboxReportData {
  const at = new Date("2026-09-11T03:00:00Z");
  return {
    mailboxId: "MB-1001",
    mailboxName: "현장A".repeat(30),
    reportTitle: "아주긴제목".repeat(20),
    description: "공백없는장문".repeat(80) + " https://www.ori.pics/" + "x".repeat(300),
    ownerName: "손용석",
    createdAt: at,
    status: "active",
    basis: "live",
    basisAt: at,
    issuedAt: at,
    issuedTo: "손용석",
    members: [{ name: "손용석", role: "시공", kind: "owner", acceptedAt: at, state: "active", photoCount: 2 }],
    photos: [1, 2].map((no) => ({
      no, thumbDataUrl: no === 1 ? TINY_PNG : null, capturedAt: at, publishedAt: at, lat: 37.1, lng: 127.1, tier: "verified" as const,
      linkUrl: `https://www.ori.pics/P260911-000000-${"0".repeat(60)}${no}`, qrDataUrl: TINY_PNG, uploader: "이철수", uploaderRole: "임차인",
      unread: 1, total: 2, memo: "메모".repeat(200), source: "capture" as const,
    })),
    ...over,
  };
}

describe("mailbox report pdf", () => {
  it("renders long text / long URLs / truncation notices without throwing", async () => {
    const buf = await renderMailboxReportPdf({ data: data({ photoTotal: 700, thumbLimit: 1 }), locale: "ko" });
    expect(buf.length).toBeGreaterThan(1000);
    expect(buf.subarray(0, 5).toString()).toBe("%PDF-");
    const en = await renderMailboxReportPdf({ data: data({ timeZone: "UTC" }), locale: "en" });
    expect(en.subarray(0, 5).toString()).toBe("%PDF-");
  }, 60_000);
});

describe("safeTimeZone", () => {
  it("falls back to Asia/Seoul for empty or invalid values", () => {
    expect(safeTimeZone(null)).toBe("Asia/Seoul");
    expect(safeTimeZone("Not/AZone")).toBe("Asia/Seoul");
    expect(safeTimeZone("UTC")).toBe("UTC");
    expect(safeTimeZone("America/New_York")).toBe("America/New_York");
  });
});
