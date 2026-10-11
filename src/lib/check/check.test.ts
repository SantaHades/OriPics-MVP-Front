import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { summarizeC2pa, EMPTY_C2PA } from "./c2paSummary";
import { summarizeExif, EMPTY_EXIF } from "./exifSummary";
import { buildFindings } from "./findings";

const sample = (f: string) => JSON.parse(fs.readFileSync(path.resolve(__dirname, "../../../docs", f), "utf8"));

describe("summarizeC2pa", () => {
  it("매니페스트 없음", () => {
    expect(summarizeC2pa({})).toEqual(EMPTY_C2PA);
    expect(summarizeC2pa(null).present).toBe(false);
  });

  it("Pixel 촬영 → OriPics 인증 (trusted, 이력 1단계)", () => {
    const s = summarizeC2pa(sample("sample-oripics-with-ingredient-manifest.json"));
    expect(s.present).toBe(true);
    expect(s.state).toBe("trusted");
    expect(s.active?.isOriPics).toBe(true);
    expect(s.history).toHaveLength(1);
    expect(s.history[0].signer).toBe("Google LLC");
    expect(s.history[0].signerName).toBe("Pixel Camera");
    expect(s.captured).toBe(true); // computationalCapture
    expect(s.aiGenerated).toBe(false);
    expect(s.edited).toBe(false);
  });

  it("validation_state Valid → 신뢰 목록 외", () => {
    expect(summarizeC2pa(sample("sample-oripics-with-ingredient-validation-trusted.json")).state).toBe("valid");
  });

  it("AI 생성·AI 편집·편집 액션", () => {
    const mk = (actions: any[]) => ({
      active_manifest: "m", validation_state: "Trusted",
      manifests: { m: { claim_generator_info: [{ name: "Adobe Firefly" }], signature_info: { issuer: "Adobe Inc." }, assertions: [{ label: "c2pa.actions.v2", data: { actions } }] } },
    });
    expect(summarizeC2pa(mk([{ action: "c2pa.created", digitalSourceType: "http://cv.iptc.org/newscodes/digitalsourcetype/trainedAlgorithmicMedia" }])).aiGenerated).toBe(true);
    const edited = summarizeC2pa(mk([{ action: "c2pa.edited", digitalSourceType: "http://cv.iptc.org/newscodes/digitalsourcetype/compositeWithTrainedAlgorithmicMedia" }]));
    expect(edited.aiEdited).toBe(true);
    expect(edited.edited).toBe(true);
  });

  it("검증 실패 코드 → invalid", () => {
    const s = summarizeC2pa({
      active_manifest: "m", validation_state: "Invalid",
      validation_results: { activeManifest: { failure: [{ code: "assertion.dataHash.mismatch" }] } },
      manifests: { m: { assertions: [] } },
    });
    expect(s.state).toBe("invalid");
    expect(s.failureCodes).toEqual(["assertion.dataHash.mismatch"]);
  });
});

describe("summarizeExif", () => {
  it("없음", () => {
    expect(summarizeExif(undefined)).toEqual(EMPTY_EXIF);
    expect(summarizeExif({}).present).toBe(false);
  });

  it("기기·시각·GPS·나중 저장·편집 앱", () => {
    const e = summarizeExif({
      Make: "samsung", Model: "SM-S928N", Software: "Adobe Photoshop Lightroom 9.2",
      DateTimeOriginal: new Date("2026-10-01T10:00:00Z"), ModifyDate: new Date("2026-10-02T09:00:00Z"),
      latitude: 37.5, longitude: 127.0,
    });
    expect(e.present).toBe(true);
    expect(e.hasGps).toBe(true);
    expect(e.savedLater).toBe(true);
    expect(e.editorHint?.toLowerCase()).toBe("photoshop");
  });

  it("AI 도구·IPTC AI 표기", () => {
    expect(summarizeExif({ Software: "Midjourney v7" }).aiHint).toBe("Midjourney");
    expect(summarizeExif({ DigitalSourceType: "http://cv.iptc.org/newscodes/digitalsourcetype/trainedAlgorithmicMedia", Make: "x" }).aiHint).toBe("IPTC DigitalSourceType");
  });

  it("EXIF 문자열 날짜(YYYY:MM:DD)", () => {
    expect(summarizeExif({ DateTimeOriginal: "2026:10:01 10:00:00", Make: "Apple" }).capturedAt?.getFullYear()).toBe(2026);
  });
});

describe("buildFindings", () => {
  it("아무 기록 없음 → 정보성 2건만 (단정 없음)", () => {
    const f = buildFindings(EMPTY_C2PA, EMPTY_EXIF);
    expect(f.map((x) => x.code)).toEqual(["c2pa_none", "exif_none"]);
    expect(f.every((x) => x.tone === "info")).toBe(true);
  });

  it("Pixel → OriPics 체인", () => {
    const f = buildFindings(summarizeC2pa(sample("sample-oripics-with-ingredient-manifest.json")), EMPTY_EXIF);
    expect(f.map((x) => x.code)).toEqual(["c2pa_trusted", "c2pa_history", "exif_none"]);
    const chain = f.find((x) => x.code === "c2pa_history") as any;
    expect(chain.chain).toContain("Pixel Camera");
  });

  it("OriPics 매니페스트는 검증 카드와 중복이면 생략", () => {
    const f = buildFindings(summarizeC2pa(sample("sample-oripics-with-ingredient-manifest.json")), EMPTY_EXIF, { skipC2paTrusted: true });
    expect(f.some((x) => x.code === "c2pa_trusted")).toBe(false);
  });
});
