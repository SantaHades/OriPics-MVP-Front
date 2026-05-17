"use client";

import React, { useState, useRef, useEffect } from "react";
import { useSession, signOut } from "next-auth/react";
import { useRouter } from "@/navigation";
import { User, Mail, Lock, Camera, Save, ArrowLeft, RefreshCw, CheckCircle, Trash2, History, ExternalLink, ImageIcon, X, Wallet, FileText, Download, RotateCw } from "lucide-react";
import { Link } from "@/navigation";
import { supabase } from "@/lib/supabase";
import { useTranslations } from "next-intl";
import { useCredits } from "@/lib/credits/useCredits";
import { CREDIT_COSTS } from "@/lib/payment";

interface ProofRecord {
  id: string;
  linkId: string;
  thumbnail: string | null;
  width: number;
  height: number;
  timestamp: string;
  createdAt: string;
  /** 증명서 PDF 발급 여부 */
  pdfIssued?: boolean;
  /** PDF 발급 시점 ISO (재발급 시점 표시용) */
  pdfIssuedAt?: string | null;
}

export default function ProfilePage() {
  const { data: session, update } = useSession();
  const router = useRouter();
  const t = useTranslations("Profile");
  const tc = useTranslations("Common");
  const tCredits = useTranslations("Home.credits");
  const { data: credits } = useCredits();

  const [name, setName] = useState(session?.user?.name || "");
  const [password, setPassword] = useState("");
  const [image, setImage] = useState(session?.user?.image || "");
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState({ type: "", text: "" });
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [proofs, setProofs] = useState<ProofRecord[]>([]);
  const [loadingProofs, setLoadingProofs] = useState(true);
  const [previewProof, setPreviewProof] = useState<ProofRecord | null>(null);
  // B-2 (2026-05-17): PDF 발급/재발급/다운로드, 인증 삭제 상태
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ProofRecord | null>(null);
  const [deletingProof, setDeletingProof] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // 증명 히스토리 불러오기
  useEffect(() => {
    const fetchProofs = async () => {
      try {
        const res = await fetch("/api/proof/history");
        if (res.ok) {
          const data = await res.json();
          setProofs(data.proofs || []);
        }
      } catch (err) {
        console.error("Failed to fetch proof history:", err);
      } finally {
        setLoadingProofs(false);
      }
    };
    fetchProofs();
  }, []);

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

  // 타임스탬프 포맷팅
  const formatProofTimestamp = (ts: string) => {
    if (ts.length !== 15) return ts;
    const year = parseInt("20" + ts.substring(0, 2), 10);
    const month = parseInt(ts.substring(2, 4), 10) - 1;
    const day = parseInt(ts.substring(4, 6), 10);
    const hour = parseInt(ts.substring(6, 8), 10);
    const min = parseInt(ts.substring(8, 10), 10);
    return `${year}.${(month+1).toString().padStart(2,'0')}.${day.toString().padStart(2,'0')} ${hour.toString().padStart(2,'0')}:${min.toString().padStart(2,'0')}`;
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
      const fileExt = file.name.split(".").pop();
      const fileName = `${(session?.user as any)?.id}-${Math.random()}.${fileExt}`;
      const filePath = `${fileName}`;
      const bucketName = "avatars";

      const { data: uploadData, error: uploadError } = await supabase.storage
        .from(bucketName)
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: true
        });

      if (uploadError) {
        console.error("Supabase Upload Error:", uploadError);
        throw new Error(`${uploadError.message} (Bucket: ${bucketName})`);
      }

      const { data: { publicUrl } } = supabase.storage
        .from(bucketName)
        .getPublicUrl(filePath);

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
        body: JSON.stringify({ name, password, image }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to update profile");

      // 세션 업데이트 (헤더 등에 실시간 반영)
      await update({ name, image });
      
      setMessage({ type: "success", text: t("messages.save_success") });
      setPassword(""); // 비밀번호 필드 초기화
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

        {/* 크레딧 섹션 (J-4) */}
        <div id="credits" className="mt-12 pt-8 border-t border-slate-100 scroll-mt-24">
          <div className="flex items-center gap-3 mb-6">
            <Wallet size={20} className="text-blue-600" />
            <h2 className="text-lg font-bold">{tCredits("section_title")}</h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
            <div className="rounded-2xl border border-slate-200 bg-white/70 p-5">
              <p className="text-xs text-slate-500 mb-1">{tCredits("tier_label")}</p>
              <p className="text-2xl font-extrabold capitalize">
                {credits?.tier ?? "—"}
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white/70 p-5">
              <p className="text-xs text-slate-500 mb-1">{tCredits("balance_label")}</p>
              <p className="text-2xl font-extrabold">
                {credits ? `${credits.credits}` : "—"}
                <span className="text-sm font-normal text-slate-500 ml-1">
                  ({Math.floor((credits?.credits ?? 0) / CREDIT_COSTS.IMAGE_PROOF)}{tCredits("balance_suffix")})
                </span>
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white/70 p-5">
              <p className="text-xs text-slate-500 mb-1">{tCredits("renews_label")}</p>
              <p className="text-sm font-semibold text-slate-700">
                {credits?.creditsRenewAt
                  ? new Date(credits.creditsRenewAt).toLocaleDateString()
                  : "—"}
              </p>
            </div>
          </div>

          {credits && credits.recentTransactions.length > 0 && (
            <div className="rounded-2xl border border-slate-200 bg-white/40">
              <div className="px-5 py-3 border-b border-slate-100">
                <p className="text-xs font-semibold text-slate-600 uppercase tracking-wider">
                  {tCredits("history_title")}
                </p>
              </div>
              <ul className="divide-y divide-slate-100 max-h-80 overflow-y-auto">
                {credits.recentTransactions.map((tx) => {
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
            </div>
          )}
        </div>

        {/* 증명 히스토리 섹션 */}
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
                    {/* 썸네일 */}
                    <div className="aspect-square bg-white flex items-center justify-center overflow-hidden">
                      {proof.thumbnail ? (
                        <img
                          src={proof.thumbnail}
                          alt="Proof thumbnail"
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        />
                      ) : (
                        <ImageIcon size={24} className="text-slate-700" />
                      )}
                      {expired && (
                        <div className="absolute top-1 right-1 bg-red-500/80 text-slate-900 text-[9px] font-bold px-1.5 py-0.5 rounded-full">
                          {t("proof_history.expired")}
                        </div>
                      )}
                      {proof.pdfIssued && (
                        <div className="absolute top-1 left-1 bg-blue-600/90 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full flex items-center gap-0.5" title={t("proof_history.pdf_issued") as string}>
                          <FileText size={9} /> PDF
                        </div>
                      )}
                    </div>

                    {/* 메타 정보 (시간만) */}
                    <div className="p-2">
                      <p className="text-[10px] text-slate-600 truncate">
                        {formatProofTimestamp(proof.timestamp)}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
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
          <div className="bg-[#1e293b] rounded-3xl max-w-md w-full p-8 border border-slate-200 shadow-2xl animate-in zoom-in-95 duration-300">
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
                className="flex-1 py-3 border border-slate-200 text-slate-600 font-medium rounded-xl hover:bg-white/80 transition-all"
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

      {/* 증명 이미지 미리보기 모달 */}
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
              <Link
                href={`/${previewProof.linkId}`}
                className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white font-medium rounded-full transition-colors text-sm shadow-lg"
              >
                <ExternalLink size={14} />
                {t("proof_history.view_link")}
              </Link>
            )}

            {previewProof.pdfIssued ? (
              <>
                <button
                  type="button"
                  onClick={() => handlePdfAction(previewProof, "issue_or_download")}
                  disabled={pdfBusy}
                  className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-medium rounded-full transition-colors text-sm shadow-lg disabled:opacity-60"
                >
                  {pdfBusy ? <RefreshCw size={14} className="animate-spin" /> : <Download size={14} />}
                  {t("proof_history.pdf_download")}
                </button>
                <button
                  type="button"
                  onClick={() => handlePdfAction(previewProof, "reissue")}
                  disabled={pdfBusy}
                  className="flex items-center gap-1.5 px-4 py-2 bg-white/10 hover:bg-white/20 text-white font-medium rounded-full transition-colors text-sm shadow-lg disabled:opacity-60"
                  title={t("proof_history.pdf_reissue_tooltip", { cost: CREDIT_COSTS.CERTIFICATE_PDF }) as string}
                >
                  <RotateCw size={14} />
                  {t("proof_history.pdf_reissue", { cost: CREDIT_COSTS.CERTIFICATE_PDF })}
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => handlePdfAction(previewProof, "issue_or_download")}
                disabled={pdfBusy}
                className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-medium rounded-full transition-colors text-sm shadow-lg disabled:opacity-60"
              >
                {pdfBusy ? <RefreshCw size={14} className="animate-spin" /> : <FileText size={14} />}
                {t("proof_history.pdf_issue", { cost: CREDIT_COSTS.CERTIFICATE_PDF })}
              </button>
            )}

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
              {t("proof_history.pdf_error", { error: pdfError.slice(0, 80) })}
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
