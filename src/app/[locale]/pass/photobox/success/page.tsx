"use client";

// 사진함 패스 결제 완료 — 코드 수령 (A-108 4단계). PC 팝업·모바일 리다이렉트 모두 ?paymentId= 로 진입.
// 서버 complete가 멱등이라 새로고침해도 같은 코드가 다시 표시된다.
import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { Link } from "@/navigation";
import { Check, CheckCircle2, Copy, Images, Loader2, XCircle } from "lucide-react";

type Phase = "confirming" | "success" | "test" | "error";

const T = {
  ko: {
    confirmingTitle: "결제를 확인하고 있어요",
    confirmingDesc: "잠시만 기다려 주세요…",
    successTitle: "사진함 패스가 내 계정에 담겼어요!",
    successDesc: "부동산사진함을 개설하거나 초대를 수락할 때 이 패스로 참여 비용을 냅니다. 등록한 사진함에서 사진 100장을 찍을 수 있어요.",
    codeLabel: "사진함 패스 코드 (구매 계정 전용)",
    copy: "코드 복사",
    copied: "복사됨!",
    validUntil: "등록 유효기간",
    howTitle: "사용 방법",
    how1: "앱 제출 탭 → 사진함 → [+ 추가]에서 부동산사진함을 개설하거나 초대코드로 참여합니다.",
    how2: "결제 수단에서 [보유한 사진함 패스]를 고르면 이 패스가 사용됩니다. 코드를 직접 입력해도 됩니다.",
    how3: "등록하지 않은 코드는 구매 후 7일 이내 사진함 패스 페이지에서 환불할 수 있습니다.",
    myPasses: "내 사진함 패스 보기",
    errorTitle: "결제 확인에 실패했어요",
    errorDesc: "결제가 완료됐다면 반복 시도하지 마시고 hi@ori.pics로 문의해 주세요.",
    testTitle: "테스트 결제가 완료되었습니다",
    testDesc: "PG 상점 심사용 테스트 채널 결제입니다. 실제 청구는 없으며 코드는 발급되지 않습니다.",
    missingPayment: "결제 정보가 없어요. 결제 후 이동한 링크가 맞는지 확인해 주세요.",
    goHome: "홈으로",
  },
  en: {
    confirmingTitle: "Confirming your payment",
    confirmingDesc: "One moment…",
    successTitle: "Your Photo Box Pass is on your account!",
    successDesc: "Use it to pay the participation cost when you create a real-estate photo box or accept an invitation. You can take 100 photos in the photo box you register it to.",
    codeLabel: "Photo Box Pass code (purchasing account only)",
    copy: "Copy code",
    copied: "Copied!",
    validUntil: "Register by",
    howTitle: "How to use",
    how1: "In the app: Submit tab → Photo Boxes → [+ Add] to create a real-estate photo box or join with an invite code.",
    how2: "Choose [My Photo Box Pass] as the payment method, or enter the code directly.",
    how3: "Unregistered codes can be refunded within 7 days of purchase on the Photo Box Pass page.",
    myPasses: "View my Photo Box Passes",
    errorTitle: "We couldn't confirm your payment",
    errorDesc: "If you were charged, please don't retry — contact hi@ori.pics.",
    testTitle: "Test payment completed",
    testDesc: "This was a test-channel payment for PG merchant review. You were not charged and no code is issued.",
    missingPayment: "Payment information is missing. Please check the link you returned from.",
    goHome: "Home",
  },
};

export default function PhotoboxSuccessPage() {
  const params = useParams<{ locale: string }>();
  const locale = (params?.locale as string) || "ko";
  const t = T[locale === "en" ? "en" : "ko"];
  const searchParams = useSearchParams();
  const [phase, setPhase] = useState<Phase>("confirming");
  const [code, setCode] = useState<string | null>(null);
  const [validUntil, setValidUntil] = useState<string | null>(null);
  const [errorDetail, setErrorDetail] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const failCode = searchParams?.get("code");
    if (failCode) {
      setPhase("error");
      setErrorDetail(`${failCode}${searchParams?.get("message") ? `: ${searchParams.get("message")}` : ""}`);
      return;
    }
    const paymentId = searchParams?.get("paymentId");
    if (!paymentId) {
      setPhase("error");
      setErrorDetail(t.missingPayment);
      return;
    }
    (async () => {
      try {
        const res = await fetch("/api/photobox/purchase/complete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ paymentId }),
        });
        const payload = await res.json().catch(() => ({}));
        if (!res.ok) {
          setPhase("error");
          setErrorDetail(payload?.detail ?? `HTTP ${res.status}`);
          return;
        }
        if (payload?.test_channel) return setPhase("test");
        setCode(payload?.code ?? null);
        setValidUntil(payload?.code_expires_at ?? null);
        setPhase("success");
      } catch (e: any) {
        setPhase("error");
        setErrorDetail(e?.message ?? "network_error");
      }
    })();
  }, [searchParams, t.missingPayment]);

  return (
    <main className="min-h-screen flex items-center justify-center px-6 py-12 bg-slate-50">
      <div className="w-full max-w-md bg-white border border-slate-200 rounded-3xl p-8 shadow-sm text-center">
        {phase === "confirming" && (
          <>
            <Loader2 size={36} className="mx-auto mb-4 animate-spin text-blue-600" />
            <h1 className="text-lg font-bold mb-1">{t.confirmingTitle}</h1>
            <p className="text-sm text-slate-500">{t.confirmingDesc}</p>
          </>
        )}
        {phase === "success" && code && (
          <>
            <CheckCircle2 size={40} className="mx-auto mb-4 text-emerald-500" />
            <h1 className="text-lg font-bold mb-2">{t.successTitle}</h1>
            <p className="text-sm text-slate-500 mb-6">{t.successDesc}</p>
            <div className="border border-slate-200 rounded-2xl p-4 mb-4 bg-slate-50/60">
              <p className="text-xs text-slate-500 mb-1 flex items-center justify-center gap-1">
                <Images size={13} className="text-blue-600" /> {t.codeLabel}
              </p>
              <p className="font-mono text-lg font-bold tracking-wider select-all">{code}</p>
              {validUntil && (
                <p className="text-[11px] text-slate-400 mt-1">
                  {t.validUntil}: {new Date(validUntil).toLocaleDateString(locale === "en" ? "en-US" : "ko-KR")}
                </p>
              )}
              <button
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(code);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1500);
                  } catch {
                    /* 복사 실패는 무시 — 코드는 화면에 선택 가능 */
                  }
                }}
                className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:underline"
              >
                {copied ? <Check size={13} /> : <Copy size={13} />} {copied ? t.copied : t.copy}
              </button>
            </div>
            <div className="text-left text-xs text-slate-600 space-y-1.5 mb-6">
              <p className="font-bold">{t.howTitle}</p>
              <p>1. {t.how1}</p>
              <p>2. {t.how2}</p>
              <p>3. {t.how3}</p>
            </div>
            <Link href="/pass/photobox" className="text-sm text-blue-600 font-semibold hover:underline">{t.myPasses} →</Link>
          </>
        )}
        {phase === "test" && (
          <>
            <CheckCircle2 size={40} className="mx-auto mb-4 text-amber-500" />
            <h1 className="text-lg font-bold mb-2">{t.testTitle}</h1>
            <p className="text-sm text-slate-500 mb-6">{t.testDesc}</p>
            <Link href="/" className="text-sm text-blue-600 font-semibold hover:underline">{t.goHome}</Link>
          </>
        )}
        {phase === "error" && (
          <>
            <XCircle size={40} className="mx-auto mb-4 text-red-500" />
            <h1 className="text-lg font-bold mb-2">{t.errorTitle}</h1>
            <p className="text-sm text-slate-500 mb-2">{t.errorDesc}</p>
            {errorDetail && <p className="text-[11px] text-slate-400 mb-6 break-all">{errorDetail}</p>}
            <Link href="/pass/photobox" className="text-sm text-blue-600 font-semibold hover:underline">{t.myPasses}</Link>
          </>
        )}
      </div>
    </main>
  );
}
