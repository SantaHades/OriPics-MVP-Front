"use client";

// 원데이 패스 코드 랜딩 (A-60 Phase 3) — 코드 링크의 목적지. 2026-09-01 A안 변형:
// 판매분은 구매 계정 전용(선물 프레이밍 제거 — 상품권 분류 회피). 어드민 발급분(베타
// 테스터 배포)은 종전대로 누구나 등록 가능해 이 페이지가 계속 쓰인다.
// 코드 유효성은 여기서 검증하지 않는다(공개 검증 API를 만들면 코드 열람 채널이 됨) —
// 등록 시점에 서버가 판정. QR은 이 페이지 URL을 담아 앱 스캐너(코드 패턴 추출)와 호환.
import { Link } from "@/navigation";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { ArrowLeft, Check, Copy, Smartphone, Ticket } from "lucide-react";

/** 서버 normalizePassCode와 동일한 관용 파싱 — 표시용 포맷만 (검증은 서버) */
function formatCode(raw: string): string | null {
  const body = decodeURIComponent(raw).toUpperCase().replace(/[^0-9A-Z]/g, "").replace(/^OP/, "");
  if (body.length !== 12) return null;
  return `OP-${body.slice(0, 4)}-${body.slice(4, 8)}-${body.slice(8, 12)}`;
}

export default function PassCodeLanding() {
  const params = useParams();
  const ko = ((params?.locale as string) || "ko") !== "en";
  const code = formatCode((params?.code as string) || "");
  const [qr, setQr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!code || typeof window === "undefined") return;
    QRCode.toDataURL(window.location.href, { margin: 1, width: 320 })
      .then(setQr)
      .catch(() => {});
  }, [code]);

  const copyCode = async () => {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // 클립보드 미지원 — 코드가 화면에 있으므로 수동 복사 가능
    }
  };

  if (!code) {
    return (
      <div className="min-h-screen bg-slate-50 text-slate-900 flex items-center justify-center px-6">
        <div className="text-center">
          <p className="text-lg font-bold mb-2">{ko ? "코드 형식이 올바르지 않아요" : "Invalid code format"}</p>
          <p className="text-sm text-slate-500 mb-6">
            {ko ? "링크가 잘렸는지 확인하고 다시 열어주세요." : "The link may be truncated — please check and try again."}
          </p>
          <Link href="/pass" className="text-sm text-blue-600 font-semibold hover:underline">
            {ko ? "원데이 패스 알아보기 →" : "About One-Day Pass →"}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <div className="max-w-xl mx-auto px-6 py-12">
        <Link href="/" className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-900 transition-colors mb-10">
          <ArrowLeft size={16} /> OriPics
        </Link>

        <div className="text-center mb-8">
          <p className="text-4xl mb-3">🎟️</p>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight mb-2">
            {ko ? "원데이 패스 시작하기" : "Start your One-Day Pass"}
          </h1>
          <p className="text-sm text-slate-600 leading-relaxed">
            {ko
              ? "등록하면 24시간 동안 촬영 인증 10회 — 찍기만 하면 공개링크·인증서까지 자동으로 만들어집니다."
              : "Redeem for 24 hours of 10 capture proofs — every shot gets a public link and certificate automatically."}
          </p>
        </div>

        {/* 코드 카드 */}
        <div className="p-6 rounded-3xl bg-white border border-slate-200 shadow-sm text-center mb-6">
          <p className="text-xs text-slate-500 mb-2 flex items-center justify-center gap-1">
            <Ticket size={13} className="text-blue-600" /> {ko ? "패스 코드" : "Pass code"}
          </p>
          <p className="font-mono text-xl font-extrabold tracking-wider mb-4">{code}</p>
          <button
            type="button"
            onClick={copyCode}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-slate-300 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
          >
            {copied ? <Check size={15} className="text-emerald-600" /> : <Copy size={15} />}
            {copied ? (ko ? "복사됨!" : "Copied!") : ko ? "코드 복사" : "Copy code"}
          </button>
        </div>

        {/* 등록 방법 */}
        <div className="p-6 rounded-3xl bg-white border border-slate-200 shadow-sm mb-6">
          <h2 className="text-sm font-bold mb-4">{ko ? "등록 방법" : "How to redeem"}</h2>
          <div className="space-y-4 text-sm text-slate-700">
            <div className="flex gap-3">
              <Smartphone size={18} className="shrink-0 text-blue-600 mt-0.5" />
              <p className="leading-relaxed">
                {ko
                  ? "OriPics 앱 → 설정 탭 → [원데이 패스 등록하기] → 코드 입력 또는 QR 스캔"
                  : "OriPics app → Settings tab → [Redeem a One-Day Pass] → enter the code or scan the QR"}
              </p>
            </div>
            <div className="flex gap-3">
              <Ticket size={18} className="shrink-0 text-blue-600 mt-0.5" />
              <p className="leading-relaxed">
                {ko ? "또는 웹에서 로그인 후 프로필에서 등록:" : "Or sign in on the web and redeem in your profile:"}{" "}
                <Link
                  href={`/profile?pass_code=${encodeURIComponent(code)}#pass`}
                  className="text-blue-600 font-semibold hover:underline"
                >
                  {ko ? "웹에서 등록하기 →" : "Redeem on web →"}
                </Link>
              </p>
            </div>
          </div>
        </div>

        {/* QR (앱 스캔용) */}
        {qr && (
          <div className="p-6 rounded-3xl bg-white border border-slate-200 shadow-sm text-center mb-6">
            <p className="text-xs text-slate-500 mb-3">
              {ko ? "앱 등록 화면의 [QR 스캔]으로 이 코드를 바로 읽을 수 있어요" : "Scan this with [Scan QR] on the app's redeem screen"}
            </p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qr} alt="Pass QR" className="mx-auto w-40 h-40 rounded-xl border border-slate-100" />
          </div>
        )}

        {/* 핵심 주의 */}
        <div className="p-4 rounded-2xl border border-amber-300 bg-amber-50 text-xs text-amber-900 leading-relaxed mb-10">
          {ko
            ? "⚠️ 등록(사용 시작)한 순간부터 24시간이 시작됩니다 — 사진 찍을 일이 있는 날 등록하세요. 사용 시작 후에는 환불이 불가하며, 구매한 패스는 구매 계정에서만 등록할 수 있습니다."
            : "⚠️ The 24-hour window starts the moment you redeem — save it for the day you need it. Non-refundable once started; purchased passes can only be redeemed by the purchasing account."}
        </div>

        <p className="text-center">
          <Link href="/pass" className="text-sm text-slate-500 hover:text-slate-900 transition-colors">
            {ko ? "원데이 패스가 뭔가요? →" : "What is a One-Day Pass? →"}
          </Link>
        </p>
      </div>
    </div>
  );
}
