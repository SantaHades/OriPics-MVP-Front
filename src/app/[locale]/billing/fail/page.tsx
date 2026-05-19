"use client";

import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Link } from "@/navigation";
import { XCircle } from "lucide-react";

export default function BillingFailPage() {
  const t = useTranslations("Billing");
  const searchParams = useSearchParams();

  const code = searchParams?.get("code");
  const message = searchParams?.get("message");

  return (
    <main className="min-h-screen flex items-center justify-center px-6 py-12 bg-slate-50">
      <div className="w-full max-w-md bg-white border border-slate-200 rounded-3xl p-8 shadow-sm text-center">
        <XCircle size={56} className="text-red-500 mx-auto mb-4" />
        <h1 className="text-xl font-bold mb-2">{t("fail_title")}</h1>
        <p className="text-sm text-slate-600 mb-4">{t("fail_desc")}</p>
        {(code || message) && (
          <div className="mb-6 px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 text-left text-xs text-slate-600">
            {code && <p><span className="font-bold">code</span>: {code}</p>}
            {message && <p className="break-words"><span className="font-bold">message</span>: {message}</p>}
          </div>
        )}
        <div className="flex flex-col gap-2">
          <Link
            href="/#pricing"
            className="w-full py-3 rounded-xl bg-slate-900 text-white font-bold hover:bg-slate-800 transition-colors"
          >
            {t("retry")}
          </Link>
          <Link
            href="/"
            className="w-full py-3 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 transition-colors"
          >
            {t("go_home")}
          </Link>
        </div>
      </div>
    </main>
  );
}
