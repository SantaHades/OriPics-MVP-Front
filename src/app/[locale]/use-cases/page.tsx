"use client";

// 사용 사례 소개 (2026-08-29 대표 기획) — 히어로 "어디에 쓰나요?" 링크의 목적지.
// 직군 6종 + 언론 제보. v1은 아이콘+시나리오 텍스트 — 일러스트·스크린샷은 2단계 보강.
import { Link } from "@/navigation";
import { useParams } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  KeyRound,
  Car,
  HardHat,
  ShieldAlert,
  Palette,
  ShoppingBag,
  Megaphone,
} from "lucide-react";

interface UseCase {
  icon: typeof Car;
  badge: string;
  title: string;
  problem: string;
  flow: string;
  result: string;
}

const CASES: Record<"ko" | "en", UseCase[]> = {
  ko: [
    {
      icon: KeyRound,
      badge: "부동산 · 임대관리",
      title: "입주·퇴실 상태 증빙",
      problem:
        "퇴실 정산 때 입주 당시 사진을 내밀어도 \"그거 나중에 찍은 거 아니냐\"는 말 한마디면 증거 가치가 흔들립니다.",
      flow: "입주 날 OriPics 앱으로 집 상태를 촬영 인증 → 공개링크를 계약 문자에 첨부해 둡니다.",
      result: "퇴실 분쟁 시 링크 하나로 '입주일에 찍힌 원본'임이 시각·위치와 함께 인증됩니다.",
    },
    {
      icon: Car,
      badge: "차량 · 정비 · 렌터카",
      title: "인수·반납 상태 기록",
      problem:
        "탁송 인수 때 멀쩡했던 차가 \"원래 흠집 있었다\"는 말로 돌아옵니다. 사진을 찍어놔도 '언제 찍은 건데요'라는 반문 앞에선 소용이 없습니다.",
      flow: "인수·반납 순간 차량 각 부위를 촬영 인증 → 상대방에게 링크를 바로 공유합니다.",
      result: "촬영 시각이 서버에 서명돼 있어 '그때 그 상태'를 다투는 것 자체가 불가능해집니다.",
    },
    {
      icon: HardHat,
      badge: "건설 · 인테리어",
      title: "시공 전·중·후 기록",
      problem:
        "준공 때 분명히 찍어둔 사진인데, 하자 접수가 들어오면 '시공 직후 사진이 맞긴 하냐'부터 다툽니다.",
      flow: "공정 단계마다 현장을 촬영 인증(GPS 포함) → 준공 보고에 링크를 첨부합니다.",
      result: "날짜·위치가 박힌 원본 기록이 남아 하자 책임 구간이 명확해집니다.",
    },
    {
      icon: ShieldAlert,
      badge: "보험 · 사고",
      title: "사고 현장 증빙",
      problem: "사고 현장 사진은 몇 시간만 지나도 재현할 수 없는데, 조작 의심을 받으면 보상이 늦어집니다.",
      flow: "사고 직후 현장을 촬영 인증 → 보험사·상대방에게 링크로 전달합니다.",
      result: "촬영 시각·GPS·기기 검증(Verified)까지 담긴 증빙으로 처리 속도가 달라집니다.",
    },
    {
      icon: Palette,
      badge: "창작자 · 사진가",
      title: "원본·창작 시점 인증",
      problem: "작품이 도용됐을 때 '내가 먼저 만들었다'를 인증할 방법이 마땅치 않습니다.",
      flow: "공개 전에 작품 파일을 인증해 두고, 원본은 보관함에 보관합니다.",
      result: "분쟁 시 '이 시점에 이 픽셀 그대로 존재했다'는 서버 서명 기록을 제시할 수 있습니다.",
    },
    {
      icon: ShoppingBag,
      badge: "중고거래",
      title: "실물 상태 인증",
      problem: "판매글 사진이 '실물과 다르다', '언제 찍은 거냐'는 시비가 거래 파탄의 단골 원인입니다.",
      flow: "판매 직전 실물을 촬영 인증 → 판매글에 공개링크를 함께 올립니다.",
      result: "구매자가 링크에서 촬영 시각과 원본 여부를 직접 확인하고 안심하고 거래합니다.",
    },
    {
      icon: Megaphone,
      badge: "언론 제보",
      title: "조작 의심 없는 제보",
      problem: "제보 사진은 AI 합성·조작 의심 때문에 채택되기 어려워졌습니다.",
      flow: "OriPics 앱의 제보 탭에서 사진을 고르면 검증 링크가 첨부된 제보 메일이 자동 작성됩니다 (연합·JTBC·MBC·SBS·KBS·YTN·채널A).",
      result: "기자가 링크로 원본 여부를 즉시 확인할 수 있어 제보의 신뢰도가 달라집니다.",
    },
  ],
  en: [
    {
      icon: KeyRound,
      badge: "Real estate · Rentals",
      title: "Move-in / move-out condition",
      problem:
        "At move-out settlement, even photos from move-in day lose their force the moment someone says \"you took those later, didn't you?\"",
      flow: "Certify photos of the unit with the OriPics app on move-in day → attach the public link to the contract message.",
      result: "In a dispute, one link proves the photos are originals taken on move-in day — with time and location.",
    },
    {
      icon: Car,
      badge: "Vehicles · Garages · Rentals",
      title: "Pick-up / return records",
      problem:
        "A car that was fine at hand-over comes back with \"that scratch was always there.\" Plain photos can't answer \"when was this even taken?\"",
      flow: "Certify each part of the vehicle at pick-up and return → share the link with the other party on the spot.",
      result: "The capture time is server-signed, so arguing about \"the state at that moment\" becomes impossible.",
    },
    {
      icon: HardHat,
      badge: "Construction · Interiors",
      title: "Before / during / after records",
      problem: "When a defect claim arrives, the first fight is whether your completion photos were really taken at completion.",
      flow: "Certify the site at each stage (with GPS) → attach links to the completion report.",
      result: "Date- and location-sealed original records make responsibility boundaries clear.",
    },
    {
      icon: ShieldAlert,
      badge: "Insurance · Accidents",
      title: "Accident scene evidence",
      problem: "Accident scenes can't be recreated hours later — and suspected manipulation delays your claim.",
      flow: "Certify the scene right after the accident → send the link to the insurer and the other party.",
      result: "Evidence carrying capture time, GPS and device verification (Verified) changes how fast claims move.",
    },
    {
      icon: Palette,
      badge: "Creators · Photographers",
      title: "Proof of authorship & timing",
      problem: "When your work is stolen, proving \"I made it first\" is surprisingly hard.",
      flow: "Certify the work before publishing; keep the original in your vault.",
      result: "In a dispute you can present a server-signed record: these exact pixels existed at this time.",
    },
    {
      icon: ShoppingBag,
      badge: "Second-hand trading",
      title: "Proof of actual condition",
      problem: "\"The item looks different\" and \"when was this photo taken?\" are the classic deal-breakers.",
      flow: "Certify the item right before listing → post the public link with your listing.",
      result: "Buyers check the capture time and originality themselves and trade with confidence.",
    },
    {
      icon: Megaphone,
      badge: "News tips",
      title: "Tips nobody can dismiss as fake",
      problem: "News tips struggle to get picked up because AI-generated and doctored photos are everywhere.",
      flow: "Pick photos in the OriPics app's Report tab — a tip email with verification links attached is composed automatically.",
      result: "Reporters verify originality instantly through the link, which changes how your tip is treated.",
    },
  ],
};

export default function UseCasesPage() {
  const params = useParams();
  const locale = params?.locale === "en" ? "en" : "ko";
  const ko = locale === "ko";
  const cases = CASES[locale];

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <div className="max-w-4xl mx-auto px-6 py-12">
        <Link href="/" className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-900 transition-colors mb-10">
          <ArrowLeft size={16} /> {ko ? "메인으로" : "Back to home"}
        </Link>

        <div className="mb-12">
          <p className="text-xs font-bold text-blue-600 uppercase tracking-[0.25em] mb-3">
            {ko ? "사용 사례" : "Use cases"}
          </p>
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight leading-snug mb-4">
            {ko ? "사진 한 장이 돈이 되는 순간, OriPics가 지킵니다" : "When one photo is worth money, OriPics protects it"}
          </h1>
          <p className="text-slate-600 leading-relaxed">
            {ko
              ? "\"그 사진 조작 아니냐\"는 말이 나오는 모든 현장이 OriPics의 자리입니다."
              : "Wherever someone might say \"that photo is fake\" — that's where OriPics belongs."}
          </p>
        </div>

        <div className="grid sm:grid-cols-2 gap-4 mb-14">
          {cases.map((c) => (
            <div key={c.title} className="p-6 rounded-3xl bg-white border border-slate-200 shadow-sm flex flex-col gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-blue-600/10 flex items-center justify-center shrink-0">
                  <c.icon className="text-blue-600" size={20} />
                </div>
                <div>
                  <p className="text-[10px] font-bold text-blue-600 uppercase tracking-widest">{c.badge}</p>
                  <h3 className="font-bold text-sm">{c.title}</h3>
                </div>
              </div>
              <p className="text-xs text-slate-500 leading-relaxed">{c.problem}</p>
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
                <p className="text-xs text-slate-700 leading-relaxed">
                  <span className="font-bold text-blue-600">{ko ? "OriPics와 함께라면 — " : "With OriPics — "}</span>
                  {c.flow}
                </p>
              </div>
              <p className="text-xs text-emerald-700 leading-relaxed flex gap-1.5">
                <span className="shrink-0">✓</span> {c.result}
              </p>
            </div>
          ))}
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <Link
            href="/"
            className="flex-1 py-4 text-center bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-2xl transition-all shadow-lg shadow-blue-200/50"
          >
            {ko ? "지금 무료로 인증해 보기" : "Try it free now"}
          </Link>
          <Link
            href="/how-it-works"
            className="flex-1 py-4 text-center bg-white hover:bg-slate-100 text-slate-900 font-bold rounded-2xl border border-slate-300 transition-all inline-flex items-center justify-center gap-2"
          >
            {ko ? "어떻게 믿을 수 있나요?" : "How can I trust it?"} <ArrowRight size={16} />
          </Link>
        </div>
      </div>
    </div>
  );
}
