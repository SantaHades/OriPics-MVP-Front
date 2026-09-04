"use client";

// C2PA 적합 제품 목록(CPL) OriPics 레코드 팝업 (2026-09-04 대표 요청).
// 배경: 히어로 '바로보기'가 C2PA Conformance Explorer(?q=OriPics)로 가면 카드에서
// "View Details"를 한 번 더 눌러야 상세가 보임. Explorer는 레코드 상세를 여는 URL
// 파라미터가 없어(번들 실측: q·o·type·status·assurance·cn·ou·c 필터만) 우리 페이지에서
// 공식 CPL JSON(raw.githubusercontent, CORS *)을 실시간으로 읽어 같은 구성으로 먼저 보여주고,
// "C2PA 홈페이지 공식 목록에서 확인" 버튼으로 Explorer를 연다. 조회 실패 시 사본(SNAPSHOT)으로 폴백.
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useParams } from "next/navigation";
import { X, ExternalLink, ShieldCheck, FileText, Clock, Image as ImageIcon, CheckCircle2, Link as LinkIcon } from "lucide-react";

export const ORIPICS_CPL_RECORD_ID = "019e4988-947c-72f8-8675-22eac83e1904";
export const C2PA_EXPLORER_ORIPICS_URL = "https://spec.c2pa.org/conformance-explorer/?q=OriPics";
const CPL_JSON_URL =
  "https://raw.githubusercontent.com/c2pa-org/conformance-public/refs/heads/main/conforming-products/conforming-products-list.json";

type CplRecord = {
  recordId: string;
  applicant: string;
  supportsCompressedManifests?: boolean;
  status: string;
  product: {
    productType: string;
    DN: { CN: string; O: string; OU?: string; C: string };
    infoURL?: string;
    minVersion?: string;
    assurance?: { maxAssuranceLevel?: number; attestationMethods?: string[] };
  };
  specVersion?: string[];
  conformanceProgramVersion?: string;
  containers?: {
    generate?: Record<string, string[]>;
    validate?: Record<string, string[]>;
  };
  dates?: { creation?: string; conformance?: string; earliestPublicDisclosure?: string; lastModification?: string };
};

// 2026-09-04 CPL 사본 (실시간 조회 실패 시 표시) — 실 레코드와 동일 값
const SNAPSHOT: CplRecord = {
  recordId: ORIPICS_CPL_RECORD_ID,
  applicant: "SantaHades Co., Ltd.",
  supportsCompressedManifests: false,
  status: "conformant",
  product: {
    productType: "generatorProduct",
    DN: { CN: "OriPics", O: "SantaHades Co., Ltd.", OU: "", C: "KR" },
    minVersion: "1.0.0",
    assurance: { maxAssuranceLevel: 1, attestationMethods: ["Google_PlayIntegrity", "Apple_AppAttest"] },
  },
  specVersion: ["2.2"],
  conformanceProgramVersion: "0.1",
  containers: { generate: { image: ["image/png"] }, validate: { image: ["image/png"] } },
  dates: { creation: "2026-05-21", conformance: "2026-06-23", earliestPublicDisclosure: "2026-06-01", lastModification: "2026-08-05" },
};
const SNAPSHOT_DATE = "2026-09-04";

const T = {
  ko: {
    intro: "C2PA 적합성 프로그램의 공식 적합 제품 목록(Conforming Products List)에 등재된 OriPics 레코드입니다.",
    live: "C2PA 공식 목록에서 실시간으로 읽어왔습니다.",
    snapshot: `공식 목록 실시간 조회에 실패해 ${SNAPSHOT_DATE} 기준 사본을 표시합니다.`,
    loading: "C2PA 공식 목록을 읽는 중…",
    generator: "Generator",
    validator: "Validator",
    conformant: "Conformant · 적합",
    recordId: "레코드 ID",
    infoUrl: "제품 정보 URL",
    specTitle: "규격 · 프로그램",
    spec: "지원 C2PA 규격",
    program: "적합성 프로그램 버전",
    minVersion: "최소 적용 제품 버전",
    assuranceTitle: "보안 보증 · 기기 증명",
    level: "최대 보증 등급",
    levelSuffix: "Level",
    attest: "기기 증명 방식",
    containersTitle: "지원 파일 형식",
    compressed: "압축 매니페스트 지원",
    yes: "예",
    no: "아니오",
    generate: "인증(서명) 생성",
    validate: "검증",
    datesTitle: "레코드 이력",
    conformanceDate: "적합 판정일",
    creationDate: "레코드 생성일",
    modifiedDate: "최종 수정일",
    officialBtn: "C2PA 홈페이지 공식 목록에서 확인",
    close: "닫기",
    ariaClose: "닫기",
  },
  en: {
    intro: "The OriPics record on the C2PA Conformance Program's official Conforming Products List.",
    live: "Fetched live from the official C2PA list.",
    snapshot: `Live lookup failed — showing a copy as of ${SNAPSHOT_DATE}.`,
    loading: "Loading the official C2PA list…",
    generator: "Generator",
    validator: "Validator",
    conformant: "Conformant",
    recordId: "Record ID",
    infoUrl: "Product Info URL",
    specTitle: "Specification & Program",
    spec: "Supported C2PA spec(s)",
    program: "Conformance program version",
    minVersion: "Minimum eligible product version",
    assuranceTitle: "Security Assurance & Attestation",
    level: "Max assurance level",
    levelSuffix: "Level",
    attest: "Attestation methods",
    containersTitle: "Supported Media Containers",
    compressed: "Supports compressed manifests",
    yes: "Yes",
    no: "No",
    generate: "Claim generation",
    validate: "Claim validation",
    datesTitle: "Record Lifecycle",
    conformanceDate: "Conformance date",
    creationDate: "Creation date",
    modifiedDate: "Last modified",
    officialBtn: "Verify on the official C2PA list",
    close: "Close",
    ariaClose: "Close",
  },
};

const ATTEST_LABEL: Record<string, string> = {
  Google_PlayIntegrity: "Google Play Integrity",
  Apple_AppAttest: "Apple App Attest",
};

function mimeToExt(m: string) {
  return m.replace(/^[a-z]+\//, "").replace("jpeg", "jpg");
}

function formatDn(dn: CplRecord["product"]["DN"]) {
  return [`CN=${dn.CN}`, dn.OU ? `OU=${dn.OU}` : "", `O=${dn.O}`, `C=${dn.C}`].filter(Boolean).join(", ");
}

export default function C2paRecordModal({
  label,
  title,
  className,
}: {
  label: string;
  title?: string;
  className?: string;
}) {
  const params = useParams();
  const lang = ((params?.locale as string) || "ko") === "en" ? "en" : "ko";
  const t = T[lang];
  const [open, setOpen] = useState(false);
  const [rec, setRec] = useState<CplRecord | null>(null);
  const [source, setSource] = useState<"live" | "snapshot" | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  useEffect(() => {
    if (!open || rec) return;
    let cancelled = false;
    (async () => {
      try {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 6000);
        const res = await fetch(CPL_JSON_URL, { signal: ctrl.signal, cache: "no-store" });
        clearTimeout(timer);
        if (!res.ok) throw new Error(String(res.status));
        const list = (await res.json()) as CplRecord[];
        const found =
          list.find((r) => r.recordId === ORIPICS_CPL_RECORD_ID) ||
          list.find((r) => r.product?.DN?.CN === "OriPics");
        if (!found) throw new Error("not found");
        if (!cancelled) { setRec(found); setSource("live"); }
      } catch {
        if (!cancelled) { setRec(SNAPSHOT); setSource("snapshot"); }
      }
    })();
    return () => { cancelled = true; };
  }, [open, rec]);

  const level = rec?.product.assurance?.maxAssuranceLevel ?? 0;
  const isConformant = rec?.status === "conformant";
  const genImages = rec?.containers?.generate?.image ?? [];
  const valImages = rec?.containers?.validate?.image ?? [];

  const Row = ({ k, v }: { k: string; v: React.ReactNode }) => (
    <div className="flex items-baseline justify-between gap-3 text-sm">
      <span className="text-slate-500">{k}</span>
      <span className="font-semibold text-slate-900 text-right">{v}</span>
    </div>
  );

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} title={title} className={className}>
        {label}
      </button>

      {open && typeof document !== "undefined" && createPortal(
        <div className="fixed inset-0 z-[60] overflow-y-auto bg-black/40 px-4" onClick={() => setOpen(false)}>
          <div
            role="dialog"
            aria-modal="true"
            aria-label="C2PA Conforming Products List — OriPics"
            className="bg-white rounded-2xl max-w-2xl w-full shadow-xl text-left mx-auto mt-12 mb-10 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* 헤더 — Explorer View Details와 동일 구성: 제품명 + 유형 배지 / 신청 법인 / DN */}
            <div className="px-6 pt-5 pb-4 border-b border-slate-100">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-2xl font-extrabold text-slate-900">{rec?.product.DN.CN ?? "OriPics"}</h3>
                    <span className="inline-flex items-center rounded-full bg-slate-100 border border-slate-200 text-slate-700 text-xs font-semibold px-2.5 py-0.5">
                      {rec?.product.productType === "validatorProduct" ? t.validator : t.generator}
                    </span>
                  </div>
                  <p className="text-base text-slate-700 mt-0.5">{rec?.applicant ?? SNAPSHOT.applicant}</p>
                  <p className="mt-2 inline-block rounded bg-slate-100 text-slate-600 font-mono text-[11px] px-2 py-0.5 break-all">
                    {formatDn(rec?.product.DN ?? SNAPSHOT.product.DN)}
                  </p>
                </div>
                <button type="button" onClick={() => setOpen(false)} aria-label={t.ariaClose} className="text-slate-400 hover:text-slate-700 transition-colors shrink-0">
                  <X size={20} />
                </button>
              </div>
              <p className="text-xs text-slate-500 mt-3 leading-relaxed">{t.intro}</p>
            </div>

            <div className="px-6 py-5 space-y-3 bg-slate-50/60">
              {!rec ? (
                <p className="text-sm text-slate-500 py-8 text-center">{t.loading}</p>
              ) : (
                <>
                  {/* 레코드 ID + 상태 */}
                  <div className="rounded-xl bg-white border border-slate-200 p-4 flex items-start justify-between gap-3 flex-wrap">
                    <div className="min-w-0">
                      <p className="text-[11px] font-bold tracking-wider text-slate-500 uppercase">{t.recordId}</p>
                      <p className="font-mono text-sm text-slate-900 break-all mt-1">{rec.recordId}</p>
                    </div>
                    <span className={`inline-flex items-center gap-1 rounded-full text-xs font-bold px-3 py-1 ${isConformant ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-amber-50 text-amber-700 border border-amber-200"}`}>
                      <CheckCircle2 size={14} /> {isConformant ? t.conformant : rec.status}
                    </span>
                  </div>

                  {/* 제품 정보 URL — 레코드에 infoURL이 있을 때만 표시 (미등록 문구 노출 안 함, 2026-09-04 대표) */}
                  {rec.product.infoURL && (
                    <div className="rounded-xl bg-white border border-slate-200 px-4 py-3 flex items-center gap-2 text-sm flex-wrap">
                      <LinkIcon size={14} className="text-slate-400 shrink-0" />
                      <span className="text-[11px] font-bold tracking-wider text-slate-500 uppercase">{t.infoUrl}</span>
                      <a href={rec.product.infoURL} target="_blank" rel="noopener noreferrer" className="text-blue-600 font-semibold hover:underline break-all">{rec.product.infoURL}</a>
                    </div>
                  )}

                  <div className="grid sm:grid-cols-2 gap-3">
                    {/* 규격·프로그램 */}
                    <div className="rounded-xl bg-white border border-slate-200 p-4 space-y-2">
                      <p className="flex items-center gap-1.5 text-[11px] font-bold tracking-wider text-slate-500 uppercase"><FileText size={13} /> {t.specTitle}</p>
                      <Row k={t.spec} v={(rec.specVersion ?? []).join(", ") || "—"} />
                      <Row k={t.program} v={rec.conformanceProgramVersion ?? "—"} />
                      <Row k={t.minVersion} v={<span className="font-mono">{rec.product.minVersion ?? "—"}</span>} />
                    </div>
                    {/* 보안 보증 */}
                    <div className="rounded-xl bg-white border border-slate-200 p-4 space-y-2">
                      <p className="flex items-center gap-1.5 text-[11px] font-bold tracking-wider text-slate-500 uppercase"><ShieldCheck size={13} /> {t.assuranceTitle}</p>
                      <Row
                        k={t.level}
                        v={
                          <span className="inline-flex items-center gap-1.5">
                            <span className="inline-flex gap-0.5" aria-hidden="true">
                              {[1, 2, 3, 4].map((n) => (
                                <span key={n} className={`inline-block w-2 h-2 rounded-full ${n <= level ? "bg-amber-500" : "bg-slate-200"}`} />
                              ))}
                            </span>
                            {t.levelSuffix} {level || "—"}
                          </span>
                        }
                      />
                      <div className="text-sm">
                        <span className="text-slate-500">{t.attest}</span>
                        <div className="flex flex-wrap gap-1.5 mt-1.5">
                          {(rec.product.assurance?.attestationMethods ?? []).map((m) => (
                            <span key={m} className="rounded-md bg-slate-100 border border-slate-200 text-slate-700 text-xs font-semibold px-2 py-0.5">{ATTEST_LABEL[m] ?? m}</span>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* 파일 형식 */}
                  <div className="rounded-xl bg-white border border-slate-200 p-4 space-y-2">
                    <p className="flex items-center gap-1.5 text-[11px] font-bold tracking-wider text-slate-500 uppercase"><ImageIcon size={13} /> {t.containersTitle}</p>
                    <Row k={t.compressed} v={rec.supportsCompressedManifests ? t.yes : t.no} />
                    <div className="grid sm:grid-cols-2 gap-3 pt-1">
                      {[[t.generate, genImages], [t.validate, valImages]].map(([k, list]) => (
                        <div key={k as string} className="text-sm">
                          <span className="text-slate-500">{k as string}</span>
                          <div className="flex flex-wrap gap-1.5 mt-1.5">
                            {(list as string[]).length === 0 ? <span className="text-slate-400">—</span> : (list as string[]).map((m) => (
                              <span key={m} className="rounded-md bg-slate-100 border border-slate-200 text-slate-700 font-mono text-xs px-2 py-0.5">{mimeToExt(m)}</span>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* 이력 */}
                  <div className="rounded-xl bg-white border border-slate-200 p-4">
                    <p className="flex items-center gap-1.5 text-[11px] font-bold tracking-wider text-slate-500 uppercase mb-2"><Clock size={13} /> {t.datesTitle}</p>
                    <div className="grid grid-cols-3 gap-3 text-sm">
                      {[[t.conformanceDate, rec.dates?.conformance], [t.creationDate, rec.dates?.creation], [t.modifiedDate, rec.dates?.lastModification]].map(([k, v]) => (
                        <div key={k as string}>
                          <p className="text-slate-500 text-xs">{k as string}</p>
                          <p className="font-semibold text-slate-900 font-mono">{(v as string) ?? "—"}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  <p className="text-[11px] text-slate-400 text-right">{source === "live" ? t.live : t.snapshot}</p>
                </>
              )}
            </div>

            {/* 푸터 — 공식 목록 확인(주) + 닫기 */}
            <div className="px-6 py-4 border-t border-slate-100 flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-2">
              <button type="button" onClick={() => setOpen(false)} className="px-4 py-2.5 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-100 transition-colors">
                {t.close}
              </button>
              <a
                href={C2PA_EXPLORER_ORIPICS_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold transition-colors"
              >
                {t.officialBtn} <ExternalLink size={14} />
              </a>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
