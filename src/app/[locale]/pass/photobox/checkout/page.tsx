"use client";

// 사진함 패스 결제 (A-108 4단계, 2026-09-23). 원데이 패스 checkout과 같은 KG이니시스 일반결제 채널.
// 채널키(NEXT_PUBLIC_PORTONE_CHANNEL_KEY_INICIS_ONETIME) 미설정이면 준비 중 안내. 실결제는 U-44(카드사 서브몰) 해소 후.
// 결제 전 필수 동의 3개(설계 §5) — 전자상거래법 제17조 제6항 청약철회 제한 사전 고지·동의.
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { useRouter, Link } from "@/navigation";
import * as PortOne from "@portone/browser-sdk/v2";
import { ArrowLeft, ShieldCheck, Images } from "lucide-react";

const PRICE_KRW = 9900; // 서버 검증 기준: lib/photobox/pass.ts PHOTOBOX_PASS_PRICE_KRW와 일치
const ORDER_NAME = "OriPics 사진함 패스";

const T = {
  ko: {
    back: "사진함 패스 소개로",
    title: "사진함 패스 구매",
    subtitle: "결제하면 코드가 내 계정에 담겨요. 사진함을 개설하거나 초대를 수락할 때 사용합니다.",
    product: "사진함 패스 1장",
    priceNote: "부가세 포함",
    productDesc: "사진함 1개 전용 촬영 이용권 · 사진 100장(사이즈 무관) · 인증·공개링크·인증서 포함 · 5년 보관",
    consentTitle: "결제 전 확인해 주세요 (필수)",
    c1: "사진함 패스는 사진함 1곳 전용이며 다른 사진함에서 사용할 수 없습니다.",
    c2: "사진함에 등록(사용 시작)한 뒤에는 남은 장수가 환불되지 않습니다. 사진함에서 나가거나 사진함이 삭제된 경우에도 같습니다.",
    c3: "등록하지 않은 코드는 구매 후 7일 이내 전액 환불됩니다.",
    termsLink: "이용약관",
    refundLink: "환불정책",
    phoneLabel: "휴대폰 번호",
    phonePlaceholder: "01012345678",
    phoneHint: "카드사 결제창에 필요해요 (숫자만 입력).",
    phoneInvalid: "휴대폰 번호를 확인해 주세요 (01로 시작하는 숫자).",
    keysMissing: "결제 설정이 아직 준비되지 않았어요. 잠시 후 다시 시도해 주세요.",
    errorGeneric: "결제를 시작하지 못했어요. 잠시 후 다시 시도해 주세요.",
    pay: "₩9,900 결제하기",
    processing: "결제 진행 중…",
    poweredBy: "PortOne · KG이니시스 안전결제",
    comingSoonTitle: "결제 오픈을 준비하고 있어요",
    comingSoonBody: "사진함 패스 판매가 곧 시작됩니다.",
    loading: "불러오는 중…",
    testModeTitle: "심사용 테스트 결제",
    testModeDesc: "PG 상점 심사 기간의 테스트 결제입니다. 실제 청구되지 않으며 코드도 발급되지 않습니다.",
  },
  en: {
    back: "About the Photo Box Pass",
    title: "Buy a Photo Box Pass",
    subtitle: "The code is kept on your account after payment. Use it when you create a photo box or accept an invitation.",
    product: "Photo Box Pass ×1",
    priceNote: "VAT included",
    productDesc: "Capture pass for one photo box · 100 photos (any size) · certification, public links and certificates included · kept 5 years",
    consentTitle: "Please confirm before paying (required)",
    c1: "A Photo Box Pass works in one photo box only and cannot be used in another.",
    c2: "Once registered to a photo box (use started), remaining photos are not refundable — including when you leave or the photo box is deleted.",
    c3: "Unregistered codes are fully refundable within 7 days of purchase.",
    termsLink: "Terms of Service",
    refundLink: "Refund Policy",
    phoneLabel: "Mobile phone number",
    phonePlaceholder: "01012345678",
    phoneHint: "Required by the card payment window (digits only).",
    phoneInvalid: "Please check the phone number (Korean mobile, starts with 01).",
    keysMissing: "Payment configuration is not ready yet. Please try again later.",
    errorGeneric: "Could not start the payment. Please try again later.",
    pay: "Pay ₩9,900",
    processing: "Processing…",
    poweredBy: "Secured by PortOne · KG INICIS",
    comingSoonTitle: "Payments are being prepared",
    comingSoonBody: "Photo Box Pass sales are opening soon.",
    loading: "Loading…",
    testModeTitle: "Test payment (PG review)",
    testModeDesc: "Test payment during PG merchant review — you will not be charged and no code will be issued.",
  },
};

export default function PhotoboxCheckoutPage() {
  const params = useParams<{ locale: string }>();
  const locale = (params?.locale as string) || "ko";
  const t = T[locale === "en" ? "en" : "ko"];
  const router = useRouter();
  const { data: session, status } = useSession();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [phone, setPhone] = useState("");
  const [agree, setAgree] = useState([false, false, false]);

  useEffect(() => {
    if (status === "unauthenticated") router.replace(`/login?redirect=${encodeURIComponent("/pass/photobox/checkout")}`);
  }, [status, router]);

  const storeId = process.env.NEXT_PUBLIC_PORTONE_STORE_ID;
  const channelKey = process.env.NEXT_PUBLIC_PORTONE_CHANNEL_KEY_INICIS_ONETIME;
  const isTestMode =
    process.env.NEXT_PUBLIC_PORTONE_TEST_MODE === "true" || /test/i.test(channelKey ?? "") || /test/i.test(storeId ?? "");

  if (!channelKey) {
    return (
      <main className="min-h-screen flex items-center justify-center px-6 bg-slate-50">
        <div className="text-center">
          <Images size={40} className="mx-auto mb-4 text-slate-300" />
          <h1 className="text-lg font-bold mb-2">{t.comingSoonTitle}</h1>
          <p className="text-sm text-slate-500 mb-6">{t.comingSoonBody}</p>
          <Link href="/pass/photobox" className="text-sm text-blue-600 font-semibold hover:underline">{t.back} →</Link>
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

  let normalizedPhone = phone.replace(/[^0-9]/g, "");
  if (normalizedPhone.startsWith("0082")) normalizedPhone = "0" + normalizedPhone.slice(4);
  else if (normalizedPhone.startsWith("82") && normalizedPhone.length >= 11) normalizedPhone = "0" + normalizedPhone.slice(2);
  const phoneValid = /^01[0-9]{8,9}$/.test(normalizedPhone);
  const allAgreed = agree.every(Boolean);

  const handlePay = async () => {
    if (!storeId || !channelKey) return setError(t.keysMissing);
    if (!phoneValid) return setError(t.phoneInvalid);
    if (!allAgreed) return;
    setSubmitting(true);
    setError(null);
    try {
      const userId = (session?.user as any)?.id ?? "anon";
      const paymentId = `pb-${String(userId).slice(-8)}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const redirectUrl = `${window.location.origin}/${locale}/pass/photobox/success`;
      const response = await PortOne.requestPayment({
        storeId,
        channelKey,
        paymentId,
        orderName: ORDER_NAME,
        totalAmount: PRICE_KRW,
        currency: "KRW",
        payMethod: "CARD",
        customer: {
          fullName: session?.user?.name ?? undefined,
          email: session?.user?.email ?? undefined,
          phoneNumber: normalizedPhone,
        },
        // 서버 검증(소유권·상품 마커)용 — lib/photobox/purchase.ts가 대조(마커 필수)
        customData: { userId, product: "photobox_pass" },
        redirectUrl,
      });
      if (response?.code != null) {
        setSubmitting(false);
        setError(`${response.code}: ${response.message ?? ""}`);
        return;
      }
      window.location.href = `/${locale}/pass/photobox/success?paymentId=${encodeURIComponent(paymentId)}`;
    } catch (e: any) {
      setSubmitting(false);
      setError(e?.message ?? t.errorGeneric);
    }
  };

  const consents = [t.c1, t.c2, t.c3];
  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-6 py-12 bg-slate-50">
      <div className="w-full max-w-md">
        <Link href="/pass/photobox" className="inline-flex items-center gap-1 text-slate-500 hover:text-slate-900 text-sm mb-6">
          <ArrowLeft size={16} /> {t.back}
        </Link>
        <div className="bg-white border border-slate-200 rounded-3xl p-8 shadow-sm">
          <h1 className="text-xl font-bold mb-1">{t.title}</h1>
          <p className="text-sm text-slate-500 mb-6">{t.subtitle}</p>

          <div className="border border-slate-200 rounded-2xl p-5 mb-6 bg-slate-50/50">
            <div className="flex items-baseline justify-between mb-1">
              <span className="font-bold flex items-center gap-1.5">
                <Images size={15} className="text-blue-600" /> {t.product}
              </span>
              <span className="text-xl font-extrabold">₩{PRICE_KRW.toLocaleString()}</span>
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
            <label htmlFor="phone" className="block text-xs font-medium text-slate-600 mb-1.5">{t.phoneLabel}</label>
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

          {/* 청약철회 제한 사전 고지·동의 (전자상거래법 제17조 제6항) */}
          <div className="mb-4 px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-700 text-xs space-y-2">
            <p className="font-bold">{t.consentTitle}</p>
            {consents.map((c, i) => (
              <label key={i} className="flex items-start gap-2 leading-relaxed cursor-pointer">
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={agree[i]}
                  onChange={(e) => setAgree((a) => a.map((v, j) => (j === i ? e.target.checked : v)))}
                />
                <span>{c}</span>
              </label>
            ))}
            <p className="text-[11px] text-slate-500">
              <Link href="/terms#refund" className="underline hover:text-slate-900" target="_blank">{t.termsLink}</Link>
              {" · "}
              <Link href="/refund" className="underline hover:text-slate-900" target="_blank">{t.refundLink}</Link>
            </p>
          </div>

          {error && (
            <div className="mb-4 px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs">{error}</div>
          )}

          <button
            onClick={handlePay}
            disabled={submitting || !phoneValid || !allAgreed}
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
