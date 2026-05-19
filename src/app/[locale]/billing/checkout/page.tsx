"use client";

import { useEffect, useState } from "react";
import { useSearchParams, useParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { useRouter, Link } from "@/navigation";
import { useTranslations } from "next-intl";
import * as PortOne from "@portone/browser-sdk/v2";
import { ArrowLeft, ShieldCheck } from "lucide-react";

const PLAN_PRICES: Record<string, { amount: number; orderName: string }> = {
  pro_monthly: { amount: 9900, orderName: "OriPics Pro" },
};

export default function CheckoutPage() {
  const t = useTranslations("Billing");
  const params = useParams<{ locale: string }>();
  const locale = params?.locale ?? "ko";
  const searchParams = useSearchParams();
  const router = useRouter();
  const { data: session, status } = useSession();

  const plan = searchParams?.get("plan") ?? "pro_monthly";
  const planInfo = PLAN_PRICES[plan];

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace(`/login?redirect=${encodeURIComponent(`/billing/checkout?plan=${plan}`)}`);
    }
  }, [status, plan, router]);

  if (!planInfo) {
    return (
      <main className="min-h-screen flex items-center justify-center px-6">
        <p className="text-slate-600">{t("invalid_plan")}</p>
      </main>
    );
  }

  if (status === "loading" || status === "unauthenticated") {
    return (
      <main className="min-h-screen flex items-center justify-center px-6">
        <p className="text-slate-500 text-sm">{t("loading")}</p>
      </main>
    );
  }

  const storeId = process.env.NEXT_PUBLIC_PORTONE_STORE_ID;
  const channelKey = process.env.NEXT_PUBLIC_PORTONE_CHANNEL_KEY_NICE;
  // 채널 키 또는 스토어 ID에 "test"가 포함되어 있으면 테스트 모드로 안내
  const isTestMode = !storeId || !channelKey ||
    /test/i.test(channelKey ?? "") || /test/i.test(storeId ?? "");

  const handlePay = async () => {
    if (!storeId || !channelKey) {
      setError(t("portone_keys_missing"));
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const userId = (session?.user as any)?.id ?? "anon";
      const paymentId = `pay-${String(userId).slice(-8)}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const origin = window.location.origin;
      const redirectUrl = `${origin}/${locale}/billing/success?plan=${plan}`;

      const response = await PortOne.requestPayment({
        storeId,
        channelKey,
        paymentId,
        orderName: planInfo.orderName,
        totalAmount: planInfo.amount,
        currency: "CURRENCY_KRW",
        payMethod: "CARD",
        customer: {
          fullName: session?.user?.name ?? undefined,
          email: session?.user?.email ?? undefined,
        },
        redirectUrl,
      });

      // 모바일 등 리다이렉트 환경에서는 여기까지 도달하지 않음.
      // PC 팝업 환경에서는 Promise resolve.
      if (response?.code != null) {
        setSubmitting(false);
        setError(`${response.code}: ${response.message ?? ""}`);
        return;
      }
      // 팝업 정상 완료 → success 페이지로 이동
      const successUrl = `/${locale}/billing/success?plan=${plan}&paymentId=${encodeURIComponent(paymentId)}`;
      window.location.href = successUrl;
    } catch (e: any) {
      setSubmitting(false);
      setError(e?.message ?? t("error_generic"));
    }
  };

  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-6 py-12 bg-slate-50">
      <div className="w-full max-w-md">
        <Link
          href="/#pricing"
          className="inline-flex items-center gap-1 text-slate-500 hover:text-slate-900 text-sm mb-6"
        >
          <ArrowLeft size={16} /> {t("back")}
        </Link>

        <div className="bg-white border border-slate-200 rounded-3xl p-8 shadow-sm">
          <h1 className="text-xl font-bold mb-1">{t("title")}</h1>
          <p className="text-sm text-slate-500 mb-6">{t("subtitle")}</p>

          <div className="border border-slate-200 rounded-2xl p-5 mb-6 bg-slate-50/50">
            <div className="flex items-baseline justify-between mb-1">
              <span className="font-bold">{planInfo.orderName}</span>
              <span className="text-xl font-extrabold">
                ₩{planInfo.amount.toLocaleString()}
              </span>
            </div>
            <p className="text-xs text-slate-500">{t("plan_period_monthly")}</p>
            <p className="text-xs text-slate-500">{t("plan_tax_note")}</p>
          </div>

          {isTestMode && (
            <div className="mb-4 px-4 py-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs">
              <p className="font-bold mb-1">{t("test_mode_title")}</p>
              <p>{t("test_mode_desc")}</p>
            </div>
          )}

          {error && (
            <div className="mb-4 px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs">
              {error}
            </div>
          )}

          <button
            onClick={handlePay}
            disabled={submitting}
            className="w-full py-3.5 rounded-xl bg-blue-600 text-white font-bold hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed transition-colors"
          >
            {submitting ? t("processing") : t("pay_button")}
          </button>

          <p className="mt-4 flex items-center justify-center gap-1 text-[11px] text-slate-400">
            <ShieldCheck size={12} /> {t("powered_by")}
          </p>
        </div>
      </div>
    </main>
  );
}
