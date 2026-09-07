"use client";
// 직군별 랜딩 공용 컴포넌트 (GTM, 2026-09-07) — /for/[segment]. 데이터=lib/segments/catalog.ts
// 구조: 히어로 → 문제 3카드 → 3단계 → 신뢰 근거 3카드 → 요금 → FAQ → CTA. how-it-works 페이지 톤과 동일.
import { Link } from "@/navigation";
import { useParams } from "next/navigation";
import { ArrowLeft, ArrowRight, BadgeCheck, CheckCircle2, Fingerprint, ShieldCheck, Smartphone } from "lucide-react";

import { getSegment, SEGMENT_TRUST } from "@/lib/segments/catalog";
import { ANDROID_STORE_URL, IOS_APP_URL } from "@/lib/appLinks";

const TRUST_ICONS = [ShieldCheck, BadgeCheck, Fingerprint];

export default function SegmentLanding({ slug }: { slug: string }) {
  const params = useParams();
  const lang = ((params?.locale as string) || "ko") === "en" ? "en" : "ko";
  const ko = lang === "ko";
  const seg = getSegment(slug);
  if (!seg) return null;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <div className="max-w-4xl mx-auto px-6 py-12">
        <Link href="/" className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-900 transition-colors mb-10">
          <ArrowLeft size={16} /> {ko ? "메인으로" : "Back to home"}
        </Link>

        {/* 히어로 */}
        <div className="mb-14">
          <p className="text-xs font-bold text-blue-600 uppercase tracking-[0.25em] mb-3">{seg.eyebrow[lang]}</p>
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight leading-snug mb-4 whitespace-pre-line break-keep">{seg.title[lang]}</h1>
          <p className="text-slate-600 leading-relaxed break-keep mb-6">{seg.subtitle[lang]}</p>
          <div className="flex flex-wrap gap-2">
            <Link href="/signup" className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold transition-colors">
              {ko ? "무료로 시작하기" : "Start free"} <ArrowRight size={14} />
            </Link>
            <Link href="/use-cases" className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-white border border-slate-200 hover:bg-slate-100 text-sm font-semibold transition-colors">
              {seg.ctaSecondary[lang]}
            </Link>
          </div>
          <p className="text-xs text-amber-700 mt-3">{seg.partnerNote[lang]}</p>
        </div>

        {/* 문제 */}
        <h2 className="text-2xl font-bold tracking-tight mb-4">{ko ? "지금 겪는 문제" : "The problem today"}</h2>
        <div className="grid sm:grid-cols-3 gap-4 mb-14">
          {seg.problems.map((p) => (
            <div key={p.title[lang]} className="p-6 rounded-3xl bg-white border border-slate-200 shadow-sm">
              <h3 className="font-bold mb-2 text-sm">{p.title[lang]}</h3>
              <p className="text-xs text-slate-600 leading-relaxed break-keep">{p.body[lang]}</p>
            </div>
          ))}
        </div>

        {/* 3단계 */}
        <h2 className="text-2xl font-bold tracking-tight mb-4">{ko ? "이렇게 씁니다" : "How it works"}</h2>
        <ol className="grid sm:grid-cols-3 gap-4 mb-14">
          {seg.steps.map((s, i) => (
            <li key={s.title[lang]} className="p-6 rounded-3xl bg-white border border-slate-200 shadow-sm">
              <p className="text-blue-600 font-extrabold text-lg mb-2">{i + 1}</p>
              <h3 className="font-bold mb-2 text-sm">{s.title[lang]}</h3>
              <p className="text-xs text-slate-600 leading-relaxed break-keep">{s.body[lang]}</p>
            </li>
          ))}
        </ol>

        {/* 신뢰 근거 */}
        <h2 className="text-2xl font-bold tracking-tight mb-4">{ko ? "왜 믿을 수 있나" : "Why it can be trusted"}</h2>
        <div className="grid sm:grid-cols-3 gap-4 mb-14">
          {SEGMENT_TRUST.map((t, i) => {
            const Icon = TRUST_ICONS[i] ?? CheckCircle2;
            return (
              <div key={t.title[lang]} className="p-6 rounded-3xl bg-white border border-slate-200 shadow-sm">
                <Icon className="text-blue-600 mb-3" size={24} />
                <h3 className="font-bold mb-2 text-sm">{t.title[lang]}</h3>
                <p className="text-xs text-slate-600 leading-relaxed break-keep">{t.body[lang]}</p>
              </div>
            );
          })}
        </div>

        {/* 요금 */}
        <div className="p-8 rounded-3xl bg-white border border-slate-200 shadow-sm mb-14">
          <h2 className="text-xl font-bold mb-2">{ko ? "요금" : "Pricing"}</h2>
          <p className="text-sm text-slate-700 leading-relaxed break-keep">{seg.pricing[lang]}</p>
          <div className="flex flex-wrap gap-2 mt-4">
            <Link href="/billing" className="text-sm font-semibold text-blue-600 hover:text-blue-500 underline underline-offset-4">{ko ? "요금제 자세히" : "Plan details"}</Link>
          </div>
        </div>

        {/* FAQ */}
        <h2 className="text-2xl font-bold tracking-tight mb-4">FAQ</h2>
        <div className="space-y-3 mb-14">
          {seg.faq.map((f) => (
            <div key={f.q[lang]} className="p-5 rounded-2xl bg-white border border-slate-200">
              <p className="font-semibold text-sm mb-1">{f.q[lang]}</p>
              <p className="text-sm text-slate-600 leading-relaxed break-keep">{f.a[lang]}</p>
            </div>
          ))}
        </div>

        {/* CTA */}
        <div className="p-8 rounded-3xl bg-blue-600 text-white text-center">
          <p className="text-lg font-bold mb-3 break-keep">{ko ? "오늘 현장부터 기록을 남겨 보세요." : "Start recording from today's site."}</p>
          <div className="flex flex-wrap justify-center gap-2">
            <Link href="/signup" className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-white text-blue-700 text-sm font-semibold hover:bg-blue-50">{ko ? "무료로 시작하기" : "Start free"} <ArrowRight size={14} /></Link>
            <a href={IOS_APP_URL} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-blue-700 text-white text-sm font-semibold hover:bg-blue-800"><Smartphone size={14} /> iPhone</a>
            <a href={ANDROID_STORE_URL} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-blue-700 text-white text-sm font-semibold hover:bg-blue-800"><Smartphone size={14} /> Android</a>
          </div>
          <p className="text-xs text-blue-100 mt-4">{ko ? "파트너 제휴 문의: hi@ori.pics" : "Partnership inquiries: hi@ori.pics"}</p>
        </div>
      </div>
    </div>
  );
}
