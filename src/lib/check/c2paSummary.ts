// C2PA 매니페스트 요약 (2026-10-01 검증 레이어 2단계, strategy-verification-layer.md §2단계)
// 브라우저(c2pa-web)·서버(c2pa-node) 어느 쪽 결과든 c2pa-rs Reader JSON 형태라 같은 함수로 해석한다.
// 결과는 "확인된 사실"만 담는다 — 진짜/가짜 판정을 만들지 않는다.

const IPTC = "http://cv.iptc.org/newscodes/digitalsourcetype/";

/** AI 생성 (전부 생성) */
const AI_GENERATED = ["trainedAlgorithmicMedia", "algorithmicMedia"];
/** AI 합성·편집 (일부 생성) */
const AI_COMPOSITE = ["compositeWithTrainedAlgorithmicMedia", "compositeSynthetic", "algorithmicallyEnhanced"];
/** 기기 촬영 */
const CAPTURE = ["digitalCapture", "computationalCapture", "negativeFilm", "positiveFilm", "print"];

type AnyRecord = Record<string, any>;

export interface C2paManifestBrief {
  label: string;
  signer: string | null; // signature_info.issuer
  signerName: string | null; // signature_info.common_name
  signedAt: string | null; // signature_info.time (TSA)
  generator: string | null; // claim_generator_info[0].name 또는 claim_generator
  actions: string[]; // c2pa.created, c2pa.edited ...
  sourceTypes: string[]; // IPTC digitalSourceType 끝단어
  isOriPics: boolean;
}

export interface C2paSummary {
  present: boolean;
  /** Trusted = 서명 유효 + 신뢰 목록 / Valid = 서명 유효(목록 외) / Invalid = 변조·손상 */
  state: "trusted" | "valid" | "invalid" | null;
  active: C2paManifestBrief | null;
  /** 이전 단계(재료) 매니페스트 — 예: Pixel 촬영 → OriPics 인증 */
  history: C2paManifestBrief[];
  aiGenerated: boolean;
  aiEdited: boolean;
  captured: boolean;
  edited: boolean;
  failureCodes: string[];
}

export const EMPTY_C2PA: C2paSummary = {
  present: false, state: null, active: null, history: [],
  aiGenerated: false, aiEdited: false, captured: false, edited: false, failureCodes: [],
};

function sourceTypeTail(v: unknown): string | null {
  if (typeof v !== "string" || !v) return null;
  return v.startsWith(IPTC) ? v.slice(IPTC.length) : v.split("/").pop() || v;
}

function brief(label: string, m: AnyRecord): C2paManifestBrief {
  const actions: string[] = [];
  const sourceTypes: string[] = [];
  for (const a of (m.assertions ?? []) as AnyRecord[]) {
    if (typeof a?.label !== "string") continue;
    if (a.label.startsWith("c2pa.actions")) {
      for (const act of (a.data?.actions ?? []) as AnyRecord[]) {
        if (typeof act?.action === "string") actions.push(act.action);
        const st = sourceTypeTail(act?.digitalSourceType);
        if (st) sourceTypes.push(st);
      }
    }
  }
  const sig = (m.signature_info ?? {}) as AnyRecord;
  const genInfo = Array.isArray(m.claim_generator_info) ? m.claim_generator_info[0] : null;
  const generator =
    (typeof genInfo?.name === "string" && genInfo.name) || (typeof m.claim_generator === "string" && m.claim_generator) || null;
  const isOriPics =
    (m.assertions ?? []).some((a: AnyRecord) => typeof a?.label === "string" && a.label.startsWith("com.oripics.")) ||
    sig.issuer === "OriPics" || /oripics/i.test(String(generator ?? ""));
  return {
    label,
    signer: typeof sig.issuer === "string" ? sig.issuer : null,
    signerName: typeof sig.common_name === "string" ? sig.common_name : null,
    signedAt: typeof sig.time === "string" ? sig.time : null,
    generator,
    actions,
    sourceTypes,
    isOriPics,
  };
}

/** c2pa-rs Reader JSON → 요약. 매니페스트가 없으면 EMPTY_C2PA */
export function summarizeC2pa(store: unknown): C2paSummary {
  const s = (store && typeof store === "object" ? store : {}) as AnyRecord;
  const manifests = (s.manifests ?? {}) as Record<string, AnyRecord>;
  const activeLabel = typeof s.active_manifest === "string" ? s.active_manifest : null;
  if (!activeLabel || !manifests[activeLabel]) return EMPTY_C2PA;

  const active = brief(activeLabel, manifests[activeLabel]);
  const history = Object.entries(manifests)
    .filter(([k]) => k !== activeLabel)
    .map(([k, m]) => brief(k, m));

  const vs = String(s.validation_state ?? "").toLowerCase();
  const failureCodes = ((s.validation_results?.activeManifest?.failure ?? []) as AnyRecord[])
    .map((f) => f?.code)
    .filter((c): c is string => typeof c === "string");
  const state: C2paSummary["state"] =
    vs === "trusted" ? "trusted" : vs === "valid" ? "valid" : vs === "invalid" ? "invalid" : failureCodes.length ? "invalid" : "valid";

  const all = [active, ...history];
  const types = all.flatMap((b) => b.sourceTypes);
  return {
    present: true,
    state,
    active,
    history,
    aiGenerated: types.some((t) => AI_GENERATED.includes(t)),
    aiEdited: types.some((t) => AI_COMPOSITE.includes(t)),
    captured: types.some((t) => CAPTURE.includes(t)),
    edited: all.some((b) => b.actions.some((a) => /^c2pa\.(edited|color_adjustments|cropped|filtered|drawing|resized|transcoded)/.test(a))),
    failureCodes,
  };
}
