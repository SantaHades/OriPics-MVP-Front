"use client";

// 원데이 패스 결제 완료 — 코드 수령 화면 (A-60 Phase 3, 2026-09-01).
// checkout(PC 팝업)·PortOne 리다이렉트(모바일) 양 경로가 ?paymentId= 로 진입.
// 서버 complete가 멱등이라 새로고침해도 같은 코드가 다시 표시된다.
import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { Link } from "@/navigation";
import QRCode from "qrcode";
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  Copy,
  Gift,
  Loader2,
  Ticket,
  XCircle,
} from "lucide-react";

type Phase = "confirming" | "success" | "error";

const T = {
  ko: {
    confirmingTitle: "결제를 확인하고 있어요",
    confirmingDesc: "잠시만 기다려 주세요…",
    successTitle: "원데이 패스가 발급됐어요!",
    successDesc: "아래 코드를 등록하는 순간부터 24시간 · 촬영 인증 10회가 시작됩니다.",
    codeLabel: "패스 코드",
    copyCode: "코드 복사",
    copied: "복사됨!",
    codeValidUntil: "코드 등록 유효기간",
    redeemNow: "지금 내 계정에 등록하기",
    redeemLater: "찍을 일이 있는 날 등록하세요 — 등록 전에는 시간이 흐르지 않아요.",
    giftTitle: "선물하기",
    giftDesc: "이 링크를 전달하면 받는 분이 직접 등록할 수 있어요 (카톡·문자 등).",
    copyGiftLink: "선물 링크 복사",
    qrHint: "앱 등록 화면의 [QR 스캔]으로 바로 읽을 수 있어요",
    keepSafe: "⚠️ 코드를 아는 사람은 누구나 등록할 수 있어요 — 링크와 코드를 소중히 보관하세요. 이 화면을 벗어나도 프로필의 최근 내역에서 코드를 다시 볼 수 있습니다.",
    errorTitle: "결제 확인에 실패했어요",
    errorDesc: "결제가 완료됐다면 반복 시도하지 마시고 hi@ori.pics로 문의해 주세요.",
    retry: "다시 시도하기",
    goHome: "홈으로",
    missingPayment: "결제 정보가 없어요. 결제 후 이동한 링크가 맞는지 확인해 주세요.",
  },
  en: {
    confirmingTitle: "Confirming your payment",
    confirmingDesc: "One moment…",
    successTitle: "Your One-Day Pass is ready!",
    successDesc: "The 24-hour window and 10 capture proofs start the moment the code below is redeemed.",
    codeLabel: "Pass code",
    copyCode: "Copy code",
    copied: "Copied!",
    codeValidUntil: "Code valid until",
    redeemNow: "Redeem on my account now",
    redeemLater: "Save it for the day you need it — the clock doesn't start until redemption.",
    giftTitle: "Gift it",
    giftDesc: "Share this link and the recipient can redeem it themselves.",
    copyGiftLink: "Copy gift link",
    qrHint: "Scan with [Scan QR] on the app's redeem screen",
    keepSafe: "⚠️ Anyone with the code can redeem it — keep the link and code safe. You can find the code again under your profile's recent activity.",
    errorTitle: "Payment confirmation failed",
    errorDesc: "If you were charged, please don't retry repeatedly — contact hi@ori.pics.",
    retry: "Try again",
    goHome: "Home",
    missingPayment: "No payment information found. Please check the link you were redirected to.",
  },
};

export default function PassSuccessPage() {
  const params = useParams();
  const locale = (params?.locale as string) || "ko";
  const t = T[locale === "en" ? "en" : "ko"];
  const searchParams = useSearchParams();

  const [phase, setPhase] = useState<Phase>("confirming");
  const [passCode, setPassCode] = useState<string | null>(null);
  const [validUntil, setValidUntil] = useState<string | null>(null);
  const [errorDetail, setErrorDetail] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  const giftPath = passCode ? `/${locale}/pass/${encodeURIComponent(passCode)}` : null;
  const giftUrl =
    giftPath && typeof window !== "undefined" ? `${window.location.origin}${giftPath}` : null;

  useEffect(() => {
    const paymentId = searchParams?.get("paymentId");
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
      setErrorDetail(t.missingPayment);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/pass/purchase/complete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ paymentId }),
        });
        if (cancelled) return;
        const payload = await res.json().catch(() => ({}));
        if (!res.ok) {
          setPhase("error");
          setErrorDetail(payload?.detail ?? `HTTP ${res.status}`);
          return;
        }
        setPassCode(payload?.code ?? null);
        setValidUntil(payload?.code_expires_at ?? null);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  useEffect(() => {
    if (!giftUrl) return;
    QRCode.toDataURL(giftUrl, { margin: 1, width: 320 })
      .then(setQr)
      .catch(() => {});
  }, [giftUrl]);

  const copy = async (text: string, mark: (v: boolean) => void) => {
    try {
      await navigator.clipboard.writeText(text);
      mark(true);
      setTimeout(() => mark(false), 2000);
    } catch {
      // 클립보드 미지원 — 값이 화면에 있으므로 수동 복사 가능
    }
  };

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <div className="max-w-xl mx-auto px-6 py-12">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-900 transition-colors mb-10"
        >
          <ArrowLeft size={16} /> OriPics
        </Link>

        {phase === "confirming" && (
          <div className="bg-white border border-slate-200 rounded-3xl p-8 shadow-sm text-center">
            <Loader2 size={48} className="text-blue-500 animate-spin mx-auto mb-4" />
            <h1 className="text-lg font-bold mb-1">{t.confirmingTitle}</h1>
            <p className="text-sm text-slate-500">{t.confirmingDesc}</p>
          </div>
        )}

        {phase === "success" && passCode && (
          <>
            <div className="text-center mb-8">
              <CheckCircle2 size={56} className="text-emerald-500 mx-auto mb-4" />
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight mb-2">{t.successTitle}</h1>
              <p className="text-sm text-slate-600 leading-relaxed">{t.successDesc}</p>
            </div>

            {/* 코드 카드 */}
            <div className="p-6 rounded-3xl bg-white border border-slate-200 shadow-sm text-center mb-6">
              <p className="text-xs text-slate-500 mb-2 flex items-center justify-center gap-1">
                <Ticket size={13} className="text-blue-600" /> {t.codeLabel}
              </p>
              <p className="font-mono text-xl font-extrabold tracking-wider mb-4">{passCode}</p>
              <button
                type="button"
                onClick={() => copy(passCode, setCopiedCode)}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-slate-300 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
              >
                {copiedCode ? <Check size={15} className="text-emerald-600" /> : <Copy size={15} />}
                {copiedCode ? t.copied : t.copyCode}
              </button>
              {validUntil && (
                <p className="text-[11px] text-slate-400 mt-3">
                  {t.codeValidUntil}: {new Date(validUntil).toLocaleDateString(locale === "en" ? "en-US" : "ko-KR")}
                </p>
              )}
            </div>

            {/* 등록 CTA */}
            <div className="p-6 rounded-3xl bg-blue-50 border border-blue-200 mb-6 text-center">
              <Link
                href={`/profile?pass_code=${encodeURIComponent(passCode)}#pass`}
                className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold transition-colors"
              >
                <Ticket size={15} /> {t.redeemNow}
              </Link>
              <p className="text-xs text-slate-600 mt-3">{t.redeemLater}</p>
            </div>

            {/* 선물 링크 + QR */}
            <div className="p-6 rounded-3xl bg-white border border-slate-200 shadow-sm text-center mb-6">
              <h2 className="text-sm font-bold mb-1 flex items-center justify-center gap-1.5">
                <Gift size={15} className="text-blue-600" /> {t.giftTitle}
              </h2>
              <p className="text-xs text-slate-500 mb-4">{t.giftDesc}</p>
              {giftUrl && (
                <>
                  <p className="font-mono text-[11px] text-slate-500 break-all mb-3">{giftUrl}</p>
                  <button
                    type="button"
                    onClick={() => copy(giftUrl, setCopiedLink)}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-slate-300 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors mb-4"
                  >
                    {copiedLink ? <Check size={15} className="text-emerald-600" /> : <Copy size={15} />}
                    {copiedLink ? t.copied : t.copyGiftLink}
                  </button>
                </>
              )}
              {qr && (
                <div>
                  <p className="text-[11px] text-slate-400 mb-2">{t.qrHint}</p>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={qr} alt="Pass QR" className="mx-auto w-36 h-36 rounded-xl border border-slate-100" />
                </div>
              )}
            </div>

            <div className="p-4 rounded-2xl border border-amber-300 bg-amber-50 text-xs text-amber-900 leading-relaxed">
              {t.keepSafe}
            </div>
          </>
        )}

        {phase === "error" && (
          <div className="bg-white border border-slate-200 rounded-3xl p-8 shadow-sm text-center">
            <XCircle size={56} className="text-red-500 mx-auto mb-4" />
            <h1 className="text-xl font-bold mb-1">{t.errorTitle}</h1>
            <p className="text-sm text-slate-600 mb-2">{t.errorDesc}</p>
            {errorDetail && <p className="text-xs text-slate-400 mb-6 break-words">[{errorDetail}]</p>}
            <div className="flex flex-col gap-2 mt-4">
              <Link
                href="/pass/checkout"
                className="w-full py-3 rounded-xl bg-slate-900 text-white font-bold hover:bg-slate-800 transition-colors"
              >
                {t.retry}
              </Link>
              <Link
                href="/"
                className="w-full py-3 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 transition-colors"
              >
                {t.goHome}
              </Link>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
