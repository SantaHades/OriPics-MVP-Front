"use client";

// 소셜 가입 직후 환영 모달 (A-82 §4.3) — 가입 폼이 없는 경로(Google·Apple·Kakao·Naver)에
// "파트너코드가 있으신가요?"를 1회 묻는다. 7일 내 입력 가능 · 프로필에서도 가능.
// 표시 조건: 로그인됨 · 아직 참여 안 함(canJoin) · 이 브라우저에서 닫은 기록 없음.
import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useLocale, useTranslations } from "next-intl";
import { Gift, X } from "lucide-react";

const DISMISS_KEY = "oripics.partner.welcome.dismissed";

export default function PartnerWelcomePrompt() {
  const t = useTranslations("Partner");
  const locale = useLocale();
  const { status } = useSession();
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [name, setName] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [myCode, setMyCode] = useState<string | null>(null);

  useEffect(() => {
    if (status !== "authenticated") return;
    if (typeof window === "undefined") return;
    if (window.localStorage.getItem(DISMISS_KEY)) return;
    // ?ref= 로 들어온 소셜 가입은 코드 미리 채움
    const ref = new URLSearchParams(window.location.search).get("ref") ?? window.sessionStorage.getItem("oripics.partner.ref");
    let cancelled = false;
    fetch("/api/partner/me", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled || !d) return;
        // 이미 참여했거나 입력 불가면 표시하지 않음 (다시 묻지 않도록 기록)
        if (!d.canJoin) {
          window.localStorage.setItem(DISMISS_KEY, "1");
          return;
        }
        setMyCode(d.code ?? null);
        if (ref) setCode(ref.replace(/[^0-9]/g, "").slice(0, 8));
        setOpen(true);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [status]);

  if (!open) return null;

  const dismiss = () => {
    window.localStorage.setItem(DISMISS_KEY, "1");
    setOpen(false);
  };
  const lookup = async () => {
    const c = code.replace(/[^0-9]/g, "");
    if (c.length < 3) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/partner/lookup?code=${c}`);
      const d = await res.json().catch(() => ({}));
      if (!res.ok || !d.ok) {
        setError(t(`errors.${d?.error ?? "code_not_found"}`));
        return;
      }
      setName(d.ownerNameMasked);
    } finally {
      setBusy(false);
    }
  };
  const join = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/partner/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: code.replace(/[^0-9]/g, "") }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(t(`errors.${d?.detail ?? "unavailable"}`));
        return;
      }
      setDone(d.referrerNameMasked ?? name ?? "");
      if (d.myCode) setMyCode(d.myCode);
      window.localStorage.setItem(DISMISS_KEY, "1");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-6" onClick={dismiss}>
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl p-6 animate-in fade-in zoom-in duration-200" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start gap-3 mb-3">
          <Gift className="text-blue-600 shrink-0 mt-0.5" size={22} />
          <div className="flex-1">
            <h3 className="text-base font-bold text-slate-900">{done !== null ? t("welcome_done_title") : t("welcome_title")}</h3>
            <p className="text-xs text-slate-500 mt-1">
              {done !== null ? t("welcome_done_body", { name: done, code: myCode ?? "" }) : t("welcome_body")}
            </p>
          </div>
          <button onClick={dismiss} className="text-slate-400 hover:text-slate-700" aria-label="close">
            <X size={18} />
          </button>
        </div>
        {done === null ? (
          <>
            <div className="flex gap-2">
              <input
                inputMode="numeric"
                value={code}
                onChange={(e) => {
                  setCode(e.target.value.replace(/[^0-9]/g, "").slice(0, 8));
                  setName(null);
                  setError(null);
                }}
                placeholder={t("code_placeholder")}
                className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 text-sm tracking-widest tabular-nums focus:outline-none focus:ring-2 focus:ring-blue-500/40"
              />
              {name ? (
                <button onClick={join} disabled={busy} className="px-4 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-bold disabled:bg-slate-300">
                  {busy ? "…" : t("join_button")}
                </button>
              ) : (
                <button onClick={lookup} disabled={busy || code.length < 3} className="px-4 py-2.5 rounded-xl border border-blue-300 text-blue-700 text-sm font-bold disabled:opacity-40">
                  {busy ? "…" : t("check_button")}
                </button>
              )}
            </div>
            {name && <p className="mt-2 text-xs text-emerald-700">{t("lookup_ok", { name })}</p>}
            {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
            <div className="mt-4 flex items-center justify-between">
              <button onClick={dismiss} className="text-xs text-slate-500 hover:text-slate-800">
                {t("welcome_skip")}
              </button>
              <a href={`/${locale}/profile#partner`} className="text-xs text-blue-600 hover:underline">
                {t("welcome_later")}
              </a>
            </div>
          </>
        ) : (
          <a href={`/${locale}/profile#partner`} className="mt-2 block w-full py-2.5 text-center rounded-xl bg-slate-900 text-white text-sm font-bold">
            {t("welcome_go_profile")}
          </a>
        )}
      </div>
    </div>
  );
}
