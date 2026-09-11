"use client";

// 소셜 가입 직후 환영 모달 (A-82 §4.3) — 가입 폼이 없는 경로(Google·Apple·Kakao·Naver)에
// "파트너코드가 있으신가요?"를 1회 묻는다. 7일 내 입력 가능 · 프로필에서도 가능.
// 표시 조건: 로그인됨 · 아직 참여 안 함(canJoin) · 이 브라우저에서 닫은 기록 없음.
// A-92: 로케일 레이아웃에 마운트(홈 외 경로에서도 1회 노출) — 가입/로그인/프로필/결제/어드민 등은 제외.
//   배경 클릭·X·Esc = 이 세션에서만 닫기(sessionStorage) · [없어요] = 영구 닫기(localStorage).
import { useEffect, useId, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { usePathname } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Gift, X } from "lucide-react";
import { partnerErrorKey } from "@/components/PartnerCard";

const DISMISS_KEY = "oripics.partner.welcome.dismissed";
const SESSION_DISMISS_KEY = "oripics.partner.welcome.session_dismissed";
/** 모달을 띄우지 않는 경로(로케일 접두 제거 후 첫 세그먼트) — 가입·인증 흐름, 파트너 카드가 이미 있는 프로필, 결제·어드민 */
const EXCLUDED_FIRST_SEGMENTS = new Set(["signup", "login", "profile", "billing", "admin", "partner", "forgot-password", "reset-password", "invite"]);

function isExcludedPath(pathname: string | null): boolean {
  if (!pathname) return false;
  const segs = pathname.split("/").filter(Boolean);
  const first = segs[0] && /^[a-z]{2}(-[A-Z]{2})?$/.test(segs[0]) ? segs[1] : segs[0];
  return !!first && EXCLUDED_FIRST_SEGMENTS.has(first);
}

export default function PartnerWelcomePrompt() {
  const t = useTranslations("Partner");
  const locale = useLocale();
  const pathname = usePathname();
  const { status } = useSession();
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [name, setName] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [myCode, setMyCode] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const titleId = useId();
  const bodyId = useId();
  const inputId = useId();
  const excluded = isExcludedPath(pathname);

  useEffect(() => {
    if (status !== "authenticated" || excluded) return;
    if (typeof window === "undefined") return;
    try {
      if (window.localStorage.getItem(DISMISS_KEY)) return;
      if (window.sessionStorage.getItem(SESSION_DISMISS_KEY)) return;
    } catch {
      return;
    }
    // ?ref= 로 들어온 소셜 가입은 코드 미리 채움
    let ref: string | null = null;
    try {
      ref = new URLSearchParams(window.location.search).get("ref") ?? window.sessionStorage.getItem("oripics.partner.ref");
    } catch {
      /* ignore */
    }
    let cancelled = false;
    fetch("/api/partner/me", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled || !d) return;
        // 이미 참여했거나 입력 불가면 표시하지 않음 (다시 묻지 않도록 기록)
        if (!d.canJoin) {
          try { window.localStorage.setItem(DISMISS_KEY, "1"); } catch { /* ignore */ }
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
  }, [status, excluded]);

  /** 이 세션에서만 닫기 — 7일 입력 창구는 유지, 다음 방문 때 다시 묻는다 */
  const dismissSession = () => {
    try { window.sessionStorage.setItem(SESSION_DISMISS_KEY, "1"); } catch { /* ignore */ }
    setOpen(false);
  };
  /** 영구 닫기 — [없어요] 명시 선택 시 또는 참여 완료 후 */
  const dismissForever = () => {
    try { window.localStorage.setItem(DISMISS_KEY, "1"); } catch { /* ignore */ }
    setOpen(false);
  };

  // 열릴 때 입력창에 포커스 · Esc = 세션 닫기
  useEffect(() => {
    if (!open) return;
    const id = window.setTimeout(() => inputRef.current?.focus(), 30);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        dismissSession();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(id);
      window.removeEventListener("keydown", onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open || excluded) return null;
  const lookup = async () => {
    const c = code.replace(/[^0-9]/g, "");
    if (c.length < 3) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/partner/lookup?code=${c}`);
      const d = await res.json().catch(() => ({}));
      if (!res.ok || !d.ok) {
        setError(t(`errors.${partnerErrorKey(res.status, d, "code_not_found")}`));
        return;
      }
      setName(d.ownerNameMasked);
    } catch {
      setError(t("errors.unavailable"));
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
        setError(t(`errors.${partnerErrorKey(res.status, d, "unavailable")}`));
        return;
      }
      setDone(d.referrerNameMasked ?? name ?? "");
      if (d.myCode) setMyCode(d.myCode);
      try { window.localStorage.setItem(DISMISS_KEY, "1"); } catch { /* ignore */ }
    } catch {
      setError(t("errors.unavailable"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-6" onClick={dismissSession}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={bodyId}
        className="w-full max-w-sm bg-white rounded-2xl shadow-2xl p-6 animate-in fade-in zoom-in duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3 mb-3">
          <Gift className="text-blue-600 shrink-0 mt-0.5" size={22} aria-hidden="true" />
          <div className="flex-1">
            <h3 id={titleId} className="text-base font-bold text-slate-900">{done !== null ? t("welcome_done_title") : t("welcome_title")}</h3>
            <p id={bodyId} className="text-xs text-slate-500 mt-1">
              {done !== null ? t("welcome_done_body", { name: done, code: myCode ?? "" }) : t("welcome_body")}
              {/* (2026-09-11 A-94 ④) 참여 완료 시 첫 인증 안내 */}
              {done !== null && <span className="block mt-1 text-emerald-700">{t("first_proof_nudge")}</span>}
            </p>
          </div>
          <button type="button" onClick={dismissSession} className="text-slate-400 hover:text-slate-700" aria-label={t("welcome_close")}>
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        {done === null ? (
          <>
            <label htmlFor={inputId} className="sr-only">{t("code_placeholder")}</label>
            <div className="flex gap-2">
              <input
                id={inputId}
                ref={inputRef}
                inputMode="numeric"
                autoComplete="off"
                value={code}
                onChange={(e) => {
                  setCode(e.target.value.replace(/[^0-9]/g, "").slice(0, 8));
                  setName(null);
                  setError(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !busy && code.length >= 3) {
                    e.preventDefault();
                    if (name) join();
                    else lookup();
                  }
                }}
                placeholder={t("code_placeholder")}
                aria-invalid={error ? true : undefined}
                className="flex-1 min-w-0 px-4 py-2.5 rounded-xl border border-slate-200 text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-blue-500/40"
              />
              {name ? (
                <button type="button" onClick={join} disabled={busy} aria-busy={busy} className="shrink-0 whitespace-nowrap px-4 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-bold disabled:bg-slate-300">
                  {busy ? "…" : t("join_button")}
                </button>
              ) : (
                <button type="button" onClick={lookup} disabled={busy || code.length < 3} aria-busy={busy} className="shrink-0 whitespace-nowrap px-4 py-2.5 rounded-xl border border-blue-300 text-blue-700 text-sm font-bold disabled:opacity-40">
                  {busy ? "…" : t("check_button")}
                </button>
              )}
            </div>
            {name && <p className="mt-2 text-xs text-emerald-700" role="status">{t("lookup_ok", { name })}</p>}
            {error && <p className="mt-2 text-xs text-red-600" role="alert">{error}</p>}
            <div className="mt-4 flex items-center justify-between">
              <button type="button" onClick={dismissForever} className="text-xs text-slate-500 hover:text-slate-800">
                {t("welcome_skip")}
              </button>
              <a href={`/${locale}/profile#partner`} onClick={dismissSession} className="text-xs text-blue-600 hover:underline">
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
