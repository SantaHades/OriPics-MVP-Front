"use client";
// 출시기념 이벤트 소개 (A-72, 2026-09-05) — 메인 배지 '출시기념 이벤트 진행 중'의 목적지.
// 두 이벤트(이 사진 진짜예요? 콘테스트 · 인증샷 콘테스트) 카드 + [자세히 보기]→/events/[id] 갤러리.
import { Link } from "@/navigation";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, CalendarDays, Images, Trophy } from "lucide-react";

import BetaRecruit from "@/components/BetaRecruit";
import { EVENTS } from "@/lib/events/catalog";

export default function EventsPage() {
  const params = useParams();
  const lang = ((params?.locale as string) || "ko") === "en" ? "en" : "ko";
  const ko = lang === "ko";
  const [counts, setCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    fetch(`/api/events?locale=${lang}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d?.events) return;
        const m: Record<string, number> = {};
        for (const e of d.events) m[e.id] = e.entry_count;
        setCounts(m);
      })
      .catch(() => {});
  }, [lang]);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <div className="max-w-4xl mx-auto px-6 py-12">
        <Link href="/" className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-900 transition-colors mb-10">
          <ArrowLeft size={16} /> {ko ? "메인으로" : "Back to home"}
        </Link>

        <div className="mb-10">
          <p className="text-xs font-bold text-amber-600 uppercase tracking-[0.25em] mb-3">
            {ko ? "출시기념 이벤트" : "Launch events"}
          </p>
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight leading-snug mb-4">
            {ko ? "오리픽스 앱으로 찍고, 좋아요로 뽑히세요" : "Shoot with OriPics, get picked by likes"}
          </h1>
          <p className="text-slate-600 leading-relaxed">
            {ko
              ? "두 가지 콘테스트가 10월 31일까지 진행됩니다. 오리픽스 앱으로 찍은 사진만 참여할 수 있고, 출품작은 누구나 검증 링크로 원본임을 확인할 수 있습니다. 좋아요를 많이 받은 순으로 소정의 상품을 드리고 명예의 전당에 올려 드립니다."
              : "Two contests run through October 31. Only photos taken with the OriPics app qualify, and every entry can be verified as original through its public link. The most-liked entries win a small prize and a Hall of Fame spot."}
          </p>
        </div>

        <div className="grid sm:grid-cols-2 gap-5 mb-14">
          {EVENTS.map((e) => (
            <div key={e.id} className="p-6 rounded-3xl bg-white border border-slate-200 shadow-sm flex flex-col">
              <h2 className="text-xl font-bold mb-2">{e.name[lang]}</h2>
              <p className="text-sm text-slate-600 leading-relaxed flex-1">{e.summary[lang]}</p>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500 mt-4">
                <span className="inline-flex items-center gap-1"><CalendarDays size={14} /> {e.period[lang]}</span>
                <span className="inline-flex items-center gap-1"><Images size={14} /> {ko ? "출품작" : "Entries"} {counts[e.id] ?? 0}</span>
              </div>
              <Link
                href={`/events/${e.id}`}
                className="mt-5 inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold transition-colors"
              >
                {ko ? "자세히 보기 · 출품작 보기" : "Details · View entries"} <ArrowRight size={14} />
              </Link>
            </div>
          ))}
        </div>

        <div className="p-6 rounded-3xl bg-amber-50 border border-amber-200 mb-14">
          <div className="flex items-center gap-2 mb-2">
            <Trophy className="text-amber-600" size={18} />
            <h3 className="font-bold">{ko ? "참여 방법" : "How to enter"}</h3>
          </div>
          <ol className="text-sm text-slate-700 leading-relaxed list-decimal pl-5 space-y-1">
            <li>{ko ? "오리픽스 앱(iOS·Android)을 설치하고 로그인합니다." : "Install the OriPics app (iOS/Android) and sign in."}</li>
            <li>{ko ? "촬영 탭에서 사진을 찍습니다. 앱으로 찍은 사진만 참여할 수 있습니다." : "Take photos on the Capture tab. Only photos taken with the app qualify."}</li>
            <li>{ko ? "제출 탭 → 이벤트 → 콘테스트의 [참여하기]에서 사진을 골라 보냅니다. 미인증 사진은 자동으로 인증·공개링크가 만들어집니다." : "Submit tab → Events → tap [Enter] on a contest and pick your photos. Uncertified photos are certified and published automatically."}</li>
            <li>{ko ? "출품작은 이 페이지와 앱에서 누구나 볼 수 있고, 로그인한 사용자가 좋아요를 누를 수 있습니다." : "Entries are visible here and in the app; signed-in users can like them."}</li>
          </ol>
        </div>

        <div className="text-center text-sm text-slate-500">
          {ko ? "베타 테스터도 계속 모집합니다 — " : "We are still recruiting beta testers — "}
          <span className="inline-flex align-middle"><BetaRecruit /><BetaRecruit variant="hero" /></span>
        </div>
      </div>
    </div>
  );
}
