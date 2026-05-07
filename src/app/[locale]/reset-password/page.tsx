"use client";

import React, { useState, useEffect } from "react";
import { Link, useRouter } from "@/navigation";
import { Lock, ArrowRight, RefreshCw, CheckCircle } from "lucide-react";
import { useTranslations } from "next-intl";

export default function ResetPasswordPage() {
  const [password, setPassword] = useState("");
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState({ type: "", text: "" });
  const router = useRouter();
  
  const t = useTranslations("ResetPassword");

  useEffect(() => {
    // Get token from URL
    const searchParams = new URLSearchParams(window.location.search);
    const tokenParam = searchParams.get("token");
    if (tokenParam) {
      setToken(tokenParam);
    } else {
      setMessage({ type: "error", text: t("invalid_token") });
    }
  }, [t]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;

    setLoading(true);
    setMessage({ type: "", text: "" });

    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });

      const data = await res.json();
      
      if (!res.ok) {
        const errorMsg = data.code ? t(`api_errors.${data.code}`) : data.message;
        throw new Error(errorMsg);
      }

      setMessage({ type: "success", text: t("success_message") });
      setPassword("");
      
      // 3초 후 로그인 페이지로 이동
      setTimeout(() => {
        router.push("/login");
      }, 3000);
    } catch (err: any) {
      setMessage({ type: "error", text: t("error_message", { error: err.message }) });
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
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label className="text-[10px] font-bold text-blue-600 uppercase tracking-[0.2em] mb-2 block ml-1 opacity-70">{t("password_label")}</label>
              <div className="relative group">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-blue-600 transition-colors" size={18} />
                <input
                  type="password"
                  required
                  placeholder={t("password_placeholder")}
                  className="w-full bg-slate-100 border border-slate-100 rounded-2xl py-4 pl-12 pr-4 text-sm focus:border-blue-500/50 outline-none transition-all focus:ring-4 focus:ring-blue-500/10 placeholder:text-slate-600"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={!token || message.type === "success"}
                />
              </div>
            </div>

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
              disabled={loading || !token || message.type === "success"}
              className="w-full py-4 bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 text-white font-bold rounded-2xl transition-all shadow-xl shadow-blue-200/50 flex items-center justify-center gap-2 active:scale-[0.98] disabled:opacity-50"
            >
              {loading ? <RefreshCw className="animate-spin" size={20} /> : (
                <>{t("submit")} <ArrowRight size={18} /></>
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
