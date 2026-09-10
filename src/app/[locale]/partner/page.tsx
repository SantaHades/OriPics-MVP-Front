"use client";

// 파트너 릴레이 챌린지 랜딩 (A-82 §4.1) — /{locale}/partner
// 혜택·방법·잔여 카운터·유의사항. 로그인 시 [내 파트너코드 보기], 비로그인 시 [코드 입력하고 가입].
import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/navigation";
import { ArrowLeft, Gift, Users, Ticket, CheckCircle2 } from "lucide-react";

interface Stats {
  cap: number;
  partnersJoined: number;
  remaining: number;
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

  useEffect(() => {
    fetch("/api/partner/stats")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setStats(d))
      .catch(() => {});
  }, []);

  const fmtWon = (n: number) => new Intl.NumberFormat(locale === "en" ? "en-US" : "ko-KR").format(n);
  const end = stats ? new Date(stats.campaignEnd).toLocaleDateString(locale === "en" ? "en-US" : "ko-KR") : "";
  const discount = stats?.discountAmount ?? 4950;
  const months = stats?.milestoneFreeMonths ?? 6;
  const goal = stats?.milestoneCount ?? 12;

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

          <div className="flex flex-wrap items-center gap-3 mb-6 text-sm">
            <span className="px-3 py-1.5 rounded-full bg-slate-100 text-slate-700">{stats ? t("until", { end }) : "…"}</span>
            {stats && (
              <span className={`px-3 py-1.5 rounded-full font-bold ${stats.remaining > 0 && !stats.campaignEnded ? "bg-blue-50 text-blue-700" : "bg-slate-200 text-slate-600"}`}>
                {stats.campaignEnded ? t("ended") : stats.remaining > 0 ? t("remaining", { remaining: stats.remaining, cap: stats.cap }) : t("full", { cap: stats.cap })}
              </span>
            )}
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

        <section className="mt-10">
          <h2 className="text-lg font-bold mb-3">{t("faq_title")}</h2>
          <dl className="space-y-4">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="rounded-2xl bg-white border border-slate-200 p-5">
                <dt className="font-semibold mb-1">{t(`faq.${i}.q`, { goal, months })}</dt>
                <dd className="text-sm text-slate-600 leading-relaxed">{t(`faq.${i}.a`, { amount: fmtWon(discount), goal, months, months24: stats?.benefitValidMonths ?? 24 })}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="mt-10 text-xs text-slate-500 leading-relaxed">
          <h2 className="text-sm font-bold text-slate-700 mb-2">{t("notice_title")}</h2>
          <ul className="list-disc pl-5 space-y-1">
            {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
              <li key={i}>{t(`notice.${i}`, { amount: fmtWon(discount), goal, months, months24: stats?.benefitValidMonths ?? 24, cap: stats?.cap ?? 500 })}</li>
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
