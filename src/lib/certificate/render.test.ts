// 증명서 PDF 렌더 스모크 테스트 (2026-08-28) — 프로덕션 "render_failed:
// Minified React error #31" 재현·회귀 방지용. 렌더 파이프라인(react-pdf ↔ React
// 사본 일치, 폰트 등록 포함)이 실제 PDF 바이트를 내는지 확인한다.
import { describe, expect, it } from "vitest";
import { renderCertificatePdf, type CertificateData } from "@oripics/certificate";

// 1×1 투명 PNG
const TINY_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

const data: CertificateData = {
  linkId: "P260828-000000-000000",
  capturedAt: new Date("2026-08-28T10:00:00+09:00"),
  sourceCode: "P",
  width: 4032,
  height: 3024,
  lat: 37.123456,
  lng: 127.123456,
  issuedTo: "손용석 (timson9717@gmail.com)",
  deviceCapturedAt: new Date("2026-08-28T09:00:00+09:00"),
  publishedAt: new Date("2026-08-28T12:00:00+09:00"),
  imageDataUrl: TINY_PNG,
  issuedAt: new Date("2026-08-28T17:00:00+09:00"),
  verifyUrl: "https://www.ori.pics/P260828-000000-000000",
  qrDataUrl: TINY_PNG,
  c2pa: { present: true, valid: false, issuer: "OriPics Sandbox CA", claimGenerator: "OriPics/1.0" },
  // 기기 검증 상세 섹션 (2026-08-29) — verified 렌더 경로 회귀 방지 (전 필드 최악 케이스)
  tier: "verified",
  verifiedDetail: {
    platform: "ios",
    zoomFactor: 1.0,
    lensPosition: "ultra-wide",
    attestTokenHash: "a1b2c3d4e5f60718293a4b5c6d7e8f90",
    deviceIntegrity: "passed",
    deviceModel: "iPhone 12 Pro Max",
    osVersion: "18.5",
    appVersion: "1.0.0",
    iso: 100,
    exposureTime: 1 / 120,
    fNumber: 1.6,
    focalLength: 5.1,
    stampVersion: 5,
  },
};

describe("certificate PDF render", () => {
  it("renders a PDF buffer for ko and en", async () => {
    for (const locale of ["ko", "en"] as const) {
      const buf = await renderCertificatePdf({ data, locale });
      expect(buf.length).toBeGreaterThan(1000);
      expect(buf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    }
  // 로컬(인텔 맥) 렌더는 로케일당 ~20초 — 짧은 타임아웃은 가짜 실패 (2026-08-28 실측)
  }, 180000);
});
