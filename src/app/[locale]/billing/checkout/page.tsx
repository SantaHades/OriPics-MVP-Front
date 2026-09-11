"use client";

import { useEffect, useState } from "react";
import { useSearchParams, useParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { useRouter, Link } from "@/navigation";
import { useTranslations } from "next-intl";
import * as PortOne from "@portone/browser-sdk/v2";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { PARTNER } from "@/lib/partner/config";

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
  // 결제 카드 변경 모드 (2026-09-10 대표): 빌링키만 새로 발급하고 청구는 하지 않는다 → 서버 change_card로 교체
  const changeCard = searchParams?.get("mode") === "change_card";

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [phone, setPhone] = useState("");
  // 파트너 혜택 미리보기 (A-82) — 첫 결제 최대 2장(0원)·이후 1장. 실제 청구액은 서버가 예약 시점에 확정
  const [preview, setPreview] = useState<{
    expectedAmount: number; discountAmount: number; couponsApplied: number; freeMonthApplied: boolean;
    listAmount?: number; couponsAvailable?: number; freeMonthsAvailable?: number;
  } | null>(null);
  useEffect(() => {
    if (status !== "authenticated" || changeCard) return;
    fetch("/api/partner/me", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d?.nextCharge && setPreview(d.nextCharge))
      .catch(() => {});
  }, [status, changeCard]);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace(`/login?redirect=${encodeURIComponent(`/billing/checkout?plan=${plan}${changeCard ? "&mode=change_card" : ""}`)}`);
    }
  }, [status, plan, router, changeCard]);

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
  // 1차 PG: KG이니시스. NICE는 추후 멀티PG 라우팅 시점에 추가.
  const channelKey =
    process.env.NEXT_PUBLIC_PORTONE_CHANNEL_KEY_INICIS ??
    process.env.NEXT_PUBLIC_PORTONE_CHANNEL_KEY_NICE;
  // 테스트 모드 안내 배너 표시 여부.
  // 실제 포트원 테스트 채널키엔 "test" 문자열이 없으므로 명시 플래그를 1순위로 사용.
  // (휴리스틱은 플래그 미설정 시 안전망.)
  const isTestMode =
    process.env.NEXT_PUBLIC_PORTONE_TEST_MODE === "true" ||
    /test/i.test(channelKey ?? "") ||
    /test/i.test(storeId ?? "");

  // KG이니시스 V2 일반결제는 구매자 휴대폰번호가 필수.
  // +82/0082 국제 형식 입력(연락처 자동완성 등)은 국내 형식(01X…)으로 정규화한다.
  // 해외(비 +82) 번호·해외 발급 카드는 현재 KG이니시스 국내 MID 계약으로 미지원 — follow-ups A-35.
  let normalizedPhone = phone.replace(/[^0-9]/g, "");
  if (normalizedPhone.startsWith("0082")) {
    normalizedPhone = "0" + normalizedPhone.slice(4);
  } else if (normalizedPhone.startsWith("82") && normalizedPhone.length >= 11) {
    normalizedPhone = "0" + normalizedPhone.slice(2);
  }
  const phoneValid = /^01[0-9]{8,9}$/.test(normalizedPhone);

  // 0원 결제(할인권 2장 또는 무료 이용권) 여부 — 청약철회 고지·다음 회차 예상액 문구 분기 (A-92 ④·⑥)
  const zeroCharge = !!preview && preview.discountAmount > 0 && preview.expectedAmount === 0;
  // 다음 회차 예상액: 이번에 쓰는 혜택을 제외한 잔여로 §3.4 규칙(할인권 1장 → 무료 이용권 1장 → 정가) 재적용.
  // /api/partner/me 가 잔여 필드를 주지 않으면 null → 기존 "{next} 또는 정가" 문구로 폴백
  const nextCharge = (() => {
    if (!preview || preview.couponsAvailable == null || preview.freeMonthsAvailable == null) return null;
    const list = preview.listAmount ?? planInfo?.amount ?? 0;
    const perCoupon = preview.couponsApplied > 0 ? preview.discountAmount / preview.couponsApplied : PARTNER.DISCOUNT_AMOUNT;
    const couponsLeft = Math.max(0, preview.couponsAvailable - preview.couponsApplied);
    const freeLeft = Math.max(0, preview.freeMonthsAvailable - (preview.freeMonthApplied ? 1 : 0));
    if (couponsLeft > 0) return { amount: Math.max(0, list - Math.min(list, perCoupon)), detail: t("partner_next_coupon", { left: couponsLeft - 1 }) };
    if (freeLeft > 0) return { amount: 0, detail: t("partner_next_free_month") };
    return { amount: list, detail: t("partner_next_list") };
  })();

  const handlePay = async () => {
    if (!storeId || !channelKey) {
      setError(t("portone_keys_missing"));
      return;
    }
    if (!phoneValid) {
      setError(t("phone_invalid"));
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const userId = (session?.user as any)?.id ?? "anon";
      // 정기결제(구독): 일반결제(1회성)가 아니라 빌링키를 발급한다.
      // 카드를 등록해 빌링키를 받고, 서버가 그 빌링키로 첫 달을 즉시 청구한 뒤
      // 매월 자동 청구한다 (KG이니시스 신용카드 정기결제창).
      const issueId = `bk-${String(userId).slice(-8)}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const origin = window.location.origin;
      const redirectUrl = `${origin}/${locale}/billing/success?plan=${plan}${changeCard ? "&mode=change_card" : ""}`;

      const response = await PortOne.requestIssueBillingKey({
        storeId,
        channelKey,
        billingKeyMethod: "CARD",
        issueId,
        issueName: changeCard ? `${planInfo.orderName} — ${t("change_card_issue_name")}` : planInfo.orderName,
        customer: {
          fullName: session?.user?.name ?? undefined,
          email: session?.user?.email ?? undefined,
          phoneNumber: normalizedPhone,
        },
        // webhook/서버가 userId·plan을 복원하기 위해 주입.
        customData: { userId, plan, ...(changeCard ? { mode: "change_card" } : {}) },
        // 서비스 제공 주기(월간 구독). 미지정 시 SDK가 (null, null)을 전송해
        // "offerPeriod violates AT_LEAST_ONE_REQUIRED"로 발급창 호출이 거부됨
        // (2026-08-24 실측 — 7/24 e2e 후 PortOne측 검증 강화로 회귀)
        offerPeriod: { interval: "1m" },
        redirectUrl,
      });

      // 모바일 등 리다이렉트 환경에서는 여기까지 도달하지 않음(redirectUrl로 billingKey 전달).
      // PC 팝업 환경에서는 Promise resolve.
      if (response?.code != null) {
        setSubmitting(false);
        setError(`${response.code}: ${response.message ?? ""}`);
        return;
      }
      // 빌링키 발급 성공 → success 페이지에서 첫 달 청구 + 구독 부여
      const billingKey = response?.billingKey;
      if (!billingKey) {
        setSubmitting(false);
        setError(t("error_generic"));
        return;
      }
      if (changeCard) {
        // 청구 없이 카드만 교체
        const r = await fetch("/api/billing/subscription", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "change_card", billingKey }),
        });
        const d = await r.json().catch(() => ({}));
        if (!r.ok) {
          setSubmitting(false);
          setError(d?.detail === "billing_key_not_owned" ? t("change_card_not_owned") : t("error_generic"));
          return;
        }
        window.location.href = `/${locale}/profile?card_changed=1#subscription`;
        return;
      }
      const successUrl = `/${locale}/billing/success?plan=${plan}&billingKey=${encodeURIComponent(billingKey)}`;
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
          href={changeCard ? "/profile#subscription" : "/#pricing"}
          className="inline-flex items-center gap-1 text-slate-500 hover:text-slate-900 text-sm mb-6"
        >
          <ArrowLeft size={16} /> {changeCard ? t("change_card_back") : t("back")}
        </Link>

        <div className="bg-white border border-slate-200 rounded-3xl p-8 shadow-sm">
          <h1 className="text-xl font-bold mb-1">{changeCard ? t("change_card_title") : t("title")}</h1>
          <p className="text-sm text-slate-500 mb-6">{changeCard ? t("change_card_subtitle") : t("subtitle")}</p>

          {changeCard ? (
            <div className="border border-emerald-200 rounded-2xl p-5 mb-6 bg-emerald-50/60 text-emerald-900 text-xs leading-relaxed">
              {t("change_card_no_charge")}
            </div>
          ) : (
          <div className="border border-slate-200 rounded-2xl p-5 mb-6 bg-slate-50/50">
            <div className="flex items-baseline justify-between mb-1">
              <span className="font-bold">{planInfo.orderName}</span>
              {preview && preview.discountAmount > 0 ? (
                <span className="text-right">
                  <span className="text-sm text-slate-400 line-through mr-2">₩{planInfo.amount.toLocaleString()}</span>
                  <span className="text-xl font-extrabold text-blue-700">₩{preview.expectedAmount.toLocaleString()}</span>
                </span>
              ) : (
                <span className="text-xl font-extrabold">
                  ₩{planInfo.amount.toLocaleString()}
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500">{t("plan_period_monthly")}</p>
            <p className="text-xs text-slate-500">{t("plan_tax_note")}</p>
            {preview && preview.discountAmount > 0 && (
              <p className="mt-2 text-xs text-blue-800 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2">
                {preview.expectedAmount === 0
                  ? nextCharge
                    ? t("partner_zero_notice_exact", {
                        kind: preview.freeMonthApplied ? t("partner_kind_free_month") : t("partner_kind_coupons", { count: preview.couponsApplied }),
                        next: nextCharge.amount.toLocaleString(),
                        detail: nextCharge.detail,
                      })
                    : t("partner_zero_notice", {
                        kind: preview.freeMonthApplied ? t("partner_kind_free_month") : t("partner_kind_coupons", { count: preview.couponsApplied }),
                        next: `₩${(planInfo.amount - PARTNER.DISCOUNT_AMOUNT).toLocaleString()}`,
                      })
                  : t("partner_discount_notice", { count: preview.couponsApplied, amount: preview.expectedAmount.toLocaleString() })}
              </p>
            )}
          </div>
          )}

          {isTestMode && (
            <div className="mb-4 px-4 py-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs">
              <p className="font-bold mb-1">{t("test_mode_title")}</p>
              <p>{t("test_mode_desc")}</p>
            </div>
          )}

          <div className="mb-4">
            <label htmlFor="phone" className="block text-xs font-medium text-slate-600 mb-1.5">
              {t("phone_label")}
            </label>
            <input
              id="phone"
              type="tel"
              inputMode="numeric"
              autoComplete="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder={t("phone_placeholder")}
              className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500"
            />
            <p className="mt-1.5 text-[11px] text-slate-400">{t("phone_hint")}</p>
          </div>

          {/* 크레딧 정액 SET 고지 — 잔여 무료분 대체(누적 아님) 기대치 정렬 (2026-08-24). 카드 변경 모드에서는 생략 */}
          {!changeCard && (
          <div className="mb-4 px-4 py-3 rounded-xl bg-blue-50 border border-blue-100 text-blue-800 text-[11px] leading-relaxed">
            {t("grant_notice")}
          </div>
          )}

          {/* 청약철회 제한 사전 고지 (전자상거래법 제17조 제6항 요건) */}
          {!changeCard && (
          <div className="mb-4 px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-600 text-[11px] leading-relaxed">
            <p className="font-bold text-slate-700 mb-1">{t("withdrawal_notice_title")}</p>
            {/* 0원 결제(할인권 2장·무료 이용권)면 환불 대상 금액이 없음을 고지 — 유료 기준 문구 그대로 두던 A-92 ④ */}
            <p className="mb-1.5">{zeroCharge ? t("withdrawal_notice_body_zero") : t("withdrawal_notice_body")}</p>
            <p className="text-slate-500">
              {t("withdrawal_notice_agree")}{" "}
              <Link href="/terms#refund" className="underline hover:text-slate-900" target="_blank">
                {t("withdrawal_notice_link_terms")}
              </Link>
              {" · "}
              <Link href="/refund" className="underline hover:text-slate-900" target="_blank">
                {t("withdrawal_notice_link_refund")}
              </Link>
            </p>
          </div>
          )}

          {error && (
            <div role="alert" className="mb-4 px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs">
              {error}
            </div>
          )}

          {/* 결제창(이니시스)이 열린 동안에는 큰 회색 버튼을 숨기고 안내문만 — 결제창의 [확인] 버튼과 시각적으로 경합하던 문제 (2026-09-10 대표) */}
          {submitting ? (
            <p className="w-full py-3 text-center text-sm text-slate-500 leading-relaxed">{t("processing_hint")}</p>
          ) : (
            <button
              onClick={handlePay}
              disabled={!phoneValid}
              className="w-full py-3.5 rounded-xl bg-blue-600 text-white font-bold hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed transition-colors"
            >
              {changeCard ? t("change_card_button") : t("pay_button")}
            </button>
          )}

          <p className="mt-4 flex items-center justify-center gap-1 text-[11px] text-slate-400">
            <ShieldCheck size={12} /> {t("powered_by")}
          </p>
        </div>
      </div>
    </main>
  );
}
