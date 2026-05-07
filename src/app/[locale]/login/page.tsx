"use client";

import React, { useState } from "react";
import { Link, useRouter } from "@/navigation";
import { useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { Mail, Lock, RefreshCw, ArrowRight } from "lucide-react";
import { useTranslations } from "next-intl";

export default function LoginPage() {
  const [formData, setFormData] = useState({ email: "", password: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();
  const searchParams = useSearchParams();
  
  const t = useTranslations("Login");

  // URL 에러 확인
  React.useEffect(() => {
    const errorParam = searchParams.get("error");
    if (errorParam) {
      // OAuthAccountNotLinked_naver 같은 provider별 에러 코드 처리
      if (errorParam.startsWith("OAuthAccountNotLinked_")) {
        const provider = errorParam.split("_").pop() || "";
        const providerKey = `errors.OAuthAccountNotLinked_${provider}`;
        // provider별 번역이 있으면 사용, 없으면 일반 메시지 사용
        const msg = t(providerKey);
        setError(msg.startsWith("errors.") ? t("errors.OAuthAccountNotLinked") : msg);
      } else {
        const msg = t(`errors.${errorParam}`);
        setError(msg.startsWith("errors.") ? t("errors.default") : msg);
      }
    }
  }, [searchParams, t]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    const result = await signIn("credentials", {
      redirect: false,
      email: formData.email,
      password: formData.password,
    });

    if (result?.error) {
      // result.error is often a code like "CredentialsSignin"
      setError(t(`errors.${result.error}`) || t("errors.default"));
      setLoading(false);
    } else {
      router.push("/");
      router.refresh();
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        <div className="text-center mb-10">
          <Link href="/" className="inline-flex items-center gap-3 font-bold text-3xl mb-4 group transition-all">
            <img src="/logo.png" alt="OriPics Logo" className="w-12 h-12 object-contain group-hover:scale-110 transition-transform" />
            <span className="text-slate-900">OriPics</span>
          </Link>
          <h1 className="text-2xl font-bold">{t("title")}</h1>
          <p className="text-slate-600 mt-2 text-sm">{t("subtitle")}</p>
        </div>

        <div className="glass p-8 rounded-3xl border border-slate-200 shadow-2xl">
          {/* 소셜 로그인 버튼 */}
          <div className="flex justify-center gap-6 mb-8 group">
            {/* Google */}
            <button
              onClick={() => signIn("google", { callbackUrl: "/" })}
              className="w-14 h-14 bg-white rounded-full flex items-center justify-center shadow-lg hover:scale-110 active:scale-95 transition-all duration-300 group-hover:opacity-70 hover:!opacity-100"
              title={t("google")}
            >
              <img src="https://www.google.com/favicon.ico" alt="Google" className="w-6 h-6" />
            </button>

            {/* Naver */}
            <button
              onClick={() => signIn("naver", { callbackUrl: "/" })}
              className="w-14 h-14 bg-[#03C75A] rounded-full flex items-center justify-center shadow-lg hover:scale-110 active:scale-95 transition-all duration-300 group-hover:opacity-70 hover:!opacity-100"
              title={t("naver")}
            >
              <span className="text-slate-900 font-extrabold text-xl">N</span>
            </button>

            {/* Kakao */}
            <button
              onClick={() => signIn("kakao", { callbackUrl: "/" })}
              className="w-14 h-14 bg-[#FEE500] rounded-full flex items-center justify-center shadow-lg hover:scale-110 active:scale-95 transition-all duration-300 group-hover:opacity-70 hover:!opacity-100"
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

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2 block ml-1">{t("email")}</label>
              <div className="relative">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                <input
                  type="email"
                  required
                  placeholder="name@company.com"
                  className="w-full bg-slate-100 border border-slate-200 rounded-2xl py-3.5 pl-12 pr-4 text-sm focus:border-blue-500 outline-none transition-all"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2 block ml-1">{t("password")}</label>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                <input
                  type="password"
                  required
                  placeholder="••••••••"
                  className="w-full bg-slate-100 border border-slate-200 rounded-2xl py-3.5 pl-12 pr-4 text-sm focus:border-blue-500 outline-none transition-all"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                />
              </div>
              <div className="flex justify-end mt-2">
                <Link href="/forgot-password" className="text-xs text-blue-600 hover:underline">
                  {t("forgot_password")}
                </Link>
              </div>
            </div>

            {error && (
              <div className="bg-red-500/10 border border-red-500/20 text-red-600 text-xs p-4 rounded-xl">
                <span>⚠️ {error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-4 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-2xl transition-all shadow-lg shadow-blue-200/50 flex items-center justify-center gap-2"
            >
              {loading ? <RefreshCw className="animate-spin" size={20} /> : (
                <>{t("submit")} <ArrowRight size={18} /></>
              )}
            </button>
          </form>

          <div className="mt-8 text-center text-sm text-slate-500">
            {t("no_account")}{" "}
            <Link href="/signup" className="text-blue-600 font-bold hover:underline">
              {t("signup_link")}
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
