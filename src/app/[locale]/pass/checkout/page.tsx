"use client";

// 원데이 패스 결제 페이지 (A-60 Phase 3, 2026-09-01).
// KG이니시스 "일반결제" 단건 결제 — 정기결제(빌링키) MID와 별도 채널.
// NEXT_PUBLIC_PORTONE_CHANNEL_KEY_INICIS_ONETIME 미설정 시 준비 중 안내만 표시
// (MID 발급 → PortOne 채널 등록 → env 설정 + 재배포가 판매 개시 스위치).
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { useRouter, Link } from "@/navigation";
import * as PortOne from "@portone/browser-sdk/v2";
import { ArrowLeft, ShieldCheck, Ticket } from "lucide-react";

const PASS_PRICE_KRW = 3300; // 서버 검증 기준: lib/pass/passPurchase.ts PASS_PRICE_KRW와 일치
const PASS_ORDER_NAME = "OriPics 원데이 패스";

const T = {
  ko: {
    back: "패스 소개로",
    title: "원데이 패스 구매",
    subtitle: "결제가 끝나면 등록 코드를 바로 받아요 — 등록 전까지 24시간은 시작되지 않아요.",
    product: "원데이 패스 1장",
    priceNote: "부가세 포함",
    productDesc: "등록 후 24시간 · 촬영 인증 10회 · 인증서 PDF · 공개링크 1년 보관 · 선물 가능",
    phoneLabel: "휴대폰 번호",
    phonePlaceholder: "01012345678",
    phoneHint: "카드사 결제창에 필요해요 (숫자만 입력).",
    phoneInvalid: "휴대폰 번호를 확인해 주세요 (01로 시작하는 숫자).",
    refundNotice: "미등록 코드는 환불할 수 있으나, 코드 등록(사용 개시) 후에는 환불이 불가합니다. 자세한 내용은",
    refundLinkTerms: "이용약관",
    refundLinkRefund: "환불정책",
    keysMissing: "결제 설정이 아직 준비되지 않았어요. 잠시 후 다시 시도해 주세요.",
    errorGeneric: "결제를 시작하지 못했어요. 잠시 후 다시 시도해 주세요.",
    pay: "₩3,300 결제하기",
    processing: "결제 진행 중…",
    poweredBy: "PortOne · KG이니시스 안전결제",
    comingSoonTitle: "결제 오픈을 준비하고 있어요",
    comingSoonBody: "원데이 패스 판매가 곧 시작됩니다. 조금만 기다려 주세요!",
    loading: "불러오는 중…",
    testModeTitle: "테스트 모드",
    testModeDesc: "실제 청구되지 않는 테스트 결제입니다.",
  },
  en: {
    back: "About the pass",
    title: "Buy a One-Day Pass",
    subtitle: "You'll receive a redemption code right after payment — the 24 hours don't start until you redeem.",
    product: "One-Day Pass ×1",
    priceNote: "VAT included",
    productDesc: "24h from redemption · 10 capture proofs · certificate PDF · 1-year links · giftable",
    phoneLabel: "Mobile phone number",
    phonePlaceholder: "01012345678",
    phoneHint: "Required by the card payment window (digits only).",
    phoneInvalid: "Please check the phone number (Korean mobile, starts with 01).",
    refundNotice: "Unredeemed codes are refundable; once redeemed, the pass is non-refundable. For details, see the",
    refundLinkTerms: "Terms of Service",
    refundLinkRefund: "Refund Policy",
    keysMissing: "Payment configuration is not ready yet. Please try again later.",
    errorGeneric: "Could not start the payment. Please try again later.",
    pay: "Pay ₩3,300",
    processing: "Processing…",
    poweredBy: "Secured by PortOne · KG INICIS",
    comingSoonTitle: "Payments are being prepared",
    comingSoonBody: "One-Day Pass sales are opening soon. Please check back!",
    loading: "Loading…",
    testModeTitle: "Test mode",
    testModeDesc: "This is a test payment — you will not be charged.",
  },
};

export default function PassCheckoutPage() {
  const params = useParams<{ locale: string }>();
  const locale = (params?.locale as string) || "ko";
  const t = T[locale === "en" ? "en" : "ko"];
  const router = useRouter();
  const { data: session, status } = useSession();

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [phone, setPhone] = useState("");

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace(`/login?redirect=${encodeURIComponent("/pass/checkout")}`);
    }
  }, [status, router]);

  const storeId = process.env.NEXT_PUBLIC_PORTONE_STORE_ID;
  // 일반결제 전용 채널 (KG이니시스 일반결제 MID) — 정기결제 채널키와 다름!
  const channelKey = process.env.NEXT_PUBLIC_PORTONE_CHANNEL_KEY_INICIS_ONETIME;
  const isTestMode =
    process.env.NEXT_PUBLIC_PORTONE_TEST_MODE === "true" ||
    /test/i.test(channelKey ?? "") ||
    /test/i.test(storeId ?? "");

  // 판매 개시 전 (env 미설정) — 준비 중 안내
  if (!channelKey) {
    return (
      <main className="min-h-screen flex items-center justify-center px-6 bg-slate-50">
        <div className="text-center">
          <Ticket size={40} className="mx-auto mb-4 text-slate-300" />
          <h1 className="text-lg font-bold mb-2">{t.comingSoonTitle}</h1>
          <p className="text-sm text-slate-500 mb-6">{t.comingSoonBody}</p>
          <Link href="/pass" className="text-sm text-blue-600 font-semibold hover:underline">
            {t.back} →
          </Link>
        </div>
      </main>
    );
  }

  if (status === "loading" || status === "unauthenticated") {
    return (
      <main className="min-h-screen flex items-center justify-center px-6 bg-slate-50">
        <p className="text-slate-500 text-sm">{t.loading}</p>
      </main>
    );
  }

  // KG이니시스 V2 일반결제는 구매자 휴대폰번호 필수 — billing/checkout과 동일 정규화
  let normalizedPhone = phone.replace(/[^0-9]/g, "");
  if (normalizedPhone.startsWith("0082")) {
    normalizedPhone = "0" + normalizedPhone.slice(4);
  } else if (normalizedPhone.startsWith("82") && normalizedPhone.length >= 11) {
    normalizedPhone = "0" + normalizedPhone.slice(2);
  }
  const phoneValid = /^01[0-9]{8,9}$/.test(normalizedPhone);

  const handlePay = async () => {
    if (!storeId || !channelKey) {
      setError(t.keysMissing);
      return;
    }
    if (!phoneValid) {
      setError(t.phoneInvalid);
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const userId = (session?.user as any)?.id ?? "anon";
      const paymentId = `dp-${String(userId).slice(-8)}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const origin = window.location.origin;
      // 리다이렉트 환경(모바일)에서는 PortOne이 이 URL에 paymentId를 붙여 복귀시킴
      const redirectUrl = `${origin}/${locale}/pass/success`;

      const response = await PortOne.requestPayment({
        storeId,
        channelKey,
        paymentId,
        orderName: PASS_ORDER_NAME,
        totalAmount: PASS_PRICE_KRW,
        currency: "KRW",
        payMethod: "CARD",
        customer: {
          fullName: session?.user?.name ?? undefined,
          email: session?.user?.email ?? undefined,
          phoneNumber: normalizedPhone,
        },
        // 서버 검증(소유권·상품 마커)용 — passPurchase.ts가 대조
        customData: { userId, product: "day_pass" },
        redirectUrl,
      });

      // PC 팝업 환경에서는 Promise resolve. 실패 시 code/message 동봉.
      if (response?.code != null) {
        setSubmitting(false);
        setError(`${response.code}: ${response.message ?? ""}`);
        return;
      }
      window.location.href = `/${locale}/pass/success?paymentId=${encodeURIComponent(paymentId)}`;
    } catch (e: any) {
      setSubmitting(false);
      setError(e?.message ?? t.errorGeneric);
    }
  };

  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-6 py-12 bg-slate-50">
      <div className="w-full max-w-md">
        <Link
          href="/pass"
          className="inline-flex items-center gap-1 text-slate-500 hover:text-slate-900 text-sm mb-6"
        >
          <ArrowLeft size={16} /> {t.back}
        </Link>

        <div className="bg-white border border-slate-200 rounded-3xl p-8 shadow-sm">
          <h1 className="text-xl font-bold mb-1">{t.title}</h1>
          <p className="text-sm text-slate-500 mb-6">{t.subtitle}</p>

          <div className="border border-slate-200 rounded-2xl p-5 mb-6 bg-slate-50/50">
            <div className="flex items-baseline justify-between mb-1">
              <span className="font-bold flex items-center gap-1.5">
                <Ticket size={15} className="text-blue-600" /> {t.product}
              </span>
              <span className="text-xl font-extrabold">₩{PASS_PRICE_KRW.toLocaleString()}</span>
            </div>
            <p className="text-xs text-slate-500">{t.priceNote}</p>
            <p className="text-xs text-slate-500 mt-1">{t.productDesc}</p>
          </div>

          {isTestMode && (
            <div className="mb-4 px-4 py-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs">
              <p className="font-bold mb-1">{t.testModeTitle}</p>
              <p>{t.testModeDesc}</p>
            </div>
          )}

          <div className="mb-4">
            <label htmlFor="phone" className="block text-xs font-medium text-slate-600 mb-1.5">
              {t.phoneLabel}
            </label>
            <input
              id="phone"
              type="tel"
              inputMode="numeric"
              autoComplete="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder={t.phonePlaceholder}
              className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500"
            />
            <p className="mt-1.5 text-[11px] text-slate-400">{t.phoneHint}</p>
          </div>

          {/* 청약철회 제한 사전 고지 (전자상거래법 제17조 제6항 요건) */}
          <div className="mb-4 px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-600 text-[11px] leading-relaxed">
            {t.refundNotice}{" "}
            <Link href="/terms#refund" className="underline hover:text-slate-900" target="_blank">
              {t.refundLinkTerms}
            </Link>
            {" · "}
            <Link href="/refund" className="underline hover:text-slate-900" target="_blank">
              {t.refundLinkRefund}
            </Link>
          </div>

          {error && (
            <div className="mb-4 px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs">
              {error}
            </div>
          )}

          <button
            onClick={handlePay}
            disabled={submitting || !phoneValid}
            className="w-full py-3.5 rounded-xl bg-blue-600 text-white font-bold hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed transition-colors"
          >
            {submitting ? t.processing : t.pay}
          </button>

          <p className="mt-4 flex items-center justify-center gap-1 text-[11px] text-slate-400">
            <ShieldCheck size={12} /> {t.poweredBy}
          </p>
        </div>
      </div>
    </main>
  );
}
