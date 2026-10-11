// 사진 검사 결과 → "확인된 점" 목록 (2026-10-01 검증 레이어 2단계)
// 원칙: 단정하지 않는다. 진짜/가짜 대신 "무엇이 기록돼 있고 무엇이 없는지"만 말한다.
// 문구는 페이지(ko/en)에서 code로 고른다.
import type { C2paSummary } from "./c2paSummary";
import type { ExifSummary } from "./exifSummary";

export type FindingTone = "positive" | "caution" | "info";

export type Finding =
  | { code: "c2pa_none"; tone: "info" }
  | { code: "c2pa_trusted"; tone: "positive"; signer: string; captured: boolean; at: string | null }
  | { code: "c2pa_untrusted"; tone: "info"; signer: string }
  | { code: "c2pa_invalid"; tone: "caution" }
  | { code: "c2pa_ai_generated"; tone: "caution" }
  | { code: "c2pa_ai_edited"; tone: "caution" }
  | { code: "c2pa_edited"; tone: "info"; tools: string }
  | { code: "c2pa_history"; tone: "info"; chain: string }
  | { code: "exif_none"; tone: "info" }
  | { code: "exif_device"; tone: "info"; device: string; at: Date | null }
  | { code: "exif_editor"; tone: "caution"; tool: string }
  | { code: "exif_ai"; tone: "caution"; tool: string }
  | { code: "exif_saved_later"; tone: "info"; at: Date }
  | { code: "exif_gps"; tone: "info" };

function signerLabel(b: { signer: string | null; signerName: string | null; generator: string | null }): string {
  const parts = [b.signer, b.signerName].filter(Boolean);
  return parts.length ? parts.join(" · ") : b.generator ?? "?";
}

export function buildFindings(c2pa: C2paSummary, exif: ExifSummary, opts: { skipC2paTrusted?: boolean } = {}): Finding[] {
  const out: Finding[] = [];

  if (!c2pa.present) {
    out.push({ code: "c2pa_none", tone: "info" });
  } else if (c2pa.active) {
    if (c2pa.state === "invalid") out.push({ code: "c2pa_invalid", tone: "caution" });
    else if (c2pa.state === "trusted") {
      // OriPics 자체 매니페스트는 위쪽 OriPics 검증 카드가 이미 설명 → 중복 표시 생략 가능
      if (!(opts.skipC2paTrusted && c2pa.active.isOriPics)) {
        out.push({ code: "c2pa_trusted", tone: "positive", signer: signerLabel(c2pa.active), captured: c2pa.captured, at: c2pa.active.signedAt });
      }
    } else out.push({ code: "c2pa_untrusted", tone: "info", signer: signerLabel(c2pa.active) });

    if (c2pa.aiGenerated) out.push({ code: "c2pa_ai_generated", tone: "caution" });
    else if (c2pa.aiEdited) out.push({ code: "c2pa_ai_edited", tone: "caution" });
    if (c2pa.edited) {
      const tools = [c2pa.active, ...c2pa.history].filter((b) => b.actions.some((a) => /edited|adjust|crop|filter|drawing/.test(a)))
        .map((b) => b.generator ?? b.signer).filter(Boolean).join(", ");
      out.push({ code: "c2pa_edited", tone: "info", tools: tools || "?" });
    }
    if (c2pa.history.length) {
      out.push({ code: "c2pa_history", tone: "info", chain: [...c2pa.history.map(signerLabel), signerLabel(c2pa.active)].join(" → ") });
    }
  }

  if (!exif.present) {
    out.push({ code: "exif_none", tone: "info" });
  } else {
    const device = [exif.make, exif.model].filter(Boolean).join(" ");
    if (device || exif.capturedAt) out.push({ code: "exif_device", tone: "info", device: device || "?", at: exif.capturedAt });
    if (exif.aiHint) out.push({ code: "exif_ai", tone: "caution", tool: exif.aiHint });
    if (exif.editorHint) out.push({ code: "exif_editor", tone: "caution", tool: exif.editorHint });
    if (exif.savedLater && exif.modifiedAt) out.push({ code: "exif_saved_later", tone: "info", at: exif.modifiedAt });
    if (exif.hasGps) out.push({ code: "exif_gps", tone: "info" });
  }
  return out;
}
