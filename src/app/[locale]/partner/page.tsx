"use client";

// 파트너 릴레이 챌린지 랜딩 (A-82 §4.1) — /{locale}/partner
// 혜택·방법·잔여 카운터·유의사항. 로그인 시 [내 파트너코드 보기], 비로그인 시 [코드 입력하고 가입].
// (2026-09-11 A-94 ③) 잔여 좌석(500 − 참여 파트너)·종료일을 큰 숫자 카드로 강조 + 마스킹 리더보드(유효 초대 상위 10, 손*석).
import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/navigation";
import { ArrowLeft, Gift, Users, Ticket, CheckCircle2, Trophy } from "lucide-react";
import { PARTNER, validityDeadline } from "@/lib/partner/config";

interface LeaderboardEntry {
  rank: number;
  nameMasked: string;
  validCount: number;
  totalCount: number;
}

interface Stats {
  cap: number;
  partnersJoined: number;
  remaining: number;
  /** (A-94) 잔여 좌석 = remaining 동일 값 */
  remainingSeats?: number;
  /** (A-94) 마스킹 리더보드 top 10 — 서버 5분 캐시 */
  leaderboard?: LeaderboardEntry[];
  campaignEnd: string;
  campaignEnded: boolean;
  discountAmount: number;
  milestoneCount: number;
  milestoneFreeMonths: number;
  benefitValidMonths: number;
}

export default function PartnerLandingPage() {
  const t = useTranslations("Partner.landing");
  const locale = useLocale();
  const { status } = useSession();
  const [stats, setStats] = useState<Stats | null>(null);
  // 통계 실패 시 "…" 무한 대기 대신 "—" + 다시 시도 (A-92 ⑧)
  const [statsFailed, setStatsFailed] = useState(false);

  const loadStats = useCallback(() => {
    setStatsFailed(false);
    fetch("/api/partner/stats", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => (d ? setStats(d) : setStatsFailed(true)))
      .catch(() => setStatsFailed(true));
  }, []);
  useEffect(() => {
    loadStats();
  }, [loadStats]);

  const dateLocale = locale === "en" ? "en-US" : "ko-KR";
  const fmtWon = (n: number) => new Intl.NumberFormat(dateLocale).format(n);
  const fmtDate = (d: Date) => d.toLocaleDateString(dateLocale, { year: "numeric", month: "long", day: "numeric" });
  // 상수는 config.ts(PARTNER)에서 — 서버 stats 도착 전·실패 시 폴백. 하드코딩 숫자 제거 (A-92 ⑥)
  const endDate = stats ? new Date(stats.campaignEnd) : PARTNER.CAMPAIGN_END;
  const end = fmtDate(endDate);
  /** 유효 초대(첫 인증) 인정 기한 = 종료 + VALIDITY_GRACE_DAYS (validityDeadline) */
  const deadline = fmtDate(stats ? new Date(endDate.getTime() + PARTNER.VALIDITY_GRACE_DAYS * 86_400_000) : validityDeadline());
  const discount = stats?.discountAmount ?? PARTNER.DISCOUNT_AMOUNT;
  const months = stats?.milestoneFreeMonths ?? PARTNER.MILESTONE_FREE_MONTHS;
  const goal = stats?.milestoneCount ?? PARTNER.MILESTONE_COUNT;
  const cap = stats?.cap ?? PARTNER.CAP;
  const months24 = stats?.benefitValidMonths ?? PARTNER.BENEFIT_VALID_MONTHS;
  // (2026-09-11 A-94 ③) 잔여 좌석·남은 일수·리더보드
  const remainingSeats = stats ? (stats.remainingSeats ?? stats.remaining) : null;
  const ended = stats?.campaignEnded ?? Date.now() > endDate.getTime();
  const daysLeft = Math.max(0, Math.ceil((endDate.getTime() - Date.now()) / 86_400_000));
  const leaderboard = stats?.leaderboard ?? [];

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <div className="max-w-3xl mx-auto px-6 py-12">
        <Link href="/" className="inline-flex items-center gap-1 text-slate-500 hover:text-slate-900 text-sm mb-8">
          <ArrowLeft size={16} /> {t("back")}
        </Link>

        <section className="rounded-3xl bg-white border border-slate-200 p-8 sm:p-10 shadow-sm">
          <p className="text-xs font-bold text-blue-600 uppercase tracking-[0.2em] mb-3">{t("eyebrow")}</p>
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight mb-4">{t("headline")}</h1>
          <p className="text-base text-slate-700 mb-2">{t("sub1", { amount: fmtWon(discount) })}</p>
          <p className="text-base text-slate-700 mb-6">{t("sub2", { goal, months, value: fmtWon(discount * 2 * months) })}</p>

          {/* (2026-09-11 A-94 ③) 잔여 좌석·종료일 강조 카드 */}
          <div className="grid sm:grid-cols-2 gap-3 mb-6">
            <div
              className={`rounded-2xl border p-4 ${ended || remainingSeats === 0 ? "bg-slate-100 border-slate-200" : "bg-blue-50 border-blue-100"}`}
              role="status"
              aria-busy={!stats && !statsFailed ? true : undefined}
            >
              <p className="text-xs font-semibold text-blue-700">{t("seats_label")}</p>
              <p className="text-3xl sm:text-4xl font-extrabold tabular-nums leading-tight mt-1">
                {ended ? t("ended") : remainingSeats === 0 ? t("seats_full") : t("seats_value", { remaining: remainingSeats ?? (statsFailed ? "—" : "…") })}
              </p>
              <p className="text-xs text-slate-600 mt-1">
                {t("seats_of", { cap })}
                {statsFailed ? (
                  <>
                    {" · "}{t("stats_failed")}{" "}
                    <button type="button" onClick={loadStats} className="underline text-blue-700 hover:text-blue-900">{t("retry")}</button>
                  </>
                ) : null}
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-semibold text-slate-600">{t("end_label")}</p>
              <p className="text-xl sm:text-2xl font-extrabold leading-tight mt-1">{end}</p>
              <p className="text-xs text-slate-600 mt-1">{ended ? t("ended") : t("days_left", { days: daysLeft })}</p>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-3">
            {status === "authenticated" ? (
              <Link href="/profile#partner" className="flex-1 py-3.5 text-center rounded-xl bg-blue-600 text-white font-bold hover:bg-blue-700">
                {t("cta_my_code")}
              </Link>
            ) : (
              <>
                <Link href="/signup" className="flex-1 py-3.5 text-center rounded-xl bg-blue-600 text-white font-bold hover:bg-blue-700">
                  {t("cta_signup")}
                </Link>
                <Link href="/login" className="flex-1 py-3.5 text-center rounded-xl border border-slate-200 text-slate-700 font-bold hover:bg-slate-50">
                  {t("cta_login")}
                </Link>
              </>
            )}
          </div>
        </section>

        <section className="mt-10">
          <h2 className="text-xl font-bold mb-5">{t("how_title")}</h2>
          <ol className="grid sm:grid-cols-3 gap-4">
            {[
              { icon: <Ticket className="text-blue-600" size={22} />, title: t("step1_t"), body: t("step1_b", { amount: fmtWon(discount) }) },
              { icon: <Users className="text-blue-600" size={22} />, title: t("step2_t"), body: t("step2_b", { amount: fmtWon(discount) }) },
              { icon: <Gift className="text-blue-600" size={22} />, title: t("step3_t", { goal, months }), body: t("step3_b", { goal, months }) },
            ].map((s, i) => (
              <li key={i} className="rounded-2xl bg-white border border-slate-200 p-5">
                <div className="mb-2">{s.icon}</div>
                <p className="font-bold mb-1">{s.title}</p>
                <p className="text-sm text-slate-600 leading-relaxed">{s.body}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="mt-10 rounded-2xl bg-white border border-slate-200 p-6">
          <h2 className="text-lg font-bold mb-3">{t("example_title")}</h2>
          <ul className="space-y-2 text-sm text-slate-700">
            {[t("ex1"), t("ex2", { amount: fmtWon(discount) }), t("ex3", { goal, months })].map((line, i) => (
              <li key={i} className="flex gap-2">
                <CheckCircle2 size={16} className="text-emerald-600 shrink-0 mt-0.5" /> {line}
              </li>
            ))}
          </ul>
        </section>

        {/* (2026-09-11 A-94 ③) 마스킹 리더보드 — 유효 초대 상위 10, 이름 마스킹(손*석), 서버 5분 캐시 */}
        <section className="mt-10 rounded-2xl bg-white border border-slate-200 p-6">
          <div className="flex items-center gap-2 mb-1">
            <Trophy size={18} className="text-amber-500" />
            <h2 className="text-lg font-bold">{t("leaderboard_title")}</h2>
          </div>
          <p className="text-xs text-slate-500 mb-4">{t("leaderboard_sub", { goal })}</p>
          {!stats ? (
            <p className="text-sm text-slate-400" aria-busy={!statsFailed ? true : undefined}>{statsFailed ? t("stats_failed") : "…"}</p>
          ) : leaderboard.length === 0 ? (
            <p className="text-sm text-slate-500">{t("leaderboard_empty")}</p>
          ) : (
            <ol className="divide-y divide-slate-100">
              {leaderboard.map((e) => (
                <li key={e.rank} className="py-2 flex items-center gap-3 text-sm">
                  <span className={`w-8 shrink-0 text-center font-extrabold tabular-nums ${e.rank <= 3 ? "text-amber-600" : "text-slate-400"}`}>{t("leaderboard_rank", { rank: e.rank })}</span>
                  <span className="font-semibold text-slate-800">{e.nameMasked}</span>
                  <span className="ml-auto text-xs text-slate-500 tabular-nums">{t("leaderboard_valid", { valid: e.validCount, total: e.totalCount })}</span>
                </li>
              ))}
            </ol>
          )}
        </section>

        <section className="mt-10">
          <h2 className="text-lg font-bold mb-3">{t("faq_title")}</h2>
          <dl className="space-y-4">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="rounded-2xl bg-white border border-slate-200 p-5">
                <dt className="font-semibold mb-1">{t(`faq.${i}.q`, { goal, months, cap })}</dt>
                <dd className="text-sm text-slate-600 leading-relaxed">{t(`faq.${i}.a`, { amount: fmtWon(discount), goal, months, months24, cap, end, deadline })}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="mt-10 text-xs text-slate-500 leading-relaxed">
          <h2 className="text-sm font-bold text-slate-700 mb-2">{t("notice_title")}</h2>
          <ul className="list-disc pl-5 space-y-1">
            {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
              <li key={i}>{t(`notice.${i}`, { amount: fmtWon(discount), goal, months, months24, cap, end, deadline })}</li>
            ))}
          </ul>
          <p className="mt-3">
            <Link href="/terms#paid" className="underline">{t("terms_link")}</Link> · <Link href="/privacy" className="underline">{t("privacy_link")}</Link>
          </p>
        </section>
      </div>
    </main>
  );
}
