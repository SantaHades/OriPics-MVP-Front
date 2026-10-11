// EXIF·XMP 요약 (2026-10-01 검증 레이어 2단계) — exifr.parse 결과를 사실 위주로 정리한다.
// EXIF는 누구나 고칠 수 있는 기록이라 증거가 아니라 "참고 정보"로만 보여 준다.

type AnyRecord = Record<string, any>;

const IPTC_AI = /trainedAlgorithmicMedia|compositeWithTrainedAlgorithmicMedia|algorithmicMedia|compositeSynthetic/i;
/** 편집·보정 앱 흔적 (Software·CreatorTool·HistorySoftwareAgent) */
const EDITOR_HINT =
  /photoshop|lightroom|snapseed|gimp|canva|picsart|meitu|snow|b612|vsco|facetune|pixlr|affinity|capture one|luminar|photoroom|remini|faceapp|epik|foodie|ulike|soda/i;
/** AI 생성 서비스 흔적 */
const AI_TOOL_HINT = /midjourney|dall[·.\- ]?e|stable diffusion|firefly|imagen|gemini|chatgpt|openai|leonardo|ideogram|flux|nano.?banana/i;

export interface ExifSummary {
  present: boolean;
  make: string | null;
  model: string | null;
  software: string | null;
  capturedAt: Date | null; // DateTimeOriginal
  modifiedAt: Date | null; // ModifyDate
  hasGps: boolean;
  /** 촬영 이후 다른 시각에 저장된 기록 (60초 이상 차이) */
  savedLater: boolean;
  editorHint: string | null;
  aiHint: string | null;
}

export const EMPTY_EXIF: ExifSummary = {
  present: false, make: null, model: null, software: null, capturedAt: null, modifiedAt: null,
  hasGps: false, savedLater: false, editorHint: null, aiHint: null,
};

function str(v: unknown): string | null {
  if (typeof v === "string" && v.trim()) return v.trim();
  if (Array.isArray(v)) return v.map((x) => str(x)).filter(Boolean).join(", ") || null;
  if (v && typeof v === "object" && typeof (v as AnyRecord).value === "string") return str((v as AnyRecord).value);
  return null;
}

function date(v: unknown): Date | null {
  if (v instanceof Date && !isNaN(v.getTime())) return v;
  if (typeof v === "string") {
    const d = new Date(v.replace(/^(\d{4}):(\d{2}):(\d{2})/, "$1-$2-$3"));
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}

/** exifr.parse(..., { xmp: true, iptc: true }) 결과 → 요약 */
export function summarizeExif(raw: unknown): ExifSummary {
  if (!raw || typeof raw !== "object") return EMPTY_EXIF;
  const e = raw as AnyRecord;
  const make = str(e.Make);
  const model = str(e.Model);
  const software = str(e.Software) ?? str(e.CreatorTool);
  const capturedAt = date(e.DateTimeOriginal) ?? date(e.CreateDate);
  const modifiedAt = date(e.ModifyDate);
  const hasGps = typeof e.latitude === "number" || e.GPSLatitude != null;

  const textBlob = [software, str(e.CreatorTool), str(e.HistorySoftwareAgent), str(e.Credit), str(e.DigitalSourceType), str(e.Description), str(e.ImageDescription)]
    .filter(Boolean)
    .join(" | ");
  const editor = textBlob.match(EDITOR_HINT)?.[0] ?? null;
  const ai = (IPTC_AI.test(textBlob) ? "IPTC DigitalSourceType" : null) ?? textBlob.match(AI_TOOL_HINT)?.[0] ?? null;

  const present = !!(make || model || software || capturedAt || modifiedAt || hasGps);
  return {
    present,
    make,
    model,
    software,
    capturedAt,
    modifiedAt,
    hasGps,
    savedLater: !!(capturedAt && modifiedAt && Math.abs(modifiedAt.getTime() - capturedAt.getTime()) > 60_000),
    editorHint: editor,
    aiHint: ai,
  };
}
