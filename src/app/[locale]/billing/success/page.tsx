"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Link } from "@/navigation";
import { CheckCircle2, XCircle, Loader2 } from "lucide-react";

type Phase = "confirming" | "success" | "error";

export default function BillingSuccessPage() {
  const t = useTranslations("Billing");
  const searchParams = useSearchParams();

  const [phase, setPhase] = useState<Phase>("confirming");
  const [granted, setGranted] = useState<number | null>(null);
  const [errorDetail, setErrorDetail] = useState<string | null>(null);

  useEffect(() => {
    const paymentId = searchParams?.get("paymentId");
    const plan = searchParams?.get("plan") ?? "pro_monthly";
    // PortOne 리다이렉트 모드에서 실패 시 code/message 동봉됨
    const code = searchParams?.get("code");
    const message = searchParams?.get("message");

    if (code) {
      setPhase("error");
      setErrorDetail(`${code}${message ? `: ${message}` : ""}`);
      return;
    }

    if (!paymentId) {
      setPhase("error");
      setErrorDetail("missing_payment_id");
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/billing/portone/complete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ paymentId, plan }),
        });
        if (cancelled) return;
        const payload = await res.json().catch(() => ({}));
        if (!res.ok) {
          setPhase("error");
          setErrorDetail(payload?.detail ?? `HTTP ${res.status}`);
          return;
        }
        setGranted(payload?.granted ?? null);
        setPhase("success");
      } catch (e: any) {
        if (cancelled) return;
        setPhase("error");
        setErrorDetail(e?.message ?? "network_error");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [searchParams]);

  return (
    <main className="min-h-screen flex items-center justify-center px-6 py-12 bg-slate-50">
      <div className="w-full max-w-md bg-white border border-slate-200 rounded-3xl p-8 shadow-sm text-center">
        {phase === "confirming" && (
          <>
            <Loader2 size={48} className="text-blue-500 animate-spin mx-auto mb-4" />
            <h1 className="text-lg font-bold mb-1">{t("confirming_title")}</h1>
            <p className="text-sm text-slate-500">{t("confirming_desc")}</p>
          </>
        )}

        {phase === "success" && (
          <>
            <CheckCircle2 size={56} className="text-emerald-500 mx-auto mb-4" />
            <h1 className="text-xl font-bold mb-1">{t("success_title")}</h1>
            <p className="text-sm text-slate-600 mb-1">{t("success_desc")}</p>
            {granted != null && (
              <p className="text-sm text-blue-700 font-bold mb-6">
                {t("granted_credits", { count: granted })}
              </p>
            )}
            <div className="flex flex-col gap-2 mt-6">
              <Link
                href="/profile"
                className="w-full py-3 rounded-xl bg-slate-900 text-white font-bold hover:bg-slate-800 transition-colors"
              >
                {t("go_profile")}
              </Link>
              <Link
                href="/"
                className="w-full py-3 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 transition-colors"
              >
                {t("go_home")}
              </Link>
            </div>
          </>
        )}

        {phase === "error" && (
          <>
            <XCircle size={56} className="text-red-500 mx-auto mb-4" />
            <h1 className="text-xl font-bold mb-1">{t("error_title")}</h1>
            <p className="text-sm text-slate-600 mb-2">{t("error_desc")}</p>
            {errorDetail && (
              <p className="text-xs text-slate-400 mb-6 break-words">[{errorDetail}]</p>
            )}
            <Link
              href="/#pricing"
              className="inline-block w-full py-3 rounded-xl bg-slate-900 text-white font-bold hover:bg-slate-800 transition-colors"
            >
              {t("retry")}
            </Link>
          </>
        )}
      </div>
    </main>
  );
}
