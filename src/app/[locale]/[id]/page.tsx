"use client";

import React, { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { ShieldCheck, Calendar, Camera as CameraIcon, Maximize2, Download, AlertCircle, RefreshCw, Home, Copy, Check, Upload, MapPin, Expand, X, ExternalLink, BadgeCheck, FileText } from "lucide-react";
import { Link } from "@/navigation";
import { useTranslations } from "next-intl";
import { useSession } from "next-auth/react";
import { verifyLinkId } from "@/lib/oripics-stamp/common";
import { VerifiedDetailLines, type VerifiedAssertionData } from "@/components/VerifiedDetailLines";
import { useCredits } from "@/lib/credits/useCredits";

interface LinkData {
  link_id: string;
  timestamp: string;
  width: number;
  height: number;
  lat?: number | null;
  lng?: number | null;
  /** 촬영시각 (V5, 기기 기록 "yymmddHHMMSSmmm" UTC) — 구 링크는 null */
  captured_at?: string | null;
  /** 검증 등급 — "verified"(attest 통과 촬영 인증) | null(standard, 구 행 포함) */
  tier?: string | null;
  /** verified 상세 (발행 시 서버 기록, snake_case) — 어서션 부재 시 폴백 (2026-08-29) */
  verified_info?: Record<string, unknown> | null;
  storage_path: string;
  signed_url: string;
  /** 소유자 여부 — 서버가 세션과 대조해 판정 (user_id 자체는 노출하지 않음, 2026-08-22) */
  is_owner?: boolean;
  /** 뷰어 경량 표시본 (A-36). 없으면 원본 폴백 (구 링크 하위호환) */
  preview_path?: string | null;
  /** 보관 만료 (null = 보관함 활성 중 무기한) */
  expires_at?: string | null;
}

interface C2paStatus {
  present: boolean;
  valid: boolean;
  trusted?: boolean;
  claim_generator?: string;
  signature?: { issuer?: string; time?: string; alg?: string };
  validation_status?: Array<{ code: string; explanation?: string }>;
  /** 매니페스트 어서션 — com.oripics.verified(플랫폼·렌즈·배율) 추출용 (2026-08-29) */
  assertions?: Array<{ label?: string; data?: Record<string, unknown> }>;
}

export default function LinkViewer() {
  const params = useParams();
  const linkId = params.id as string;
  const locale = (params?.locale as string) || "ko";
  const t = useTranslations("LinkViewer");
  const { data: session } = useSession();
  const { data: credits } = useCredits();

  const [data, setData] = useState<LinkData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [imageObjectUrl, setImageObjectUrl] = useState<string | null>(null);
  const [downloadedBytes, setDownloadedBytes] = useState(0);
  const [totalBytes, setTotalBytes] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [c2pa, setC2pa] = useState<C2paStatus | null>(null);
  const [certLoading, setCertLoading] = useState(false);
  const [certError, setCertError] = useState<string | null>(null);

  const isOwner = !!data?.is_owner;
  const isPaidTier = credits?.tier === "pro" || credits?.tier === "business";
  const canDownloadCertificate = isOwner && isPaidTier;

  const handleDownloadCertificate = async () => {
    if (!data || !canDownloadCertificate) return;
    setCertLoading(true);
    setCertError(null);
    try {
      const res = await fetch(
        `/api/links/${data.link_id}/certificate?locale=${locale === "en" ? "en" : "ko"}`,
      );
      if (!res.ok) {
        const detail = await res.text().catch(() => "");
        throw new Error(`http_${res.status}:${detail.slice(0, 120)}`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `OriPics_Certificate_${data.link_id}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      setCertError(e?.message ?? "unknown");
    } finally {
      setCertLoading(false);
    }
  };

  const shortLink =
    typeof window !== "undefined"
      ? `${window.location.origin}/${linkId}`
      : `https://ori.pics/${linkId}`;

  const handleCopy = () => {
    navigator.clipboard.writeText(shortLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  useEffect(() => {
    const fetchData = async () => {
      try {
        if (!verifyLinkId(linkId)) {
          throw new Error(t("not_found_desc"));
        }
        // 브라우저의 anon PostgREST 직접 조회를 서버 API로 대체 (2026-08-22 보안 조치 —
        // anon SELECT는 전체 링크·GPS 열거를 허용했다). 만료 판정도 서버가 수행.
        const res = await fetch(`/api/links/${encodeURIComponent(linkId)}/public`);
        if (!res.ok) throw new Error(t("not_found_desc"));
        const { link } = await res.json();
        if (!link) throw new Error(t("not_found_desc"));
        setData(link as LinkData);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    if (linkId) fetchData();
  }, [linkId, t]);

  useEffect(() => {
    if (!data?.signed_url) return;

    // A-36: 경량 표시본이 있으면 뷰어는 프리뷰(≤1600px JPEG)를 직접 로딩 —
    // 원본(최대 수십 MB)은 다운로드 버튼에서만 전송 (egress 절감).
    // handleDownload는 blob: URL이 아니면 원본 signed_url을 새로 fetch하므로 정합.
    if (data.preview_path) {
      const previewUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/oripics-proofs/${data.preview_path}`;
      setImageObjectUrl(previewUrl);
      return;
    }

    let cancelled = false;
    let createdUrl: string | null = null;

    (async () => {
      try {
        const res = await fetch(data.signed_url);
        if (!res.ok || !res.body) throw new Error("image_fetch_failed");
        const total = Number(res.headers.get("content-length")) || 0;
        setTotalBytes(total);
        const reader = res.body.getReader();
        const chunks: Uint8Array[] = [];
        let received = 0;
        while (true) {
          const { done, value } = await reader.read();
          if (cancelled) {
            try { reader.cancel(); } catch {}
            return;
          }
          if (done) break;
          if (value) {
            chunks.push(value);
            received += value.length;
            setDownloadedBytes(received);
          }
        }
        const blob = new Blob(chunks as BlobPart[], { type: "image/png" });
        createdUrl = URL.createObjectURL(blob);
        if (!cancelled) setImageObjectUrl(createdUrl);
      } catch {
        if (!cancelled) setImageObjectUrl(data.signed_url);
      }
    })();

    return () => {
      cancelled = true;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [data?.signed_url, data?.preview_path]);

  useEffect(() => {
    if (!data?.link_id) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/links/${data.link_id}/c2pa`);
        if (!res.ok) return;
        const json = (await res.json()) as C2paStatus;
        if (!cancelled) setC2pa(json);
      } catch {
        // 매니페스트 없거나 조회 실패 → 배지 숨김 (graceful)
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [data?.link_id]);

  useEffect(() => {
    if (!isFullscreen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsFullscreen(false);
    };
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handler);
    return () => {
      window.removeEventListener("keydown", handler);
      document.body.style.overflow = prevOverflow;
    };
  }, [isFullscreen]);

  const formatBytes = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  };

  const formatTimestamp = (ts: string) => {
    const cleanTs = isNaN(parseInt(ts[0])) ? ts.substring(1) : ts;
    if (cleanTs.length !== 14) return ts;
    const year = parseInt("20" + cleanTs.substring(0, 2), 10);
    const month = parseInt(cleanTs.substring(2, 4), 10) - 1;
    const day = parseInt(cleanTs.substring(4, 6), 10);
    const hour = parseInt(cleanTs.substring(6, 8), 10);
    const minute = parseInt(cleanTs.substring(8, 10), 10);
    const second = parseInt(cleanTs.substring(10, 12), 10);
    const ms = parseInt(cleanTs.substring(12, 14), 10) * 10;
    const utcDate = new Date(Date.UTC(year, month, day, hour, minute, second, ms));
    return utcDate.toLocaleString(undefined, {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      timeZoneName: "short",
    });
  };

  // V5 촬영시각: "yymmddHHMMSSmmm" (UTC, prefix 없음, ms 3자리)
  const formatCapturedAt = (ca: string) => {
    if (!/^\d{15}$/.test(ca)) return ca;
    const utcDate = new Date(Date.UTC(
      parseInt("20" + ca.substring(0, 2), 10),
      parseInt(ca.substring(2, 4), 10) - 1,
      parseInt(ca.substring(4, 6), 10),
      parseInt(ca.substring(6, 8), 10),
      parseInt(ca.substring(8, 10), 10),
      parseInt(ca.substring(10, 12), 10),
      parseInt(ca.substring(12, 15), 10),
    ));
    return utcDate.toLocaleString(undefined, {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      timeZoneName: "short",
    });
  };

  const handleDownload = async () => {
    if (!data) return;
    let url = imageObjectUrl;
    let revoke = false;
    if (!url || !url.startsWith("blob:")) {
      const res = await fetch(data.signed_url);
      const blob = await res.blob();
      url = URL.createObjectURL(blob);
      revoke = true;
    }
    const a = document.createElement("a");
    a.href = url;
    a.download = `OriPics_${linkId}.png`;
    a.click();
    if (revoke) URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col items-center justify-center p-6">
        <RefreshCw size={48} className="animate-spin text-purple-500 mb-4" />
        <p className="text-xl font-medium">{t("loading")}</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col items-center justify-center p-6 text-center">
        <div className="w-20 h-20 bg-red-50 rounded-full flex items-center justify-center mb-6">
          <AlertCircle size={40} className="text-red-600" />
        </div>
        <h1 className="text-3xl font-bold mb-4">{t("not_found")}</h1>
        <p className="text-slate-600 mb-8 max-w-md">{error}</p>
        <Link
          href="/"
          className="px-8 py-3 bg-slate-100 hover:bg-slate-300 rounded-xl font-bold transition-all flex items-center gap-2"
        >
          <Home size={18} /> {t("back_home")}
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 py-12 px-6">
      <nav className="max-w-5xl mx-auto mb-12 flex justify-between items-center">
        <Link href="/" className="font-bold text-2xl flex items-center gap-3">
          <img src="/logo.png" alt="OriPics Logo" className="w-10 h-10 object-contain" />
          <span>OriPics</span>
        </Link>
        <div className="hidden sm:flex items-center gap-2 px-4 py-1.5 bg-green-500/10 border border-green-200 rounded-full text-green-600 text-xs font-bold">
          <ShieldCheck size={14} /> {t("verified")}
        </div>
      </nav>

      <main className="max-w-5xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
        {/* 이미지 영역 */}
        <div className="lg:col-span-2 glass rounded-3xl p-4 sm:p-8 flex items-center justify-center min-h-[400px] relative">
          {!imageObjectUrl && (
            <div className="absolute inset-4 sm:inset-8 flex flex-col items-center justify-center bg-slate-100/50 rounded-xl gap-3">
              <RefreshCw size={36} className="animate-spin text-purple-500" />
              <p className="text-sm font-mono text-slate-600">
                {totalBytes > 0
                  ? `${formatBytes(downloadedBytes)} / ${formatBytes(totalBytes)}`
                  : formatBytes(downloadedBytes)}
              </p>
            </div>
          )}
          {imageObjectUrl && (
            <>
              <img
                src={imageObjectUrl}
                alt="Verified Content"
                onClick={() => setIsFullscreen(true)}
                className="max-w-full max-h-[70vh] object-contain rounded-xl shadow-2xl transition-opacity duration-300 cursor-zoom-in"
              />
              <button
                onClick={() => setIsFullscreen(true)}
                className="absolute top-6 right-6 w-10 h-10 bg-white/80 hover:bg-white rounded-full flex items-center justify-center backdrop-blur shadow-lg transition-colors"
                aria-label="Fullscreen"
              >
                <Expand size={18} className="text-slate-700" />
              </button>
            </>
          )}
        </div>

        {/* 정보 영역 */}
        <aside className="space-y-6">
          <div className="glass p-8 rounded-3xl">
            <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
              <ShieldCheck className="text-blue-600" /> {t("info_title")}
            </h2>

            <div className="space-y-6">
              {/* 검증 등급 — verified(촬영 시점 기기 검증)만 배지 표시, standard/구 링크는 미표시 (2026-08-23) */}
              {data!.tier === "verified" && (
                <div className="flex gap-4">
                  <div className="w-10 h-10 bg-blue-500/10 rounded-xl flex items-center justify-center text-blue-600">
                    <BadgeCheck size={20} />
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 mb-1">{t("tier_label")}</p>
                    <p className="text-sm font-bold text-blue-600">{t("tier_verified")}</p>
                    {/* 기기 검증 상세 (2026-08-29) — C2PA 서명 어서션 원값을 쉬운 말+기술
                        상세로 병기. c2pa 조회 전/구 링크(어서션 없음)는 일반 문구 폴백 */}
                    {(() => {
                      const va = c2pa?.assertions?.find((a) =>
                        a.label?.startsWith("com.oripics.verified"),
                      )?.data as VerifiedAssertionData | undefined;
                      const actionsData = c2pa?.assertions?.find((a) =>
                        a.label?.startsWith("c2pa.actions"),
                      )?.data as any;
                      const sv = actionsData?.actions?.[0]?.parameters?.["com.oripics.version"];
                      const vd = va
                        ? { ...va, ...(typeof sv === "number" ? { stamp_version: sv } : {}) }
                        : ((data!.verified_info ?? undefined) as VerifiedAssertionData | undefined);
                      return (
                        <VerifiedDetailLines
                          vd={vd}
                          t={t as unknown as (key: string) => string}
                        />
                      );
                    })()}
                  </div>
                </div>
              )}
              {data!.captured_at && (
                <div className="flex gap-4">
                  <div className="w-10 h-10 bg-white/80 rounded-xl flex items-center justify-center text-slate-600">
                    <CameraIcon size={20} />
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 mb-1">{t("captured_label")}</p>
                    <p className="text-sm font-medium">{formatCapturedAt(data!.captured_at)}</p>
                  </div>
                </div>
              )}
              <div className="flex gap-4">
                <div className="w-10 h-10 bg-white/80 rounded-xl flex items-center justify-center text-slate-600">
                  <Calendar size={20} />
                </div>
                <div>
                  <p className="text-xs text-slate-500 mb-1">{t("timestamp_label")}</p>
                  <p className="text-sm font-medium">{formatTimestamp(data!.timestamp)}</p>
                </div>
              </div>

              <div className="flex gap-4">
                <div className="w-10 h-10 bg-white/80 rounded-xl flex items-center justify-center text-slate-600">
                  <Maximize2 size={20} />
                </div>
                <div>
                  <p className="text-xs text-slate-500 mb-1">{t("resolution_label")}</p>
                  <p className="text-sm font-medium">
                    {data!.width} × {data!.height} px
                  </p>
                </div>
              </div>

              <div className="flex gap-4">
                <div className="w-10 h-10 bg-white/80 rounded-xl flex items-center justify-center text-slate-600">
                  <Upload size={20} />
                </div>
                <div>
                  <p className="text-xs text-slate-500 mb-1">{t("source_label")}</p>
                  <p className="text-sm font-medium">
                    {data!.timestamp.startsWith("F") && t("source_f")}
                    {data!.timestamp.startsWith("P") && t("source_p")}
                    {data!.timestamp.startsWith("C") && t("source_c")}
                    {!["F", "P", "C"].includes(data!.timestamp[0]) && t("source_f")}
                  </p>
                </div>
              </div>

              {data!.lat != null && data!.lng != null && (
                <div className="flex gap-4">
                  <div className="w-10 h-10 bg-white/80 rounded-xl flex items-center justify-center text-slate-600">
                    <MapPin size={20} />
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 mb-1">GPS</p>
                    <a
                      href={`https://maps.google.com/?q=${data!.lat},${data!.lng}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm font-medium font-mono text-blue-700 hover:underline inline-flex items-center gap-1"
                    >
                      {data!.lat!.toFixed(6)}, {data!.lng!.toFixed(6)}
                      <ExternalLink size={16} />
                    </a>
                  </div>
                </div>
              )}
            </div>

            <div className="mt-8 pt-6 border-t border-slate-200">
              <p className="text-xs text-slate-600 mb-2">{t("short_link")}</p>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={shortLink}
                  className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-blue-700 font-mono outline-none"
                />
                <button
                  onClick={handleCopy}
                  className="p-2 bg-blue-600/20 hover:bg-blue-600/40 text-blue-600 rounded-lg transition-colors flex-shrink-0"
                  title={t("copy_link")}
                >
                  {copied ? (
                    <Check size={18} className="text-green-600" />
                  ) : (
                    <Copy size={18} />
                  )}
                </button>
              </div>
            </div>

            <div className="mt-10 pt-8 border-t border-slate-200 space-y-3">
              <button
                onClick={handleDownload}
                className="w-full py-4 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-2xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-blue-200/50"
              >
                <Download size={20} /> {t("download")}
              </button>
              {canDownloadCertificate && (
                <>
                  <button
                    onClick={handleDownloadCertificate}
                    disabled={certLoading}
                    className="w-full py-3 bg-white hover:bg-slate-50 text-slate-900 font-semibold rounded-2xl border border-slate-300 flex items-center justify-center gap-2 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {certLoading ? (
                      <>
                        <RefreshCw size={18} className="animate-spin" /> {t("cert_generating")}
                      </>
                    ) : (
                      <>
                        <FileText size={18} /> {t("cert_download")}
                      </>
                    )}
                  </button>
                  {certError && (
                    <p className="text-xs text-rose-600 text-center">
                      {t("cert_error")}
                    </p>
                  )}
                </>
              )}
              {isOwner && !isPaidTier && (
                <p className="text-xs text-slate-500 text-center pt-1">
                  {t("cert_pro_only")}
                </p>
              )}
            </div>
          </div>

          {c2pa?.present && (
            <div className="p-6 rounded-3xl bg-white/60 border border-slate-200 shadow-sm">
              <div className="flex items-center gap-2 mb-3">
                <BadgeCheck
                  size={20}
                  className={c2pa.valid && c2pa.trusted ? "text-emerald-600" : "text-amber-600"}
                />
                <h3 className="text-sm font-bold text-slate-900">
                  {t("c2pa_title")}
                </h3>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed mb-4">
                {c2pa.valid && c2pa.trusted ? t("c2pa_valid_desc") : t("c2pa_invalid_desc")}
              </p>
              {(c2pa.signature?.issuer || c2pa.claim_generator) && (
                <dl className="space-y-1.5 mb-4 text-[11px]">
                  {c2pa.claim_generator && (
                    <div className="flex gap-2">
                      <dt className="text-slate-500 shrink-0">{t("c2pa_generator")}</dt>
                      <dd className="text-slate-700 font-mono break-all">
                        {c2pa.claim_generator}
                      </dd>
                    </div>
                  )}
                  {c2pa.signature?.issuer && (
                    <div className="flex gap-2">
                      <dt className="text-slate-500 shrink-0">{t("c2pa_issuer")}</dt>
                      <dd className="text-slate-700 font-mono break-all">
                        {c2pa.signature.issuer}
                      </dd>
                    </div>
                  )}
                </dl>
              )}
              {data?.signed_url && (
                <a
                  href={`https://contentcredentials.org/verify?source=${encodeURIComponent(data.signed_url)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-700 hover:underline"
                >
                  {t("c2pa_inspect")} <ExternalLink size={12} />
                </a>
              )}
            </div>
          )}

          <div className="p-6 rounded-3xl bg-gradient-to-br from-purple-50/50 to-indigo-50/50 border border-purple-200 shadow-sm">
            <p className="text-sm text-purple-800 leading-relaxed">{t("verified_desc")}</p>
          </div>

          <button
            onClick={() => (window.location.href = "/")}
            className="w-full py-4 glass hover:bg-slate-100 text-slate-900 font-bold rounded-2xl border border-slate-200 transition-all flex items-center justify-center gap-2"
          >
            {t("try_now")}
          </button>
        </aside>
      </main>

      <footer className="max-w-5xl mx-auto mt-20 pt-12 border-t border-slate-100 flex flex-col items-center gap-6 text-gray-600 text-xs">
        <Link href="/">
          <img
            src="/logo-long.png"
            alt="OriPics Logo"
            className="h-24 object-contain opacity-60 hover:opacity-100 transition-opacity"
          />
        </Link>
        <div className="flex items-center gap-4">
          <Link href="/terms" className="hover:text-slate-900 transition-colors">
            {t("terms_link")}
          </Link>
          <Link href="/privacy" className="hover:text-slate-900 transition-colors">
            {t("privacy_link")}
          </Link>
          <Link href="/refund" className="hover:text-slate-900 transition-colors">
            {t("refund_link")}
          </Link>
          <a href="mailto:security@ori.pics" className="hover:text-slate-900 transition-colors">
            {t("security_link")}
          </a>
        </div>
        <p>{t("footer")}</p>
        <div className="text-[10px] text-slate-400 text-center leading-relaxed mt-1">
          <p>{t("business_info_line1")}</p>
          <p>{t("business_info_line2")}</p>
        </div>
      </footer>

      {isFullscreen && imageObjectUrl && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4 cursor-zoom-out"
          onClick={() => setIsFullscreen(false)}
        >
          <button
            onClick={(e) => {
              e.stopPropagation();
              setIsFullscreen(false);
            }}
            className="absolute top-4 right-4 w-11 h-11 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center text-white transition-colors"
            aria-label="Close"
          >
            <X size={24} />
          </button>
          <img
            src={imageObjectUrl}
            alt="Full Resolution"
            onClick={(e) => e.stopPropagation()}
            className="max-w-full max-h-full object-contain cursor-default"
          />
        </div>
      )}
    </div>
  );
}
