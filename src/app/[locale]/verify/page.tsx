"use client";

// 무료 검증 (2026-10-01, 원장 1단계 — docs/strategy-verification-layer.md §3.4·3.5)
// 로그인 없이 누구나. 사진은 서버로 보내지 않는다 — 브라우저에서 스탬프 판독·해시·지문만 계산해 대조.
//   ① 스탬프가 있으면 /api/verify (원본 여부 + 원장 기록 + 제3자 시각 증명)
//   ② 스탬프가 없거나 손상(재압축·크기 변경)이면 /api/verify/lookup (원장 지문으로 인증 원본 후보 찾기)
import { useRef, useState, type DragEvent, type ReactNode } from "react";
import { Link } from "@/navigation";
import { useParams } from "next/navigation";
import {
  AlertTriangle, ArrowLeft, CheckCircle2, Clock, Download, ExternalLink, FileSearch, Loader2,
  RefreshCw, SearchX, ShieldCheck, Upload,
} from "lucide-react";
import { verifyImage, lookupCopies, type VerifyResponse, type LookupResult, type LedgerInfo } from "@/lib/oripics-stamp";

const MAX_BYTES = 50 * 1024 * 1024;
const LOOKUP_REASONS = ["no_stamp", "dimension_mismatch", "image_too_small"];

type Phase =
  | { kind: "idle" }
  | { kind: "working" }
  | { kind: "stamp"; res: VerifyResponse }
  | { kind: "lookup"; res: LookupResult; reason: string }
  | { kind: "error"; message: string };

type Copy = typeof KO;

const KO = {
  back: "홈으로",
  title: "사진 무료 검증",
  lead: "받은 사진이 OriPics로 인증된 원본인지 확인합니다. 로그인 없이 누구나 무료로 쓸 수 있습니다.",
  privacy: "사진은 서버로 전송되지 않습니다. 브라우저에서 스탬프와 지문만 계산해 인증 기록과 대조합니다.",
  drop: "사진을 끌어다 놓거나 눌러서 선택",
  dropHint: "PNG·JPEG·WEBP · 50MB 이하 · 카톡·메신저로 받은 사진도 됩니다",
  working: "확인 중…",
  again: "다른 사진 검증",
  errSize: "50MB 이하 사진만 확인할 수 있습니다.",
  errType: "이미지 파일만 확인할 수 있습니다.",
  errRate: "요청이 많습니다. 잠시 후 다시 시도해 주세요.",
  errGeneric: "확인하지 못했습니다. 잠시 후 다시 시도해 주세요.",
  okTitle: "OriPics 인증 원본입니다",
  okLead: "사진에 새겨진 인증 스탬프가 서버 기록과 일치합니다. 인증 이후 픽셀이 바뀌지 않았습니다.",
  failTitle: "인증 이후 바뀐 사진으로 보입니다",
  failLead: "OriPics 스탬프는 있지만 내용이 기록과 일치하지 않습니다. 인증 후 편집·합성되었을 수 있습니다.",
  exactTitle: "인증본 파일 그대로입니다",
  exactLead: "올린 파일이 인증 기록의 파일과 바이트 단위로 같습니다.",
  candTitle: (n: number) => `시각적으로 유사한 인증 원본 후보 ${n}건`,
  candLead:
    "스탬프는 없지만(재압축·크기 변경 등) 모습이 비슷한 인증 원본이 있습니다. 이것만으로 같은 사진이라고 단정할 수는 없습니다. 공개링크가 있으면 원본과 직접 비교해 보세요.",
  noneTitle: "OriPics 인증 기록을 찾지 못했습니다",
  noneLead:
    "기록이 없다고 해서 가짜라는 뜻은 아닙니다. OriPics로 인증하지 않았거나, 크게 잘라내기·회전한 사진일 수 있습니다. 상대에게 공개링크나 인증 원본 파일을 요청해 보세요.",
  lowInfo: "단색·단순한 사진이라 비슷한 사진과 구분하기 어렵습니다. 찾기 결과의 정확도가 낮습니다.",
  captured: "촬영 시각 (기기 기록)",
  certified: "인증 시각 (서버)",
  tier: "등급",
  tierVerified: "Verified · 앱 카메라 촬영 + 기기 검증",
  tierStandard: "Standard · 파일 인증",
  size: "크기",
  gps: "위치",
  tsa: "제3자 시각 증명",
  tsaStamped: (t: string) => `${t} · SSL.com 타임스탬프`,
  tsaPending: "인증 다음 날(00:10) 확정됩니다",
  tsaRetrying: "확정 처리 중",
  legacy: "원장 도입(2026-10-01) 이전 인증 — 스탬프로만 검증됩니다",
  link: "공개링크",
  noLink: "공개링크 없음",
  c2pa: "C2PA 자격증명",
  c2paVal: { trusted: "서명 유효 · 신뢰됨", untrusted: "서명 유효 · 신뢰 목록 외", invalid: "변조 흔적", absent: "없음" } as Record<string, string>,
  proof: "검증 기록 다운로드 (JSON)",
  proofNote: "머클 증명 경로와 타임스탬프 토큰이 들어 있어 OriPics 없이도 제3자가 재확인할 수 있습니다.",
  distance: (p: number) => `차이 ${p}/256`,
  limitsTitle: "검증이 말해 주는 것과 아닌 것",
  limits: [
    "확인하는 것: 그 시각에 OriPics로 인증되었는지, 이후 바뀌지 않았는지, (Verified) 실제 기기 카메라로 찍었는지.",
    "확인하지 못하는 것: 사진 속 내용이 사실인지, 모니터·인쇄물을 다시 찍은 사진인지(재촬영).",
  ],
  cta: "다음 거래부터는 상대에게 OriPics 인증 사진을 요청해 보세요.",
  ctaLink: "OriPics 알아보기",
};

const EN: Copy = {
  back: "Home",
  title: "Free photo verification",
  lead: "Check whether a photo you received is an OriPics-certified original. Free for everyone, no sign-in.",
  privacy: "Your photo is never uploaded. The browser computes the stamp and fingerprints and compares them with certification records.",
  drop: "Drop a photo here or tap to choose",
  dropHint: "PNG · JPEG · WEBP · up to 50MB · photos received via messengers work too",
  working: "Checking…",
  again: "Verify another photo",
  errSize: "Photos up to 50MB only.",
  errType: "Image files only.",
  errRate: "Too many requests. Please try again shortly.",
  errGeneric: "Could not check. Please try again shortly.",
  okTitle: "This is an OriPics-certified original",
  okLead: "The embedded stamp matches the server record. The pixels have not changed since certification.",
  failTitle: "This photo appears to have changed after certification",
  failLead: "It carries an OriPics stamp, but the content does not match the record. It may have been edited after certification.",
  exactTitle: "This is the certified file, unchanged",
  exactLead: "The uploaded file is byte-for-byte identical to the certified file on record.",
  candTitle: (n: number) => `${n} visually similar certified original${n > 1 ? "s" : ""}`,
  candLead:
    "No stamp (recompressed or resized), but a certified original looks similar. This alone does not prove it is the same photo — compare with the original via its public link if available.",
  noneTitle: "No OriPics record found",
  noneLead:
    "No record does not mean fake. It may not have been certified with OriPics, or it was heavily cropped or rotated. Ask the sender for a public link or the certified file.",
  lowInfo: "This image is very plain, so it is hard to tell apart from similar images. Search accuracy is low.",
  captured: "Captured (device)",
  certified: "Certified (server)",
  tier: "Tier",
  tierVerified: "Verified · in-app camera + device attestation",
  tierStandard: "Standard · file certification",
  size: "Size",
  gps: "Location",
  tsa: "Third-party time proof",
  tsaStamped: (t: string) => `${t} · SSL.com timestamp`,
  tsaPending: "Confirmed the day after certification (00:10 KST)",
  tsaRetrying: "Being confirmed",
  legacy: "Certified before the ledger (2026-10-01) — verified by stamp only",
  link: "Public link",
  noLink: "No public link",
  c2pa: "C2PA credentials",
  c2paVal: { trusted: "Valid · trusted", untrusted: "Valid · not on trust list", invalid: "Tampering detected", absent: "None" } as Record<string, string>,
  proof: "Download verification record (JSON)",
  proofNote: "Contains the Merkle path and timestamp token so anyone can re-check it without OriPics.",
  distance: (p: number) => `diff ${p}/256`,
  limitsTitle: "What verification does and does not tell you",
  limits: [
    "It tells you: that it was certified with OriPics at that time, that it has not changed since, and (Verified) that it was taken with a real device camera.",
    "It cannot tell you: whether the scene is true, or whether a screen or print was re-photographed.",
  ],
  cta: "Next time, ask the other party for an OriPics-certified photo.",
  ctaLink: "About OriPics",
};

function fmtDate(d: Date, locale: string): string {
  if (isNaN(d.getTime())) return "";
  return d.toLocaleString(locale === "en" ? "en-US" : "ko-KR", {
    year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
}

/** 인증 timestamp (prefix + yymmddHHMMSS + cs, UTC) */
function fmtStampTs(ts: string, locale: string): string {
  const c = /^\d/.test(ts[0] ?? "") ? ts : ts.substring(1);
  if (!/^\d{14}$/.test(c)) return ts;
  const n = (a: number, b: number) => parseInt(c.slice(a, b), 10);
  return fmtDate(new Date(Date.UTC(2000 + n(0, 2), n(2, 4) - 1, n(4, 6), n(6, 8), n(8, 10), n(10, 12), n(12, 14) * 10)), locale);
}

/** 촬영 시각 (yymmddHHMMSSmmm, UTC) */
function fmtCaptured(ca: string, locale: string): string {
  if (!/^\d{15}$/.test(ca)) return ca;
  const n = (a: number, b: number) => parseInt(ca.slice(a, b), 10);
  return fmtDate(new Date(Date.UTC(2000 + n(0, 2), n(2, 4) - 1, n(4, 6), n(6, 8), n(8, 10), n(10, 12), n(12, 15))), locale);
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 border-b border-slate-100 py-2.5 last:border-0 sm:flex-row sm:gap-4">
      <dt className="w-40 shrink-0 text-sm text-slate-500">{label}</dt>
      <dd className="text-sm font-medium text-slate-900 break-all">{children}</dd>
    </div>
  );
}

function TsaValue({ ledger, c, locale }: { ledger?: LedgerInfo; c: Copy; locale: string }) {
  if (!ledger) return <span className="text-slate-500">{c.legacy}</span>;
  const tp = ledger.timestamp_proof;
  if (tp.status === "stamped") return <>{c.tsaStamped(fmtDate(new Date(tp.tsa_time), locale))}</>;
  return (
    <span className="inline-flex items-center gap-1.5 text-slate-600">
      <Clock size={14} /> {tp.status === "pending" ? c.tsaPending : c.tsaRetrying}
    </span>
  );
}

function LinkValue({ url, c }: { url: string | null | undefined; c: Copy }) {
  if (!url) return <span className="text-slate-500">{c.noLink}</span>;
  return (
    <a href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-blue-600 hover:underline">
      {url.replace(/^https?:\/\//, "")} <ExternalLink size={13} />
    </a>
  );
}

function LedgerRows({ record, c, locale }: { record: LedgerInfo; c: Copy; locale: string }) {
  return (
    <dl>
      {record.captured_at && <Row label={c.captured}>{fmtCaptured(record.captured_at, locale)}</Row>}
      <Row label={c.certified}>{fmtStampTs(record.stamp_ts, locale) || fmtDate(new Date(record.certified_at), locale)}</Row>
      <Row label={c.tier}>{record.tier === "verified" ? c.tierVerified : c.tierStandard}</Row>
      <Row label={c.size}>{record.width}×{record.height}</Row>
      <Row label={c.tsa}><TsaValue ledger={record} c={c} locale={locale} /></Row>
      <Row label={c.link}><LinkValue url={record.verify_url} c={c} /></Row>
    </dl>
  );
}

function Banner({ tone, icon, title, lead }: { tone: "ok" | "warn" | "info"; icon: ReactNode; title: string; lead: string }) {
  const cls = {
    ok: "border-emerald-200 bg-emerald-50 text-emerald-800",
    warn: "border-amber-200 bg-amber-50 text-amber-800",
    info: "border-slate-200 bg-slate-50 text-slate-800",
  }[tone];
  return (
    <div className={`rounded-xl border p-5 ${cls}`}>
      <p className="flex items-center gap-2 text-lg font-bold">{icon} {title}</p>
      <p className="mt-1.5 text-sm leading-relaxed opacity-90">{lead}</p>
    </div>
  );
}

export default function VerifyPage() {
  const params = useParams();
  const locale = (params?.locale as string) || "ko";
  const c = locale === "en" ? EN : KO;
  const inputRef = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [preview, setPreview] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  const reset = () => {
    if (preview) URL.revokeObjectURL(preview);
    setPreview(null);
    setPhase({ kind: "idle" });
  };

  const run = async (file: File) => {
    if (!file.type.startsWith("image/")) return setPhase({ kind: "error", message: c.errType });
    if (file.size > MAX_BYTES) return setPhase({ kind: "error", message: c.errSize });
    if (preview) URL.revokeObjectURL(preview);
    setPreview(URL.createObjectURL(file));
    setPhase({ kind: "working" });
    try {
      const res = await verifyImage(file, { apiBase: "" });
      if (res.reason === "verify_http_429") return setPhase({ kind: "error", message: c.errRate });
      if (res.metadata) return setPhase({ kind: "stamp", res });
      const reason = res.reason ?? "no_stamp";
      if (!LOOKUP_REASONS.includes(reason)) return setPhase({ kind: "error", message: c.errGeneric });
      const lk = await lookupCopies(file, { apiBase: "" });
      setPhase({ kind: "lookup", res: lk, reason });
    } catch (e: any) {
      const msg = String(e?.message || e);
      setPhase({ kind: "error", message: /429/.test(msg) ? c.errRate : c.errGeneric });
    }
  };

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files?.[0];
    if (f) void run(f);
  };

  const c2pa = phase.kind === "stamp"
    ? (phase.res.trust_report?.evidence?.find((e) => e.type === "c2pa.manifest") as { result?: string } | undefined)
    : undefined;

  return (
    <div className="min-h-screen bg-slate-50 px-5 py-10 text-slate-700 sm:py-14">
      <div className="mx-auto max-w-3xl space-y-6">
        <Link href="/" className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-900">
          <ArrowLeft size={16} /> {c.back}
        </Link>

        <header className="pb-2">
          <h1 className="flex items-center gap-3 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
            <ShieldCheck className="text-blue-600" size={34} /> {c.title}
          </h1>
          <p className="mt-3 text-base leading-relaxed text-slate-600">{c.lead}</p>
          <p className="mt-2 text-xs text-slate-500">{c.privacy}</p>
        </header>

        {(phase.kind === "idle" || phase.kind === "error") && (
          <div
            role="button"
            tabIndex={0}
            onClick={() => inputRef.current?.click()}
            onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && inputRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            className={`flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed bg-white px-6 py-14 text-center transition-colors ${
              dragging ? "border-blue-500 bg-blue-50" : "border-slate-300 hover:border-blue-400"
            }`}
          >
            <Upload className="mb-3 text-blue-600" size={36} />
            <p className="font-semibold text-slate-900">{c.drop}</p>
            <p className="mt-1 text-xs text-slate-500">{c.dropHint}</p>
            {phase.kind === "error" && (
              <p className="mt-4 inline-flex items-center gap-1.5 text-sm text-red-600"><AlertTriangle size={15} /> {phase.message}</p>
            )}
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) void run(f);
              }}
            />
          </div>
        )}

        {phase.kind === "working" && (
          <div className="flex items-center justify-center gap-3 rounded-2xl border border-slate-200 bg-white py-14 text-slate-600">
            <Loader2 className="animate-spin" size={22} /> {c.working}
          </div>
        )}

        {(phase.kind === "stamp" || phase.kind === "lookup") && (
          <section className="space-y-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
            {preview && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={preview} alt="" className="mx-auto max-h-72 rounded-lg object-contain" />
            )}

            {phase.kind === "stamp" && (
              <>
                {phase.res.match ? (
                  <Banner tone="ok" icon={<CheckCircle2 size={22} />} title={c.okTitle} lead={c.okLead} />
                ) : (
                  <Banner tone="warn" icon={<AlertTriangle size={22} />} title={c.failTitle} lead={c.failLead} />
                )}
                {phase.res.match && (
                  <dl>
                    {phase.res.metadata?.captured_at && (
                      <Row label={c.captured}>{fmtCaptured(phase.res.metadata.captured_at, locale)}</Row>
                    )}
                    <Row label={c.certified}>{fmtStampTs(phase.res.metadata?.timestamp ?? "", locale)}</Row>
                    <Row label={c.tier}>{phase.res.tier === "verified" || phase.res.ledger?.tier === "verified" ? c.tierVerified : c.tierStandard}</Row>
                    <Row label={c.size}>{phase.res.metadata?.width}×{phase.res.metadata?.height}</Row>
                    {phase.res.metadata?.lat != null && phase.res.metadata?.lng != null && (
                      <Row label={c.gps}>{phase.res.metadata.lat.toFixed(5)}, {phase.res.metadata.lng.toFixed(5)}</Row>
                    )}
                    <Row label={c.tsa}><TsaValue ledger={phase.res.ledger} c={c} locale={locale} /></Row>
                    <Row label={c.link}>
                      <LinkValue url={phase.res.trust_report?.subject?.verify_url ?? phase.res.ledger?.verify_url} c={c} />
                    </Row>
                    {c2pa?.result && <Row label={c.c2pa}>{c.c2paVal[c2pa.result] ?? c2pa.result}</Row>}
                  </dl>
                )}
                {phase.res.match && phase.res.ledger?.timestamp_proof.status === "stamped" && phase.res.ledger.proof_url && (
                  <div>
                    <a
                      href={phase.res.ledger.proof_url}
                      className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-900 hover:bg-slate-50"
                    >
                      <Download size={16} /> {c.proof}
                    </a>
                    <p className="mt-1.5 text-xs text-slate-500">{c.proofNote}</p>
                  </div>
                )}
              </>
            )}

            {phase.kind === "lookup" && (() => {
              const { matches, low_info } = phase.res;
              const exact = matches.find((m) => m.kind === "exact_file");
              const cands = matches.filter((m) => m.kind === "perceptual");
              return (
                <>
                  {exact ? (
                    <>
                      <Banner tone="ok" icon={<CheckCircle2 size={22} />} title={c.exactTitle} lead={c.exactLead} />
                      <LedgerRows record={exact.record} c={c} locale={locale} />
                    </>
                  ) : cands.length > 0 ? (
                    <>
                      <Banner tone="info" icon={<FileSearch size={22} />} title={c.candTitle(cands.length)} lead={c.candLead} />
                      {cands.map((m, i) => (
                        <div key={m.record.link_id} className="rounded-xl border border-slate-200 p-4">
                          <p className="mb-1 text-xs font-semibold text-slate-500">
                            #{i + 1} · {c.distance(m.phash_distance ?? 0)}
                          </p>
                          <LedgerRows record={m.record} c={c} locale={locale} />
                        </div>
                      ))}
                    </>
                  ) : (
                    <Banner tone="info" icon={<SearchX size={22} />} title={c.noneTitle} lead={c.noneLead} />
                  )}
                  {low_info && (
                    <p className="inline-flex items-start gap-1.5 text-xs text-amber-700"><AlertTriangle size={14} className="mt-0.5 shrink-0" /> {c.lowInfo}</p>
                  )}
                </>
              );
            })()}

            <button
              onClick={reset}
              className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white hover:bg-slate-700"
            >
              <RefreshCw size={16} /> {c.again}
            </button>
          </section>
        )}

        <section className="rounded-2xl border border-slate-200 bg-white p-6 text-sm leading-relaxed sm:p-8">
          <h2 className="mb-3 font-bold text-slate-900">{c.limitsTitle}</h2>
          <ul className="list-disc space-y-1.5 pl-5">
            {c.limits.map((l) => <li key={l}>{l}</li>)}
          </ul>
          <p className="mt-4 text-slate-600">
            {c.cta}{" "}
            <Link href="/how-it-works" className="font-semibold text-blue-600 hover:underline">{c.ctaLink}</Link>
          </p>
        </section>
      </div>
    </div>
  );
}
