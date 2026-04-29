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
  const router = useRouter();
  const searchParams = useSearchParams();
  
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
          {/* 소셜 가입 버튼 */}
          <div className="flex justify-center gap-6 mb-8 group">
            <button
              onClick={() => signIn("google", { callbackUrl: "/" })}
              className="w-14 h-14 bg-white rounded-full flex items-center justify-center shadow-lg hover:scale-110 active:scale-[0.98] transition-all duration-300 group-hover:opacity-70 hover:!opacity-100"
              title={t("google")}
            >
              <img src="https://www.google.com/favicon.ico" alt="Google" className="w-6 h-6" />
            </button>
            <button
              onClick={() => signIn("naver", { callbackUrl: "/" })}
              className="w-14 h-14 bg-[#03C75A] rounded-full flex items-center justify-center shadow-lg hover:scale-110 active:scale-[0.98] transition-all duration-300 group-hover:opacity-70 hover:!opacity-100"
              title={t("naver")}
            >
              <span className="text-slate-900 font-extrabold text-xl">N</span>
            </button>
            <button
              onClick={() => signIn("kakao", { callbackUrl: "/" })}
              className="w-14 h-14 bg-[#FEE500] rounded-full flex items-center justify-center shadow-lg hover:scale-110 active:scale-[0.98] transition-all duration-300 group-hover:opacity-70 hover:!opacity-100"
              title={t("kakao")}
            >
              <svg viewBox="0 0 24 24" className="w-7 h-7 text-[#3C1E1E] fill-current">
                <path d="M12 3c-4.97 0-9 3.165-9 7.07 0 2.507 1.64 4.708 4.12 6.002-.164.553-.59 1.996-.675 2.304-.105.385.125.38.263.288.11-.073 1.74-1.18 2.42-1.64.28.04.566.06.853.06 4.97 0 9-3.166 9-7.07 0-3.905-4.03-7.07-9-7.07z" />
              </svg>
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
              disabled={loading || !codeSent || verificationCode.length !== 6}
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
    </div>
  );
}
