"use client";

// 베타 테스터 모집 버튼 + 팝업 (2026-08-31 대표 지시) — 홈 네비 좌측(로고 옆).
// 신청 이메일은 /api/beta/apply가 hi@ori.pics로 전달 → 대표가 Google 테스터 목록에
// 수동 등록. Android 참여 링크는 등록된 구글 계정만 접속 가능하므로 그 안내를 병기.
import { useState } from "react";
import { useParams } from "next/navigation";
import { X, RefreshCw, CheckCircle, Apple, Smartphone, MessageCircle } from "lucide-react";
import { IOS_APP_URL, ANDROID_STORE_URL } from "@/lib/appLinks";

const TESTFLIGHT_APP_URL = "https://apps.apple.com/app/testflight/id899247664";
const KAKAO_OPENCHAT_URL = "https://open.kakao.com/o/gwyKJqKi";

const T = {
  ko: {
    trigger: "베타테스트가 진행중입니다…",
    title: "베타테스터를 모집합니다.",
    emailLabel: "이메일주소",
    emailPlaceholder: "you@example.com",
    emailHint: "Android는 Google 계정(Gmail), iPhone은 자주 쓰는 이메일을 적어주세요.",
    submit: "신청하기",
    submitting: "신청 중…",
    done: "신청이 접수되었어요! 테스터 목록 등록 후 아래 링크로 참여하실 수 있어요.",
    errInvalid: "이메일 형식을 확인해 주세요.",
    errRate: "신청이 너무 잦습니다. 잠시 후 다시 시도해 주세요.",
    errGeneric: "접수에 실패했어요. 잠시 후 다시 시도하거나 hi@ori.pics로 메일 주세요.",
    iosTitle: "아이폰 사용자",
    iosStep1: "① TestFlight 앱 설치",
    iosStep2: "② OriPics 설치 (TestFlight에서 열기)",
    androidTitle: "안드로이드 사용자",
    androidLink: "테스트 참여 링크 열기",
    androidNote: "신청하신 Google 계정이 테스터 목록에 등록된 뒤에 접속할 수 있어요 (등록까지 최대 하루).",
    ask: "🙏 부탁드려요 — 2주간 앱을 지우지 말고, 가끔씩 사진을 찍고 인증해 주세요. 여러분의 2주가 정식 출시의 필수 조건이에요!",
    kakao: "테스터 단톡방 참여하기",
    close: "닫기",
  },
  en: {
    trigger: "Beta test in progress…",
    title: "We're recruiting beta testers.",
    emailLabel: "Email address",
    emailPlaceholder: "you@example.com",
    emailHint: "For Android, use your Google account (Gmail); for iPhone, any email you check often.",
    submit: "Apply",
    submitting: "Applying…",
    done: "Application received! Once you're added to the tester list, join via the links below.",
    errInvalid: "Please check the email format.",
    errRate: "Too many attempts. Please try again later.",
    errGeneric: "Failed to submit. Try again later or email hi@ori.pics.",
    iosTitle: "iPhone users",
    iosStep1: "① Install the TestFlight app",
    iosStep2: "② Install OriPics (opens in TestFlight)",
    androidTitle: "Android users",
    androidLink: "Open the test opt-in link",
    androidNote: "The link works after your Google account is added to the tester list (up to a day).",
    ask: "🙏 One favor — keep the app installed for 2 weeks and take & certify photos now and then. Your two weeks are a launch requirement!",
    kakao: "Join the tester group chat",
    close: "Close",
  },
};

export default function BetaRecruit({ variant = "nav" }: { variant?: "nav" | "hero" }) {
  const params = useParams();
  const t = T[(((params?.locale as string) || "ko") === "en" ? "en" : "ko")];

  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const apply = async () => {
    const trimmed = email.trim();
    if (busy || !trimmed) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(trimmed)) {
      setError(t.errInvalid);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/beta/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: trimmed }),
      });
      if (res.status === 429) {
        setError(t.errRate);
        return;
      }
      if (!res.ok) {
        setError(t.errGeneric);
        return;
      }
      setDone(true);
    } catch {
      setError(t.errGeneric);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation(); // 로고 그룹의 scrollTo(0,0) 클릭과 분리
          setOpen(true);
        }}
        // nav=데스크톱(xs+) 전용, hero=모바일 전용(히어로 문구 위 좌측 — 2026-08-31 대표)
        className={`${variant === "nav" ? "hidden xs:inline-flex" : "inline-flex xs:hidden"} items-center px-2.5 py-1 rounded-full bg-amber-100 text-amber-800 text-[10px] sm:text-xs font-semibold border border-amber-200 hover:bg-amber-200 transition-colors whitespace-nowrap`}
      >
        {t.trigger}
      </button>

      {open && (
        // items-center는 카드가 창보다 길면 상단이 화면 밖으로 잘림(데스크톱 실측 8/31) —
        // 상단 여백 고정 + 백드롭 스크롤로 어떤 창 높이에서도 전체 내용 접근 보장
        <div className="fixed inset-0 z-[60] overflow-y-auto bg-black/40 px-4" onClick={() => setOpen(false)}>
          <div
            className="bg-white rounded-2xl p-6 max-w-md w-full shadow-xl text-left mx-auto mt-20 mb-10"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between mb-4">
              <h3 className="text-xl font-bold text-slate-900">{t.title}</h3>
              <button type="button" onClick={() => setOpen(false)} aria-label={t.close} className="text-slate-400 hover:text-slate-700 transition-colors">
                <X size={20} />
              </button>
            </div>

            {/* 신청 폼 */}
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">{t.emailLabel}</label>
            {done ? (
              <div className="flex items-start gap-2 p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-sm text-emerald-800 mb-2">
                <CheckCircle size={16} className="shrink-0 mt-0.5" /> {t.done}
              </div>
            ) : (
              <>
                <div className="flex gap-2">
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => { setEmail(e.target.value); setError(null); }}
                    onKeyDown={(e) => { if (e.key === "Enter") apply(); }}
                    placeholder={t.emailPlaceholder}
                    autoComplete="email"
                    className="flex-1 min-w-0 bg-slate-100 border border-slate-100 rounded-xl py-2.5 px-4 text-sm outline-none focus:border-blue-300"
                  />
                  <button
                    type="button"
                    onClick={apply}
                    disabled={busy || !email.trim()}
                    className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold transition-colors disabled:opacity-60 whitespace-nowrap"
                  >
                    {busy ? <RefreshCw size={15} className="animate-spin" /> : t.submit}
                  </button>
                </div>
                <p className="text-[11px] text-slate-400 mt-1.5">{t.emailHint}</p>
                {error && <p className="text-xs text-red-600 mt-1.5">{error}</p>}
              </>
            )}

            {/* 설치 링크 */}
            <div className="mt-5 space-y-4">
              <div>
                <p className="text-xs font-bold text-slate-700 mb-2 flex items-center gap-1.5">
                  <Apple size={14} /> {t.iosTitle}
                </p>
                <div className="space-y-1.5">
                  <a href={TESTFLIGHT_APP_URL} target="_blank" rel="noopener noreferrer" className="block text-sm text-blue-600 font-medium hover:underline">
                    {t.iosStep1} →
                  </a>
                  <a href={IOS_APP_URL} target="_blank" rel="noopener noreferrer" className="block text-sm text-blue-600 font-medium hover:underline">
                    {t.iosStep2} →
                  </a>
                </div>
              </div>
              <div>
                <p className="text-xs font-bold text-slate-700 mb-2 flex items-center gap-1.5">
                  <Smartphone size={14} /> {t.androidTitle}
                </p>
                <a href={ANDROID_STORE_URL} target="_blank" rel="noopener noreferrer" className="block text-sm text-blue-600 font-medium hover:underline">
                  {t.androidLink} →
                </a>
                <p className="text-[11px] text-slate-400 mt-1">{t.androidNote}</p>
              </div>
            </div>

            {/* 2주 부탁 + 단톡방 */}
            <div className="mt-5 p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 leading-relaxed">
              {t.ask}
            </div>
            <a
              href={KAKAO_OPENCHAT_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 flex items-center justify-center gap-1.5 w-full py-2.5 rounded-xl bg-[#FEE500] text-slate-900 text-sm font-bold hover:brightness-95 transition-all"
            >
              <MessageCircle size={15} /> {t.kakao}
            </a>
          </div>
        </div>
      )}
    </>
  );
}
