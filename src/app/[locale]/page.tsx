"use client";

import React, { useState, useRef, useEffect, ChangeEvent, DragEvent } from "react";
import { UploadCloud, CheckCircle, XCircle, ShieldCheck, AlertTriangle, RefreshCw, Download, User, LogOut, Image as ImageIcon, Camera, File as FileIcon, Clipboard, X, ChevronDown, HelpCircle, ExternalLink, ImageUp, Lock, Share2, BadgeCheck } from "lucide-react";
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
import { ANDROID_INTENT_URL, ANDROID_STORE_URL, IOS_APP_URL } from "@/lib/appLinks";
import { VerifiedDetailLines, type VerifiedAssertionData } from "@/components/VerifiedDetailLines";

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
  /** 촬영시각 (V5, 기기 기록 "yymmddHHMMSSmmm" UTC) */
  captured_at?: string;
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
  /** 검증 등급 — "verified"(attest 통과 촬영 인증) | undefined(standard·구 링크) */
  tier?: string;
  /** 기기 검증 상세 (C2PA com.oripics.verified 어서션, 2026-08-29) */
  verified_detail?: VerifiedAssertionData;
  /** 서버가 유도한 공개링크 (V4+, 발행된 인증만) */
  verify_url?: string;
  /** C2PA 자격증명 증거 (trust_report.evidence의 c2pa.manifest — 발행본 기준, 2026-08-26) */
  c2pa?: { result?: string; issuer?: string };
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
  // 서명 업로드 URL 만료 시각 — 만료 후엔 publishStamped가 영수증으로 fresh URL 재발급
  // (2026-08-30 대표 결정: 카운트다운 UI 제거 — 발행 권한은 영수증 30일이라 시간제한 무의미)
  const signExpiresAtRef = useRef<number>(0);
  // 미발행 인증본을 저장/발행 없이 이탈하면 복구 불가(서버 무저장) — 경고 게이트 (2026-08-30)
  const savedOrPublishedRef = useRef(true);
  const [generatedLink, setGeneratedLink] = useState<string | null>(null);
  const [isLinking, setIsLinking] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [uploadSource, setUploadSource] = useState<"F" | "P" | "C">("F");
  const [showUploadMenu, setShowUploadMenu] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  // 사진 촬영(P)·GPS는 모바일 앱 전용으로 이관 (2026-08-22) — 웹은 파일/클립보드 인증만
  const cameraEnabled = false;
  const [showInsufficientModal, setShowInsufficientModal] = useState(false);
  const [verifyConfirm, setVerifyConfirm] = useState<{ file: File; detect: DetectResult } | null>(null);
  // B-1 (2026-05-17): 본인 미공개 인증 이미지 재드롭 — receipt JWT 매칭 시 publish 버튼 표시
  const [unpublishedSelf, setUnpublishedSelf] = useState<{ file: File; receiptRec: import("@/lib/oripics-stamp/receipts").ReceiptRecord } | null>(null);
  const [publishingUnpublished, setPublishingUnpublished] = useState(false);
  const [unpublishedUploadProgress, setUnpublishedUploadProgress] = useState<{ loaded: number; total: number } | null>(null);
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

  // GPS 취득 로직 전면 제거 (2026-08-24) — 웹은 F/C 경로만이라 좌표를 쓰는 곳이 없는데
  // 페이지 로드마다 위치를 조회하던 잔재(8/22 P 경로 이관 시 미정리)였음. 판독/뷰어의
  // GPS "표시"는 서버 응답 기반이라 무관.
  const [watermarkEnabled, setWatermarkEnabled] = useState(true);
  const [showWatermarkHelpModal, setShowWatermarkHelpModal] = useState(false);

  const router = useRouter();

  // 카메라 버튼 노출 여부 결정.
  // 1) 사용자가 명시적으로 토글한 적 있으면 localStorage 값을 우선
  // (2026-08-22) 카메라 자동 감지·토글 제거 — 촬영 인증은 모바일 앱 안내로 대체

  // 페이지 로드 시 저장된 옵션 로드 (GPS 관련 로드·권한 query는 2026-08-24 제거)
  useEffect(() => {
    if (typeof window === 'undefined') return;

    // '인증마크 포함' 체크박스 상태 로드
    const savedWatermark = localStorage.getItem('oripics_watermark_include');
    if (savedWatermark === 'true' || savedWatermark === 'false') {
      setWatermarkEnabled(savedWatermark === 'true');
    }
  }, []);

  const handleWatermarkToggle = (enabled: boolean) => {
    setWatermarkEnabled(enabled);
    if (typeof window !== 'undefined') {
      localStorage.setItem('oripics_watermark_include', enabled ? 'true' : 'false');
    }
  };

  // 인디케이터 클릭: prompt 상태면 권한 요청, denied/unsupported면 안내 모달

  const t = useTranslations("Home");
  const tc = useTranslations("Common");
  const tLV = useTranslations("LinkViewer");


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

    // GPS 취득 제거 (2026-08-24) — 웹은 F/C 경로만, 좌표 첨부 없음
    processFile(file, uploadSource, null);
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
      // 미공개 인증 — 무차감, 안내 에러 화면
      if (verifyRes.reason === "not_published") {
        setStatus("error");
        setErrorMessage(t("errors.verify_not_published"));
        return;
      }
      if (verifyRes.metadata) {
        // C2PA 증거 (trust_report.evidence) — OriPics 스탬프 판독과 구분 표시 (2026-08-26)
        const c2paEv = verifyRes.trust_report?.evidence?.find((e) => e.type === "c2pa.manifest") as
          | { result?: string; details?: { signer?: { issuer?: string } } }
          | undefined;
        setResultData({
          status: "verified",
          match: verifyRes.match,
          metadata: verifyRes.metadata,
          owner_exempt: verifyRes.owner_exempt,
          tier: verifyRes.tier,
          verify_url: verifyRes.trust_report?.subject?.verify_url,
          c2pa: c2paEv ? { result: c2paEv.result, issuer: c2paEv.details?.signer?.issuer } : undefined,
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
          // B-1 (2026-05-17): 같은 브라우저에서 본인이 미공개 인증한 이미지인지 확인.
          // localStorage receipt 매칭 → 본인 미공개 UI로 분기 (publish 버튼 노출).
          const ts = detect.preview?.timestamp;
          if (ts && session?.user) {
            const receiptRec = getReceipt(ts);
            if (receiptRec) {
              setStatus("idle");
              setUnpublishedSelf({ file, receiptRec });
              return;
            }
          }
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
      signExpiresAtRef.current = Date.now() + draft.sign.jwt_ttl * 1000;
      savedOrPublishedRef.current = false;
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
        signExpiresAtRef.current = Date.now() + draft.sign.jwt_ttl * 1000;
        savedOrPublishedRef.current = false;
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
      // publish는 사용자가 "공개링크 생성" 버튼 클릭 시 별도 흐름.
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

  // multi-result 카드별 공개링크 생성 핸들러 (LINK_CREATE -2 차감)
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
        ...(Date.now() < signExpiresAtRef.current
          ? { signedUploadUrl: item.draft.sign.signed_upload_url }
          : {}),
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

  // B-1: 본인 미공개 인증 이미지를 재드롭한 후 publish 버튼 클릭
  const handleUnpublishedSelfPublish = async () => {
    if (!unpublishedSelf || publishingUnpublished) return;
    setPublishingUnpublished(true);
    setUnpublishedUploadProgress({ loaded: 0, total: unpublishedSelf.file.size });
    try {
      // 썸네일 생성
      let thumbnailDataUrl: string | null = null;
      try {
        const img = new window.Image();
        img.src = URL.createObjectURL(unpublishedSelf.file);
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

      // signedUploadUrl 미제공 → publishStamped가 /api/links/publish/upload-url로 fresh 발급받음
      const result = await publishStamped({
        apiBase: "",
        blob: unpublishedSelf.file,
        receipt: unpublishedSelf.receiptRec.receipt,
        thumbnailDataUrl,
        onUploadProgress: (loaded, total) => setUnpublishedUploadProgress({ loaded, total }),
      });

      const linkUrl = `${window.location.origin}/${result.link_id}`;
      removeReceipt(unpublishedSelf.receiptRec.timestamp);

      // 결과 화면으로 전환 (공개링크 생성된 상태)
      setGeneratedLink(linkUrl);
      setResultData({
        status: "stamped",
        image: URL.createObjectURL(unpublishedSelf.file),
        session_id: result.link_id,
        metadata: {
          timestamp: result.timestamp,
          width: unpublishedSelf.receiptRec.width,
          height: unpublishedSelf.receiptRec.height,
        },
      });
      setStatus("result_stamped");
      setUnpublishedSelf(null);
      setSessionID(null);
      setStampedDraft(null);
      setConfirmedSingle(null);
      void refreshCredits();
    } catch (err: any) {
      const raw = String(err?.message || err || "");
      // 402 잔액 부족 → 별도 모달
      const m = raw.match(/^publish_failed:(\d+):(.*)$/);
      if (m && m[1] === "402") {
        setShowInsufficientModal(true);
        void refreshCredits();
      } else {
        alert(t("errors.link_creation_failed") + (raw ? `\n${raw.slice(0, 120)}` : ""));
      }
    } finally {
      setPublishingUnpublished(false);
      setUnpublishedUploadProgress(null);
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
    signExpiresAtRef.current = 0;
    setGeneratedLink(null);
    setSingleUploadProgress(null);
    if (originalImagePreview) {
      URL.revokeObjectURL(originalImagePreview);
      setOriginalImagePreview(null);
    }
    // 화면 상단으로 스크롤 이동
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // 미저장 인증본 이탈 확인 — 저장/발행했거나 인증 결과 화면이 아니면 그냥 통과
  const confirmDiscardUnsaved = () => {
    const hasUnsavedSingle =
      status === "result_stamped" && !generatedLink && !savedOrPublishedRef.current;
    const hasUnsavedMulti =
      !!multiResults && multiResults.some((i) => i.phase === "ready") && !savedOrPublishedRef.current;
    if (hasUnsavedSingle || hasUnsavedMulti) {
      return window.confirm(t("result.unsaved_leave_warning"));
    }
    return true;
  };
  const handleProcessAnother = () => {
    if (!confirmDiscardUnsaved()) return;
    savedOrPublishedRef.current = true;
    resetState();
  };

  // 새로고침·탭 닫기 가드 — 미저장 미발행 인증본이 있으면 브라우저 기본 확인창
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      const unsavedSingle =
        status === "result_stamped" && !generatedLink && !savedOrPublishedRef.current;
      const unsavedMulti =
        !!multiResults && multiResults.some((i) => i.phase === "ready") && !savedOrPublishedRef.current;
      if (unsavedSingle || unsavedMulti) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [status, generatedLink, multiResults]);

  const handleDownload = () => {
    if (resultData?.image) {
      // 파일명 결정: 링크 ID(발행 전에도 인증 확정 시 확보됨 — 스탬프에 새겨진 값과 동일),
      // 없으면 oripics_타임스탬프 폴백 (2026-08-28: 미발행 다운로드도 링크 ID로 — 소스코드 F/P/C 식별 가능)
      // 발행 전 파일명엔 '임시저장-' 접두(2026-08-30 대표 요청) — 발행본과 혼동 방지.
      // 재드래그 발행(영수증 매칭)은 파일 내용 기준이라 파일명 무관.
      savedOrPublishedRef.current = true;
      const draftPrefix = t("result.unpublished_filename_prefix");
      let filename = `oripics_${new Date().getTime()}.png`;
      if (generatedLink) {
        const parts = generatedLink.split('/');
        filename = `${parts[parts.length - 1]}.png`;
      } else if (confirmedSingle?.linkId) {
        filename = `${draftPrefix}${confirmedSingle.linkId}.png`;
      } else if (sessionID) {
        filename = `${draftPrefix}${sessionID}.png`;
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
        // 서명 URL 유효 시에만 재사용 — 만료면 publishStamped가 영수증으로 fresh URL 발급
        ...(Date.now() < signExpiresAtRef.current
          ? { signedUploadUrl: confirmedSingle.signedUploadUrl }
          : {}),
        receipt: confirmedSingle.receipt,
        thumbnailDataUrl,
        onUploadProgress: (loaded, total) => setSingleUploadProgress({ loaded, total }),
      });
      const baseUrl = window.location.origin;
      const fullLink = `${baseUrl}/${result.link_id}`;
      setGeneratedLink(fullLink);
      savedOrPublishedRef.current = true;
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
          <span className="font-bold text-base xs:text-lg sm:text-xl">OriPics</span>
        </div>
        <div className="flex items-center gap-2 sm:gap-6">
          <LanguageSwitcher />

          {session ? (
            <div className="flex items-center gap-1.5 sm:gap-4 pl-2 sm:pl-6 border-l border-slate-200">
              {credits && (
                <Link
                  href="/profile#credits"
                  className="inline-flex items-center gap-1 px-2 sm:px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 text-[11px] sm:text-xs font-semibold border border-blue-100 hover:bg-blue-100 transition-colors whitespace-nowrap"
                  // 칩 숫자 = 잔여 건수(크레딧)로 통일 — floor(/3) "인증 가능 횟수"는 앱·프로필의 잔액 20과
                  // 달라 보여 혼란 (2026-08-26 대표 피드백: 앱 20건 vs 웹 6건)
                  title={t("credits.chip_title", { count: credits.credits })}
                >
                  {t("credits.chip", { count: credits.credits })}
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
          {/* 아이브로 2줄(사진 원본 인증 · C2PA 적합성) + 설명문의 타이틀 승격 — 2026-08-29 대표 시안 */}
          <p className="text-sm md:text-base text-slate-600 mb-4 whitespace-pre-line leading-relaxed">
            {t("hero.eyebrow")}
          </p>
          {/* 모바일=3줄(1|2|3), 데스크톱=2줄(1+2|3) — 대표 시안 반응형 줄바꿈 (2026-08-29) */}
          <h1 className="text-3xl md:text-4xl font-extrabold mb-5 leading-snug max-w-2xl mx-auto">
            {(() => {
              const lines = t("hero.title").split("\n");
              if (lines.length !== 3) return t("hero.title");
              return (
                <>
                  {lines[0]}
                  <br className="md:hidden" />
                  <span className="hidden md:inline"> </span>
                  {lines[1]}
                  <br />
                  {lines[2]}
                </>
              );
            })()}
          </h1>

          {/* 인증 방식·사용 사례 진입 링크 (2026-08-29 대표 기획) — 신뢰(이중 인증)와
              효용(직군별 시나리오)으로 이어지는 통로 */}
          <div className="flex flex-wrap items-center justify-center gap-3 mb-16">
            <Link
              href="/how-it-works"
              className="text-sm text-blue-600 hover:text-blue-500 font-semibold underline underline-offset-4 decoration-blue-300"
            >
              {t("hero.link_how")}
            </Link>
            <span className="text-slate-300">·</span>
            <Link
              href="/use-cases"
              className="text-sm text-blue-600 hover:text-blue-500 font-semibold underline underline-offset-4 decoration-blue-300"
            >
              {t("hero.link_cases")}
            </Link>
          </div>

          {status !== "result_stamped" && status !== "result_verified" && (
            <div className="w-full max-w-2xl flex flex-col items-center">
              {/* 업로드 섹션 타이틀 (2026-08-30 대표 시안) — 판독·인증이 이 박스 하나임을 명시 */}
              {(status === "idle" || status === "dragover") && (
                <h2 className="text-2xl sm:text-3xl font-bold tracking-tight mb-5 text-center">
                  {(() => {
                    // 모바일 2줄(\n 기준), 데스크톱 1줄 — 2026-08-30 대표 요청
                    const [first, ...rest] = (t("upload.section_title") as string).split("\n");
                    if (rest.length === 0) return first;
                    return (
                      <>
                        {first}
                        <br className="sm:hidden" />
                        <span className="hidden sm:inline"> </span>
                        {rest.join(" ")}
                      </>
                    );
                  })()}
                </h2>
              )}
              <div
                className={`relative w-full p-10 rounded-2xl border-2 border-dashed transition-all duration-300 ${status === "dragover" ? "border-blue-400 bg-blue-500/10" : "border-slate-600 glass hover:border-slate-400"
                  }`}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
              >
                {(status === "idle" || status === "dragover") && (
                  <div
                    className="absolute top-3 left-3 flex items-center gap-1 text-xs"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <label
                      className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-white border border-slate-200 cursor-pointer hover:bg-slate-50 select-none"
                      title={t('upload.watermark_include') as string}
                    >
                      <input
                        type="checkbox"
                        checked={watermarkEnabled}
                        onChange={(e) => handleWatermarkToggle(e.target.checked)}
                        className="rounded border-slate-300 text-orange-500 focus:ring-orange-500 w-3.5 h-3.5"
                      />
                      <img
                        src="/logo.png"
                        alt={t('upload.watermark_include') as string}
                        className={`w-4 h-4 object-contain transition-opacity ${watermarkEnabled ? "opacity-100" : "opacity-30 grayscale"}`}
                      />
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
                {status === "idle" || status === "dragover" ? (
                  <div className="flex flex-col items-center cursor-pointer" onClick={() => { if (!requireAuthOrRedirect()) return; setShowUploadMenu(true); }}>
                    <div className="flex items-center justify-center gap-6 mb-4">
                      <UploadCloud size={64} strokeWidth={1.5} className={`${status === "dragover" ? "text-blue-600" : "text-slate-600"}`} />
                    </div>
                    <p className="text-xl font-medium mb-2 whitespace-pre-line">
                      {status === "dragover" ? t("upload.dragover") : t("upload.idle")}
                    </p>
                    <p className="text-sm text-slate-600 mt-1">
                      {t.rich("upload.subtext", {
                        u: (chunks) => <span className="underline underline-offset-2">{chunks}</span>,
                      })}
                    </p>
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
                ) : status === "size_selection" ? (
                  <div className="flex flex-col items-center text-slate-600">
                    <ImageUp size={40} className="text-blue-600 mb-4" />
                    <p className="text-lg font-medium">{t("upload.size_selecting")}</p>
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
                <div className="mt-4">
                  <p className="text-xs text-slate-500">{t("upload.app_capture_note")}</p>
                  {/* 앱 설치/실행 버튼 (2026-08-28) — 링크는 lib/appLinks.ts에서 관리(베타→정식 교체 지점).
                      Android는 intent 스킴으로 설치 시 실행·미설치 시 스토어 폴백, iOS는 링크(Universal Links는 정식 출시 때) */}
                  <div className="mt-3 flex justify-center gap-3">
                    <a
                      href={IOS_APP_URL}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-semibold hover:bg-slate-700 transition-colors"
                    >
                      <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 fill-white" aria-hidden>
                        <path d="M17.05 20.28c-.98.95-2.05.86-3.08.38-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.38C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.53 4.08zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
                      </svg>
                      {t("upload.app_ios_button")}
                    </a>
                    <button
                      onClick={() => {
                        const isAndroid = /android/i.test(navigator.userAgent);
                        window.location.href = isAndroid ? ANDROID_INTENT_URL : ANDROID_STORE_URL;
                      }}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-semibold hover:bg-slate-700 transition-colors"
                    >
                      <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 fill-white" aria-hidden>
                        <path d="M3 20.5V3.5c0-.6.4-1.1.9-1.3l10.6 9.8L3.9 21.8c-.5-.2-.9-.7-.9-1.3zm13.8-6.2L6.05 21.34l8.49-8.49 2.26 1.45zm3.35-3.35c.4.3.65.77.65 1.3 0 .52-.24.98-.62 1.28l-2.03 1.3-2.5-2.5 2.5-2.5 2 1.12zM6.05 2.66l10.76 7.04-2.27 2.27-8.49-9.31z" />
                      </svg>
                      {t("upload.app_android_button")}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </section>

        {status === "size_selection" && sizeSelection && (() => {
          const { originalWidth, originalHeight, standardChecked, originalChecked } = sizeSelection;
          // B-2 (2026-05-17): 사이즈 선택 화면은 인증(proof) 비용만 표시.
          // 공개링크 생성(LINK_CREATE -2)은 publish 버튼 클릭 시 별도 차감 — 여기 합계에 포함 X.
          const stdMult = 1;
          const origMult = getProofMultiplier(originalWidth, originalHeight);
          // 사용자 노출은 '건'(사진 인증 건수)로 표기 — 1건 = 기준 사이즈 1회.
          // 원본 사이즈는 픽셀 수에 따라 2~3건으로 차감(내부 크레딧 회계의 배수와 동일).
          const totalCount =
            (standardChecked ? stdMult : 0) + (originalChecked ? origMult : 0);
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
              {(longest > 10000 || pixels > 100_000_000) && (
                <p className="text-xs text-slate-500 mb-4">{t("size_select.hint_huge")}</p>
              )}
              <div className="mb-4" />

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
                        ≤ {MAX_DIMENSION}px · {stdMult}{t("size_select.credits_deduct")}
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
                        {originalWidth}×{originalHeight} · {origMult}{t("size_select.credits_deduct")}
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
                      {totalCount} {t("size_select.credits")}
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
              <button onClick={handleProcessAnother} className="px-6 py-3 glass hover:bg-slate-100 text-slate-900 font-medium rounded-xl flex items-center justify-center gap-2">
                <RefreshCw size={18} /> {t("result.process_another")}
              </button>
            </div>

            {!generatedLink && (
              <p className="mt-4 text-xs text-slate-500 text-center max-w-md mx-auto">
                {t("result.save_for_later_hint")}
              </p>
            )}

            {sessionID && !generatedLink && (
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
                <p className="text-slate-700 text-sm font-bold mb-3">
                  {credits?.tier === "pro" || credits?.tier === "business"
                    ? t("result.link_created_paid")
                    : t("result.link_created")}
                </p>
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
                <p className="mt-3 text-[10px] text-slate-500 text-center">
                  {credits?.tier === "pro" || credits?.tier === "business"
                    ? t("result.link_hint_paid")
                    : t("result.link_hint")}
                </p>
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
            <p className="text-sm text-slate-600 mb-6">
              {credits?.tier === "pro" || credits?.tier === "business"
                ? t("result.multi_desc_paid")
                : t("result.multi_desc")}
            </p>

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
                      savedOrPublishedRef.current = true;
                      const a = document.createElement("a");
                      a.href = item.display.image!;
                      a.download = `${item.phase === "published" ? "" : t("result.unpublished_filename_prefix")}${item.draft.sign.link_id}.png`;
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
              onClick={handleProcessAnother}
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
                {/* 판독 결과 이원 표시 (2026-08-26): OriPics 스탬프 섹션 ↔ 아래 C2PA 섹션 구분 */}
                <div className="text-xs font-bold text-slate-400 uppercase tracking-wide pb-1">
                  {t("verify.section_oripics")}
                </div>
                {/* verified 티어 (links.tier) — 촬영 시점 기기 검증 통과 표시 (2026-08-23) */}
                {resultData.match && resultData.tier === "verified" && (
                  <div className="py-2 border-b border-slate-100">
                    <div className="flex justify-between">
                      <span className="text-slate-500">{t("verify.tier_label")}</span>
                      <span className="font-bold text-blue-600 inline-flex items-center gap-1">
                        <BadgeCheck size={16} /> {t("verify.tier_verified")}
                      </span>
                    </div>
                    {/* 기기 검증 상세 (2026-08-29) — 쉬운 말 + 기술 상세·인증 데이터 병기 */}
                    <VerifiedDetailLines
                      vd={resultData.verified_detail}
                      t={t as unknown as (key: string) => string}
                      keyPrefix="verify."
                    />
                  </div>
                )}
                {resultData.metadata.captured_at && (
                  <div className="flex justify-between py-2 border-b border-slate-100">
                    <span className="text-slate-500">{t("verify.captured_at")}</span>
                    <span>{formatCapturedAt(resultData.metadata.captured_at)}</span>
                  </div>
                )}
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
                {resultData.verify_url && (
                  <div className="flex justify-between py-2 border-b border-slate-100 items-center">
                    <span className="text-slate-500">{t("verify.public_link")}</span>
                    <a
                      href={resultData.verify_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-mono text-xs text-blue-700 hover:underline inline-flex items-center gap-1"
                    >
                      {resultData.verify_url.replace(/^https?:\/\//, "")}
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

                {/* C2PA 자격증명 섹션 (2026-08-26) — 발행본에서 읽은 증거. OriPics 스탬프 판독과 별개 축 */}
                <div className="mt-4 pt-3 border-t border-slate-200">
                  <div className="text-xs font-bold text-slate-400 uppercase tracking-wide pb-1">
                    {t("verify.section_c2pa")}
                  </div>
                  <div className="flex justify-between py-2 items-center">
                    <span className="text-slate-500">{t("verify.c2pa_status")}</span>
                    {(() => {
                      const r = resultData.c2pa?.result;
                      const badge = (cls: string, label: string) => (
                        <span className={`px-3 py-1 rounded-full text-xs font-bold border ${cls}`}>{label}</span>
                      );
                      if (r === "trusted")
                        return badge("bg-emerald-50 text-emerald-700 border-emerald-200", t("verify.c2pa_trusted"));
                      if (r === "untrusted")
                        return badge("bg-amber-50 text-amber-700 border-amber-200", t("verify.c2pa_untrusted"));
                      if (r === "invalid")
                        return badge("bg-red-50 text-red-600 border-red-200", t("verify.c2pa_invalid"));
                      if (r === "absent")
                        return badge("bg-slate-100 text-slate-500 border-slate-200", t("verify.c2pa_absent"));
                      return badge("bg-slate-100 text-slate-500 border-slate-200", t("verify.c2pa_unchecked"));
                    })()}
                  </div>
                  {resultData.c2pa?.issuer && (
                    <div className="flex justify-between py-2 items-center">
                      <span className="text-slate-500">{t("verify.c2pa_signer")}</span>
                      <span className="font-medium text-xs">{resultData.c2pa.issuer}</span>
                    </div>
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
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-center mb-12">{t("how_it_works.title")}</h2>
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
              <p className="text-xs text-slate-500 mb-5">{t("pricing.price_tax_note")}</p>
              <ul className="text-sm text-slate-700 space-y-2 mb-6 flex-1">
                <li className="flex gap-2"><CheckCircle size={16} className="shrink-0 text-blue-600 mt-0.5" /> {t("pricing.pro.f1")}</li>
                <li className="flex gap-2"><CheckCircle size={16} className="shrink-0 text-blue-600 mt-0.5" /> {t("pricing.pro.f2")}</li>
                <li className="flex gap-2"><CheckCircle size={16} className="shrink-0 text-blue-600 mt-0.5" /> {t("pricing.pro.f3")}</li>
                <li className="flex gap-2"><CheckCircle size={16} className="shrink-0 text-blue-600 mt-0.5" /> {t("pricing.pro.f4")}</li>
                <li className="flex gap-2"><CheckCircle size={16} className="shrink-0 text-blue-600 mt-0.5" /> {t("pricing.pro.f5")}</li>
              </ul>
              <Link
                href="/billing/checkout?plan=pro_monthly"
                className="w-full py-3 text-center text-sm font-bold rounded-xl bg-blue-600 text-white hover:bg-blue-700 transition-colors"
              >
                {t("pricing.pro.cta_pay")}
              </Link>
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
                <li className="flex gap-2"><CheckCircle size={16} className="shrink-0 text-purple-600 mt-0.5" /> {t("pricing.business.f5")}</li>
              </ul>
              {/* mailto 단독은 메일 클라이언트 미설정 브라우저에서 무반응(2026-08-28 실측) —
                  주소 복사+안내를 먼저 하고 mailto는 보조로 시도 */}
              <button
                onClick={() => {
                  navigator.clipboard?.writeText("hi@ori.pics").catch(() => {});
                  window.alert(t("pricing.business.contact_copied"));
                  window.location.href = `mailto:hi@ori.pics?subject=${encodeURIComponent(t("pricing.business.contact_subject"))}`;
                }}
                className="w-full py-3 text-center text-sm font-bold rounded-xl border border-slate-900 text-slate-900 hover:bg-slate-900 hover:text-white transition-colors"
              >
                {t("pricing.business.cta")}
              </button>
            </div>
          </div>

          {/* Credits guide — 차감 기준 통합 표기 */}
          <div className="mt-8 p-5 rounded-2xl bg-slate-100/60 border border-slate-200">
            <p className="text-lg font-extrabold text-slate-800 mb-3">
              {t("pricing.guide.title")}
            </p>
            {/* 모바일 앱 차감규칙 시트와 동일 구성 (2026-08-22) — 항목/값 행 + 면제·PDF 노트 + 배율 표 */}
            <div className="text-sm text-slate-700">
              {([
                ["row_local", "cost_free"],
                ["row_verify", "cost_verify"],
                ["row_standard", "cost_standard"],
                ["row_verified", "cost_verified"],
                ["row_link", "cost_link"],
                ["row_pdf", "cost_pdf"],
              ] as const).map(([labelKey, costKey]) => (
                <div key={labelKey} className="flex justify-between py-1.5 border-b border-slate-200/60">
                  <span>{t(`pricing.guide.${labelKey}`)}</span>
                  <span className="font-semibold">{t(`pricing.guide.${costKey}`)}</span>
                </div>
              ))}
            </div>
            <p className="text-xs text-slate-500 mt-2">{t("pricing.guide.owner_note")}</p>
            <p className="text-xs text-slate-500 mt-1">{t("pricing.guide.pdf_note")}</p>
            <p className="text-base font-bold text-slate-800 mt-5 mb-1">
              {t("pricing.guide.mult_title")}
            </p>
            <div className="text-sm text-slate-700">
              {([["mult1", "1×"], ["mult2", "2×"], ["mult3", "3×"]] as const).map(([key, mult]) => (
                <div key={key} className="flex justify-between py-1.5 border-b border-slate-200/60">
                  <span>{t(`pricing.guide.${key}`)}</span>
                  <span className="font-semibold font-mono tabular-nums">{mult}</span>
                </div>
              ))}
            </div>
            <p className="text-xs text-slate-500 mt-2">{t("pricing.guide.mult_note")}</p>
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
          {Array.from({ length: 15 }, (_, i) => i).map((i) => (
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
          {/* mailto 단독은 메일 클라이언트 미설정 브라우저에서 무반응 — 복사+안내 우선 (영업팀 문의와 동일 패턴) */}
          <button
            onClick={() => {
              navigator.clipboard?.writeText("hi@ori.pics").catch(() => {});
              window.alert(tc("contact_copied"));
              window.location.href = "mailto:hi@ori.pics";
            }}
            className="px-6 py-2 border border-slate-200 rounded-full hover:bg-white/80 transition-all"
          >
            {tc("contact")}
          </button>
          <Link href="/terms" className="px-6 py-2 border border-slate-200 rounded-full hover:bg-white/80 transition-all">
            {tc("terms")}
          </Link>
          <Link href="/privacy" className="px-6 py-2 border border-slate-200 rounded-full hover:bg-white/80 transition-all">
            {tc("privacy")}
          </Link>
          <Link href="/refund" className="px-6 py-2 border border-slate-200 rounded-full hover:bg-white/80 transition-all">
            {tc("refund")}
          </Link>
          <a href="mailto:security@ori.pics" className="px-6 py-2 border border-slate-200 rounded-full hover:bg-white/80 transition-all">
            {tc("security")}
          </a>
          <a href="https://www.ftc.go.kr/bizCommPop.do?wrkr_no=4448802865" target="_blank" rel="noopener noreferrer" className="px-6 py-2 border border-slate-200 rounded-full hover:bg-white/80 transition-all">
            {tc("business_verify")}
          </a>
        </div>
        <p>{tLV("footer")}</p>
        <div className="text-xs text-slate-400 text-center leading-relaxed mt-2">
          <p>{tLV("business_info_line1")}</p>
          <p>{tLV("business_info_line2")}</p>
        </div>
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

              {/* 모바일 브라우저 전용: 촬영 인증은 앱으로 유도 (2026-08-30 대표 요청 —
                  OS 파일 시트의 '사진 찍기'는 제거 불가라, Verified 촬영 경로를 명시 제공) */}
              {typeof navigator !== "undefined" && /android|iphone|ipad|ipod/i.test(navigator.userAgent) && (
                <>
                  <div className="h-px bg-white/80 my-2"></div>
                  <button
                    onClick={() => {
                      setShowUploadMenu(false);
                      const isAndroid = /android/i.test(navigator.userAgent);
                      window.location.href = isAndroid ? ANDROID_INTENT_URL : IOS_APP_URL;
                    }}
                    className="w-full flex items-center gap-4 p-4 hover:bg-white/80 rounded-2xl transition-colors text-left"
                  >
                    <div className="w-10 h-10 rounded-xl bg-blue-500/20 flex items-center justify-center text-blue-600">
                      <Camera size={22} />
                    </div>
                    <div className="flex flex-col">
                      <span className="font-medium">{t("upload.upload_menu.app_camera")}</span>
                      <span className="text-xs text-slate-500">{t("upload.upload_menu.app_camera_subtext")}</span>
                    </div>
                  </button>
                </>
              )}

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

      {unpublishedSelf && (() => {
        const previewUrl = URL.createObjectURL(unpublishedSelf.file);
        const pct = unpublishedUploadProgress && unpublishedUploadProgress.total > 0
          ? Math.min(100, Math.round((unpublishedUploadProgress.loaded / unpublishedUploadProgress.total) * 100))
          : 0;
        return (
          <div
            className="fixed inset-0 z-[10000] flex items-center justify-center p-6 bg-black/60"
            onClick={() => !publishingUnpublished && setUnpublishedSelf(null)}
          >
            <div
              className="relative bg-white rounded-2xl shadow-2xl max-w-lg w-full p-6"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="w-12 h-12 rounded-2xl bg-blue-100 text-blue-600 flex items-center justify-center mb-4">
                <ShieldCheck size={22} />
              </div>
              <h3 className="text-xl font-bold mb-2">{t("unpublished_self.title")}</h3>
              <p className="text-sm text-slate-600 leading-relaxed mb-4">
                {t("unpublished_self.body")}
              </p>
              <div className="flex justify-center mb-4 bg-slate-50 rounded-xl p-3">
                <img
                  src={previewUrl}
                  alt="Unpublished proof"
                  className="max-w-full max-h-[220px] object-contain rounded"
                  onLoad={() => URL.revokeObjectURL(previewUrl)}
                />
              </div>
              <p className="text-xs text-slate-500 mb-4 text-center">
                {t("result.c2pa_after_publish_note")}
              </p>

              {publishingUnpublished && (
                <div className="mb-4">
                  <div className="flex items-center justify-between text-xs text-slate-600 mb-1">
                    <span className="flex items-center gap-1.5">
                      <RefreshCw size={12} className="animate-spin" />
                      {unpublishedUploadProgress ? t("result.uploading") : t("result.publishing")}
                    </span>
                    {unpublishedUploadProgress && unpublishedUploadProgress.total > 0 && (
                      <span className="font-mono">
                        {pct}%
                      </span>
                    )}
                  </div>
                  <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                    <div className="bg-blue-600 h-1.5 rounded-full transition-all duration-150" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              )}

              <div className="flex gap-2">
                <button
                  onClick={handleUnpublishedSelfPublish}
                  disabled={publishingUnpublished}
                  className="flex-1 py-3 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl transition-colors disabled:opacity-60"
                >
                  {t("result.create_link_button", { cost: CREDIT_COSTS.LINK_CREATE })}
                </button>
                <button
                  onClick={() => setUnpublishedSelf(null)}
                  disabled={publishingUnpublished}
                  className="px-5 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl transition-colors disabled:opacity-60"
                >
                  {t("unpublished_self.cancel")}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

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
