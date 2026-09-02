"use client";

import React, { useState, useEffect } from "react";
import { Link, useRouter } from "@/navigation";
import { useSearchParams } from "next/navigation";
import { Mail, Lock, User, RefreshCw, ArrowRight, ShieldCheck, CheckCircle } from "lucide-react";
import { signIn } from "next-auth/react";
import { useTranslations } from "next-intl";

export default function SignupPage() {
  const [formData, setFormData] = useState({ name: "", email: "", password: "" });
  const [verificationCode, setVerificationCode] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [codeVerified, setCodeVerified] = useState(false);
  const [sendingCode, setSendingCode] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [agreed, setAgreed] = useState(false);
  // 동의 전 소셜 버튼 클릭 → 인라인 에러 대신 팝업 (작은 창에서 안 보임, 2026-08-26 대표 피드백).
  // 팝업의 [동의하고 계속하기]가 동의 체크 + 해당 provider 로그인까지 이어서 실행
  const [pendingProvider, setPendingProvider] = useState<"apple" | "google" | "kakao" | "naver" | null>(null);
  const [oauthBusy, setOauthBusy] = useState("");

  // 소셜 버튼 중복 클릭 방지 (2026-08-28) — signIn 리다이렉트까지의 공백에 재클릭되면
  // authorize가 이중 개시돼 state 쿠키가 덮이며 콜백 검증이 실패할 수 있음
  const socialSignIn = (provider: "apple" | "google" | "kakao" | "naver") => {
    if (oauthBusy || loading) return;
    if (!agreed) { setPendingProvider(provider); return; }
    setOauthBusy(provider);
    signIn(provider, { callbackUrl: "/" });
  };
  const router = useRouter();
  const searchParams = useSearchParams();
  // 앱에서 연 경우(?from=app) — 웹 자동 로그인·홈 이동 대신 "앱으로 돌아가 로그인" 완료
  // 화면을 표시 (forgot-password의 from=app 패턴, 2026-09-02. 앱 로그인 화면 링크 연동)
  const fromApp = searchParams?.get("from") === "app";
  const [appDone, setAppDone] = useState(false);

  const t = useTranslations("Signup");
  const tL = useTranslations("Login");

  // 재발송 쿨다운 타이머
  useEffect(() => {
    if (cooldown > 0) {
      const timer = setTimeout(() => setCooldown(cooldown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [cooldown]);

  // URL 에러 확인
  useEffect(() => {
    const errorParam = searchParams.get("error");
    if (errorParam) {
      setError(tL(`errors.${errorParam}`) || tL("errors.default"));
    }
  }, [searchParams, tL]);

  // 인증 코드 발송
  const handleSendCode = async () => {
    setError("");
    setSuccessMsg("");

    // 이메일 형식 검증
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    if (!emailRegex.test(formData.email)) {
      setError(t("errors.invalid_email"));
      return;
    }

    setSendingCode(true);

    try {
      const res = await fetch("/api/auth/send-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: formData.email }),
      });

      const data = await res.json();
      if (!res.ok) {
        const errorMsg = data.code ? t(`api_errors.${data.code}`) : data.message;
        throw new Error(errorMsg);
      }

      setCodeSent(true);
      setCooldown(60); // 60초 쿨다운
      setSuccessMsg(t("verification.code_sent"));
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSendingCode(false);
    }
  };

  // 회원가입 제출
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    if (!agreed) {
      setError(t("errors.must_agree"));
      setLoading(false);
      return;
    }

    // 이메일 형식 유효성 검사
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    if (!emailRegex.test(formData.email)) {
      setError(t("errors.invalid_email"));
      setLoading(false);
      return;
    }

    // 비밀번호 최소 길이 검사
    if (formData.password.length < 6) {
      setError(t("errors.short_password"));
      setLoading(false);
      return;
    }

    // 인증 코드 확인
    if (!verificationCode || verificationCode.length !== 6) {
      setError(t("verification.enter_code"));
      setLoading(false);
      return;
    }

    try {
      // 1. 회원가입 API 호출 (인증 코드 포함)
      const res = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...formData, verificationCode }),
      });

      const data = await res.json();
      if (!res.ok) {
        // API 에러 코드를 번역 키로 사용
        const errorMsg = data.code ? t(`api_errors.${data.code}`) : data.message;
        throw new Error(errorMsg);
      }

      // 앱 유입 가입은 웹 세션을 만들지 않고 완료 화면으로 — 앱 복귀 후 로그인 유도
      if (fromApp) {
        setAppDone(true);
        return;
      }

      // 2. 가입 성공 시 즉시 로그인 처리
      const loginRes = await signIn("credentials", {
        email: formData.email,
        password: formData.password,
        redirect: false,
      });

      if (loginRes?.error) {
        router.push("/login?error=auto-login-failed");
        return;
      }

      // 3. 로그인 성공 시 홈으로 이동
      router.push("/");
      router.refresh();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // 앱 유입 가입 완료 화면 — 폼 대신 앱 복귀 안내만 표시
  if (appDone) {
    return (
      <div className="min-h-screen bg-slate-50 text-slate-900 flex items-center justify-center p-6">
        <div className="w-full max-w-md text-center bg-white border border-slate-200 rounded-3xl p-10 shadow-sm animate-in fade-in duration-300">
          <CheckCircle size={56} className="text-emerald-500 mx-auto mb-5" />
          <h1 className="text-xl font-bold mb-2">{t("from_app_done_title")}</h1>
          <p className="text-sm text-slate-600 leading-relaxed">{t("from_app_done_body")}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex items-center justify-center p-6 bg-[radial-gradient(circle_at_top_right,_var(--tw-gradient-stops))] from-blue-50 via-white to-purple-50">
      <div className="w-full max-w-md animate-in fade-in zoom-in duration-500">
        <div className="text-center mb-10">
          <Link href="/" className="inline-flex items-center gap-3 font-bold text-3xl mb-4 group transition-all">
            <img src="/logo.png" alt="OriPics Logo" className="w-12 h-12 object-contain group-hover:scale-110 transition-transform" />
            <span className="text-slate-900">OriPics</span>
          </Link>
          <h1 className="text-2xl font-bold tracking-tight">{t("title")}</h1>
          <p className="text-slate-600 mt-2 text-sm">{t("subtitle")}</p>
        </div>

        <div className="auth-card">
          {/* 앱 유입 안내 — 가입 후 앱으로 돌아가 로그인해야 함을 사전 고지 */}
          {fromApp && (
            <div className="mb-6 px-4 py-3 rounded-xl bg-blue-50 border border-blue-100 text-blue-800 text-xs leading-relaxed">
              {t("from_app_notice")}
            </div>
          )}
          {/* 소셜 가입 버튼 */}
          {/* 소셜 가입 버튼 — 순서: Apple·Google·Kakao·Naver (2026-08-26 대표 지정) */}
          <div className="flex justify-center gap-6 mb-8 group">
            {/* Apple (2026-08-26, A-50 웹 트랙) */}
            <button
              onClick={() => socialSignIn("apple")}
              disabled={!!oauthBusy || loading}
              className="w-14 h-14 bg-black rounded-full flex items-center justify-center shadow-lg hover:scale-110 active:scale-[0.98] transition-all duration-300 group-hover:opacity-70 hover:!opacity-100 disabled:opacity-40 disabled:pointer-events-none"
              title={t("apple")}
            >
              {oauthBusy === "apple" ? <RefreshCw className="w-6 h-6 text-white animate-spin" /> : <svg viewBox="0 0 24 24" className="w-6 h-6 fill-white">
                <path d="M17.05 20.28c-.98.95-2.05.86-3.08.38-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.38C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.53 4.08zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
              </svg>}
            </button>
            <button
              onClick={() => socialSignIn("google")}
              disabled={!!oauthBusy || loading}
              className="w-14 h-14 bg-white rounded-full flex items-center justify-center shadow-lg hover:scale-110 active:scale-[0.98] transition-all duration-300 group-hover:opacity-70 hover:!opacity-100 disabled:opacity-40 disabled:pointer-events-none"
              title={t("google")}
            >
              {oauthBusy === "google" ? <RefreshCw className="w-6 h-6 text-slate-600 animate-spin" /> : <img src="https://www.google.com/favicon.ico" alt="Google" className="w-6 h-6" />}
            </button>
            <button
              onClick={() => socialSignIn("kakao")}
              disabled={!!oauthBusy || loading}
              className="w-14 h-14 bg-[#FEE500] rounded-full flex items-center justify-center shadow-lg hover:scale-110 active:scale-[0.98] transition-all duration-300 group-hover:opacity-70 hover:!opacity-100 disabled:opacity-40 disabled:pointer-events-none"
              title={t("kakao")}
            >
              {oauthBusy === "kakao" ? <RefreshCw className="w-6 h-6 text-[#3C1E1E] animate-spin" /> : <svg viewBox="0 0 24 24" className="w-7 h-7 text-[#3C1E1E] fill-current">
                <path d="M12 3c-4.97 0-9 3.165-9 7.07 0 2.507 1.64 4.708 4.12 6.002-.164.553-.59 1.996-.675 2.304-.105.385.125.38.263.288.11-.073 1.74-1.18 2.42-1.64.28.04.566.06.853.06 4.97 0 9-3.166 9-7.07 0-3.905-4.03-7.07-9-7.07z" />
              </svg>}
            </button>
            <button
              onClick={() => socialSignIn("naver")}
              disabled={!!oauthBusy || loading}
              className="w-14 h-14 bg-[#03C75A] rounded-full flex items-center justify-center shadow-lg hover:scale-110 active:scale-[0.98] transition-all duration-300 group-hover:opacity-70 hover:!opacity-100 disabled:opacity-40 disabled:pointer-events-none"
              title={t("naver")}
            >
              {oauthBusy === "naver" ? <RefreshCw className="w-6 h-6 text-white animate-spin" /> : <span className="text-slate-900 font-extrabold text-xl">N</span>}
            </button>
          </div>

          <div className="relative mb-8">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-slate-200"></div>
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="bg-white/80 px-3 text-slate-600 font-bold">{t("or_email")}</span>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label className="text-xs font-bold text-blue-600 uppercase tracking-[0.2em] mb-2 block ml-1">{t("name")}</label>
              <div className="relative group">
                <User className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-blue-600 transition-colors" size={18} />
                <input
                  type="text"
                  required
                  placeholder="Full Name"
                  className="w-full bg-slate-100 border border-slate-100 rounded-2xl py-4 pl-12 pr-4 text-sm focus:border-blue-500/50 outline-none transition-all focus:ring-4 focus:ring-blue-500/10 placeholder:text-slate-600"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                />
              </div>
            </div>

            {/* 이메일 + 인증 코드 발송 */}
            <div>
              <label className="text-xs font-bold text-blue-600 uppercase tracking-[0.2em] mb-2 block ml-1">{t("email")}</label>
              <div className="flex gap-2">
                <div className="relative group flex-1">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-blue-600 transition-colors" size={18} />
                  <input
                    type="email"
                    required
                    placeholder="example@oripics.com"
                    className={`w-full bg-slate-100 border rounded-2xl py-4 pl-12 pr-4 text-sm outline-none transition-all focus:ring-4 focus:ring-blue-500/10 placeholder:text-slate-600 ${
                      codeVerified ? "border-emerald-500/30 bg-emerald-500/5" : "border-slate-100 focus:border-blue-500/50"
                    }`}
                    value={formData.email}
                    onChange={(e) => {
                      setFormData({ ...formData, email: e.target.value });
                      setCodeSent(false);
                      setCodeVerified(false);
                      setVerificationCode("");
                    }}
                    disabled={codeVerified}
                  />
                </div>
                <button
                  type="button"
                  onClick={handleSendCode}
                  disabled={sendingCode || cooldown > 0 || !formData.email || codeVerified}
                  className="px-4 py-4 bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold rounded-2xl transition-all disabled:opacity-30 disabled:cursor-not-allowed whitespace-nowrap shrink-0"
                >
                  {sendingCode ? (
                    <RefreshCw className="animate-spin" size={16} />
                  ) : cooldown > 0 ? (
                    `${cooldown}s`
                  ) : codeSent ? (
                    t("verification.resend")
                  ) : (
                    t("verification.send")
                  )}
                </button>
              </div>
            </div>

            {/* 인증 코드 입력 필드 */}
            {codeSent && !codeVerified && (
              <div className="animate-in fade-in slide-in-from-top-2 duration-300">
                <label className="text-sm font-bold text-emerald-700 uppercase tracking-[0.2em] mb-2 block ml-1">{t("verification.code_label")}</label>
                <div className="relative group">
                  <CheckCircle className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-emerald-400 transition-colors" size={18} />
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    placeholder="000000"
                    className="w-full bg-slate-100 border border-emerald-500/20 rounded-2xl py-4 pl-12 pr-4 text-sm focus:border-emerald-500/50 outline-none transition-all focus:ring-4 focus:ring-emerald-500/10 placeholder:text-slate-600 tracking-[0.5em] text-center font-mono text-lg"
                    value={verificationCode}
                    onChange={(e) => {
                      const val = e.target.value.replace(/[^0-9]/g, "");
                      setVerificationCode(val);
                    }}
                  />
                </div>
                <p className="text-sm text-slate-500 mt-2 ml-1">{t("verification.hint")}</p>
              </div>
            )}

            <div>
              <label className="text-xs font-bold text-blue-600 uppercase tracking-[0.2em] mb-2 block ml-1">{t("password")}</label>
              <div className="relative group">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-blue-600 transition-colors" size={18} />
                <input
                  type="password"
                  required
                  placeholder="••••••••"
                  className="w-full bg-slate-100 border border-slate-100 rounded-2xl py-4 pl-12 pr-4 text-sm focus:border-blue-500/50 outline-none transition-all focus:ring-4 focus:ring-blue-500/10 placeholder:text-slate-600"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                />
              </div>
              <p className="text-xs text-slate-500 mt-2 ml-1">{t("errors.password_hint")}</p>
            </div>

            {/* 약관·개인정보 처리방침 동의 (필수) */}
            <label className="flex items-start gap-2 cursor-pointer select-none px-1">
              <input
                type="checkbox"
                checked={agreed}
                onChange={(e) => setAgreed(e.target.checked)}
                className="mt-0.5 w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
              />
              <span className="text-xs text-slate-600 leading-relaxed">
                {t.rich("agree_label", {
                  terms: (chunks) => (
                    <Link href="/terms" target="_blank" className="text-blue-600 font-semibold hover:underline">
                      {chunks}
                    </Link>
                  ),
                  privacy: (chunks) => (
                    <Link href="/privacy" target="_blank" className="text-blue-600 font-semibold hover:underline">
                      {chunks}
                    </Link>
                  ),
                })}
              </span>
            </label>

            {/* 성공 메시지 */}
            {successMsg && (
              <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-700 text-xs p-4 rounded-xl flex items-start gap-2 animate-in fade-in duration-300">
                <CheckCircle size={16} className="shrink-0 mt-0.5" />
                <span>{successMsg}</span>
              </div>
            )}

            {/* 에러 메시지 */}
            {error && (
              <div className="bg-red-500/10 border border-red-500/20 text-red-600 text-xs p-4 rounded-xl flex items-start gap-2 animate-shake">
                <span className="shrink-0 mt-0.5">⚠️</span>
                <span>{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !codeSent || verificationCode.length !== 6 || !agreed}
              className="w-full py-4 bg-blue-800 hover:bg-blue-700 text-white font-bold rounded-2xl transition-all shadow-xl shadow-blue-200/50 flex items-center justify-center gap-2 active:scale-[0.98] disabled:opacity-50"
            >
              {loading ? <RefreshCw className="animate-spin" size={20} /> : (
                <>{t("submit")} <ArrowRight size={18} /></>
              )}
            </button>
          </form>

          <div className="mt-8 pt-8 border-t border-slate-100 text-center text-sm text-slate-500">
            {t("has_account")}{" "}
            <Link href="/login" className="text-blue-600 font-bold hover:text-blue-700 transition-colors">
              {t("login_link")}
            </Link>
          </div>
        </div>

        <p className="mt-8 text-center text-[11px] text-slate-600 flex items-center justify-center gap-2">
          <ShieldCheck size={14} /> {t("shield_text")}
        </p>
      </div>

      {/* 동의 안내 팝업 — 작은 창에서 인라인 에러가 안 보이는 문제 대응 (2026-08-26 대표 피드백).
          [동의하고 계속하기] = 체크 + 선택한 provider로 즉시 진행 */}
      {pendingProvider && (
        <div
          className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-6"
          onClick={() => setPendingProvider(null)}
        >
          <div
            className="w-full max-w-sm bg-white rounded-2xl shadow-2xl p-6 animate-in fade-in zoom-in duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-sm text-slate-800 font-medium mb-2">{t("errors.must_agree")}</p>
            <p className="text-xs text-slate-500 mb-5">
              {t.rich("agree_label", {
                terms: (chunks) => (
                  <Link href="/terms" target="_blank" className="text-blue-600 underline">
                    {chunks}
                  </Link>
                ),
                privacy: (chunks) => (
                  <Link href="/privacy" target="_blank" className="text-blue-600 underline">
                    {chunks}
                  </Link>
                ),
              })}
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setPendingProvider(null)}
                className="flex-1 py-3 rounded-xl border border-slate-200 text-slate-600 text-sm font-semibold hover:bg-slate-50 transition-colors"
              >
                {t("agree_close")}
              </button>
              <button
                onClick={() => {
                  if (oauthBusy) return;
                  const p = pendingProvider;
                  setAgreed(true);
                  setPendingProvider(null);
                  setOauthBusy(p);
                  signIn(p, { callbackUrl: "/" });
                }}
                className="flex-1 py-3 rounded-xl bg-blue-800 hover:bg-blue-700 text-white text-sm font-bold transition-colors"
              >
                {t("agree_continue")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
