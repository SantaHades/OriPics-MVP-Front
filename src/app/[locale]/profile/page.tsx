"use client";

import React, { useState, useRef, useEffect } from "react";
import { useSession, signOut } from "next-auth/react";
import { useRouter } from "@/navigation";
import { User, Mail, Lock, Camera, Save, ArrowLeft, RefreshCw, CheckCircle, Trash2, History, ExternalLink, ImageIcon, X, Wallet, FileText, Download, RotateCw, CreditCard, Copy, Check, Info, Ticket } from "lucide-react";
import { Link } from "@/navigation";
import { useTranslations, useLocale } from "next-intl";
import { useCredits, type CreditTransactionView } from "@/lib/credits/useCredits";
import { CREDIT_COSTS } from "@/lib/payment";

const SUPPORT_EMAIL = "hi@ori.pics";

interface SubscriptionInfo {
  plan: string;
  status: string;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  cancelAtPeriodEnd: boolean;
  canceledAt: string | null;
}

interface ProofRecord {
  id: string;
  linkId: string;
  thumbnail: string | null;
  width: number;
  height: number;
  timestamp: string;
  createdAt: string;
  /** 인증서 PDF 발급 여부 */
  pdfIssued?: boolean;
  /** PDF 발급 시점 ISO (재발급 시점 표시용) */
  pdfIssuedAt?: string | null;
  /** 원데이 패스로 발행 시 패스 id (A-60 — "패스" 태그 표시) */
  passId?: string | null;
}

/** 활성 원데이 패스 (GET /api/pass/active 응답 shape) */
interface ActivePassView {
  code_masked: string;
  redeemed_at: string;
  expires_at: string;
  total_proofs: number;
  used_proofs: number;
  remaining: number;
}

export default function ProfilePage() {
  const { data: session, status: sessionStatus, update } = useSession();
  const router = useRouter();

  // 비로그인 접근 시 로그인으로 — 기존엔 !session 스피너만 무한 표시 (2026-08-24 모바일 A-45 링크 실측)
  useEffect(() => {
    if (sessionStatus === "unauthenticated") router.replace("/login");
  }, [sessionStatus, router]);
  const t = useTranslations("Profile");
  const tc = useTranslations("Common");
  const tCredits = useTranslations("Home.credits");
  const locale = useLocale();
  // 보관함 사용량 — 온디맨드 조회 (2026-08-31 대표 결정: 버튼 클릭 시에만, 결과 유지)
  const [storageUsage, setStorageUsage] = useState<{ bytes: number; files: number; limit_bytes: number | null } | null>(null);
  const [storageLoading, setStorageLoading] = useState(false);
  const [storageError, setStorageError] = useState(false);
  const fetchStorageUsage = async () => {
    if (storageLoading) return;
    setStorageLoading(true);
    setStorageError(false);
    try {
      const res = await fetch("/api/user/storage");
      if (!res.ok) throw new Error(String(res.status));
      setStorageUsage(await res.json());
    } catch {
      setStorageError(true);
    } finally {
      setStorageLoading(false);
    }
  };
  const fmtBytes = (b: number) => {
    if (b < 1024 ** 2) return `${Math.max(0, Math.round(b / 1024))} KB`;
    if (b < 1024 ** 3) return `${(b / 1024 ** 2).toFixed(1)} MB`;
    return `${(b / 1024 ** 3).toFixed(2)} GB`;
  };
  const { data: credits, refresh: refreshCredits } = useCredits();

  // 원데이 패스 (A-60, 2026-08-31) — 활성 패스 자동 조회 + 코드 등록
  const [pass, setPass] = useState<ActivePassView | null>(null);
  const [passCode, setPassCode] = useState("");
  const [passBusy, setPassBusy] = useState(false);
  const [passError, setPassError] = useState<string | null>(null);
  // 등록 전 확인 창 (2026-08-31 대표) — 24h 즉시 시작·크레딧 대신 우선 차감·자동 발행·환불 불가 고지
  const [passConfirmOpen, setPassConfirmOpen] = useState(false);
  // 사용 안내 전체 팝업 — 등록 전·후 공통 "자세히 보기" (2026-08-31 대표)
  const [passDetailsOpen, setPassDetailsOpen] = useState(false);
  // 선물 랜딩(/pass/{code} → ?pass_code=)에서 넘어온 코드 자동 입력 (A-60 Phase 3).
  // useSearchParams 대신 location 직접 읽기 — 클라이언트 페이지 prerender 시 Suspense 요구 회피
  useEffect(() => {
    if (typeof window === "undefined") return;
    const q = new URLSearchParams(window.location.search).get("pass_code");
    if (q) {
      setPassCode(q);
      setTimeout(() => document.getElementById("pass")?.scrollIntoView({ behavior: "smooth", block: "center" }), 300);
    }
  }, []);
  useEffect(() => {
    if (sessionStatus !== "authenticated") return;
    fetch("/api/pass/active")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setPass(d?.active ? d.pass : null))
      .catch(() => {});
  }, [sessionStatus]);
  const handleRedeemPass = async () => {
    if (passBusy || !passCode.trim()) return;
    setPassBusy(true);
    setPassError(null);
    try {
      const res = await fetch("/api/pass/redeem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: passCode }),
      });
      const d = await res.json().catch(() => ({}) as any);
      if (!res.ok) {
        const KNOWN = ["invalid_code", "invalid_code_format", "code_already_used", "pass_already_active", "code_expired", "code_revoked", "not_owner"];
        // 429는 서버가 사용자 문구(message)를 직접 내려줌, 그 외는 detail 키 매핑
        setPassError(
          typeof d?.message === "string" && d.message
            ? d.message
            : KNOWN.includes(d?.detail)
              ? tCredits(`pass_err_${d.detail}` as any)
              : tCredits("pass_err_generic"),
        );
        return;
      }
      setPass(d.pass);
      setPassCode("");
    } catch {
      setPassError(tCredits("pass_err_generic"));
    } finally {
      setPassBusy(false);
    }
  };

  const [name, setName] = useState(session?.user?.name || "");
  const [password, setPassword] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [image, setImage] = useState(session?.user?.image || "");
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState({ type: "", text: "" });

  // 세션이 마운트 이후에 로딩되면 useState 초기값이 빈 채로 남음 — 빈 이름칸에 Chrome
  // 자동완성이 이메일을 밀어 넣는 증상(2026-08-27). 사용자 입력 전(빈 값)일 때만 동기화.
  useEffect(() => {
    if (session?.user?.name) setName((prev) => prev || session.user?.name || "");
    if (session?.user?.image) setImage((prev) => prev || session.user?.image || "");
  }, [session]);

  // 구독 관리 (일반해지 예약/재개 — 약관 제11조 제5항)
  const [subscription, setSubscription] = useState<SubscriptionInfo | null>(null);
  const [subBusy, setSubBusy] = useState(false);
  const [subError, setSubError] = useState<string | null>(null);
  const [showCancelModal, setShowCancelModal] = useState(false);

  useEffect(() => {
    fetch("/api/billing/subscription")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setSubscription(d?.subscription ?? null))
      .catch(() => {});
  }, []);

  const handleSubscriptionAction = async (action: "cancel" | "resume") => {
    setSubBusy(true);
    setSubError(null);
    try {
      const res = await fetch("/api/billing/subscription", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) throw new Error(String(res.status));
      setSubscription((prev) =>
        prev
          ? {
              ...prev,
              cancelAtPeriodEnd: action === "cancel",
              canceledAt: action === "cancel" ? new Date().toISOString() : null,
            }
          : prev,
      );
      setShowCancelModal(false);
    } catch {
      setSubError(t("subscription.error_generic"));
    } finally {
      setSubBusy(false);
    }
  };

  // 중도해지 자동 환불 (A-34) — 견적 조회 → 확인 모달 → 부분취소 실행
  const [refundQuote, setRefundQuote] = useState<{
    refundAmount: number;
    basis: string;
    usedProofs: number;
    usageDeduction: number;
    proratedElapsed: number;
    penalty: number;
    refundable: boolean;
  } | null>(null);
  const [showRefundModal, setShowRefundModal] = useState(false);
  const [refundDone, setRefundDone] = useState<number | null>(null);

  const handleRefundPreview = async () => {
    setSubBusy(true);
    setSubError(null);
    try {
      const res = await fetch("/api/billing/subscription", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "refund_preview" }),
      });
      if (!res.ok) throw new Error(String(res.status));
      const d = await res.json();
      setRefundQuote(d.quote);
      setShowRefundModal(true);
    } catch {
      setSubError(t("subscription.error_generic"));
    } finally {
      setSubBusy(false);
    }
  };

  const handleRefundConfirm = async () => {
    setSubBusy(true);
    setSubError(null);
    try {
      const res = await fetch("/api/billing/subscription", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "refund_cancel" }),
      });
      const d = await res.json().catch(() => null);
      if (!res.ok) {
        setShowRefundModal(false);
        setSubError(
          res.status === 409 && d?.detail === "refund_not_available"
            ? t("subscription.refund_not_available")
            : t("subscription.error_generic"),
        );
        return;
      }
      setRefundDone(d?.refunded ?? 0);
      setShowRefundModal(false);
      setSubscription(null); // 즉시 종료 — 섹션 갱신
      // 환불로 티어·크레딧이 원복됨 — 현재 플랜/잔여 횟수 카드 즉시 갱신 (2026-08-24 실측: 미갱신 stale)
      void refreshCredits();
    } catch {
      setSubError(t("subscription.error_generic"));
    } finally {
      setSubBusy(false);
    }
  };
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [proofs, setProofs] = useState<ProofRecord[]>([]);
  const [loadingProofs, setLoadingProofs] = useState(true);
  // "더 보기" 페이지네이션 (2026-08-21): 인증 히스토리 50개/최근 내역 20건 초과분 열람
  const [proofCursor, setProofCursor] = useState<string | null>(null);
  const [loadingMoreProofs, setLoadingMoreProofs] = useState(false);
  const [extraTxs, setExtraTxs] = useState<CreditTransactionView[]>([]);
  const [txCursor, setTxCursor] = useState<string | null>(null);
  const [txMayHaveMore, setTxMayHaveMore] = useState(true);
  const [loadingMoreTxs, setLoadingMoreTxs] = useState(false);
  const [previewProof, setPreviewProof] = useState<ProofRecord | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);
  // 모달 항목이 바뀌면 복사 피드백 초기화
  useEffect(() => setLinkCopied(false), [previewProof?.linkId]);
  // B-2 (2026-05-17): PDF 발급/재발급/다운로드, 인증 삭제 상태
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ProofRecord | null>(null);
  const [deletingProof, setDeletingProof] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // 인증 히스토리 불러오기
  useEffect(() => {
    const fetchProofs = async () => {
      try {
        const res = await fetch("/api/proof/history");
        if (res.ok) {
          const data = await res.json();
          setProofs(data.proofs || []);
          setProofCursor(data.nextCursor ?? null);
        }
      } catch (err) {
        console.error("Failed to fetch proof history:", err);
      } finally {
        setLoadingProofs(false);
      }
    };
    fetchProofs();
  }, []);

  // 패스 발행분은 인증서 PDF가 백그라운드 자동 생성(수십 초) — 생성 대기 중인 항목 판정.
  // 최근 10분 내 항목만 "준비 중"으로 취급 (오래된 워밍 실패 건에 스피너가 영구 표시되는 것 방지)
  const isPdfPending = (p: ProofRecord) =>
    !!p.passId && !p.pdfIssued && Date.now() - new Date(p.createdAt).getTime() < 10 * 60 * 1000;

  // 준비 중 항목이 있으면 8초 간격 폴링 — 생성 완료 시 스핀 태그가 PDF 태그로 자연 전환 (2026-08-31 대표)
  useEffect(() => {
    if (!proofs.some(isPdfPending)) return;
    const timer = setTimeout(async () => {
      try {
        const res = await fetch("/api/proof/history");
        if (res.ok) {
          const data = await res.json();
          const fresh = new Map<string, ProofRecord>(
            ((data.proofs || []) as ProofRecord[]).map((p) => [p.linkId, p]),
          );
          // 첫 페이지 범위만 갱신 — "더 보기"로 붙인 이전 항목은 유지
          setProofs((prev) => prev.map((p) => fresh.get(p.linkId) ?? p));
        }
      } catch {
        // 다음 주기에서 재시도
      }
    }, 8000);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proofs]);

  // 모달 열린 동안 ESC + body scroll lock
  useEffect(() => {
    if (!previewProof) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPreviewProof(null);
    };
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handler);
    return () => {
      window.removeEventListener("keydown", handler);
      document.body.style.overflow = prevOverflow;
    };
  }, [previewProof]);

  // linkId → public 원본 URL
  const proofImageUrl = (linkId: string): string | null => {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!supabaseUrl || !linkId || linkId.length < 7) return null;
    const yymmdd = linkId.slice(1, 7);
    return `${supabaseUrl}/storage/v1/object/public/oripics-proofs/${yymmdd}/${linkId}.png`;
  };

  // 그리드 썸네일 폴백: ProofHistory.thumbnail이 없는 항목(구 모바일 발급분)은
  // 뷰어용 경량본(_preview.jpg, A-36)을 사용. 그것도 없으면 img onError로 아이콘 노출.
  const proofPreviewUrl = (linkId: string): string | null => {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!supabaseUrl || !linkId || linkId.length < 7) return null;
    const yymmdd = linkId.slice(1, 7);
    return `${supabaseUrl}/storage/v1/object/public/oripics-proofs/${yymmdd}/${linkId}_preview.jpg`;
  };

  // "더 보기" — 인증 히스토리 다음 50개
  const loadMoreProofs = async () => {
    if (!proofCursor || loadingMoreProofs) return;
    setLoadingMoreProofs(true);
    try {
      const res = await fetch(`/api/proof/history?cursor=${encodeURIComponent(proofCursor)}`);
      if (res.ok) {
        const data = await res.json();
        setProofs((prev) => [...prev, ...(data.proofs || [])]);
        setProofCursor(data.nextCursor ?? null);
      }
    } catch (err) {
      console.error("Failed to load more proofs:", err);
    } finally {
      setLoadingMoreProofs(false);
    }
  };

  // "더 보기" — 최근 내역 다음 20건 (초기 20건은 /api/credits/me의 recentTransactions)
  const visibleTxs = React.useMemo(() => {
    const base = credits?.recentTransactions ?? [];
    const seen = new Set(base.map((t) => t.id));
    return [...base, ...extraTxs.filter((t) => !seen.has(t.id))];
  }, [credits?.recentTransactions, extraTxs]);

  const loadMoreTxs = async () => {
    if (loadingMoreTxs || visibleTxs.length === 0) return;
    setLoadingMoreTxs(true);
    try {
      const cursor = txCursor ?? visibleTxs[visibleTxs.length - 1].id;
      const res = await fetch(`/api/credits/history?cursor=${encodeURIComponent(cursor)}`);
      if (res.ok) {
        const data = await res.json();
        setExtraTxs((prev) => [...prev, ...(data.transactions || [])]);
        setTxCursor(data.nextCursor ?? null);
        setTxMayHaveMore(!!data.nextCursor);
      }
    } catch (err) {
      console.error("Failed to load more transactions:", err);
    } finally {
      setLoadingMoreTxs(false);
    }
  };

  // 타임스탬프 포맷팅 — 소스 접두사(P/F/C) 제거 후 UTC로 파싱해 로컬 시간 표시
  // (2026-08-21: 접두사 미제거로 "20.60.82" 오표기되던 버그 수정)
  const formatProofTimestamp = (ts: string) => {
    const clean = /^\d/.test(ts[0] ?? "") ? ts : ts.substring(1);
    if (clean.length !== 14 || !/^\d{14}$/.test(clean)) return ts;
    const d = new Date(Date.UTC(
      2000 + parseInt(clean.substring(0, 2), 10),
      parseInt(clean.substring(2, 4), 10) - 1,
      parseInt(clean.substring(4, 6), 10),
      parseInt(clean.substring(6, 8), 10),
      parseInt(clean.substring(8, 10), 10),
      parseInt(clean.substring(10, 12), 10),
    ));
    if (isNaN(d.getTime())) return ts;
    const p = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
  };

  // 링크 만료 여부 (7일)
  const isExpired = (createdAt: string) => {
    const created = new Date(createdAt);
    const now = new Date();
    return (now.getTime() - created.getTime()) > 7 * 24 * 60 * 60 * 1000;
  };

  // 이미지 업로드 처리 (Supabase Storage)
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      setMessage({ type: "error", text: t("messages.size_error") });
      return;
    }

    setUploading(true);
    setMessage({ type: "", text: "" });

    try {
      // 브라우저에서 공개 anon 키로 직접 업로드하던 경로를 서버 API로 전환 (2026-08-22 보안 수정)
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/profile/avatar", { method: "POST", body });
      if (!res.ok) {
        const d = await res.json().catch(() => null);
        throw new Error(d?.detail ?? String(res.status));
      }
      const { url: publicUrl } = await res.json();

      setImage(publicUrl);
      setMessage({ type: "success", text: t("messages.upload_success") });
    } catch (error: any) {
      console.error("Detailed error:", error);
      setMessage({ type: "error", text: t("messages.upload_error", { error: error.message }) });
    } finally {
      setUploading(false);
    }
  };

  // 프로필 정보 저장
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage({ type: "", text: "" });

    try {
      const res = await fetch("/api/user/update", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, password, currentPassword, image }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to update profile");

      // 세션 업데이트 (헤더 등에 실시간 반영)
      await update({ name, image });
      
      setMessage({ type: "success", text: t("messages.save_success") });
      setPassword(""); // 비밀번호 필드 초기화
      setCurrentPassword("");
    } catch (error: any) {
      setMessage({ type: "error", text: t("messages.save_error", { error: error.message }) });
    } finally {
      setSaving(false);
    }
  };

  // PDF 발급/다운로드/재발급 — /api/links/[linkId]/certificate
  // 동작 (서버):
  //   - 캐시 없으면: 발급 -10 + 캐시 저장 + PDF 응답
  //   - 캐시 있으면 (기본): 무료 다운로드
  //   - ?reissue=1: 캐시 무시하고 재발급 -10
  const handlePdfAction = async (proof: ProofRecord, mode: "issue_or_download" | "reissue") => {
    if (pdfBusy) return;
    setPdfBusy(true);
    setPdfError(null);
    try {
      const url = `/api/links/${proof.linkId}/certificate${mode === "reissue" ? "?reissue=1" : ""}`;
      const res = await fetch(url, { method: "GET" });
      if (!res.ok) {
        let detail = `${res.status}`;
        try {
          const j = await res.json();
          detail = j.detail || detail;
        } catch { /* ignore */ }
        throw new Error(detail);
      }
      // PDF blob 다운로드
      const blob = await res.blob();
      const cached = res.headers.get("X-Oripics-Cached") === "1";
      const downloadUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = downloadUrl;
      a.download = `OriPics_Certificate_${proof.linkId}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(downloadUrl);

      // 발급(혹은 재발급)된 경우 — pdfIssued 상태 갱신
      if (!cached || mode === "reissue") {
        setProofs((prev) => prev.map((p) =>
          p.linkId === proof.linkId ? { ...p, pdfIssued: true, pdfIssuedAt: new Date().toISOString() } : p,
        ));
        setPreviewProof((prev) => prev && prev.linkId === proof.linkId
          ? { ...prev, pdfIssued: true, pdfIssuedAt: new Date().toISOString() }
          : prev);
      }
    } catch (e: any) {
      setPdfError(e?.message || "unknown");
    } finally {
      setPdfBusy(false);
    }
  };

  // 인증 이미지 삭제 (DELETE /api/links/[id])
  const handleProofDelete = async () => {
    if (!deleteTarget || deletingProof) return;
    setDeletingProof(true);
    try {
      const res = await fetch(`/api/links/${deleteTarget.linkId}`, { method: "DELETE" });
      if (!res.ok) {
        let detail = `${res.status}`;
        try {
          const j = await res.json();
          detail = j.detail || detail;
        } catch { /* ignore */ }
        throw new Error(detail);
      }
      setProofs((prev) => prev.filter((p) => p.linkId !== deleteTarget.linkId));
      setDeleteTarget(null);
      setPreviewProof(null);
    } catch (e: any) {
      alert(`삭제 실패: ${e?.message || "unknown"}`);
    } finally {
      setDeletingProof(false);
    }
  };

  // 회원 탈퇴 처리
  const handleDeleteAccount = async () => {
    setDeleting(true);
    try {
      const res = await fetch("/api/user/delete", { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || "Failed to delete account");
      }
      // 페이지를 떠나는 마지막 동작이라 인라인 메시지는 보이지 않음 — 앱(Alert)과 동일하게
      // 블로킹 알림으로 완료를 고지 (2026-08-27, "완료 안내 없이 메인 이동" 피드백)
      window.alert(t("messages.delete_done"));
      await signOut({ callbackUrl: "/" });
    } catch (error: any) {
      setMessage({ type: "error", text: t("messages.delete_error", { error: error.message }) });
      setShowDeleteModal(false);
    } finally {
      setDeleting(false);
    }
  };

  if (!session) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <RefreshCw className="animate-spin text-blue-500" size={32} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 p-6 bg-[radial-gradient(circle_at_top_right,_var(--tw-gradient-stops))] from-blue-50 via-white to-purple-50">
      <div className="max-w-2xl mx-auto pt-12 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <Link href="/" className="inline-flex items-center gap-2 text-slate-600 hover:text-slate-900 mb-8 transition-colors group">
          <ArrowLeft size={18} className="group-hover:-translate-x-1 transition-transform" /> {tc("home")}
        </Link>

        <div className="mb-10 text-center sm:text-left">
          <h1 className="text-3xl font-extrabold tracking-tight mb-2">{t("title")}</h1>
          <p className="text-slate-600">{t("subtitle")}</p>
        </div>

        <div className="auth-card">
          <form onSubmit={handleSave} className="space-y-8">
            {/* 프로필 이미지 섹션 */}
            <div className="flex flex-col items-center sm:flex-row gap-8 pb-8 border-b border-slate-100">
              <div className="relative group">
                <div className="w-32 h-32 rounded-full overflow-hidden border-4 border-blue-500/20 bg-slate-100 flex items-center justify-center shadow-2xl transition-transform group-hover:scale-[1.02]">
                  {image ? (
                    <img src={image} alt="Profile" className="w-full h-full object-cover" />
                  ) : (
                    <User size={48} className="text-slate-600" />
                  )}
                  {uploading && (
                    <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                      <RefreshCw className="animate-spin text-blue-600" size={24} />
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="absolute bottom-0 right-0 p-2.5 bg-blue-600 rounded-full text-white shadow-xl hover:bg-blue-500 transition-all hover:scale-110 active:scale-95"
                  title={t("change_photo")}
                >
                  <Camera size={18} />
                </button>
                <input
                  type="file"
                  ref={fileInputRef}
                  className="hidden"
                  accept="image/*"
                  onChange={handleImageUpload}
                />
              </div>
              <div className="flex-1 text-center sm:text-left">
                <h3 className="text-lg font-bold mb-1">{t("profile_image")}</h3>
                <p className="text-sm text-slate-500 mb-4 whitespace-pre-line">{t("profile_image_desc")}</p>
              </div>
            </div>

            {/* 기본 정보 폼 */}
            <div className="grid grid-cols-1 gap-6">
              <div>
                <label className="text-xs font-bold text-blue-600 uppercase tracking-[0.2em] mb-3 block ml-1 opacity-70">{t("email_label")}</label>
                <div className="relative opacity-60">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                  <input
                    type="email"
                    disabled
                    className="w-full bg-slate-100 border border-slate-100 rounded-2xl py-4 pl-12 pr-4 text-sm cursor-not-allowed"
                    value={session.user?.email || ""}
                  />
                </div>
                <p className="text-xs text-slate-600 mt-2 ml-1">{t("email_hint")}</p>
              </div>

              <div>
                <label className="text-xs font-bold text-blue-600 uppercase tracking-[0.2em] mb-3 block ml-1 opacity-70">{t("name_label")}</label>
                <div className="relative group">
                  <User className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-blue-600 transition-colors" size={18} />
                  <input
                    type="text"
                    required
                    placeholder={t("name_placeholder")}
                    // 브라우저 자동완성이 이름칸에 이메일을 채우는 오인 방지 (2026-08-26 실측 — Apple 가입 직후 gmail이 채워져 보임)
                    autoComplete="nickname"
                    className="w-full bg-slate-100 border border-slate-100 rounded-2xl py-4 pl-12 pr-4 text-sm focus:border-blue-500/50 outline-none transition-all focus:ring-4 focus:ring-blue-500/10"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-blue-600 uppercase tracking-[0.2em] mb-3 block ml-1 opacity-70">{t("password_label")}</label>
                <div className="relative group">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-blue-600 transition-colors" size={18} />
                  <input
                    type="password"
                    placeholder={t("password_placeholder")}
                    className="w-full bg-slate-100 border border-slate-100 rounded-2xl py-4 pl-12 pr-4 text-sm focus:border-blue-500/50 outline-none transition-all focus:ring-4 focus:ring-blue-500/10 placeholder:text-slate-700"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </div>
              </div>

              {/* 비밀번호 변경 시 현재 비밀번호 재확인 (M-4: 세션 탈취만으로 계정 탈취 방지) */}
              {password && (
                <div>
                  <label className="text-xs font-bold text-blue-600 uppercase tracking-[0.2em] mb-3 block ml-1 opacity-70">{t("current_password_label")}</label>
                  <div className="relative group">
                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-blue-600 transition-colors" size={18} />
                    <input
                      type="password"
                      placeholder={t("current_password_placeholder")}
                      className="w-full bg-slate-100 border border-slate-100 rounded-2xl py-4 pl-12 pr-4 text-sm focus:border-blue-500/50 outline-none transition-all focus:ring-4 focus:ring-blue-500/10 placeholder:text-slate-700"
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* 결과 메시지 */}
            {message.text && (
              <div className={`p-4 rounded-xl flex items-start gap-3 animate-in fade-in slide-in-from-top-2 duration-300 ${
                message.type === "success" ? "bg-emerald-500/10 border border-emerald-500/20 text-emerald-400" : "bg-red-500/10 border border-red-500/20 text-red-600"
              }`}>
                {message.type === "success" ? <CheckCircle size={18} className="shrink-0 mt-0.5" /> : <RefreshCw size={18} className="shrink-0 mt-0.5" />}
                <span className="text-sm font-medium">{message.text}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={saving || uploading}
              className="w-full py-4 bg-gradient-to-r from-blue-700 to-blue-500 hover:from-blue-600 hover:to-blue-400 text-white font-bold rounded-2xl transition-all shadow-xl shadow-blue-200/50 flex items-center justify-center gap-2 active:scale-[0.98] disabled:opacity-50"
            >
              {saving ? <RefreshCw className="animate-spin" size={20} /> : (
                <>{t("submit")} <Save size={18} /></>
              )}
            </button>
          </form>
        </div>

        {/* 원데이 패스 (A-60, 2026-08-31) — 활성 패스 표시 + 코드 등록. ⚠️앱과 달리 웹은 판매 링크 허용이지만 판매 페이지는 Phase 3 */}
        <div id="pass" className="mt-6 rounded-2xl border border-slate-200 bg-white/70 p-5">
          <div className="flex items-center gap-2 mb-2">
            <Ticket size={18} className="text-blue-600" />
            <h3 className="text-sm font-bold">{tCredits("pass_title")}</h3>
            {pass && (
              <span className="ml-auto px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-[11px] font-bold">
                {tCredits("pass_remaining", { count: pass.remaining })}
              </span>
            )}
          </div>
          {pass ? (
            <>
              <p className="font-mono text-lg font-bold tracking-wide">{pass.code_masked}</p>
              <p className="text-xs text-slate-500 mt-1">
                {tCredits("pass_expires", {
                  time: new Intl.DateTimeFormat(locale === "en" ? "en-US" : "ko-KR", {
                    timeZone: "Asia/Seoul", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit",
                  }).format(new Date(pass.expires_at)),
                })}
              </p>
              <p className="text-xs text-slate-500 mt-1">{tCredits("pass_active_note")}</p>
              <button
                type="button"
                onClick={() => setPassDetailsOpen(true)}
                className="mt-2 text-xs font-semibold text-blue-600 hover:text-blue-500 underline underline-offset-2"
              >
                {tCredits("pass_details_link")}
              </button>
            </>
          ) : (
            <>
              <p className="text-xs text-slate-500 mb-1">{tCredits("pass_inactive_note")}</p>
              <button
                type="button"
                onClick={() => setPassDetailsOpen(true)}
                className="mb-3 text-xs font-semibold text-blue-600 hover:text-blue-500 underline underline-offset-2"
              >
                {tCredits("pass_details_link")}
              </button>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={passCode}
                  onChange={(e) => { setPassCode(e.target.value); setPassError(null); }}
                  onKeyDown={(e) => { if (e.key === "Enter" && passCode.trim() && !passBusy) setPassConfirmOpen(true); }}
                  placeholder={tCredits("pass_code_placeholder")}
                  autoCapitalize="characters"
                  autoCorrect="off"
                  spellCheck={false}
                  className="flex-1 min-w-0 bg-slate-100 border border-slate-100 rounded-xl py-2.5 px-4 font-mono text-sm uppercase tracking-wide outline-none focus:border-blue-300"
                />
                <button
                  type="button"
                  onClick={() => setPassConfirmOpen(true)}
                  disabled={passBusy || !passCode.trim()}
                  className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold transition-colors disabled:opacity-60 whitespace-nowrap"
                >
                  {passBusy ? tCredits("pass_redeeming") : tCredits("pass_redeem")}
                </button>
              </div>
              {passError && <p className="mt-2 text-xs text-red-600">{passError}</p>}
            </>
          )}
        </div>

        {/* 패스 사용 안내 전체 팝업 — 등록 전·후 공통 (2026-08-31 대표) */}
        {passDetailsOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-6">
            <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-xl max-h-[80vh] overflow-y-auto">
              <h3 className="text-xl font-bold text-slate-900 mb-3 flex items-center gap-2">
                <Ticket size={20} className="text-blue-600" />
                {tCredits("pass_details_title")}
              </h3>
              <ul className="text-sm text-slate-600 mb-5 space-y-2 list-disc pl-5">
                {(["pass_details_1", "pass_details_2", "pass_details_3", "pass_details_4", "pass_details_5", "pass_details_6", "pass_details_7", "pass_details_8", "pass_details_9"] as const).map((k) => (
                  <li key={k}>{tCredits(k)}</li>
                ))}
              </ul>
              <div className="flex justify-end">
                <button
                  onClick={() => setPassDetailsOpen(false)}
                  className="px-4 py-2 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition-colors"
                >
                  {tCredits("pass_details_close")}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 패스 등록 확인 모달 — 24h 즉시 시작·우선 차감·자동 발행·환불 불가 고지 후 등록 */}
        {passConfirmOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-6">
            <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-xl">
              <h3 className="text-xl font-bold text-slate-900 mb-3">
                {tCredits("pass_confirm_title")}
              </h3>
              <ul className="text-sm text-slate-600 mb-5 space-y-2 list-disc pl-5">
                <li>{tCredits("pass_confirm_1")}</li>
                <li>{tCredits("pass_confirm_2")}</li>
                <li>{tCredits("pass_confirm_3")}</li>
                <li className="font-semibold text-slate-700">{tCredits("pass_confirm_4")}</li>
              </ul>
              <div className="flex gap-3 justify-end">
                <button
                  onClick={() => setPassConfirmOpen(false)}
                  disabled={passBusy}
                  className="px-4 py-2 rounded-xl border border-slate-300 text-slate-600 text-sm font-semibold hover:bg-slate-50 disabled:opacity-50 transition-colors"
                >
                  {tCredits("pass_confirm_cancel")}
                </button>
                <button
                  onClick={() => {
                    setPassConfirmOpen(false);
                    void handleRedeemPass();
                  }}
                  disabled={passBusy}
                  className="px-4 py-2 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors"
                >
                  {tCredits("pass_confirm_go")}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 크레딧 섹션 (J-4) */}
        <div id="credits" className="mt-12 pt-8 border-t border-slate-100 scroll-mt-24">
          <div className="flex items-center gap-3 mb-6">
            <Wallet size={20} className="text-blue-600" />
            <h2 className="text-lg font-bold">{tCredits("section_title")}</h2>
          </div>

          {/* 보관 유예 경고 (A-58 §5.3) — 이메일 알림의 제품 내 백업 채널 */}
          {credits?.grace && (
            <div className="mb-4 p-4 rounded-2xl border border-amber-300 bg-amber-50 text-sm text-amber-900">
              <p className="font-bold mb-1">
                ⚠️ {tCredits("grace_title", { count: credits.grace.count })}
              </p>
              <p className="text-xs leading-relaxed">
                {tCredits("grace_body", {
                  date: new Intl.DateTimeFormat(locale === "en" ? "en-US" : "ko-KR", {
                    timeZone: "Asia/Seoul", year: "numeric", month: "long", day: "numeric",
                  }).format(new Date(credits.grace.expires_at)),
                })}
              </p>
              <Link
                href="/billing/checkout?plan=pro_monthly"
                className="mt-2 inline-flex items-center gap-1 px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold rounded-full transition-colors"
              >
                {tCredits("grace_cta")}
              </Link>
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <div className="rounded-2xl border border-slate-200 bg-white/70 p-5">
              <p className="text-xs text-slate-500 mb-1">{tCredits("tier_label")}</p>
              <p className="text-2xl font-extrabold capitalize">
                {credits?.tier ?? "—"}
              </p>
              {/* free 티어에 구독 전환 진입점 (2026-08-24 피드백) */}
              {credits?.tier === "free" && (
                <Link
                  href="/billing/checkout?plan=pro_monthly"
                  className="mt-2 inline-flex items-center gap-1 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-full transition-colors"
                >
                  {t("proof_history.upgrade_cta")}
                </Link>
              )}
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white/70 p-5">
              <p className="text-xs text-slate-500 mb-1 flex items-center gap-1">
                {tCredits("balance_label")}
                {/* 앱의 크레딧 칩 ⓘ와 동일 패턴 — 클릭하면 아래 차감 규칙 패널을 펼치고 스크롤 (2026-08-26 대표 피드백) */}
                <button
                  type="button"
                  aria-label={tCredits("rules_toggle")}
                  onClick={() => {
                    const el = document.getElementById("credit-rules") as HTMLDetailsElement | null;
                    if (el) {
                      el.open = true;
                      el.scrollIntoView({ behavior: "smooth", block: "start" });
                    }
                  }}
                  className="text-slate-400 hover:text-blue-600 transition-colors"
                >
                  <Info size={14} />
                </button>
              </p>
              <p className="text-2xl font-extrabold">{credits ? `${credits.credits}` : "—"}</p>
              {/* "N회 인증 가능" 추정 표기는 가변 차감(기본 3·Verified 4·대형 ×2~3)과 안 맞아 규칙 요약으로 교체 (2026-08-26 대표 피드백) */}
              <p className="text-xs text-slate-500 mt-1">{tCredits("balance_note")}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white/70 p-5">
              <p className="text-xs text-slate-500 mb-1">{tCredits("renews_label")}</p>
              <p className="text-sm font-semibold text-slate-700">
                {credits?.creditsRenewAt
                  ? new Date(credits.creditsRenewAt).toLocaleDateString()
                  : "—"}
              </p>
            </div>
            {/* 보관함 사용량 (A-61, 2026-08-31) — 버튼 클릭 시 조회 */}
            <div className="rounded-2xl border border-slate-200 bg-white/70 p-5">
              <p className="text-xs text-slate-500 mb-1">{tCredits("storage_label")}</p>
              {storageUsage ? (
                <>
                  <p className="text-sm font-semibold text-slate-700">
                    {fmtBytes(storageUsage.bytes)}
                    {storageUsage.limit_bytes ? ` / ${fmtBytes(storageUsage.limit_bytes)}` : ""}
                  </p>
                  {storageUsage.limit_bytes ? (
                    <div className="w-full h-1.5 bg-slate-200 rounded-full mt-2 overflow-hidden">
                      <div
                        className="h-1.5 bg-blue-500 rounded-full"
                        style={{ width: `${Math.min(100, (storageUsage.bytes / storageUsage.limit_bytes) * 100)}%` }}
                      />
                    </div>
                  ) : (
                    <p className="text-xs text-slate-500 mt-1">{tCredits("storage_free_note")}</p>
                  )}
                  <p className="text-xs text-slate-500 mt-1">
                    {tCredits("storage_files", { count: storageUsage.files })}
                  </p>
                </>
              ) : (
                <button
                  onClick={fetchStorageUsage}
                  disabled={storageLoading}
                  className="mt-1 px-3 py-1.5 text-xs font-semibold rounded-full border border-slate-300 text-slate-700 hover:bg-slate-100 transition-colors disabled:opacity-60"
                >
                  {storageLoading
                    ? tCredits("storage_loading")
                    : storageError
                      ? tCredits("storage_retry")
                      : tCredits("storage_view")}
                </button>
              )}
            </div>
          </div>

          {/* 차감 규칙·요금제 (2026-08-22) — 접힌 상태 기본, 모바일 앱 시트와 동일 내용 + 웹 가격 */}
          <details id="credit-rules" className="rounded-2xl border border-slate-200 bg-white/40 mb-6 group scroll-mt-24">
            <summary className="px-5 py-3 text-sm font-semibold text-slate-700 cursor-pointer select-none list-none flex items-center justify-between">
              {tCredits("rules_toggle")}
              <span className="text-slate-400 group-open:rotate-180 transition-transform">⌄</span>
            </summary>
            <div className="px-5 pb-4 text-sm text-slate-700">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">{tCredits("rules_costs_title")}</p>
              {/* 각 항목 아래 희미한 작은 설명문 — 앱 시트와 동일 6항목 (2026-09-03 대표 요청) */}
              {([
                ["rules_local_label", "rules_local_cost", "rules_local_desc"],
                ["rules_verify_label", "rules_verify_cost", "rules_verify_desc"],
                ["rules_standard_label", "rules_standard_cost", "rules_standard_desc"],
                ["rules_verified_label", "rules_verified_cost", "rules_verified_desc"],
                ["rules_link_label", "rules_link_cost", "rules_link_desc"],
                ["rules_pdf_label", "rules_pdf_cost", "rules_pdf_desc"],
              ] as const).map(([labelKey, costKey, descKey]) => (
                <div key={labelKey} className="flex justify-between gap-4 py-2 border-b border-slate-100">
                  <div className="min-w-0">
                    <span className="text-slate-600">{tCredits(labelKey)}</span>
                    <p className="text-[11px] leading-snug text-slate-400 mt-0.5">{tCredits(descKey)}</p>
                  </div>
                  <span className="font-semibold shrink-0">{tCredits(costKey)}</span>
                </div>
              ))}
              <p className="text-xs text-slate-500 mt-2">{tCredits("rules_multiplier")}</p>
              <p className="text-xs text-slate-500 mt-1">{tCredits("rules_owner")}</p>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mt-4 mb-1">{tCredits("rules_plans_title")}</p>
              <div className="flex justify-between py-1.5 border-b border-slate-100">
                <span className="text-slate-500">Free</span>
                <span className="font-semibold">{tCredits("rules_plan_free")}</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-slate-100">
                <span className="text-slate-500">Pro</span>
                <span className="font-semibold">{tCredits("rules_plan_pro")}</span>
              </div>
              <p className="text-xs text-slate-500 mt-2">{tCredits("rules_plan_note")}</p>
            </div>
          </details>

          {credits && visibleTxs.length > 0 && (
            <div className="rounded-2xl border border-slate-200 bg-white/40">
              <div className="px-5 py-3 border-b border-slate-100">
                <p className="text-xs font-semibold text-slate-600 uppercase tracking-wider">
                  {tCredits("history_title")}
                </p>
              </div>
              <ul className="divide-y divide-slate-100 max-h-80 overflow-y-auto">
                {visibleTxs.map((tx) => {
                  const positive = tx.delta > 0;
                  return (
                    <li key={tx.id} className="px-5 py-3 flex items-center justify-between gap-3 text-sm">
                      <div className="flex flex-col min-w-0">
                        <span className="font-medium text-slate-800 truncate">
                          {tCredits(`action_${tx.action}` as any)}
                        </span>
                        <span className="text-xs text-slate-500 font-mono">
                          {new Date(tx.createdAt).toLocaleString()}
                        </span>
                      </div>
                      <div className="flex flex-col items-end shrink-0">
                        <span className={`font-bold tabular-nums ${positive ? "text-emerald-600" : "text-slate-700"}`}>
                          {positive ? "+" : ""}{tx.delta}
                        </span>
                        <span className="text-[11px] text-slate-400 tabular-nums">
                          {tCredits("balance_short", { count: tx.balanceAfter })}
                        </span>
                      </div>
                    </li>
                  );
                })}
              </ul>
              {visibleTxs.length >= 20 && txMayHaveMore && (
                <div className="px-5 py-2 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={loadMoreTxs}
                    disabled={loadingMoreTxs}
                    className="w-full text-xs font-semibold text-blue-600 hover:text-blue-700 py-1.5 disabled:opacity-50"
                  >
                    {loadingMoreTxs ? "…" : t("load_more")}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* 구독 관리 섹션 (유료 구독자에게만 표시) */}
        {subscription && subscription.status === "active" && (
          <div id="subscription" className="mt-12 pt-8 border-t border-slate-100 scroll-mt-24">
            <div className="flex items-center gap-3 mb-6">
              <CreditCard size={20} className="text-blue-600" />
              <h2 className="text-lg font-bold">{t("subscription.title")}</h2>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white/40 p-5">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-4">
                <div>
                  <p className="text-xs text-slate-500 mb-1">{t("subscription.plan_label")}</p>
                  <p className="font-bold">OriPics Pro</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 mb-1">{t("subscription.status_label")}</p>
                  <p className={`font-bold ${subscription.cancelAtPeriodEnd ? "text-amber-600" : "text-emerald-600"}`}>
                    {subscription.cancelAtPeriodEnd
                      ? t("subscription.status_cancel_scheduled")
                      : t("subscription.status_active")}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 mb-1">
                    {subscription.cancelAtPeriodEnd
                      ? t("subscription.ends_at_label")
                      : t("subscription.next_billing_label")}
                  </p>
                  <p className="font-bold tabular-nums">
                    {new Date(subscription.currentPeriodEnd).toLocaleDateString()}
                  </p>
                </div>
              </div>

              {subscription.cancelAtPeriodEnd && (
                <p className="mb-4 px-4 py-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs">
                  {t("subscription.canceled_notice", {
                    date: new Date(subscription.currentPeriodEnd).toLocaleDateString(),
                  })}
                </p>
              )}

              {subError && (
                <p className="mb-4 px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs">
                  {subError}
                </p>
              )}

              <div className="flex flex-wrap gap-3">
                {subscription.cancelAtPeriodEnd ? (
                  <button
                    onClick={() => handleSubscriptionAction("resume")}
                    disabled={subBusy}
                    className="px-4 py-2 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:bg-slate-300 transition-colors"
                  >
                    {t("subscription.resume_button")}
                  </button>
                ) : (
                  <button
                    onClick={() => setShowCancelModal(true)}
                    disabled={subBusy}
                    className="px-4 py-2 rounded-xl border border-slate-300 text-slate-600 text-sm font-semibold hover:bg-slate-50 disabled:opacity-50 transition-colors"
                  >
                    {t("subscription.cancel_button")}
                  </button>
                )}
              </div>

              {/* 환불 신청 (7일 청약철회 · 중도해지) — 자동 산정·즉시 처리 (A-34) + 이메일 폴백 */}
              <div className="mt-5 pt-4 border-t border-slate-100">
                <p className="text-xs font-semibold text-slate-600 mb-1">
                  {t("subscription.refund_request_label")}
                </p>
                <p className="text-[11px] text-slate-500 mb-2">
                  {t("subscription.refund_request_desc")}{" "}
                  <Link href="/refund" className="underline hover:text-slate-800" target="_blank">
                    {t("subscription.refund_policy_link")}
                  </Link>
                </p>
                {/* 모바일에서 세로로 겹칠 때 간격 확보 — flex gap (2026-08-24 실기기 피드백) */}
                <div className="flex flex-wrap gap-3">
                  <button
                    onClick={handleRefundPreview}
                    disabled={subBusy}
                    className="inline-block px-4 py-2 rounded-xl bg-slate-800 text-white text-xs font-semibold hover:bg-slate-700 disabled:opacity-50 transition-colors"
                  >
                    {subBusy ? "…" : t("subscription.refund_auto_button")}
                  </button>
                  <a
                    href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(t("subscription.refund_mail_subject"))}&body=${encodeURIComponent(t("subscription.refund_mail_body", { email: session?.user?.email ?? "" }))}`}
                    className="inline-block px-4 py-2 rounded-xl border border-slate-300 text-slate-600 text-xs font-semibold hover:bg-slate-50 transition-colors"
                  >
                    {t("subscription.refund_request_button")}
                  </a>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 중도해지 환불 완료 안내 */}
        {refundDone !== null && (
          <p className="mt-6 px-4 py-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm">
            {t("subscription.refund_done", { amount: refundDone.toLocaleString() })}
          </p>
        )}

        {/* 중도해지 환불 확인 모달 (A-34) — 제11조 산식 분해 표시 */}
        {showRefundModal && refundQuote && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-6">
            <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-xl">
              <h3 className="text-xl font-bold text-slate-900 mb-3">
                {t("subscription.refund_modal_title")}
              </h3>
              <div className="text-sm text-slate-700 mb-3">
                <div className="flex justify-between py-1.5 border-b border-slate-100">
                  <span className="text-slate-500">{t("subscription.refund_used_label")}</span>
                  <span>{t("subscription.refund_used_value", { count: refundQuote.usedProofs, deduction: refundQuote.usageDeduction.toLocaleString() })}</span>
                </div>
                {refundQuote.basis === "after7d" && (
                  <>
                    <div className="flex justify-between py-1.5 border-b border-slate-100">
                      <span className="text-slate-500">{t("subscription.refund_prorated_label")}</span>
                      <span>₩{refundQuote.proratedElapsed.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between py-1.5 border-b border-slate-100">
                      <span className="text-slate-500">{t("subscription.refund_penalty_label")}</span>
                      <span>₩{refundQuote.penalty.toLocaleString()}</span>
                    </div>
                  </>
                )}
                <div className="flex justify-between py-2 font-bold">
                  <span>{t("subscription.refund_amount_label")}</span>
                  <span className="text-blue-700">₩{refundQuote.refundAmount.toLocaleString()}</span>
                </div>
              </div>
              {refundQuote.refundable ? (
                <p className="text-xs text-slate-500 mb-5">{t("subscription.refund_modal_desc")}</p>
              ) : (
                <p className="text-xs text-red-600 mb-5">{t("subscription.refund_not_available")}</p>
              )}
              <div className="flex gap-3 justify-end">
                <button
                  onClick={() => setShowRefundModal(false)}
                  disabled={subBusy}
                  className="px-4 py-2 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition-colors"
                >
                  {t("subscription.cancel_modal_keep")}
                </button>
                {refundQuote.refundable && (
                  <button
                    onClick={handleRefundConfirm}
                    disabled={subBusy}
                    className="px-4 py-2 rounded-xl border border-red-300 text-red-600 text-sm font-semibold hover:bg-red-50 disabled:opacity-50 transition-colors"
                  >
                    {subBusy ? "…" : t("subscription.refund_confirm_button")}
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* 구독 해지 확인 모달 */}
        {showCancelModal && subscription && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-6">
            <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-xl">
              <h3 className="text-xl font-bold text-slate-900 mb-3">
                {t("subscription.cancel_modal_title")}
              </h3>
              <p className="text-sm text-slate-600 mb-2">
                {t("subscription.cancel_modal_desc", {
                  date: new Date(subscription.currentPeriodEnd).toLocaleDateString(),
                })}
              </p>
              <p className="text-xs text-slate-500 mb-5">
                {t("subscription.cancel_modal_refund_hint")}
              </p>
              <div className="flex gap-3 justify-end">
                <button
                  onClick={() => setShowCancelModal(false)}
                  disabled={subBusy}
                  className="px-4 py-2 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition-colors"
                >
                  {t("subscription.cancel_modal_keep")}
                </button>
                <button
                  onClick={() => handleSubscriptionAction("cancel")}
                  disabled={subBusy}
                  className="px-4 py-2 rounded-xl border border-slate-300 text-slate-600 text-sm font-semibold hover:bg-slate-50 disabled:opacity-50 transition-colors"
                >
                  {subBusy ? "…" : t("subscription.cancel_modal_confirm")}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 인증 히스토리 섹션 */}
        <div className="mt-12 pt-8 border-t border-slate-100">
          <div className="flex items-center gap-3 mb-6">
            <History size={20} className="text-blue-600" />
            <h2 className="text-lg font-bold">{t("proof_history.title")}</h2>
            <span className="text-xs text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">{proofs.length}</span>
          </div>

          {loadingProofs ? (
            <div className="flex items-center justify-center py-12">
              <RefreshCw className="animate-spin text-blue-500" size={24} />
            </div>
          ) : proofs.length === 0 ? (
            <div className="text-center py-12">
              <ImageIcon size={48} className="text-slate-700 mx-auto mb-4" />
              <p className="text-slate-500 text-sm">{t("proof_history.empty")}</p>
              <Link href="/" className="text-blue-600 text-sm mt-2 inline-block hover:text-blue-700 transition-colors">
                {t("proof_history.go_certify")}
              </Link>
            </div>
          ) : (
            <>
            <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 gap-3">
              {proofs.map((proof) => {
                const expired = isExpired(proof.createdAt);
                return (
                  <button
                    key={proof.id}
                    type="button"
                    onClick={() => setPreviewProof(proof)}
                    className={`group relative bg-slate-50 border rounded-xl overflow-hidden transition-all hover:border-blue-200 text-left ${
                      expired ? "border-slate-100 opacity-60" : "border-slate-200"
                    }`}
                  >
                    {/* 썸네일 (없으면 경량본 폴백 → 그것도 없으면 아이콘) */}
                    <div className="aspect-square bg-white flex items-center justify-center overflow-hidden relative">
                      <ImageIcon size={24} className="text-slate-700" />
                      {(proof.thumbnail ?? proofPreviewUrl(proof.linkId)) && (
                        <img
                          src={proof.thumbnail ?? proofPreviewUrl(proof.linkId)!}
                          alt="Proof thumbnail"
                          loading="lazy"
                          onError={(e) => {
                            e.currentTarget.style.display = "none";
                          }}
                          className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        />
                      )}
                      {expired && (
                        <div className="absolute top-1 right-1 bg-red-500/80 text-slate-900 text-[9px] font-bold px-1.5 py-0.5 rounded-full">
                          {t("proof_history.expired")}
                        </div>
                      )}
                      {proof.pdfIssued ? (
                        <div className="absolute top-1 left-1 bg-blue-600/90 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full flex items-center gap-0.5" title={t("proof_history.pdf_issued") as string}>
                          <FileText size={9} /> PDF
                        </div>
                      ) : isPdfPending(proof) ? (
                        // 패스 자동 발급 진행 중 — 완료되면 폴링이 PDF 태그로 전환
                        <div className="absolute top-1 left-1 bg-slate-500/90 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full flex items-center gap-0.5" title={t("proof_history.pdf_pending") as string}>
                          <RefreshCw size={9} className="animate-spin" /> PDF
                        </div>
                      ) : null}
                      {proof.passId && (
                        <div className="absolute bottom-1 left-1 bg-emerald-600/90 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full flex items-center gap-0.5">
                          <Ticket size={9} /> {t("proof_history.pass_tag")}
                        </div>
                      )}
                    </div>

                    {/* 메타 정보 — 인증 시각 + 공개링크 ID 전체(www.ori.pics/ 뒷부분) (2026-08-21 피드백) */}
                    <div className="p-2">
                      <p className="text-[10px] text-slate-600 truncate">
                        {formatProofTimestamp(proof.timestamp)}
                      </p>
                      <p className="text-[9px] tracking-tight text-slate-600 truncate font-mono" title={proof.linkId}>
                        {proof.linkId}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
            {proofCursor && (
              <button
                type="button"
                onClick={loadMoreProofs}
                disabled={loadingMoreProofs}
                className="mt-4 w-full text-xs font-semibold text-blue-600 hover:text-blue-700 py-2.5 border border-slate-200 rounded-xl hover:border-blue-200 transition-all disabled:opacity-50"
              >
                {loadingMoreProofs ? "…" : t("load_more")}
              </button>
            )}
            </>
          )}
        </div>

        {/* 회원 탈퇴 섹션 */}
        <div className="mt-12 mb-8 pt-8 border-t border-slate-100">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <h3 className="text-sm font-bold text-red-600">{t("delete_account.title")}</h3>
              <p className="text-xs text-slate-500 mt-1">{t("delete_account.description")}</p>
            </div>
            <button
              type="button"
              onClick={() => setShowDeleteModal(true)}
              className="px-5 py-2.5 border border-red-200 text-red-600 text-sm font-medium rounded-xl hover:bg-red-500/10 transition-all flex items-center gap-2 whitespace-nowrap"
            >
              <Trash2 size={16} />
              {t("delete_account.button")}
            </button>
          </div>
        </div>
      </div>

      {/* 회원 탈퇴 확인 모달 */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-6 animate-in fade-in duration-200">
          {/* 배경 #1e293b(다크)에 라이트용 텍스트 색이 얹혀 안 보이던 문제 — 흰 배경으로 (2026-08-26 대표 피드백) */}
          <div className="bg-white rounded-3xl max-w-md w-full p-8 border border-slate-200 shadow-2xl animate-in zoom-in-95 duration-300">
            <div className="text-center mb-6">
              <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <Trash2 size={28} className="text-red-600" />
              </div>
              <h3 className="text-xl font-bold text-slate-900">{t("delete_account.modal_title")}</h3>
              <p className="text-sm text-slate-600 mt-3 leading-relaxed">{t("delete_account.modal_description")}</p>
            </div>

            <div className="mb-6">
              <label className="text-xs text-slate-500 mb-2 block">
                {t("delete_account.confirm_label")}
              </label>
              <input
                type="text"
                className="w-full bg-slate-100 border border-slate-200 rounded-xl py-3 px-4 text-sm focus:border-red-500/50 outline-none transition-all"
                placeholder={t("delete_account.confirm_placeholder")}
                value={deleteConfirmText}
                onChange={(e) => setDeleteConfirmText(e.target.value)}
              />
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => { setShowDeleteModal(false); setDeleteConfirmText(""); }}
                className="flex-1 py-3 border border-slate-200 text-slate-600 font-medium rounded-xl hover:bg-slate-50 transition-all"
              >
                {t("delete_account.cancel")}
              </button>
              <button
                type="button"
                disabled={deleteConfirmText !== t("delete_account.confirm_word") || deleting}
                onClick={handleDeleteAccount}
                className="flex-1 py-3 bg-red-600 hover:bg-red-500 text-white font-bold rounded-xl transition-all disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {deleting ? <RefreshCw className="animate-spin" size={18} /> : <Trash2 size={18} />}
                {t("delete_account.confirm_button")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 인증 이미지 미리보기 모달 */}
      {previewProof && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4 cursor-zoom-out"
          onClick={() => setPreviewProof(null)}
        >
          <button
            onClick={(e) => { e.stopPropagation(); setPreviewProof(null); }}
            className="absolute top-4 right-4 w-11 h-11 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center text-white transition-colors"
            aria-label="Close"
          >
            <X size={24} />
          </button>
          {(() => {
            const url = proofImageUrl(previewProof.linkId);
            return url ? (
              <img
                src={url}
                alt="Proof original"
                onClick={(e) => e.stopPropagation()}
                className="max-w-full max-h-[85vh] object-contain cursor-default rounded-xl"
              />
            ) : null;
          })()}
          <div
            className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center flex-wrap gap-2 max-w-[95vw] justify-center"
            onClick={(e) => e.stopPropagation()}
          >
            {!isExpired(previewProof.createdAt) && (
              <>
                {/* 링크 복사 — 뷰어 이동 없이 바로 공유 (2026-08-24 피드백) */}
                <button
                  onClick={async () => {
                    await navigator.clipboard.writeText(`${window.location.origin}/${previewProof.linkId}`);
                    setLinkCopied(true);
                    setTimeout(() => setLinkCopied(false), 2000);
                  }}
                  className="flex items-center gap-1.5 px-4 py-2 bg-white/90 hover:bg-white text-slate-800 font-medium rounded-full transition-colors text-sm shadow-lg"
                >
                  {linkCopied ? <Check size={14} className="text-green-600" /> : <Copy size={14} />}
                  {linkCopied ? t("proof_history.copied") : t("proof_history.copy_link")}
                </button>
                <Link
                  href={`/${previewProof.linkId}`}
                  className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white font-medium rounded-full transition-colors text-sm shadow-lg"
                >
                  <ExternalLink size={14} />
                  {t("proof_history.view_link")}
                </Link>
              </>
            )}

            {(() => {
              // 폴링이 갱신하는 최신 상태 사용 — 모달이 열린 채로 자동 발급이 완료되면
              // 버튼이 [다운로드]로 자연 전환 (previewProof는 열림 시점 스냅샷)
              const lp = proofs.find((p) => p.linkId === previewProof.linkId) ?? previewProof;
              if (lp.pdfIssued) {
                return (
                  <>
                    <button
                      type="button"
                      onClick={() => handlePdfAction(lp, "issue_or_download")}
                      disabled={pdfBusy}
                      className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-medium rounded-full transition-colors text-sm shadow-lg disabled:opacity-60"
                    >
                      {pdfBusy ? <RefreshCw size={14} className="animate-spin" /> : <Download size={14} />}
                      {t("proof_history.pdf_download")}
                    </button>
                    <button
                      type="button"
                      onClick={() => handlePdfAction(lp, "reissue")}
                      disabled={pdfBusy}
                      className="flex items-center gap-1.5 px-4 py-2 bg-white/10 hover:bg-white/20 text-white font-medium rounded-full transition-colors text-sm shadow-lg disabled:opacity-60"
                      title={lp.passId ? (t("proof_history.pdf_reissue_free") as string) : (t("proof_history.pdf_reissue_tooltip", { cost: CREDIT_COSTS.CERTIFICATE_PDF }) as string)}
                    >
                      <RotateCw size={14} />
                      {/* 패스 발행분은 재발급도 무료 (서버 isPassLink 분기) — "-10건" 표기는 오해 */}
                      {lp.passId ? t("proof_history.pdf_reissue_free") : t("proof_history.pdf_reissue", { cost: CREDIT_COSTS.CERTIFICATE_PDF })}
                    </button>
                  </>
                );
              }
              if (isPdfPending(lp)) {
                // 자동 발급 진행 중 — 중복 발급 요청 대신 대기 (폴링이 완료 시 다운로드로 전환)
                return (
                  <button
                    type="button"
                    disabled
                    className="flex items-center gap-1.5 px-4 py-2 bg-slate-500/80 text-white font-medium rounded-full text-sm shadow-lg cursor-wait"
                  >
                    <RefreshCw size={14} className="animate-spin" />
                    {t("proof_history.pdf_preparing")}
                  </button>
                );
              }
              return (
                <button
                  type="button"
                  onClick={() => handlePdfAction(lp, "issue_or_download")}
                  disabled={pdfBusy}
                  className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-medium rounded-full transition-colors text-sm shadow-lg disabled:opacity-60"
                >
                  {pdfBusy ? <RefreshCw size={14} className="animate-spin" /> : <FileText size={14} />}
                  {lp.passId ? t("proof_history.pdf_issue_free") : t("proof_history.pdf_issue", { cost: CREDIT_COSTS.CERTIFICATE_PDF })}
                </button>
              );
            })()}

            <button
              type="button"
              onClick={() => setDeleteTarget(previewProof)}
              className="flex items-center gap-1.5 px-4 py-2 bg-red-600/90 hover:bg-red-600 text-white font-medium rounded-full transition-colors text-sm shadow-lg"
            >
              <Trash2 size={14} />
              {t("proof_history.delete_proof")}
            </button>
          </div>

          {pdfError && (
            <div className="absolute bottom-20 left-1/2 -translate-x-1/2 px-4 py-2 bg-red-600/90 text-white text-xs rounded-lg max-w-[80vw]" onClick={(e) => e.stopPropagation()}>
              {/* Pro 전용 거부는 원시 코드 대신 친화 문구 + 구독 전환 버튼 (2026-08-24 피드백) */}
              {pdfError === "tier_required" ? (
                <span className="flex items-center gap-2">
                  {t("proof_history.pdf_tier_required")}
                  <Link
                    href="/billing/checkout?plan=pro_monthly"
                    className="shrink-0 px-2.5 py-1 bg-white text-red-700 font-semibold rounded-full hover:bg-red-50 transition-colors"
                  >
                    {t("proof_history.upgrade_cta")}
                  </Link>
                </span>
              ) : (
                t("proof_history.pdf_error", { error: pdfError.slice(0, 80) })
              )}
            </div>
          )}
        </div>
      )}

      {/* 인증 삭제 확인 모달 */}
      {deleteTarget && (
        <div className="fixed inset-0 z-[60] bg-black/70 flex items-center justify-center p-6 animate-in fade-in duration-200" onClick={() => !deletingProof && setDeleteTarget(null)}>
          <div className="bg-white rounded-3xl max-w-md w-full p-8 border border-slate-200 shadow-2xl animate-in zoom-in-95 duration-300" onClick={(e) => e.stopPropagation()}>
            <div className="text-center mb-6">
              <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <Trash2 size={28} className="text-red-600" />
              </div>
              <h3 className="text-xl font-bold text-slate-900">{t("proof_history.delete_modal_title")}</h3>
              <p className="text-sm text-slate-600 mt-3 leading-relaxed">
                {t("proof_history.delete_modal_description")}
              </p>
              <p className="text-xs font-mono text-slate-500 mt-2 break-all">{deleteTarget.linkId}</p>
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                disabled={deletingProof}
                className="flex-1 py-3 border border-slate-300 text-slate-700 font-medium rounded-xl hover:bg-slate-50 transition-all disabled:opacity-50"
              >
                {t("proof_history.delete_modal_cancel")}
              </button>
              <button
                type="button"
                onClick={handleProofDelete}
                disabled={deletingProof}
                className="flex-1 py-3 bg-red-600 hover:bg-red-500 text-white font-bold rounded-xl transition-all disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {deletingProof ? <RefreshCw className="animate-spin" size={18} /> : <Trash2 size={18} />}
                {t("proof_history.delete_modal_confirm")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
