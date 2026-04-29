"use client";

import React, { useState, useRef, useEffect, ChangeEvent, DragEvent } from "react";
import { UploadCloud, CheckCircle, XCircle, ShieldCheck, AlertTriangle, RefreshCw, Download, User, LogOut, Image as ImageIcon, Camera, File as FileIcon, Clipboard, X, ChevronDown, HelpCircle } from "lucide-react";
import { useSession, signOut } from "next-auth/react";
import { Link, useRouter } from "@/navigation";
import { useTranslations } from "next-intl";

import LanguageSwitcher from "@/components/LanguageSwitcher";

type ProcessStatus = "idle" | "dragover" | "processing" | "result_stamped" | "result_verified" | "error";

interface MetaData {
  timestamp: string;
  width: number;
  height: number;
  hash?: string;
}

interface ApiResponse {
  status: "stamped" | "verified" | "error";
  match?: boolean;
  image?: string;
  message?: string;
  session_id?: string;
  metadata?: MetaData;
}

export default function Home() {
  const [status, setStatus] = useState<ProcessStatus>("idle");
  const [resultData, setResultData] = useState<ApiResponse | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [originalImagePreview, setOriginalImagePreview] = useState<string | null>(null);
  const { data: session } = useSession();
  const [sessionID, setSessionID] = useState<string | null>(null);
  const [timeLeft, setTimeLeft] = useState(0);
  const [generatedLink, setGeneratedLink] = useState<string | null>(null);
  const [isLinking, setIsLinking] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [uploadSource, setUploadSource] = useState<"F" | "P" | "C">("F");
  const [showUploadMenu, setShowUploadMenu] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [isMobileDevice, setIsMobileDevice] = useState(false);
  const router = useRouter();

  // Detect if mobile device
  useEffect(() => {
    const checkMobile = () => {
      const userAgent = typeof window !== 'undefined' ? navigator.userAgent || navigator.vendor || (window as any).opera : '';
      const mobileRegex = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i;
      setIsMobileDevice(mobileRegex.test(userAgent));
    };
    checkMobile();
  }, []);

  const t = useTranslations("Home");
  const tc = useTranslations("Common");
  const tLV = useTranslations("LinkViewer");


  // Timer for Link Creation Button (3 minutes)
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (status === "result_stamped" && timeLeft > 0) {
      timer = setInterval(() => {
        setTimeLeft((prev) => prev - 1);
      }, 1000);
    } else if (timeLeft === 0) {
      setSessionID(null); // Clear session after timeout
    }
    return () => clearInterval(timer);
  }, [status, timeLeft]);

  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      // Only capture paste if we are in idle or error state (not while processing)
      if (status !== "idle" && status !== "dragover" && status !== "error") return;

      const items = e.clipboardData?.items;
      if (!items) return;

      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf("image") !== -1) {
          const file = items[i].getAsFile();
          if (file) {
            processFile(file, "C");
            break;
          }
        }
      }
    };

    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, [status]);

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (status === "idle" || status === "dragover") setStatus("dragover");
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (status === "dragover") setStatus("idle");
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (status !== "idle" && status !== "dragover") return;
    setStatus("idle");
    const file = e.dataTransfer.files?.[0];
    if (file) processFile(file, "F");
  };

  const handleFileSelect = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file, uploadSource);
    // Reset value to allow selecting same file again
    e.target.value = "";
  };

  const onClickUpload = () => {
    setUploadSource("F");
    fileInputRef.current?.click();
  };

  const processFile = async (file: File, source: "F" | "P" | "C" = "F") => {
    setUploadSource(source);
    const supportedTypes = ["image/png", "image/jpeg", "image/webp", "image/bmp", "image/tiff", "image/gif"];
    if (!supportedTypes.includes(file.type)) {
      setStatus("error");
      setErrorMessage(t("errors.unsupported_format"));
      return;
    }

    if (file.size > 50 * 1024 * 1024) {
      setStatus("error");
      setErrorMessage(t("errors.size_limit"));
      return;
    }

    const previewUrl = URL.createObjectURL(file);
    setOriginalImagePreview(previewUrl);
    setStatus("processing");
    setErrorMessage("");

    const formData = new FormData();
    formData.append("file", file);
    formData.append("upload_type", source);

    try {
      const res = await fetch(`/api/process?upload_type=${source}`, {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const errorText = await res.text();
        let errorMsg = t("errors.server_error");
        try {
          const errorData = JSON.parse(errorText);
          const detail = errorData.detail || "";
          const knownCodes = ["empty_file", "invalid_image", "image_too_small"];
          errorMsg = knownCodes.includes(detail)
            ? t(`errors.${detail}`)
            : detail || errorMsg;
        } catch (e) {
          errorMsg = errorText || errorMsg;
        }
        throw new Error(errorMsg);
      }

      const data: ApiResponse = await res.json();
      setResultData(data);
      if (data.status === "stamped") {
        setStatus("result_stamped");
        setSessionID(data.session_id || null);
        setTimeLeft(180); // 3 minutes
        setGeneratedLink(null);
      }
      else setStatus("result_verified");
    } catch (err: any) {
      setStatus("error");
      setErrorMessage(err.message || t("errors.unknown_error"));
    }
  };

  const resetState = () => {
    setStatus("idle");
    setResultData(null);
    setErrorMessage("");
    setSessionID(null);
    setTimeLeft(0);
    setGeneratedLink(null);
    if (originalImagePreview) {
      URL.revokeObjectURL(originalImagePreview);
      setOriginalImagePreview(null);
    }
    // 화면 상단으로 스크롤 이동
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleDownload = () => {
    if (resultData?.image) {
      // 파일명 결정: 간편링크가 있으면 링크ID, 없으면 oripics_타임스탬프
      let filename = `oripics_${new Date().getTime()}.png`;
      if (generatedLink) {
        const parts = generatedLink.split('/');
        filename = `${parts[parts.length - 1]}.png`;
      }

      // iOS 기기 감지
      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

      if (isIOS) {
        const win = window.open();
        if (win) {
          win.document.write(`
            <html>
              <head>
                <title>${filename}</title>
                <meta name="viewport" content="width=device-width, initial-scale=1">
                <style>
                  body { margin: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; background: #000; min-height: 100vh; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
                  img { max-width: 100%; height: auto; shadow: 0 20px 50px rgba(0,0,0,0.5); }
                  .hint { position: fixed; top: 20px; background: rgba(255,255,255,0.9); color: #000; padding: 12px 24px; border-radius: 50px; font-weight: bold; font-size: 14px; box-shadow: 0 4px 15px rgba(0,0,0,0.3); z-index: 10; animation: fadeIn 0.5s ease-out; }
                  @keyframes fadeIn { from { opacity: 0; transform: translateY(-10px); } to { opacity: 1; transform: translateY(0); } }
                </style>
              </head>
              <body>
                <div class="hint">💡 사진을 길게 눌러 '사진 앱에 저장' 하세요</div>
                <img src="${resultData.image}" />
              </body>
            </html>
          `);
        } else {
          window.location.href = resultData.image;
        }
      } else {
        const a = document.createElement("a");
        a.href = resultData.image;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }
    }
  };

  const handleCreateLink = async () => {
    if (!sessionID || isLinking) return;
    setIsLinking(true);

    try {
      const res = await fetch("/api/links/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sessionID }),
      });

      if (!res.ok) throw new Error(t("errors.link_creation_failed"));

      const data = await res.json();
      const baseUrl = window.location.origin;
      const fullLink = `${baseUrl}/${data.link_id}`;
      setGeneratedLink(fullLink);
      setSessionID(null); // Used up

      // 로그인된 사용자인 경우 증명 히스토리 저장
      if (session?.user) {
        try {
          // 썸네일 생성 (스탬프된 이미지에서 축소)
          let thumbnailDataUrl: string | null = null;
          if (resultData?.image) {
            const img = new window.Image();
            img.src = resultData.image;
            await new Promise((resolve) => { img.onload = resolve; });
            const canvas = document.createElement("canvas");
            const maxSize = 200;
            const scale = Math.min(maxSize / img.width, maxSize / img.height);
            canvas.width = img.width * scale;
            canvas.height = img.height * scale;
            const ctx = canvas.getContext("2d");
            ctx?.drawImage(img, 0, 0, canvas.width, canvas.height);
            thumbnailDataUrl = canvas.toDataURL("image/webp", 0.6);
          }

          await fetch("/api/proof/history", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              linkId: data.link_id,
              thumbnail: thumbnailDataUrl,
              width: data.metadata?.width || resultData?.metadata?.width || 0,
              height: data.metadata?.height || resultData?.metadata?.height || 0,
              timestamp: data.metadata?.timestamp || resultData?.metadata?.timestamp || "",
            }),
          });
        } catch (historyErr) {
          console.error("Failed to save proof history:", historyErr);
          // 히스토리 저장 실패는 무시 (링크 생성은 이미 성공)
        }
      }
    } catch (err: any) {
      alert(err.message);
    } finally {
      setIsLinking(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    alert(t("errors.clipboard_success"));
  };

  const formatTimestamp = (ts: string) => {
    // Prefix (1) + yymmddHHMMSS (12) + ms/10 (2) = 15 chars
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
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
      timeZoneName: "short"
    });
  };

  return (
    <>
      <nav className="sticky top-0 w-full glass z-50 px-2 sm:px-6 py-3 sm:py-4 flex justify-between items-center text-[10px] sm:text-sm">
        <div className="flex items-center gap-2 cursor-pointer flex-shrink-0" onClick={() => window.scrollTo(0, 0)}>
          <img src="/logo.png" alt="OriPics Logo" className="w-8 h-8 sm:w-9 sm:h-9 object-contain" />
          <span className="font-bold text-lg sm:text-xl hidden xs:block">OriPics</span>
        </div>
        <div className="flex items-center gap-2 sm:gap-6">
          <LanguageSwitcher />

          {session ? (
            <div className="flex items-center gap-1.5 sm:gap-4 pl-2 sm:pl-6 border-l border-slate-200">
              <Link href="/profile" className="flex items-center gap-1.5 group hover:opacity-80 transition-all">
                <div className="w-7 h-7 sm:w-9 sm:h-9 rounded-full bg-blue-600/20 border border-slate-200 overflow-hidden flex items-center justify-center font-bold text-[9px] sm:text-xs">
                  {session.user?.image ? (
                    <img src={session.user.image} alt="Profile" className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-blue-600">{session.user?.name?.[0] || <User size={12} />}</span>
                  )}
                </div>
                <div className="hidden md:flex flex-col items-start">
                  <span className="font-semibold text-xs sm:text-sm leading-tight group-hover:text-blue-600 transition-colors whitespace-nowrap">
                    {session.user?.name}{tc("profile") === "Profile" ? "'s" : "님"}
                  </span>
                  <span className="text-xs text-slate-500">{tc("profile")}</span>
                </div>
              </Link>
              <button
                onClick={() => signOut()}
                className="p-1 sm:p-2 hover:bg-slate-100 rounded-lg text-slate-600 hover:text-slate-900 transition-colors"
                title={tc("logout")}
              >
                <LogOut size={14} />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 sm:gap-3">
              <Link href="/login" className="px-1.5 sm:px-4 py-2 hover:bg-white/80 rounded-xl transition-all whitespace-nowrap">{tc("login")}</Link>
              <Link href="/signup" className="px-2 sm:px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl transition-all shadow-lg shadow-blue-200/50 whitespace-nowrap">
                <span className="xs:hidden">{tc("signup").includes("무료") ? "가입" : "Signup"}</span>
                <span className="hidden xs:inline">{tc("signup")}</span>
              </Link>
            </div>
          )}
        </div>
      </nav>

      <main className="max-w-5xl mx-auto px-6 py-12 flex flex-col items-center">
        <section className="w-full text-center mb-16 pt-8 flex flex-col items-center">
          <h1 className="text-4xl md:text-5xl font-extrabold mb-6">{t("hero.title")}</h1>
          <p className="text-slate-700 md:text-lg mb-12 max-w-xl mx-auto whitespace-pre-line">
            {t("hero.description")}
          </p>

          {status !== "result_stamped" && status !== "result_verified" && (
            <div
              className={`w-full max-w-2xl p-10 rounded-2xl border-2 border-dashed transition-all duration-300 ${status === "dragover" ? "border-blue-400 bg-blue-500/10" : "border-slate-600 glass hover:border-slate-400"
                }`}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              {status === "idle" || status === "dragover" ? (
                <div className="flex flex-col items-center cursor-pointer" onClick={() => setShowUploadMenu(true)}>
                  <UploadCloud size={48} className={`mb-4 ${status === "dragover" ? "text-blue-600" : "text-slate-600"}`} />
                  <p className="text-xl font-medium mb-2">
                    {status === "dragover" ? t("upload.dragover") : t("upload.idle")}
                  </p>
                  <p className="text-sm text-slate-600 mt-1">{t("upload.subtext")}</p>
                  <p className="text-xs text-slate-500 mt-2">{t("upload.limit")}</p>
                </div>
              ) : status === "processing" ? (
                <div className="flex flex-col items-center py-6">
                  <RefreshCw size={40} className="animate-spin text-blue-600 mb-6" />
                  <p className="text-xl font-medium">{t("upload.processing")}</p>
                  <div className="w-full max-w-md bg-slate-100 rounded-full h-2 mt-6 overflow-hidden">
                    <div className="bg-blue-500 h-2 rounded-full animate-pulse w-full"></div>
                  </div>
                </div>
              ) : status === "error" ? (
                <div className="flex flex-col items-center text-red-600">
                  <AlertTriangle size={48} className="mb-4" />
                  <h3 className="text-xl font-bold mb-2">{t("upload.error")}</h3>
                  <p>{errorMessage}</p>
                  <button onClick={resetState} className="mt-6 px-6 py-2 bg-slate-100 hover:bg-slate-700 text-slate-900 rounded-lg flex items-center gap-2">
                    <RefreshCw size={16} /> {t("upload.retry")}
                  </button>
                </div>
              ) : null}
            </div>
          )}
        </section>

        {status === "result_stamped" && resultData?.metadata && (
          <section className="w-full max-w-3xl glass p-8 rounded-2xl mb-16 animate-in slide-in-from-bottom-4 fade-in duration-500">
            <div className="flex items-center gap-3 text-green-600 mb-8 border-b border-slate-200 pb-4">
              <CheckCircle size={28} />
              <h2 className="text-2xl font-bold">{t("result.stamped_title")}</h2>
            </div>

            <div className="flex flex-col md:flex-row gap-8 mb-8 items-center justify-center">
              <div className="flex flex-col items-center">
                <p className="mb-2 text-sm text-slate-600">{t("result.original_image")}</p>
                <img src={originalImagePreview!} className="max-w-[240px] max-h-[240px] object-contain rounded border border-slate-200" alt="Original" />
              </div>
              <div className="hidden md:flex text-2xl text-slate-500">➡️</div>
              <div className="flex flex-col items-center">
                <p className="mb-2 text-sm text-green-600 font-medium">{t("result.stamped_image")}</p>
                <img src={resultData.image} className="max-w-[240px] max-h-[240px] object-contain rounded border border-green-500/50 shadow-[0_0_15px_rgba(34,197,94,0.2)]" alt="Stamped" />
              </div>
            </div>

            <div className="bg-slate-50 rounded-xl p-6 mb-8 text-sm text-slate-700">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div><span className="text-slate-500 block mb-1">{t("result.timestamp")}</span> {formatTimestamp(resultData.metadata.timestamp)}</div>
                <div><span className="text-slate-500 block mb-1">{t("result.size")}</span> {resultData.metadata.width} × {resultData.metadata.height} px</div>
                <div>
                  <span className="text-slate-500 block mb-1">{t("result.upload_type")}</span>
                  <span className="font-medium text-slate-900">
                    {resultData.metadata.timestamp.startsWith("F") && t("upload.upload_menu.library")}
                    {resultData.metadata.timestamp.startsWith("P") && t("upload.upload_menu.camera")}
                    {resultData.metadata.timestamp.startsWith("C") && t("upload.upload_menu.clipboard")}
                    {!["F", "P", "C"].includes(resultData.metadata.timestamp[0]) && t("upload.upload_menu.library")}
                  </span>
                </div>
                <div className="pt-2">
                  <p className="text-blue-700 font-medium">{t("result.completed")}</p>
                </div>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <button onClick={handleDownload} className="px-6 py-3 bg-blue-600 hover:bg-blue-500 text-white font-medium rounded-xl flex items-center justify-center gap-2">
                <Download size={18} /> {t("result.download")}
              </button>
              <button onClick={resetState} className="px-6 py-3 glass hover:bg-slate-100 text-slate-900 font-medium rounded-xl flex items-center justify-center gap-2">
                <RefreshCw size={18} /> {t("result.process_another")}
              </button>
            </div>

            {sessionID && !generatedLink && timeLeft > 0 && (
              <div className="mt-8 flex flex-col items-center animate-in fade-in zoom-in duration-300">
                <button
                  onClick={handleCreateLink}
                  disabled={isLinking}
                  className="w-full max-w-md px-6 py-4 bg-slate-800 hover:bg-slate-700 text-white font-bold rounded-2xl shadow-lg shadow-slate-200/50 flex flex-col items-center gap-1 transition-all hover:scale-[1.02] active:scale-[0.98]"
                >
                  <span className="flex items-center gap-2">
                    {isLinking ? <RefreshCw className="animate-spin" size={20} /> : t("result.create_link")}
                  </span>
                  <span className="text-xs font-normal opacity-80 italic">
                    {uploadSource}
                    {resultData.metadata.timestamp.slice(1, 7)}-xxxx
                  </span>
                  <span className="text-xs font-normal opacity-80 mt-1">
                    {t("result.link_time_left", {
                      minutes: Math.floor(timeLeft / 60),
                      seconds: timeLeft % 60
                    })}
                  </span>
                </button>
              </div>
            )}

            {generatedLink && (
              <div className="mt-8 p-6 bg-slate-50 border border-slate-200 rounded-2xl animate-in zoom-in duration-500">
                <p className="text-slate-700 text-sm font-bold mb-3">{t("result.link_created")}</p>
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    readOnly
                    value={generatedLink}
                    className="flex-1 bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm text-blue-600 font-mono min-w-0 overflow-ellipsis"
                  />
                  <button
                    onClick={() => copyToClipboard(generatedLink)}
                    className="px-6 py-3 bg-slate-800 hover:bg-slate-700 text-white text-sm font-bold rounded-xl transition-colors whitespace-nowrap shadow-sm"
                  >
                    {t("result.copy")}
                  </button>
                </div>
                <p className="mt-3 text-[10px] text-slate-500 text-center">{t("result.link_hint")}</p>
              </div>
            )}

            <div className="mt-8 p-5 rounded-xl bg-slate-50 border border-slate-200">
              <p className="text-slate-600 font-semibold mb-3 flex items-center gap-2">
                {t("result.warning")}
              </p>
              <p className="text-slate-500 text-xs mb-4 leading-relaxed">
                {t("result.warning_desc")}
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
                <div className="bg-white border border-slate-100 rounded-lg p-3 text-center shadow-sm">
                  <p className="text-2xl mb-1">🔗</p>
                  <p className="text-slate-800 font-bold mb-1">{t("result.guide_1_title")}</p>
                  <p className="text-slate-600 text-xs whitespace-pre-line">{t("result.guide_1_desc")}</p>
                </div>
                <div className="bg-white border border-slate-100 rounded-lg p-3 text-center shadow-sm">
                  <p className="text-2xl mb-1">🗜️</p>
                  <p className="text-slate-800 font-bold mb-1">{t("result.guide_2_title")}</p>
                  <p className="text-slate-600 text-xs whitespace-pre-line">{t("result.guide_2_desc")}</p>
                </div>
                <div className="bg-white border border-slate-100 rounded-lg p-3 text-center shadow-sm">
                  <p className="text-2xl mb-1">☁️</p>
                  <p className="text-slate-800 font-bold mb-1">{t("result.guide_3_title")}</p>
                  <p className="text-slate-600 text-xs whitespace-pre-line">{t("result.guide_3_desc")}</p>
                </div>
              </div>
            </div>
          </section>
        )}

        {status === "result_verified" && resultData?.metadata && (
          <section className="w-full max-w-2xl glass p-8 rounded-2xl mb-16 animate-in slide-in-from-bottom-4 fade-in duration-500">
            <div className={`flex items-center gap-3 mb-6 border-b border-slate-200 pb-4 ${resultData.match ? "text-blue-600" : "text-orange-400"}`}>
              {resultData.match ? <ShieldCheck size={28} /> : <AlertTriangle size={28} />}
              <h2 className="text-2xl font-bold">{resultData.match ? t("verify.success_title") : t("verify.fail_title")}</h2>
            </div>

            <div className="flex flex-col items-center mb-8">
              <img src={originalImagePreview!} className="max-w-[200px] max-h-[200px] object-contain rounded border border-slate-200 mb-6" alt="Verify" />
              <div className="w-full bg-slate-50 rounded-xl p-6 text-sm text-slate-700">
                <div className="flex justify-between py-2 border-b border-slate-100">
                  <span className="text-slate-500">{t("verify.processed_at")}</span>
                  <span>{formatTimestamp(resultData.metadata.timestamp)}</span>
                </div>
                <div className="flex justify-between py-2 border-b border-slate-100">
                  <span className="text-slate-500">{t("result.size")}</span>
                  <span>{resultData.metadata.width} × {resultData.metadata.height} px</span>
                </div>
                <div className="flex justify-between py-2 border-b border-slate-100">
                  <span className="text-slate-500">{t("result.upload_type")}</span>
                  <span className="font-medium">
                    {resultData.metadata.timestamp.startsWith("F") && t("upload.upload_menu.library")}
                    {resultData.metadata.timestamp.startsWith("P") && t("upload.upload_menu.camera")}
                    {resultData.metadata.timestamp.startsWith("C") && t("upload.upload_menu.clipboard")}
                    {!["F", "P", "C"].includes(resultData.metadata.timestamp[0]) && t("upload.upload_menu.library")}
                  </span>
                </div>
                <div className="flex justify-between py-2 items-center">
                  <span className="text-slate-500">{t("verify.integrity")}</span>
                  {resultData.match ? (
                    <span className="px-3 py-1 bg-blue-500/20 text-blue-700 rounded-full text-xs font-bold border border-blue-200">{t("verify.match")}</span>
                  ) : (
                    <span className="px-3 py-1 bg-red-50 text-red-300 rounded-full text-xs font-bold border border-red-200">{t("verify.mismatch")}</span>
                  )}
                </div>
              </div>
            </div>

            <div className={`p-4 rounded-xl mb-8 ${resultData.match ? "bg-blue-900/20 text-blue-200" : "bg-orange-900/20 text-orange-200"}`}>
              {resultData.match ? (
                <p>{t("verify.success_desc")}</p>
              ) : (
                <p className="font-medium">{t("verify.fail_desc")}</p>
              )}
            </div>

            <div className="flex justify-center">
              <button onClick={resetState} className="px-6 py-3 glass hover:bg-slate-100 text-slate-900 font-medium rounded-xl flex items-center justify-center gap-2">
                <RefreshCw size={18} /> {t("verify.verify_another")}
              </button>
            </div>
          </section>
        )}

        <section id="how-it-works" className="w-full max-w-4xl mt-12 mb-20 scroll-mt-24">
          <h2 className="text-3xl font-bold text-center mb-12">{t("how_it_works.title")}</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="glass p-6 rounded-2xl flex flex-col items-center text-center">
              <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center font-bold text-xl mb-4">1</div>
              <h3 className="font-bold text-lg mb-2">{t("how_it_works.step1_title")}</h3>
              <p className="text-slate-600 text-sm whitespace-pre-line">{t("how_it_works.step1_desc")}</p>
            </div>
            <div className="glass p-6 rounded-2xl flex flex-col items-center text-center">
              <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center font-bold text-xl mb-4 text-blue-600">2</div>
              <h3 className="font-bold text-lg mb-2">{t("how_it_works.step2_title")}</h3>
              <p className="text-slate-600 text-sm whitespace-pre-line">{t("how_it_works.step2_desc")}</p>
            </div>
            <div className="glass p-6 rounded-2xl flex flex-col items-center text-center">
              <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center font-bold text-xl mb-4 text-green-600">3</div>
              <h3 className="font-bold text-lg mb-2">{t("how_it_works.step3_title")}</h3>
              <p className="text-slate-600 text-sm whitespace-pre-line">{t("how_it_works.step3_desc")}</p>
            </div>
          </div>
        </section>

      </main>

      {/* FAQ Section */}
      <section className="w-full max-w-3xl mx-auto px-6 py-20">
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-blue-500/10 rounded-full text-blue-600 text-xs font-semibold tracking-wider uppercase mb-4">
            <HelpCircle size={14} />
            FAQ
          </div>
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">{t("faq.title")}</h2>
        </div>

        <div className="space-y-3">
          {[0, 1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className={`border rounded-2xl transition-all duration-300 overflow-hidden ${
                openFaq === i
                  ? "border-blue-200 bg-blue-500/5 shadow-lg shadow-blue-500/5"
                  : "border-slate-200 bg-white/[0.02] hover:border-slate-300"
              }`}
            >
              <button
                onClick={() => setOpenFaq(openFaq === i ? null : i)}
                className="w-full flex items-center justify-between p-5 text-left gap-4"
              >
                <span className={`font-semibold text-sm sm:text-base transition-colors ${
                  openFaq === i ? "text-blue-600" : "text-slate-900"
                }`}>
                  {t(`faq.items.${i}.q`)}
                </span>
                <ChevronDown
                  size={18}
                  className={`shrink-0 text-slate-500 transition-transform duration-300 ${
                    openFaq === i ? "rotate-180 text-blue-600" : ""
                  }`}
                />
              </button>
              <div
                className={`transition-all duration-300 ease-in-out ${
                  openFaq === i
                    ? "max-h-60 opacity-100"
                    : "max-h-0 opacity-0"
                }`}
              >
                <p className="px-5 pb-5 text-sm text-slate-600 leading-relaxed">
                  {t(`faq.items.${i}.a`)}
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <footer className="w-full border-t border-slate-200 py-16 flex flex-col items-center gap-8 text-slate-500 text-sm">
        <img src="/logo-long.png" alt="OriPics Logo" className="h-24 object-contain opacity-60 hover:opacity-100 transition-opacity cursor-pointer" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} />
        <a href="mailto:hi@ori.pics" className="px-6 py-2 border border-slate-200 rounded-full hover:bg-white/80 transition-all">
          {tc("contact")}
        </a>
        <p>{tLV("footer")}</p>
      </footer>
      {/* Custom Upload Menu (Action Sheet) */}
      {showUploadMenu && (
        <div className="fixed inset-0 z-[100] flex items-end justify-center sm:items-center p-4 animate-in fade-in duration-300">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowUploadMenu(false)}></div>
          <div className="relative w-full max-w-md bg-white border border-slate-200 rounded-t-3xl sm:rounded-3xl overflow-hidden shadow-2xl animate-in slide-in-from-bottom-10 duration-300">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center">
              <h3 className="text-lg font-bold">{t("upload.upload_menu.title")}</h3>
              <button onClick={() => setShowUploadMenu(false)} className="p-2 hover:bg-white/80 rounded-full text-slate-600">
                <X size={20} />
              </button>
            </div>
            <div className="p-2">
              {isMobileDevice && (
                <button
                  onClick={() => {
                    setUploadSource("P");
                    cameraInputRef.current?.click();
                    setShowUploadMenu(false);
                  }}
                  className="w-full flex items-center gap-4 p-4 hover:bg-white/80 rounded-2xl transition-all text-left"
                >
                  <div className="w-10 h-10 rounded-xl bg-orange-500/20 flex items-center justify-center text-orange-600">
                    <Camera size={22} />
                  </div>
                  <span className="font-medium">{t("upload.upload_menu.camera")}</span>
                </button>
              )}

              {isMobileDevice && (
                <button
                  onClick={() => {
                    setUploadSource("F");
                    fileInputRef.current?.click();
                    setShowUploadMenu(false);
                  }}
                  className="w-full flex items-center gap-4 p-4 hover:bg-white/80 rounded-2xl transition-all text-left"
                >
                  <div className="w-10 h-10 rounded-xl bg-blue-500/20 flex items-center justify-center text-blue-600">
                    <ImageIcon size={22} />
                  </div>
                  <span className="font-medium">{t("upload.upload_menu.library")}</span>
                </button>
              )}

              <button
                onClick={() => {
                  setUploadSource("F");
                  fileInputRef.current?.click();
                  setShowUploadMenu(false);
                }}
                className="w-full flex items-center gap-4 p-4 hover:bg-white/80 rounded-2xl transition-colors text-left"
              >
                <div className="w-10 h-10 rounded-xl bg-amber-500/20 flex items-center justify-center text-amber-600">
                  <FileIcon size={22} />
                </div>
                <span className="font-medium">{t("upload.upload_menu.file")}</span>
              </button>

              <div className="h-px bg-white/80 my-2"></div>

              <button
                onClick={async () => {
                  setShowUploadMenu(false);
                  try {
                    const clipboardItems = await navigator.clipboard.read();
                    for (const item of clipboardItems) {
                      for (const type of item.types) {
                        if (type.startsWith('image/')) {
                          const blob = await item.getType(type);
                          const file = new File([blob], "pasted_image.png", { type });
                          processFile(file, "C");
                          return;
                        }
                      }
                    }
                    alert(t("upload.upload_menu.no_image"));
                  } catch (err) {
                    console.error("Failed to read clipboard:", err);
                    alert(t("upload.upload_menu.paste_error"));
                  }
                }}
                className="w-full flex items-center gap-4 p-4 hover:bg-white/80 rounded-2xl transition-colors text-left"
              >
                <div className="w-10 h-10 rounded-xl bg-green-500/20 flex items-center justify-center text-green-600">
                  <Clipboard size={22} />
                </div>
                <div className="flex flex-col">
                  <span className="font-medium">{t("upload.upload_menu.paste")}</span>
                  <span className="text-xs text-slate-500">{t("upload.upload_menu.paste_subtext")}</span>
                </div>
              </button>
            </div>
            <div className="p-4 bg-slate-100">
              <button
                onClick={() => setShowUploadMenu(false)}
                className="w-full py-3 text-sm font-bold text-slate-600 hover:text-slate-900 transition-colors"
              >
                {t("upload.upload_menu.cancel")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Hidden file input moved here to prevent auto-trigger on some mobile browsers */}
      <input
        type="file"
        className="hidden"
        accept="image/png,image/jpeg,image/webp,image/bmp,image/tiff,image/gif"
        ref={fileInputRef}
        onChange={handleFileSelect}
      />
      <input
        type="file"
        className="hidden"
        accept="image/png,image/jpeg,image/webp,image/bmp,image/tiff,image/gif"
        capture="environment"
        ref={cameraInputRef}
        onChange={handleFileSelect}
      />
    </>
  );
}
