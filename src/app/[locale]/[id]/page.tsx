"use client";

import React, { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { ShieldCheck, Calendar, Maximize2, Download, AlertCircle, RefreshCw, Home, Copy, Check, Upload, MapPin, Expand, X } from "lucide-react";
import { Link } from "@/navigation";
import { useTranslations } from "next-intl";
import { supabase } from "@/lib/supabase";
import { verifyLinkId } from "@/lib/oripics-stamp/common";

interface LinkData {
  link_id: string;
  timestamp: string;
  width: number;
  height: number;
  lat?: number | null;
  lng?: number | null;
  storage_path: string;
  signed_url: string;
}

export default function LinkViewer() {
  const params = useParams();
  const linkId = params.id as string;
  const t = useTranslations("LinkViewer");

  const [data, setData] = useState<LinkData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [imageObjectUrl, setImageObjectUrl] = useState<string | null>(null);
  const [downloadedBytes, setDownloadedBytes] = useState(0);
  const [totalBytes, setTotalBytes] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);

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
        const { data: row, error: dbError } = await supabase
          .from("links")
          .select("*")
          .eq("link_id", linkId)
          .single();

        if (dbError || !row) throw new Error(t("not_found_desc"));
        setData(row as LinkData);
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
  }, [data?.signed_url]);

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
                    <p className="text-sm font-medium font-mono">
                      {data!.lat!.toFixed(6)}, {data!.lng!.toFixed(6)}
                    </p>
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

            <div className="mt-10 pt-8 border-t border-slate-200">
              <button
                onClick={handleDownload}
                className="w-full py-4 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-2xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-blue-200/50"
              >
                <Download size={20} /> {t("download")}
              </button>
            </div>
          </div>

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

      <footer className="max-w-5xl mx-auto mt-20 pt-12 border-t border-slate-100 flex flex-col items-center gap-8 text-gray-600 text-xs">
        <Link href="/">
          <img
            src="/logo-long.png"
            alt="OriPics Logo"
            className="h-24 object-contain opacity-60 hover:opacity-100 transition-opacity"
          />
        </Link>
        <p>{t("footer")}</p>
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
