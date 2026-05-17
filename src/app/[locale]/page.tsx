"use client";

import React, { useState, useRef, useEffect, ChangeEvent, DragEvent } from "react";
import { UploadCloud, CheckCircle, XCircle, ShieldCheck, AlertTriangle, RefreshCw, Download, User, LogOut, Image as ImageIcon, Camera, File as FileIcon, Clipboard, X, ChevronDown, HelpCircle, ExternalLink, ImageUp, Lock, Share2 } from "lucide-react";
import { useSession, signOut } from "next-auth/react";
import { Link, useRouter } from "@/navigation";
import { useTranslations } from "next-intl";

import LanguageSwitcher from "@/components/LanguageSwitcher";
import {
  signAndStampFromPixels,
  confirmStamped,
  publishStamped,
  verifyImage,
  detectStamp,
  type StampedDraft,
  type DetectResult,
} from "@/lib/oripics-stamp";
import { saveReceipt, getReceipt, removeReceipt } from "@/lib/oripics-stamp/receipts";
import { useCredits } from "@/lib/credits/useCredits";
import { CREDIT_COSTS } from "@/lib/payment";
import { getProofMultiplier } from "@/lib/credits/sizeMultiplier";

type ProcessStatus = "idle" | "dragover" | "processing" | "size_selection" | "result_stamped" | "result_multi" | "result_verified" | "error";

interface SingleResult {
  draft: StampedDraft;
  display: ApiResponse;
  /** 인증(confirm) 후 받은 receipt JWT — publish 버튼 클릭 시 재제출 */
  receipt: string | null;
  proofCost: number;
  /** 단계: confirming → ready(publish 버튼 대기) → publishing(Storage PUT + C2PA + DB) → published */
  phase: "confirming" | "ready" | "publishing" | "published" | "error";
  link: string | null;
  error: string | null;
  /** 사이즈 라벨 — 멀티 결과 카드 헤더에 표시 */
  variant: "standard" | "original";
  /** 업로드 진행률 (loaded/total bytes) — publishing 중 Storage PUT 진행률 */
  uploadProgress?: { loaded: number; total: number };
}

interface MetaData {
  timestamp: string;
  width: number;
  height: number;
  lat?: number;
  lng?: number;
  hash?: string;
}

interface ApiResponse {
  status: "stamped" | "verified" | "error";
  match?: boolean;
  image?: string;
  message?: string;
  session_id?: string;
  metadata?: MetaData;
  owner_exempt?: boolean;
}

const KNOWN_ERROR_CODES = ["empty_file", "invalid_image", "image_too_small", "dimension_mismatch"];

const MAX_DIMENSION = 1800;

// 원본 사이즈 측정 — 빠른 dimensions probe (decode 비용 회피).
// 메타에 박힐 width/height와 동일하게 createImageBitmap이 반환하는 값을 사용.
async function probeDimensions(file: Blob): Promise<{ width: number; height: number }> {
  const bitmap = await createImageBitmap(file);
  const { width, height } = bitmap;
  bitmap.close();
  return { width, height };
}

async function decodeAndMaybeResize(
  file: Blob,
  options?: { skipResize?: boolean },
): Promise<{ pixels: Uint8ClampedArray; width: number; height: number }> {
  const bitmap = await createImageBitmap(file);
  const { width: srcW, height: srcH } = bitmap;
  const longest = Math.max(srcW, srcH);
  let targetW = srcW;
  let targetH = srcH;
  if (!options?.skipResize && longest > MAX_DIMENSION) {
    const scale = MAX_DIMENSION / longest;
    targetW = Math.round(srcW * scale);
    targetH = Math.round(srcH * scale);
  }
  const canvas = document.createElement("canvas");
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) {
    bitmap.close();
    throw new Error("canvas_context_failed");
  }
  ctx.drawImage(bitmap, 0, 0, targetW, targetH);
  bitmap.close();
  const imageData = ctx.getImageData(0, 0, targetW, targetH);
  return { pixels: imageData.data, width: targetW, height: targetH };
}

function translateBackendError(detail: string, t: (k: string) => string): string {
  if (KNOWN_ERROR_CODES.includes(detail)) return t(`errors.${detail}`);
  return detail || t("errors.server_error");
}

export default function Home() {
  const [status, setStatus] = useState<ProcessStatus>("idle");
  const [resultData, setResultData] = useState<ApiResponse | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [originalImagePreview, setOriginalImagePreview] = useState<string | null>(null);
  const { data: session, status: sessionStatus } = useSession();
  const [sessionID, setSessionID] = useState<string | null>(null);
  const [stampedDraft, setStampedDraft] = useState<StampedDraft | null>(null);
  // B-2'' (2026-05-17): confirm 후 publish에 필요한 정보 보관. 같은 페이지 세션에서만 publish 가능.
  const [confirmedSingle, setConfirmedSingle] = useState<{ stampedBlob: Blob; signedUploadUrl: string; receipt: string; linkId: string; timestamp: string; proofCost: number } | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [timeLeft, setTimeLeft] = useState(0);
  const [generatedLink, setGeneratedLink] = useState<string | null>(null);
  const [isLinking, setIsLinking] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [uploadSource, setUploadSource] = useState<"F" | "P" | "C">("F");
  const [showUploadMenu, setShowUploadMenu] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [cameraEnabled, setCameraEnabled] = useState(false);
  const [debugMessage, setDebugMessage] = useState<string | null>(null);
  const [showInsufficientModal, setShowInsufficientModal] = useState(false);
  const [verifyConfirm, setVerifyConfirm] = useState<{ file: File; detect: DetectResult } | null>(null);
  const { data: credits, refresh: refreshCredits } = useCredits();

  // 원본 사이즈 옵션 — 긴 변 > 1800px 이미지가 들어왔을 때 사용자가 선택
  const [sizeSelection, setSizeSelection] = useState<{
    file: File;
    source: "F" | "P" | "C";
    gps?: { lat: number; lng: number } | null;
    originalWidth: number;
    originalHeight: number;
    standardChecked: boolean;
    originalChecked: boolean;
  } | null>(null);
  // 양쪽 체크 시 결과 (1개 자리는 stampedDraft/resultData로 표시, 2개면 multiResults로 표시)
  const [multiResults, setMultiResults] = useState<SingleResult[] | null>(null);
  // 처리 진행 표시: 경과 초 + 단계 라벨 (멀티 시 "1/2 기준 사이즈" 등)
  const [processingElapsed, setProcessingElapsed] = useState(0);
  const [processingStep, setProcessingStep] = useState<{ current: number; total: number; variant: "standard" | "original" } | null>(null);
  // 단일 결과 publish(업로드+confirm) 진행률
  const [singleUploadProgress, setSingleUploadProgress] = useState<{ loaded: number; total: number } | null>(null);

  type GpsState = 'unknown' | 'unsupported' | 'prompt' | 'granted' | 'denied';
  type HelpPlatform = 'ios_safari' | 'ios_chrome' | 'android' | 'desktop';
  const [gpsState, setGpsState] = useState<GpsState>('unknown');
  const [gpsCoords, setGpsCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [gpsIncludeEnabled, setGpsIncludeEnabled] = useState(true);
  const [watermarkEnabled, setWatermarkEnabled] = useState(true);
  const [showGpsHelpModal, setShowGpsHelpModal] = useState(false);
  const [showWatermarkHelpModal, setShowWatermarkHelpModal] = useState(false);
  const [helpOpenSection, setHelpOpenSection] = useState<HelpPlatform | null>(null);

  const detectHelpPlatform = (): HelpPlatform => {
    if (typeof window === 'undefined') return 'desktop';
    const ua = navigator.userAgent || '';
    const isIos = /iphone|ipad|ipod/i.test(ua) || (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1);
    if (isIos) {
      // iOS Chrome은 UA에 "CriOS" 포함 (Firefox는 FxiOS, Edge는 EdgiOS)
      if (/CriOS|FxiOS|EdgiOS|OPiOS/i.test(ua)) return 'ios_chrome';
      return 'ios_safari';
    }
    if (/android/i.test(ua)) return 'android';
    return 'desktop';
  };

  const openGpsHelpModal = () => {
    setHelpOpenSection(detectHelpPlatform());
    setShowGpsHelpModal(true);
  };

  const router = useRouter();

  // 카메라 버튼 노출 여부 결정.
  // 1) 사용자가 명시적으로 토글한 적 있으면 localStorage 값을 우선
  // 2) 없으면 자동 감지 (mobile UA 또는 iPadOS 13+ Macintosh+touch)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const saved = localStorage.getItem('oripics_camera_enabled');
    if (saved === 'true' || saved === 'false') {
      setCameraEnabled(saved === 'true');
      return;
    }
    const userAgent = navigator.userAgent || navigator.vendor || (window as any).opera || '';
    const mobileRegex = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i;
    const isIpadOS13Plus = /Macintosh/i.test(userAgent) && navigator.maxTouchPoints > 1;
    setCameraEnabled(mobileRegex.test(userAgent) || isIpadOS13Plus);
  }, []);

  const handleCameraToggle = (enabled: boolean) => {
    setCameraEnabled(enabled);
    if (typeof window !== 'undefined') {
      localStorage.setItem('oripics_camera_enabled', enabled ? 'true' : 'false');
    }
  };

  // GPS 좌표 fetch (저정확도/고정확도 옵션). state(gpsCoords) 업데이트 + 토스트 메시지 표시.
  const fetchGps = (highAccuracy: boolean): Promise<{ lat: number; lng: number } | null> => {
    return new Promise((resolve) => {
      if (!navigator.geolocation) {
        resolve(null);
        return;
      }
      let settled = false;
      const finish = (msg: string | null, value: { lat: number; lng: number } | null) => {
        if (settled) return;
        settled = true;
        clearTimeout(safetyTimer);
        if (msg) setDebugMessage(msg);
        resolve(value);
      };
      const safetyTimer = setTimeout(() => {
        finish("GPS 타임아웃 (폴백)", null);
      }, highAccuracy ? 12000 : 6000);
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const c = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          setGpsCoords(c);
          setGpsState('granted');
          finish(
            `GPS OK: ${c.lat.toFixed(6)}, ${c.lng.toFixed(6)} (정확도 ${Math.round(pos.coords.accuracy)}m)`,
            c,
          );
        },
        (err) => {
          if (err.code === 1) setGpsState('denied');
          const codeMap: Record<number, string> = { 1: "PERMISSION_DENIED", 2: "POSITION_UNAVAILABLE", 3: "TIMEOUT" };
          finish(
            `GPS 실패: code=${err.code} (${codeMap[err.code] || "?"}) ${err.message || ""}`,
            null,
          );
        },
        { timeout: highAccuracy ? 10000 : 5000, maximumAge: 60000, enableHighAccuracy: highAccuracy },
      );
    });
  };

  // 페이지 로드 시 GPS 권한 query + (granted면) 저정확도 워밍업
  useEffect(() => {
    if (typeof window === 'undefined') return;

    // 'GPS 포함' 체크박스 상태 로드
    const savedInclude = localStorage.getItem('oripics_gps_include');
    if (savedInclude === 'true' || savedInclude === 'false') {
      setGpsIncludeEnabled(savedInclude === 'true');
    }

    // '인증마크 포함' 체크박스 상태 로드
    const savedWatermark = localStorage.getItem('oripics_watermark_include');
    if (savedWatermark === 'true' || savedWatermark === 'false') {
      setWatermarkEnabled(savedWatermark === 'true');
    }

    if (!navigator.geolocation) {
      setGpsState('unsupported');
      return;
    }

    if (!navigator.permissions) {
      // 권한 API 미지원 (Safari 일부 옛 버전): 직접 호출 시도
      fetchGps(false);
      return;
    }

    let perm: PermissionStatus | null = null;
    const onChange = () => {
      if (perm) setGpsState(perm.state as GpsState);
    };
    navigator.permissions.query({ name: 'geolocation' as PermissionName }).then((p) => {
      perm = p;
      setGpsState(p.state as GpsState);
      p.addEventListener('change', onChange);
      if (p.state === 'granted') {
        fetchGps(false); // 저정확도 워밍업 (배터리/속도 절약)
      }
    }).catch(() => {
      // query 자체가 실패하면 fallback
      fetchGps(false);
    });

    return () => {
      perm?.removeEventListener('change', onChange);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // GPS 포함 체크박스 ON + 권한 granted → 고정확도 재요청 (배터리 절약 위해 ON 시점에만)
  useEffect(() => {
    if (gpsIncludeEnabled && gpsState === 'granted') {
      fetchGps(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gpsIncludeEnabled, gpsState]);

  const handleGpsIncludeToggle = (enabled: boolean) => {
    setGpsIncludeEnabled(enabled);
    if (typeof window !== 'undefined') {
      localStorage.setItem('oripics_gps_include', enabled ? 'true' : 'false');
    }
  };

  const handleWatermarkToggle = (enabled: boolean) => {
    setWatermarkEnabled(enabled);
    if (typeof window !== 'undefined') {
      localStorage.setItem('oripics_watermark_include', enabled ? 'true' : 'false');
    }
  };

  // 인디케이터 클릭: prompt 상태면 권한 요청, denied/unsupported면 안내 모달
  const handleGpsIndicatorClick = () => {
    if (gpsState === 'prompt' || gpsState === 'unknown') {
      fetchGps(true); // 권한 팝업 트리거 + 고정확도 측위
    } else if (gpsState === 'denied' || gpsState === 'unsupported') {
      openGpsHelpModal();
    }
  };

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

  // 처리 경과 초 카운터 — status === "processing" 동안만 1초 tick
  useEffect(() => {
    if (status !== "processing") {
      setProcessingElapsed(0);
      setProcessingStep(null);
      return;
    }
    const start = Date.now();
    setProcessingElapsed(0);
    const timer = setInterval(() => {
      setProcessingElapsed(Math.floor((Date.now() - start) / 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, [status]);

  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      // Only capture paste if we are in idle or error state (not while processing)
      if (status !== "idle" && status !== "dragover" && status !== "error") return;
      if (sessionStatus === "unauthenticated") {
        router.push("/login");
        return;
      }

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
  }, [status, sessionStatus, router]);

  // GPS 토스트 자동 닫힘: 최종 상태(요청 중이 아닌 결과 메시지) 표시 후 3초 뒤 사라짐
  useEffect(() => {
    if (!debugMessage || debugMessage === "GPS 요청 중...") return;
    const timer = setTimeout(() => setDebugMessage(null), 3000);
    return () => clearTimeout(timer);
  }, [debugMessage]);

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (status === "idle" || status === "dragover") setStatus("dragover");
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (status === "dragover") setStatus("idle");
  };

  const requireAuthOrRedirect = (): boolean => {
    if (sessionStatus === "unauthenticated") {
      router.push("/login");
      return false;
    }
    return true;
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (status !== "idle" && status !== "dragover") return;
    setStatus("idle");
    if (!requireAuthOrRedirect()) return;
    const file = e.dataTransfer.files?.[0];
    if (file) processFile(file, "F");
  };

  const handleFileSelect = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    let gps: { lat: number; lng: number } | null = null;
    if (uploadSource === "P" && gpsIncludeEnabled && gpsState === 'granted') {
      setStatus("processing");
      // GPS는 페이지 로드 + 'GPS 포함' 체크박스 ON 시점에 이미 fetch됨 → state(gpsCoords) 사용
      // 캐시가 없으면 짧은 fallback 호출
      if (gpsCoords) {
        gps = gpsCoords;
      } else {
        gps = await new Promise<{ lat: number; lng: number } | null>((resolve) => {
          const t = setTimeout(() => resolve(null), 1500);
          navigator.geolocation.getCurrentPosition(
            (pos) => { clearTimeout(t); resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }); },
            () => { clearTimeout(t); resolve(null); },
            { timeout: 1500, maximumAge: 60000, enableHighAccuracy: true },
          );
        });
      }
    }
    processFile(file, uploadSource, gps);
  };

  const onClickUpload = () => {
    setUploadSource("F");
    fileInputRef.current?.click();
  };

  // 인증 확인 모달에서 "예" → 풀 verify 호출 (-1 차감)
  const handleVerifyConfirmYes = async () => {
    const ctx = verifyConfirm;
    if (!ctx) return;
    setVerifyConfirm(null);
    setStatus("processing");
    try {
      const verifyRes = await verifyImage(ctx.file, { apiBase: "" });
      if (verifyRes.reason === "verify_http_402" || /:402:/.test(verifyRes.reason ?? "")) {
        setStatus("idle");
        setShowInsufficientModal(true);
        void refreshCredits();
        return;
      }
      if (verifyRes.metadata) {
        setResultData({
          status: "verified",
          match: verifyRes.match,
          metadata: verifyRes.metadata,
          owner_exempt: verifyRes.owner_exempt,
        });
        setStatus("result_verified");
        void refreshCredits();
        return;
      }
      setStatus("error");
      setErrorMessage(t("errors.unknown_error"));
    } catch (err: any) {
      const raw = String(err?.message || err || "");
      if (/:402:/.test(raw)) {
        setStatus("idle");
        setShowInsufficientModal(true);
        void refreshCredits();
        return;
      }
      setStatus("error");
      setErrorMessage(raw || t("errors.unknown_error"));
    }
  };

  // 인증 확인 모달에서 "아니오" → 차감 없이 닫기 (idle 복귀)
  const handleVerifyConfirmNo = () => {
    setVerifyConfirm(null);
    setStatus("idle");
  };

  const processFile = async (file: File, source: "F" | "P" | "C" = "F", gps?: { lat: number; lng: number } | null) => {
    if (!requireAuthOrRedirect()) return;
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

    try {
      if (file.type === "image/png") {
        // 무료 detect — magic byte만 확인. 해시·서버 호출 없음.
        const detect = await detectStamp(file);
        if (detect.hasStamp) {
          // 이미 인증된 이미지 — 풀 verify는 차감이라 사용자 확인 필요.
          setStatus("idle");
          setVerifyConfirm({ file, detect });
          return;
        }
        // no_stamp → stamp 흐름으로 진입
      }

      // 사이즈 확인: 긴 변 > 1800px면 size_selection 단계로 분기 (1개·2개 결과물 선택)
      const dims = await probeDimensions(file);
      const longest = Math.max(dims.width, dims.height);
      if (longest > MAX_DIMENSION) {
        setStatus("size_selection");
        setSizeSelection({
          file,
          source,
          gps: gps ?? null,
          originalWidth: dims.width,
          originalHeight: dims.height,
          standardChecked: false,
          originalChecked: false,
        });
        return;
      }

      const decoded = await decodeAndMaybeResize(file);
      const draft = await signAndStampFromPixels(
        decoded.pixels,
        decoded.width,
        decoded.height,
        { apiBase: "", uploadType: source, gps, watermark: watermarkEnabled },
      );
      setStampedDraft(draft);
      // B-2'': proof 비용만 차감 (작은 JSON). Storage 업로드는 publish 버튼 클릭 시점.
      setConfirming(true);
      const confirmed = await confirmStamped(draft, { apiBase: "" });
      setConfirming(false);
      saveReceipt({
        receipt: confirmed.receipt,
        timestamp: confirmed.timestamp,
        linkId: confirmed.link_id,
        width: draft.width,
        height: draft.height,
      });
      const stampedUrl = URL.createObjectURL(draft.blob);
      setConfirmedSingle({
        stampedBlob: draft.blob,
        signedUploadUrl: draft.sign.signed_upload_url,
        receipt: confirmed.receipt,
        linkId: confirmed.link_id,
        timestamp: confirmed.timestamp,
        proofCost: confirmed.proofCost,
      });
      setResultData({
        status: "stamped",
        image: stampedUrl,
        session_id: draft.sign.link_id,
        metadata: {
          timestamp: draft.sign.timestamp,
          width: draft.width,
          height: draft.height,
          lat: draft.gps?.lat,
          lng: draft.gps?.lng,
        },
      });
      setSessionID(draft.sign.link_id);
      setTimeLeft(draft.sign.jwt_ttl);
      setGeneratedLink(null);
      setStatus("result_stamped");
      void refreshCredits();
    } catch (err: any) {
      setConfirming(false);
      setSingleUploadProgress(null);
      const raw = String(err?.message || err || "");
      const m = raw.match(/^(?:sign_failed|verify_http|upload_failed|confirm_failed):(\d+):(.*)$/);
      // 402(잔액 부족) → 일반 에러 대신 전용 모달 노출
      if (m && m[1] === "402") {
        setStatus("idle");
        setShowInsufficientModal(true);
        void refreshCredits();
        return;
      }
      setStatus("error");
      if (m) {
        try {
          const parsed = JSON.parse(m[2]);
          if (parsed.detail === "insufficient_credits") {
            setStatus("idle");
            setShowInsufficientModal(true);
            void refreshCredits();
            return;
          }
          setErrorMessage(translateBackendError(parsed.detail || "", t));
        } catch {
          setErrorMessage(translateBackendError(m[2], t));
        }
      } else if (raw === "image_too_small" || KNOWN_ERROR_CODES.includes(raw)) {
        setErrorMessage(t(`errors.${raw}`));
      } else {
        setErrorMessage(raw || t("errors.unknown_error"));
      }
    }
  };

  /**
   * size_selection에서 사용자가 1개 또는 2개 옵션을 체크하고 진행 클릭 시 호출.
   * - 1개 체크: 기존 단일 result_stamped 흐름으로 진입 (preview → 사용자가 link 발급 클릭)
   * - 2개 체크: 두 옵션 모두 즉시 sign + publish 자동 실행 후 result_multi 표시
   */
  const handleSizeSelectionConfirm = async () => {
    if (!sizeSelection) return;
    const { file, source, gps, standardChecked, originalChecked } = sizeSelection;
    if (!standardChecked && !originalChecked) return;

    const wantsBoth = standardChecked && originalChecked;
    setStatus("processing");
    setErrorMessage("");

    try {
      if (!wantsBoth) {
        // 단일 옵션 — single-result 흐름 (B-2: signAndStamp + 자동 confirmStamped, publish는 버튼 클릭 시)
        const skipResize = originalChecked;
        const decoded = await decodeAndMaybeResize(file, { skipResize });
        const draft = await signAndStampFromPixels(
          decoded.pixels,
          decoded.width,
          decoded.height,
          { apiBase: "", uploadType: source, gps: gps ?? undefined, watermark: watermarkEnabled },
        );
        setStampedDraft(draft);
        setConfirming(true);
        const confirmed = await confirmStamped(draft, { apiBase: "" });
        setConfirming(false);
        saveReceipt({
          receipt: confirmed.receipt,
          timestamp: confirmed.timestamp,
          linkId: confirmed.link_id,
          width: draft.width,
          height: draft.height,
        });
        const stampedUrl = URL.createObjectURL(draft.blob);
        setConfirmedSingle({
          stampedBlob: draft.blob,
          signedUploadUrl: draft.sign.signed_upload_url,
          receipt: confirmed.receipt,
          linkId: confirmed.link_id,
          timestamp: confirmed.timestamp,
          proofCost: confirmed.proofCost,
        });
        setResultData({
          status: "stamped",
          image: stampedUrl,
          session_id: draft.sign.link_id,
          metadata: {
            timestamp: draft.sign.timestamp,
            width: draft.width,
            height: draft.height,
            lat: draft.gps?.lat,
            lng: draft.gps?.lng,
          },
        });
        setSessionID(draft.sign.link_id);
        setTimeLeft(draft.sign.jwt_ttl);
        setGeneratedLink(null);
        setSizeSelection(null);
        setStatus("result_stamped");
        void refreshCredits();
        return;
      }

      // 양쪽 모두 체크 — 순차 처리 + 자동 publish
      const results: SingleResult[] = [];
      const variants = ["standard", "original"] as const;
      for (let i = 0; i < variants.length; i++) {
        const variant = variants[i];
        setProcessingStep({ current: i + 1, total: variants.length, variant });
        const skipResize = variant === "original";
        const decoded = await decodeAndMaybeResize(file, { skipResize });
        const draft = await signAndStampFromPixels(
          decoded.pixels,
          decoded.width,
          decoded.height,
          { apiBase: "", uploadType: source, gps: gps ?? undefined, watermark: watermarkEnabled },
        );
        const stampedUrl = URL.createObjectURL(draft.blob);
        const display: ApiResponse = {
          status: "stamped",
          image: stampedUrl,
          session_id: draft.sign.link_id,
          metadata: {
            timestamp: draft.sign.timestamp,
            width: draft.width,
            height: draft.height,
            lat: draft.gps?.lat,
            lng: draft.gps?.lng,
          },
        };
        results.push({
          draft, display, variant,
          receipt: null, proofCost: 0,
          phase: "confirming",
          link: null, error: null,
        });
      }
      setMultiResults(results);
      setSizeSelection(null);
      setStatus("result_multi");
      void refreshCredits();

      // 각 결과물에 대해 confirmStamped 호출 (C2PA 적용 + proof cost 차감). 병렬 처리.
      // publish는 사용자가 "간편링크 생성" 버튼 클릭 시 별도 흐름.
      results.forEach((item, idx) => {
        confirmStamped(item.draft, { apiBase: "" })
          .then((confirmed) => {
            saveReceipt({
              receipt: confirmed.receipt,
              timestamp: confirmed.timestamp,
              linkId: confirmed.link_id,
              width: item.draft.width,
              height: item.draft.height,
            });
            setMultiResults((prev) => {
              if (!prev) return prev;
              const copy = [...prev];
              copy[idx] = {
                ...copy[idx],
                receipt: confirmed.receipt,
                proofCost: confirmed.proofCost,
                phase: "ready",
              };
              return copy;
            });
            void refreshCredits();
          })
          .catch((err: any) => {
            const raw = String(err?.message || err || "");
            setMultiResults((prev) => {
              if (!prev) return prev;
              const copy = [...prev];
              copy[idx] = { ...copy[idx], phase: "error", error: raw };
              return copy;
            });
          });
      });
    } catch (err: any) {
      const raw = String(err?.message || err || "");
      const m = raw.match(/^(?:sign_failed|verify_http|upload_failed|confirm_failed):(\d+):(.*)$/);
      if (m && m[1] === "402") {
        setStatus("idle");
        setShowInsufficientModal(true);
        void refreshCredits();
        setSizeSelection(null);
        return;
      }
      setStatus("error");
      if (m) {
        try {
          const parsed = JSON.parse(m[2]);
          if (parsed.detail === "insufficient_credits") {
            setStatus("idle");
            setShowInsufficientModal(true);
            void refreshCredits();
            setSizeSelection(null);
            return;
          }
          setErrorMessage(translateBackendError(parsed.detail || "", t));
        } catch {
          setErrorMessage(translateBackendError(m[2], t));
        }
      } else if (raw === "image_too_small" || KNOWN_ERROR_CODES.includes(raw)) {
        setErrorMessage(t(`errors.${raw}`));
      } else {
        setErrorMessage(raw || t("errors.unknown_error"));
      }
      setSizeSelection(null);
    }
  };

  const handleSizeSelectionCancel = () => {
    setSizeSelection(null);
    setStatus("idle");
    if (originalImagePreview) {
      URL.revokeObjectURL(originalImagePreview);
      setOriginalImagePreview(null);
    }
  };

  // multi-result 카드별 간편링크 생성 핸들러 (LINK_CREATE -2 차감)
  const handleMultiPublish = async (idx: number) => {
    if (!multiResults) return;
    const item = multiResults[idx];
    if (!item || item.phase !== "ready" || !item.receipt) return;

    setMultiResults((prev) => {
      if (!prev) return prev;
      const copy = [...prev];
      copy[idx] = { ...copy[idx], phase: "publishing", error: null, uploadProgress: undefined };
      return copy;
    });

    try {
      // 썸네일 생성 (history용)
      let thumbnailDataUrl: string | null = null;
      try {
        const img = new window.Image();
        img.src = URL.createObjectURL(item.draft.blob);
        await new Promise<void>((r) => { img.onload = () => r(); });
        const canvas = document.createElement("canvas");
        const maxSize = 150;
        const scale = Math.min(maxSize / img.width, maxSize / img.height);
        canvas.width = img.width * scale;
        canvas.height = img.height * scale;
        canvas.getContext("2d")?.drawImage(img, 0, 0, canvas.width, canvas.height);
        thumbnailDataUrl = canvas.toDataURL("image/webp", 0.6);
        URL.revokeObjectURL(img.src);
      } catch { /* thumbnail은 best-effort */ }

      const result = await publishStamped({
        apiBase: "",
        blob: item.draft.blob,
        signedUploadUrl: item.draft.sign.signed_upload_url,
        receipt: item.receipt,
        thumbnailDataUrl,
        onUploadProgress: (loaded, total) => {
          setMultiResults((prev) => {
            if (!prev) return prev;
            const copy = [...prev];
            copy[idx] = { ...copy[idx], uploadProgress: { loaded, total } };
            return copy;
          });
        },
      });
      const linkUrl = `${window.location.origin}/${result.link_id}`;
      // 공개 완료 → localStorage receipt 제거
      removeReceipt(item.draft.sign.timestamp);
      // CDN warm-up
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      if (supabaseUrl) {
        fetch(result.public_url, { method: "HEAD", cache: "no-cache" }).catch(() => {});
      }
      setMultiResults((prev) => {
        if (!prev) return prev;
        const copy = [...prev];
        copy[idx] = { ...copy[idx], phase: "published", link: linkUrl, uploadProgress: undefined };
        return copy;
      });
      void refreshCredits();
    } catch (err: any) {
      const raw = String(err?.message || err || "");
      setMultiResults((prev) => {
        if (!prev) return prev;
        const copy = [...prev];
        copy[idx] = { ...copy[idx], phase: "ready", error: raw, uploadProgress: undefined };
        return copy;
      });
    }
  };

  const resetState = () => {
    setStatus("idle");
    if (resultData?.image && resultData.image.startsWith("blob:")) {
      URL.revokeObjectURL(resultData.image);
    }
    if (multiResults) {
      for (const r of multiResults) {
        if (r.display.image?.startsWith("blob:")) URL.revokeObjectURL(r.display.image);
      }
    }
    setResultData(null);
    setMultiResults(null);
    setSizeSelection(null);
    setErrorMessage("");
    setSessionID(null);
    setStampedDraft(null);
    setConfirmedSingle(null);
    setConfirming(false);
    setTimeLeft(0);
    setGeneratedLink(null);
    setDebugMessage(null);
    setSingleUploadProgress(null);
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
    if (!confirmedSingle || isLinking) return;
    setIsLinking(true);
    setSingleUploadProgress({ loaded: 0, total: confirmedSingle.stampedBlob.size });

    try {
      // 썸네일 생성 (history 표시용)
      let thumbnailDataUrl: string | null = null;
      try {
        const img = new window.Image();
        img.src = URL.createObjectURL(confirmedSingle.stampedBlob);
        await new Promise<void>((r) => { img.onload = () => r(); });
        const canvas = document.createElement("canvas");
        const maxSize = 150;
        const scale = Math.min(maxSize / img.width, maxSize / img.height);
        canvas.width = img.width * scale;
        canvas.height = img.height * scale;
        canvas.getContext("2d")?.drawImage(img, 0, 0, canvas.width, canvas.height);
        thumbnailDataUrl = canvas.toDataURL("image/webp", 0.6);
        URL.revokeObjectURL(img.src);
      } catch { /* best-effort */ }

      const result = await publishStamped({
        apiBase: "",
        blob: confirmedSingle.stampedBlob,
        signedUploadUrl: confirmedSingle.signedUploadUrl,
        receipt: confirmedSingle.receipt,
        thumbnailDataUrl,
        onUploadProgress: (loaded, total) => setSingleUploadProgress({ loaded, total }),
      });
      const baseUrl = window.location.origin;
      const fullLink = `${baseUrl}/${result.link_id}`;
      setGeneratedLink(fullLink);
      setSessionID(null);

      // 공개 완료 → localStorage receipt 제거
      removeReceipt(confirmedSingle.timestamp);

      // CDN warm-up
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      if (supabaseUrl && result.public_url) {
        fetch(result.public_url, { method: "HEAD", cache: "no-cache" }).catch(() => { });
      }

      setStampedDraft(null);
      setConfirmedSingle(null);
      void refreshCredits();
    } catch (err: any) {
      const raw = String(err?.message || err || "");
      const match = raw.match(/^(?:publish_failed):\d+:(.*)$/);
      let msg = raw;
      if (match) {
        try {
          const parsed = JSON.parse(match[1]);
          msg = translateBackendError(parsed.detail || "", t);
        } catch {
          msg = match[1];
        }
      }
      alert(msg || t("errors.link_creation_failed"));
    } finally {
      setIsLinking(false);
      setSingleUploadProgress(null);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    alert(t("errors.clipboard_success"));
  };

  const handleShare = async (text: string) => {
    const shareData = {
      title: t("result.share_title"),
      text: `${t("result.share_text")}\n${text}`,
      url: text,
    };

    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      try {
        await navigator.share(shareData);
        return;
      } catch (err) {
        if ((err as DOMException)?.name === "AbortError") return;
      }
    }

    try {
      await navigator.clipboard.writeText(text);
      alert(t("result.share_unsupported"));
    } catch {
      alert(t("errors.clipboard_failed"));
    }
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
              {credits && (
                <Link
                  href="/profile#credits"
                  className="inline-flex items-center gap-1 px-2 sm:px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 text-[11px] sm:text-xs font-semibold border border-blue-100 hover:bg-blue-100 transition-colors whitespace-nowrap"
                  title={t("credits.chip_title", { count: credits.credits })}
                >
                  {t("credits.chip", { count: Math.floor(credits.credits / CREDIT_COSTS.IMAGE_PROOF) })}
                </Link>
              )}
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
          <h1 className="text-4xl md:text-5xl font-extrabold mb-6 whitespace-pre-line md:whitespace-normal">{t("hero.title")}</h1>
          <p className="text-slate-700 md:text-lg mb-12 max-w-xl mx-auto whitespace-pre-line">
            {t("hero.description")}
          </p>

          {status !== "result_stamped" && status !== "result_verified" && (
            <div className="w-full max-w-2xl flex flex-col items-center">
              {(status === "idle" || status === "dragover") && (
                <div className="w-full flex justify-start mb-2 text-xs gap-1">
                  <label className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-white border border-slate-200 text-slate-700 cursor-pointer hover:bg-slate-50 select-none">
                    <input
                      type="checkbox"
                      checked={watermarkEnabled}
                      onChange={(e) => handleWatermarkToggle(e.target.checked)}
                      className="rounded border-slate-300 text-orange-500 focus:ring-orange-500 w-3.5 h-3.5"
                    />
                    <span>{t('upload.watermark_include')}</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowWatermarkHelpModal(true)}
                    className="w-6 h-6 rounded-full bg-white border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-700 flex items-center justify-center"
                    aria-label={t('upload.watermark_help_aria') as string}
                  >
                    <HelpCircle size={14} />
                  </button>
                </div>
              )}
              <div
                className={`relative w-full p-10 rounded-2xl border-2 border-dashed transition-all duration-300 ${status === "dragover" ? "border-blue-400 bg-blue-500/10" : "border-slate-600 glass hover:border-slate-400"
                  }`}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
              >
                {cameraEnabled && (status === "idle" || status === "dragover") && (
                  <div className="absolute top-3 right-3 flex items-center gap-2 text-xs">
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); handleGpsIndicatorClick(); }}
                      className={`flex items-center gap-1 px-2 py-1 rounded-full font-medium transition-colors ${gpsState === 'granted'
                        ? 'bg-green-50 text-green-700 hover:bg-green-100'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                      title={gpsCoords ? `${gpsCoords.lat.toFixed(6)}, ${gpsCoords.lng.toFixed(6)}` : ''}
                    >
                      <span aria-hidden>{gpsState === 'granted' ? '🟢' : '⚪'}</span>
                      <span>
                        {gpsState === 'granted' ? t('gps.status_active') : t('gps.status_inactive')}
                      </span>
                    </button>
                    {(gpsState === 'denied' || gpsState === 'prompt' || gpsState === 'unsupported') && (
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); openGpsHelpModal(); }}
                        className="w-6 h-6 rounded-full bg-white border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-700 flex items-center justify-center"
                        aria-label={t('gps.help_button')}
                      >
                        <HelpCircle size={14} />
                      </button>
                    )}
                    <label
                      onClick={(e) => e.stopPropagation()}
                      className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-white border border-slate-200 text-slate-700 cursor-pointer hover:bg-slate-50 select-none"
                    >
                      <input
                        type="checkbox"
                        checked={gpsIncludeEnabled}
                        onChange={(e) => handleGpsIncludeToggle(e.target.checked)}
                        className="rounded border-slate-300 text-orange-500 focus:ring-orange-500 w-3.5 h-3.5"
                      />
                      <span>{t('gps.include_label')}</span>
                    </label>
                  </div>
                )}
                {status === "idle" || status === "dragover" ? (
                  <div className="flex flex-col items-center cursor-pointer" onClick={() => { if (!requireAuthOrRedirect()) return; setShowUploadMenu(true); }}>
                    <div className="flex items-center justify-center gap-6 mb-4">
                      <UploadCloud size={64} strokeWidth={1.5} className={`${status === "dragover" ? "text-blue-600" : "text-slate-600"}`} />
                      {cameraEnabled && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setUploadSource("P");
                            cameraInputRef.current?.click();
                          }}
                          className="shrink-0 flex items-center justify-center p-5 rounded-2xl bg-white hover:bg-slate-50 active:bg-slate-100 text-orange-600 border border-slate-200 shadow-sm transition-all"
                          aria-label={t("upload.upload_menu.camera")}
                        >
                          <Camera size={64} strokeWidth={1.5} />
                        </button>
                      )}
                    </div>
                    <p className="text-xl font-medium mb-2 whitespace-pre-line">
                      {status === "dragover"
                        ? t("upload.dragover")
                        : cameraEnabled
                          ? t("upload.idle_mobile")
                          : t("upload.idle")}
                    </p>
                    <p className="text-sm text-slate-600 mt-1">{cameraEnabled ? t("upload.subtext_mobile") : t("upload.subtext")}</p>
                    <p className="text-xs text-slate-500 mt-2">{t("upload.limit")}</p>
                    {sessionStatus === "unauthenticated" && (
                      <p className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-3 py-1">
                        <Lock size={12} /> {t("upload.login_required")}
                      </p>
                    )}
                  </div>
                ) : status === "processing" ? (
                  <div className="flex flex-col items-center py-6">
                    <RefreshCw size={40} className="animate-spin text-blue-600 mb-6" />
                    <p className="text-xl font-medium">
                      {processingStep
                        ? t("upload.processing_step", {
                            current: processingStep.current,
                            total: processingStep.total,
                            label:
                              processingStep.variant === "original"
                                ? t("size_select.original_label")
                                : t("size_select.standard_label"),
                          })
                        : t("upload.processing")}
                    </p>
                    <p className="text-sm text-slate-500 mt-1 font-mono">{processingElapsed}s</p>
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
              {(status === "idle" || status === "dragover") && (
                <label className="mt-4 inline-flex items-center gap-2 text-xs text-slate-500 cursor-pointer hover:text-slate-700 select-none">
                  <input
                    type="checkbox"
                    checked={cameraEnabled}
                    onChange={(e) => handleCameraToggle(e.target.checked)}
                    className="rounded border-slate-300 text-orange-500 focus:ring-orange-500"
                  />
                  {t("upload.toggle_camera")}
                </label>
              )}
            </div>
          )}
        </section>

        {status === "size_selection" && sizeSelection && (() => {
          const { originalWidth, originalHeight, standardChecked, originalChecked } = sizeSelection;
          // B-2 (2026-05-17): 사이즈 선택 화면은 인증(proof) 비용만 표시.
          // 간편링크 생성(LINK_CREATE -2)은 publish 버튼 클릭 시 별도 차감 — 여기 합계에 포함 X.
          const stdMult = 1;
          const origMult = getProofMultiplier(originalWidth, originalHeight);
          const stdCost = CREDIT_COSTS.IMAGE_PROOF * stdMult; // 3
          const origCost = CREDIT_COSTS.IMAGE_PROOF * origMult; // 6 or 9
          const totalCost =
            (standardChecked ? stdCost : 0) + (originalChecked ? origCost : 0);
          const longest = Math.max(originalWidth, originalHeight);
          const pixels = originalWidth * originalHeight;
          const noneSelected = !standardChecked && !originalChecked;

          return (
            <section className="w-full max-w-3xl glass p-8 rounded-2xl mb-16 animate-in slide-in-from-bottom-4 fade-in duration-500">
              <div className="flex items-center gap-3 text-blue-600 mb-6 border-b border-slate-200 pb-4">
                <ImageUp size={28} />
                <h2 className="text-2xl font-bold">{t("size_select.title")}</h2>
              </div>
              <p className="text-sm text-slate-700 mb-2">
                {t.rich("size_select.intro", {
                  w: originalWidth,
                  h: originalHeight,
                  mp: (pixels / 1_000_000).toFixed(1),
                  strong: (chunks) => <strong className="font-semibold">{chunks}</strong>,
                })}
              </p>
              <p className="text-xs text-slate-500 mb-6">
                {longest > 10000 || pixels > 100_000_000
                  ? t("size_select.hint_huge")
                  : t("size_select.hint_large")}
              </p>

              {/* 업로드한 이미지 미리보기 — Blob URL이 있을 때만 표시 (페이지 새로고침 시 손실) */}
              {originalImagePreview && (
                <div className="flex justify-center mb-6">
                  <img
                    src={originalImagePreview}
                    alt={t("size_select.preview_alt") as string}
                    className="max-w-full max-h-[260px] object-contain rounded-lg border border-slate-200 bg-slate-50"
                  />
                </div>
              )}

              <div className="space-y-3 mb-6">
                <label
                  className={`flex items-start gap-3 p-4 rounded-xl border-2 cursor-pointer transition-all ${
                    standardChecked
                      ? "border-blue-500 bg-blue-50/60"
                      : "border-slate-200 bg-white hover:border-slate-300"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={standardChecked}
                    onChange={(e) =>
                      setSizeSelection((s) => (s ? { ...s, standardChecked: e.target.checked } : s))
                    }
                    className="mt-1 w-5 h-5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  <div className="flex-1">
                    <div className="flex justify-between items-baseline mb-1">
                      <span className="font-semibold text-slate-900">
                        {t("size_select.standard_label")}
                      </span>
                      <span className="text-xs font-mono text-slate-500">
                        ≤ {MAX_DIMENSION}px · {stdCost} {t("size_select.credits")}
                      </span>
                    </div>
                    <p className="text-xs text-slate-600">{t("size_select.standard_desc")}</p>
                  </div>
                </label>

                <label
                  className={`flex items-start gap-3 p-4 rounded-xl border-2 cursor-pointer transition-all ${
                    originalChecked
                      ? "border-purple-500 bg-purple-50/60"
                      : "border-slate-200 bg-white hover:border-slate-300"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={originalChecked}
                    onChange={(e) =>
                      setSizeSelection((s) => (s ? { ...s, originalChecked: e.target.checked } : s))
                    }
                    className="mt-1 w-5 h-5 rounded border-slate-300 text-purple-600 focus:ring-purple-500"
                  />
                  <div className="flex-1">
                    <div className="flex justify-between items-baseline mb-1">
                      <span className="font-semibold text-slate-900">
                        {t("size_select.original_label")}
                      </span>
                      <span className="text-xs font-mono text-slate-500">
                        {originalWidth}×{originalHeight} · {origCost} {t("size_select.credits")}{" "}
                        <span className="text-purple-600">({origMult}×)</span>
                      </span>
                    </div>
                    <p className="text-xs text-slate-600">{t("size_select.original_desc")}</p>
                  </div>
                </label>
              </div>

              {!noneSelected && (
                <div className="mb-4 p-3 rounded-lg bg-slate-50 border border-slate-200">
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-slate-600">{t("size_select.total_label")}</span>
                    <span className="font-bold text-slate-900">
                      {totalCost} {t("size_select.credits")}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-1.5">
                    {t("size_select.link_extra_note", { cost: CREDIT_COSTS.LINK_CREATE })}
                  </p>
                </div>
              )}

              <div className="flex gap-3">
                <button
                  onClick={handleSizeSelectionCancel}
                  className="flex-1 py-3 rounded-xl border border-slate-300 bg-white text-slate-700 font-semibold hover:bg-slate-50 transition-colors"
                >
                  {t("size_select.cancel")}
                </button>
                <button
                  onClick={handleSizeSelectionConfirm}
                  disabled={noneSelected}
                  className="flex-1 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold shadow-lg shadow-blue-200/50 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                >
                  {t("size_select.confirm")}
                </button>
              </div>
            </section>
          );
        })()}

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
                {resultData.metadata.lat != null && resultData.metadata.lng != null && (
                  <div>
                    <span className="text-slate-500 block mb-1">GPS</span>
                    <a
                      href={`https://maps.google.com/?q=${resultData.metadata.lat},${resultData.metadata.lng}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-mono text-xs text-blue-700 hover:underline inline-flex items-center gap-1"
                    >
                      {resultData.metadata.lat.toFixed(6)}, {resultData.metadata.lng.toFixed(6)}
                      <ExternalLink size={16} />
                    </a>
                  </div>
                )}
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
              <div className="mt-8 flex flex-col items-center animate-in fade-in zoom-in duration-300 w-full">
                <p className="text-xs text-slate-500 mb-3 text-center max-w-md">
                  {t("result.c2pa_after_publish_note")}
                </p>
                <button
                  onClick={handleCreateLink}
                  disabled={isLinking}
                  className="w-full max-w-md px-6 py-4 bg-slate-800 hover:bg-slate-700 text-white font-bold rounded-2xl shadow-lg shadow-slate-200/50 flex flex-col items-center gap-1 transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-80 disabled:cursor-not-allowed disabled:hover:scale-100"
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
                {isLinking && singleUploadProgress && singleUploadProgress.total > 0 && (() => {
                  const pct = Math.min(
                    100,
                    Math.round((singleUploadProgress.loaded / singleUploadProgress.total) * 100),
                  );
                  return (
                    <div className="w-full max-w-md mt-3">
                      <div className="flex justify-between text-xs text-slate-600 mb-1">
                        <span>{t("result.uploading")}</span>
                        <span className="font-mono">
                          {pct}% ({(singleUploadProgress.loaded / (1024 * 1024)).toFixed(1)}/
                          {(singleUploadProgress.total / (1024 * 1024)).toFixed(1)} MB)
                        </span>
                      </div>
                      <div className="w-full bg-slate-200 rounded-full h-2 overflow-hidden">
                        <div
                          className="bg-blue-600 h-2 rounded-full transition-all duration-150"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })()}
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
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleShare(generatedLink)}
                      className="flex-1 sm:flex-none px-5 py-3 bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold rounded-xl transition-colors whitespace-nowrap shadow-sm flex items-center justify-center gap-1.5"
                    >
                      <Share2 size={16} />
                      {t("result.share")}
                    </button>
                    <button
                      onClick={() => copyToClipboard(generatedLink)}
                      className="flex-1 sm:flex-none px-5 py-3 bg-slate-800 hover:bg-slate-700 text-white text-sm font-bold rounded-xl transition-colors whitespace-nowrap shadow-sm flex items-center justify-center gap-1.5"
                    >
                      <Clipboard size={16} />
                      {t("result.copy")}
                    </button>
                  </div>
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

        {status === "result_multi" && multiResults && (
          <section className="w-full max-w-5xl mx-auto glass p-8 rounded-2xl mb-16 animate-in slide-in-from-bottom-4 fade-in duration-500">
            <div className="flex items-center gap-3 text-green-600 mb-6 border-b border-slate-200 pb-4">
              <CheckCircle size={28} />
              <h2 className="text-2xl font-bold">{t("result.multi_title")}</h2>
            </div>
            <p className="text-sm text-slate-600 mb-6">{t("result.multi_desc")}</p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
              {multiResults.map((item, idx) => (
                <div
                  key={item.draft.sign.link_id}
                  className="bg-white rounded-2xl border-2 border-slate-200 p-6 flex flex-col"
                >
                  <div
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold mb-3 self-start ${
                      item.variant === "original"
                        ? "bg-purple-100 text-purple-700"
                        : "bg-blue-100 text-blue-700"
                    }`}
                  >
                    {item.variant === "original"
                      ? t("size_select.original_label")
                      : t("size_select.standard_label")}{" "}
                    · {item.draft.width}×{item.draft.height}
                  </div>

                  <div className="flex justify-center mb-4 bg-slate-50 rounded-xl p-3">
                    <img
                      src={item.display.image}
                      alt={`Result ${idx + 1}`}
                      className="max-w-full max-h-[200px] object-contain rounded"
                    />
                  </div>

                  {(item.phase === "confirming" || item.phase === "publishing") && (() => {
                    const total = item.uploadProgress?.total ?? item.draft.blob.size;
                    const loaded = item.uploadProgress?.loaded ?? 0;
                    const pct = total > 0 ? Math.min(100, Math.round((loaded / total) * 100)) : 0;
                    return (
                      <div className="mb-3">
                        <div className="flex items-center justify-between text-xs text-slate-600 mb-1">
                          <span className="flex items-center gap-1.5">
                            <RefreshCw size={12} className="animate-spin" />
                            {item.phase === "confirming"
                              ? t("result.confirming")
                              : item.uploadProgress
                                ? t("result.uploading")
                                : t("result.publishing")}
                          </span>
                          {item.uploadProgress && total > 0 && (
                            <span className="font-mono">
                              {pct}% ({(loaded / (1024 * 1024)).toFixed(1)}/
                              {(total / (1024 * 1024)).toFixed(1)} MB)
                            </span>
                          )}
                        </div>
                        <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                          <div
                            className="bg-blue-600 h-1.5 rounded-full transition-all duration-150"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })()}

                  {item.error && (
                    <p className="text-xs text-rose-600 mb-2">
                      {t("result.publish_error")}: {item.error.slice(0, 80)}
                    </p>
                  )}

                  {item.phase === "ready" && (
                    <>
                      <p className="text-xs text-slate-500 mb-2">
                        {t("result.c2pa_after_publish_note")}
                      </p>
                      <button
                        onClick={() => handleMultiPublish(idx)}
                        className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg flex items-center justify-center gap-2 text-sm transition-colors mb-3"
                      >
                        {t("result.create_link_button", { cost: CREDIT_COSTS.LINK_CREATE })}
                      </button>
                    </>
                  )}

                  {item.link && (
                    <div className="mb-3">
                      <p className="text-xs text-slate-500 mb-1">{t("result.short_link")}</p>
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          readOnly
                          value={item.link}
                          className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-blue-700 font-mono outline-none min-w-0"
                        />
                        <button
                          onClick={() => copyToClipboard(item.link!)}
                          className="p-2 bg-blue-600/20 hover:bg-blue-600/40 text-blue-600 rounded-lg flex-shrink-0"
                          title={t("result.copy_link")}
                        >
                          <Clipboard size={14} />
                        </button>
                        <button
                          onClick={() => handleShare(item.link!)}
                          className="p-2 bg-blue-600/20 hover:bg-blue-600/40 text-blue-600 rounded-lg flex-shrink-0"
                          title={t("result.share")}
                        >
                          <Share2 size={14} />
                        </button>
                      </div>
                    </div>
                  )}

                  <button
                    onClick={() => {
                      const a = document.createElement("a");
                      a.href = item.display.image!;
                      a.download = `${item.draft.sign.link_id}.png`;
                      a.click();
                    }}
                    className="mt-auto w-full py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-900 font-semibold rounded-lg flex items-center justify-center gap-2 text-sm transition-colors"
                  >
                    <Download size={16} /> {t("result.download_stamped")}
                  </button>
                </div>
              ))}
            </div>

            <button
              onClick={resetState}
              className="w-full py-3 bg-white border border-slate-300 hover:bg-slate-50 text-slate-900 font-bold rounded-xl flex items-center justify-center gap-2"
            >
              <RefreshCw size={18} /> {t("result.process_another")}
            </button>
          </section>
        )}

        {status === "result_verified" && resultData?.metadata && (
          <section className="w-full max-w-2xl glass p-8 rounded-2xl mb-16 animate-in slide-in-from-bottom-4 fade-in duration-500">
            <div className={`flex items-center gap-3 mb-2 ${resultData.match ? "text-blue-600" : "text-orange-400"}`}>
              {resultData.match ? <ShieldCheck size={28} /> : <AlertTriangle size={28} />}
              <h2 className="text-2xl font-bold">{resultData.match ? t("verify.success_title") : t("verify.fail_title")}</h2>
            </div>
            {resultData.owner_exempt && (
              <div className="mb-4 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-50 text-emerald-700 text-xs font-semibold border border-emerald-200">
                <CheckCircle size={14} /> {t("verify.owner_exempt")}
              </div>
            )}
            <div className="border-b border-slate-200 pb-4 mb-6"></div>

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
                {resultData.metadata.lat != null && resultData.metadata.lng != null && (
                  <div className="flex justify-between py-2 border-b border-slate-100">
                    <span className="text-slate-500">GPS</span>
                    <a
                      href={`https://maps.google.com/?q=${resultData.metadata.lat},${resultData.metadata.lng}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-mono text-xs text-blue-700 hover:underline inline-flex items-center gap-1"
                    >
                      {resultData.metadata.lat.toFixed(6)}, {resultData.metadata.lng.toFixed(6)}
                      <ExternalLink size={16} />
                    </a>
                  </div>
                )}
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

            <div className={`p-4 rounded-xl mb-8 ${resultData.match ? "bg-blue-50 text-blue-900 border border-blue-200" : "bg-orange-50 text-orange-900 border border-orange-200"}`}>
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
          <div className="relative grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* 데스크톱 전용 점선 커넥터 — 카드 간 진행 흐름 시각화 */}
            <div className="hidden md:block absolute top-[5.5rem] left-[16.6%] right-[16.6%] border-t-2 border-dashed border-slate-200 pointer-events-none" aria-hidden="true"></div>

            <div className="glass p-6 rounded-2xl flex flex-col items-center text-center relative bg-white/60">
              <span className="text-[10px] font-mono font-bold tracking-[0.2em] text-sky-600 mb-3">STEP 01</span>
              <div className="relative mb-4">
                <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-sky-400 to-blue-500 text-white flex items-center justify-center shadow-lg shadow-sky-400/25 ring-4 ring-sky-50">
                  <ImageUp size={36} strokeWidth={1.75} />
                </div>
              </div>
              <h3 className="font-bold text-lg mb-2">{t("how_it_works.step1_title")}</h3>
              <p className="text-slate-600 text-sm whitespace-pre-line">{t("how_it_works.step1_desc")}</p>
            </div>

            <div className="glass p-6 rounded-2xl flex flex-col items-center text-center relative bg-white/60">
              <span className="text-[10px] font-mono font-bold tracking-[0.2em] text-teal-600 mb-3">STEP 02</span>
              <div className="relative mb-4">
                <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-cyan-400 to-teal-500 text-white flex items-center justify-center shadow-lg shadow-teal-400/25 ring-4 ring-teal-50">
                  <Lock size={36} strokeWidth={1.75} />
                </div>
              </div>
              <h3 className="font-bold text-lg mb-2">{t("how_it_works.step2_title")}</h3>
              <p className="text-slate-600 text-sm whitespace-pre-line">{t("how_it_works.step2_desc")}</p>
            </div>

            <div className="glass p-6 rounded-2xl flex flex-col items-center text-center relative bg-white/60">
              <span className="text-[10px] font-mono font-bold tracking-[0.2em] text-emerald-600 mb-3">STEP 03</span>
              <div className="relative mb-4">
                <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-emerald-400 to-green-500 flex items-center justify-center shadow-lg shadow-emerald-400/25 ring-4 ring-emerald-50 p-3">
                  <img src="/logo.png" alt="OriPics" className="w-full h-full object-contain brightness-0 invert" />
                </div>
              </div>
              <h3 className="font-bold text-lg mb-2">{t("how_it_works.step3_title")}</h3>
              <p className="text-slate-600 text-sm whitespace-pre-line">{t("how_it_works.step3_desc")}</p>
            </div>
          </div>
        </section>

        {/* Why OriPics — 표준 호환 트러스트 섹션 */}
        <section id="why" className="w-full max-w-4xl mt-12 mb-20 scroll-mt-24">
          <div className="text-center mb-10">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-emerald-500/10 rounded-full text-emerald-700 text-xs font-semibold tracking-wider uppercase mb-4">
              <ShieldCheck size={14} />
              {t("why.eyebrow")}
            </div>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight mb-4">{t("why.title")}</h2>
            <p className="text-slate-600 max-w-2xl mx-auto leading-relaxed whitespace-pre-line">{t("why.body")}</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="glass p-5 rounded-2xl bg-white/60 border border-slate-200">
              <p className="text-xs font-mono font-bold tracking-[0.15em] text-emerald-700 mb-2">C2PA</p>
              <p className="text-sm text-slate-700 leading-relaxed">{t("why.point_c2pa")}</p>
            </div>
            <div className="glass p-5 rounded-2xl bg-white/60 border border-slate-200">
              <p className="text-xs font-mono font-bold tracking-[0.15em] text-blue-700 mb-2">JPEG TRUST</p>
              <p className="text-sm text-slate-700 leading-relaxed">{t("why.point_jpeg_trust")}</p>
            </div>
            <div className="glass p-5 rounded-2xl bg-white/60 border border-slate-200">
              <p className="text-xs font-mono font-bold tracking-[0.15em] text-purple-700 mb-2">{t("why.point_open_label")}</p>
              <p className="text-sm text-slate-700 leading-relaxed">{t("why.point_open")}</p>
            </div>
          </div>
        </section>

        {/* Pricing — 요금제 */}
        <section id="pricing" className="w-full max-w-5xl mt-12 mb-20 scroll-mt-24">
          <div className="text-center mb-10">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-orange-500/10 rounded-full text-orange-700 text-xs font-semibold tracking-wider uppercase mb-4">
              {t("pricing.eyebrow")}
            </div>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight mb-3">{t("pricing.title")}</h2>
            <p className="text-slate-600 max-w-xl mx-auto">{t("pricing.subtitle")}</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {/* Free */}
            <div className="glass p-7 rounded-3xl border border-slate-200 bg-white/70 flex flex-col">
              <div className="mb-4">
                <h3 className="text-lg font-bold mb-1">{t("pricing.free.name")}</h3>
                <p className="text-xs text-slate-500">{t("pricing.free.tagline")}</p>
              </div>
              <p className="text-3xl font-extrabold mb-5">
                ₩0<span className="text-sm font-normal text-slate-500"> / {t("pricing.month")}</span>
              </p>
              <ul className="text-sm text-slate-700 space-y-2 mb-6 flex-1">
                <li className="flex gap-2"><CheckCircle size={16} className="shrink-0 text-emerald-600 mt-0.5" /> {t("pricing.free.f1")}</li>
                <li className="flex gap-2"><CheckCircle size={16} className="shrink-0 text-emerald-600 mt-0.5" /> {t("pricing.free.f2")}</li>
                <li className="flex gap-2"><CheckCircle size={16} className="shrink-0 text-emerald-600 mt-0.5" /> {t("pricing.free.f3")}</li>
                <li className="flex gap-2 text-slate-400"><X size={16} className="shrink-0 mt-0.5" /> {t("pricing.free.f4_excluded")}</li>
              </ul>
              {session ? (
                <span className="w-full py-3 text-center text-sm font-semibold rounded-xl bg-slate-100 text-slate-500">
                  {t("pricing.free.current_plan")}
                </span>
              ) : (
                <Link
                  href="/signup"
                  className="w-full py-3 text-center text-sm font-bold rounded-xl bg-slate-900 text-white hover:bg-slate-800 transition-colors"
                >
                  {t("pricing.free.cta")}
                </Link>
              )}
            </div>

            {/* Pro (highlighted) */}
            <div className="relative glass p-7 rounded-3xl border-2 border-blue-400 bg-white/80 flex flex-col shadow-lg shadow-blue-200/40">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-blue-600 text-white text-[10px] font-bold tracking-wider uppercase">
                {t("pricing.pro.badge")}
              </div>
              <div className="mb-4">
                <h3 className="text-lg font-bold mb-1">{t("pricing.pro.name")}</h3>
                <p className="text-xs text-slate-500">{t("pricing.pro.tagline")}</p>
              </div>
              <p className="text-3xl font-extrabold mb-1">
                ₩9,900<span className="text-sm font-normal text-slate-500"> / {t("pricing.month")}</span>
              </p>
              <p className="text-xs text-slate-500">{t("pricing.price_tax_note")}</p>
              <p className="text-xs text-slate-500 mb-5">{t("pricing.pro.annual_hint")}</p>
              <ul className="text-sm text-slate-700 space-y-2 mb-6 flex-1">
                <li className="flex gap-2"><CheckCircle size={16} className="shrink-0 text-blue-600 mt-0.5" /> {t("pricing.pro.f1")}</li>
                <li className="flex gap-2"><CheckCircle size={16} className="shrink-0 text-blue-600 mt-0.5" /> {t("pricing.pro.f2")}</li>
                <li className="flex gap-2"><CheckCircle size={16} className="shrink-0 text-blue-600 mt-0.5" /> {t("pricing.pro.f3")}</li>
                <li className="flex gap-2"><CheckCircle size={16} className="shrink-0 text-blue-600 mt-0.5" /> {t("pricing.pro.f4")}</li>
                <li className="flex gap-2"><CheckCircle size={16} className="shrink-0 text-blue-600 mt-0.5" /> {t("pricing.pro.f5")}</li>
              </ul>
              <span className="w-full py-3 text-center text-sm font-bold rounded-xl bg-blue-50 text-blue-700 border border-blue-200">
                {t("pricing.pro.coming_soon")}
              </span>
            </div>

            {/* Business */}
            <div className="glass p-7 rounded-3xl border border-slate-200 bg-white/70 flex flex-col">
              <div className="mb-4">
                <h3 className="text-lg font-bold mb-1">{t("pricing.business.name")}</h3>
                <p className="text-xs text-slate-500">{t("pricing.business.tagline")}</p>
              </div>
              <p className="text-3xl font-extrabold mb-1">
                ₩79,000<span className="text-sm font-normal text-slate-500"> / {t("pricing.month")}~</span>
              </p>
              <p className="text-xs text-slate-500">{t("pricing.price_tax_note")}</p>
              <p className="text-xs text-slate-500 mb-5">{t("pricing.business.team_hint")}</p>
              <ul className="text-sm text-slate-700 space-y-2 mb-6 flex-1">
                <li className="flex gap-2"><CheckCircle size={16} className="shrink-0 text-purple-600 mt-0.5" /> {t("pricing.business.f1")}</li>
                <li className="flex gap-2"><CheckCircle size={16} className="shrink-0 text-purple-600 mt-0.5" /> {t("pricing.business.f2")}</li>
                <li className="flex gap-2"><CheckCircle size={16} className="shrink-0 text-purple-600 mt-0.5" /> {t("pricing.business.f3")}</li>
                <li className="flex gap-2"><CheckCircle size={16} className="shrink-0 text-purple-600 mt-0.5" /> {t("pricing.business.f4")}</li>
              </ul>
              <a
                href={`mailto:hi@ori.pics?subject=${encodeURIComponent(t("pricing.business.contact_subject"))}`}
                className="w-full py-3 text-center text-sm font-bold rounded-xl border border-slate-900 text-slate-900 hover:bg-slate-900 hover:text-white transition-colors"
              >
                {t("pricing.business.cta")}
              </a>
            </div>
          </div>

          {/* Credits guide — 차감 기준 통합 표기 */}
          <div className="mt-8 p-5 rounded-2xl bg-slate-100/60 border border-slate-200">
            <p className="text-xs font-mono font-bold tracking-wider uppercase text-slate-700 mb-3">
              {t("pricing.guide.title")}
            </p>
            <ul className="text-sm text-slate-700 space-y-1.5">
              <li className="flex items-baseline gap-2"><span className="text-blue-600 font-mono font-bold tabular-nums">−1</span> <span>{t("pricing.guide.verify_query")}</span></li>
              <li className="flex items-baseline gap-2"><span className="text-blue-600 font-mono font-bold tabular-nums">−2</span> <span>{t("pricing.guide.link_create")}</span></li>
              <li className="flex items-baseline gap-2"><span className="text-blue-600 font-mono font-bold tabular-nums">−3</span> <span>{t("pricing.guide.image_proof")}</span></li>
              <li className="flex items-baseline gap-2"><span className="text-blue-600 font-mono font-bold tabular-nums">−4</span> <span>{t("pricing.guide.verified_proof")}</span></li>
              <li className="flex items-baseline gap-2"><span className="text-blue-600 font-mono font-bold tabular-nums">−10</span> <span>{t("pricing.guide.certificate_pdf")}</span></li>
            </ul>
          </div>

          <p className="text-center text-xs text-slate-500 mt-6">{t("pricing.footnote")}</p>
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
          {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => (
            <div
              key={i}
              className={`border rounded-2xl transition-all duration-300 overflow-hidden ${openFaq === i
                ? "border-blue-200 bg-blue-500/5 shadow-lg shadow-blue-500/5"
                : "border-slate-200 bg-white/[0.02] hover:border-slate-300"
                }`}
            >
              <button
                onClick={() => setOpenFaq(openFaq === i ? null : i)}
                className="w-full flex items-center justify-between p-5 text-left gap-4"
              >
                <span className={`font-semibold text-sm sm:text-base transition-colors ${openFaq === i ? "text-blue-600" : "text-slate-900"
                  }`}>
                  {t(`faq.items.${i}.q`)}
                </span>
                <ChevronDown
                  size={18}
                  className={`shrink-0 text-slate-500 transition-transform duration-300 ${openFaq === i ? "rotate-180 text-blue-600" : ""
                    }`}
                />
              </button>
              <div
                className={`transition-all duration-300 ease-in-out ${openFaq === i
                  ? "max-h-[2000px] opacity-100"
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

      <footer className="w-full border-t border-slate-200 py-16 flex flex-col items-center gap-6 text-slate-500 text-sm">
        <img src="/logo-long.png" alt="OriPics Logo" className="h-24 object-contain opacity-60 hover:opacity-100 transition-opacity cursor-pointer" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} />
        <div className="flex flex-wrap items-center justify-center gap-3">
          <a href="mailto:hi@ori.pics" className="px-6 py-2 border border-slate-200 rounded-full hover:bg-white/80 transition-all">
            {tc("contact")}
          </a>
          <Link href="/terms" className="px-6 py-2 border border-slate-200 rounded-full hover:bg-white/80 transition-all">
            {tc("terms")}
          </Link>
          <Link href="/privacy" className="px-6 py-2 border border-slate-200 rounded-full hover:bg-white/80 transition-all">
            {tc("privacy")}
          </Link>
        </div>
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
              {cameraEnabled && (
                <button
                  onClick={() => {
                    setShowUploadMenu(false);
                    setUploadSource("P");
                    cameraInputRef.current?.click();
                  }}
                  className="w-full flex items-center gap-4 p-4 hover:bg-white/80 rounded-2xl transition-all text-left"
                >
                  <div className="w-10 h-10 rounded-xl bg-orange-500/20 flex items-center justify-center text-orange-600">
                    <Camera size={22} />
                  </div>
                  <span className="font-medium">{t("upload.upload_menu.camera")}</span>
                </button>
              )}

              {cameraEnabled && (
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

      {verifyConfirm && (() => {
        const preview = verifyConfirm.detect.preview;
        const verifyMult = preview
          ? getProofMultiplier(preview.width, preview.height)
          : 1;
        const verifyCost = CREDIT_COSTS.VERIFY_QUERY * verifyMult;
        return (
        <div
          className="fixed inset-0 z-[10000] flex items-center justify-center p-6 bg-black/60"
          onClick={handleVerifyConfirmNo}
        >
          <div
            className="relative bg-white rounded-2xl shadow-2xl max-w-md w-full p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-12 h-12 rounded-2xl bg-emerald-100 text-emerald-600 flex items-center justify-center mb-4">
              <ShieldCheck size={22} />
            </div>
            <h3 className="text-xl font-bold mb-2">{t("verify_confirm.title")}</h3>
            <p className="text-sm text-slate-600 leading-relaxed mb-2">
              {t("verify_confirm.body")}
            </p>
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-5">
              {t("verify_confirm.cost_notice_dynamic", { cost: verifyCost, mult: verifyMult })}
            </p>
            <div className="flex gap-2">
              <button
                onClick={handleVerifyConfirmYes}
                className="flex-1 py-3 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl transition-colors"
              >
                {t("verify_confirm.yes")}
              </button>
              <button
                onClick={handleVerifyConfirmNo}
                className="px-5 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl transition-colors"
              >
                {t("verify_confirm.no")}
              </button>
            </div>
          </div>
        </div>
        );
      })()}

      {showInsufficientModal && (
        <div
          className="fixed inset-0 z-[10000] flex items-center justify-center p-6 bg-black/60"
          onClick={() => setShowInsufficientModal(false)}
        >
          <div
            className="relative bg-white rounded-2xl shadow-2xl max-w-md w-full p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setShowInsufficientModal(false)}
              className="absolute top-3 right-3 p-1.5 hover:bg-slate-100 rounded-full text-slate-500"
              aria-label="close"
            >
              <X size={18} />
            </button>
            <div className="w-12 h-12 rounded-2xl bg-amber-100 text-amber-600 flex items-center justify-center mb-4">
              <Lock size={22} />
            </div>
            <h3 className="text-xl font-bold mb-2">{t("credits.modal.insufficient_title")}</h3>
            <p className="text-sm text-slate-600 leading-relaxed mb-1">
              {t("credits.modal.insufficient_body")}
            </p>
            {credits?.creditsRenewAt && (
              <p className="text-xs text-slate-500 mb-5">
                {t("credits.modal.next_renewal", {
                  date: new Date(credits.creditsRenewAt).toLocaleDateString(),
                })}
              </p>
            )}
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setShowInsufficientModal(false);
                  document.getElementById("pricing")?.scrollIntoView({ behavior: "smooth" });
                }}
                className="flex-1 py-3 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl transition-colors"
              >
                {t("credits.modal.cta_pro")}
              </button>
              <button
                onClick={() => setShowInsufficientModal(false)}
                className="px-5 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl transition-colors"
              >
                {t("credits.modal.close")}
              </button>
            </div>
          </div>
        </div>
      )}

      {debugMessage && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[9999] max-w-[90vw] px-4 py-3 rounded-xl bg-black/85 text-white text-sm font-mono shadow-2xl border border-white/10 flex items-start gap-3">
          <span className="break-all">{debugMessage}</span>
          <button
            onClick={() => setDebugMessage(null)}
            className="shrink-0 text-white/60 hover:text-white"
            aria-label="close"
          >
            <X size={16} />
          </button>
        </div>
      )}

      {showGpsHelpModal && (() => {
        const detected = detectHelpPlatform();
        const allSections: { key: HelpPlatform; titleKey: string; bodyKey: string }[] = [
          { key: 'ios_safari', titleKey: 'gps.help_ios_safari_title', bodyKey: 'gps.help_ios_safari_body' },
          { key: 'ios_chrome', titleKey: 'gps.help_ios_chrome_title', bodyKey: 'gps.help_ios_chrome_body' },
          { key: 'android', titleKey: 'gps.help_android_title', bodyKey: 'gps.help_android_body' },
          { key: 'desktop', titleKey: 'gps.help_desktop_title', bodyKey: 'gps.help_desktop_body' },
        ];
        // 감지된 환경을 맨 위로 정렬
        const ordered = [...allSections].sort((a, b) => (a.key === detected ? -1 : b.key === detected ? 1 : 0));
        return (
          <div className="fixed inset-0 z-[10000] flex items-center justify-center p-6 bg-black/60" onClick={() => setShowGpsHelpModal(false)}>
            <div className="relative bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between p-5 border-b border-slate-100 sticky top-0 bg-white">
                <h3 className="text-lg font-bold">{t('gps.help_title')}</h3>
                <button onClick={() => setShowGpsHelpModal(false)} className="p-1.5 hover:bg-slate-100 rounded-full text-slate-500" aria-label="close">
                  <X size={18} />
                </button>
              </div>
              <div className="p-5 text-sm text-slate-700 space-y-2 leading-relaxed">
                <p className="mb-3">{t('gps.help_intro')}</p>
                {ordered.map((section) => {
                  const isOpen = helpOpenSection === section.key;
                  const isDetected = section.key === detected;
                  return (
                    <div key={section.key} className={`border rounded-xl overflow-hidden ${isOpen ? 'border-blue-200 bg-blue-500/5' : 'border-slate-200'}`}>
                      <button
                        type="button"
                        onClick={() => setHelpOpenSection(isOpen ? null : section.key)}
                        className="w-full flex items-center justify-between p-3 text-left gap-3"
                      >
                        <span className="flex items-center gap-2 font-semibold">
                          {t(section.titleKey)}
                          {isDetected && (
                            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-full bg-orange-100 text-orange-700">{t('gps.help_detected_badge')}</span>
                          )}
                        </span>
                        <ChevronDown size={16} className={`shrink-0 text-slate-500 transition-transform ${isOpen ? 'rotate-180 text-blue-600' : ''}`} />
                      </button>
                      {isOpen && (
                        <p className="px-3 pb-3 whitespace-pre-line text-slate-700">{t(section.bodyKey)}</p>
                      )}
                    </div>
                  );
                })}
                <p className="text-xs text-slate-500 pt-3 mt-3 border-t border-slate-100">{t('gps.help_https_note')}</p>
              </div>
            </div>
          </div>
        );
      })()}

      {showWatermarkHelpModal && (
        <div
          className="fixed inset-0 z-[10000] flex items-center justify-center p-6 bg-black/60"
          onClick={() => setShowWatermarkHelpModal(false)}
        >
          <div
            className="relative bg-white rounded-2xl shadow-2xl max-w-md w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-5 border-b border-slate-100">
              <h3 className="text-lg font-bold">{t("upload.watermark_help_title")}</h3>
              <button
                onClick={() => setShowWatermarkHelpModal(false)}
                className="p-1.5 hover:bg-slate-100 rounded-full text-slate-500"
                aria-label="close"
              >
                <X size={18} />
              </button>
            </div>
            <div className="p-5 text-sm text-slate-700 space-y-4 leading-relaxed">
              <div className="flex justify-center">
                <img
                  src="/watermark-logo.png"
                  alt="OriPics logo"
                  className="h-16 w-auto object-contain"
                />
              </div>
              <p className="text-center">{t("upload.watermark_help_body")}</p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
