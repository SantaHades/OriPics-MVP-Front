"use client";

// 원데이 패스 상품 페이지 (A-60 Phase 3 선제작, 2026-08-31).
// 결제 버튼은 일반결제 MID 발급·포트원 회신 전까지 "출시 준비 중" — 판매 개시 시
// 버튼만 결제 플로우로 교체한다. KG이니시스 MID 심사의 "사이트 상품 노출" 요건 겸용.
// 문구는 verified-trust-model.md 가이드 준수 — Verified는 "기기 검증 통과 시"로만 표기.
import { Link } from "@/navigation";
import { useParams } from "next/navigation";
import {
  ArrowLeft,
  Ticket,
  Clock,
  Camera,
  FileText,
  CalendarCheck,
  Gift,
  CheckCircle,
  BadgeCheck,
} from "lucide-react";

const FEATURES = {
  ko: [
    { icon: Clock, title: "24시간 · 촬영 인증 10회", body: "코드 등록 순간부터 24시간 동안, 사진 크기와 무관하게 촬영 인증 10회를 쓸 수 있습니다." },
    { icon: Camera, title: "찍기만 하면 전부 자동", body: "패스가 켜져 있는 동안 앱에서 촬영하면 인증 → 공개링크 → 인증서 PDF까지 자동으로 만들어집니다. 버튼을 누를 필요가 없습니다." },
    { icon: BadgeCheck, title: "기기 검증(Verified) 포함", body: "기기 검증을 통과한 촬영은 Verified 등급으로 인증됩니다 — Free 플랜이어도 적용됩니다." },
    { icon: CalendarCheck, title: "공개링크 1년 보관", body: "패스로 발행한 공개링크는 발행 시점부터 1년간 보관됩니다. 사고·분쟁 증거처럼 오래 남겨야 하는 기록에 알맞습니다." },
    { icon: FileText, title: "인증서 PDF 무료", body: "패스로 인증한 사진의 인증서 PDF 발급·재발급에 추가 차감이 없습니다." },
    { icon: Gift, title: "선물할 수 있어요", body: "구매하면 등록 코드를 받습니다. 코드를 전달하면 다른 사람도 등록해 쓸 수 있습니다 — 가족·지인에게 필요한 날 선물하세요." },
  ],
  en: [
    { icon: Clock, title: "24 hours · 10 capture proofs", body: "From the moment you redeem the code, you get 10 capture proofs for 24 hours — regardless of photo size." },
    { icon: Camera, title: "Just shoot — everything is automatic", body: "While the pass is active, photos captured in the app are certified with a public link and certificate PDF issued automatically." },
    { icon: BadgeCheck, title: "Device verification (Verified) included", body: "Captures that pass device attestation are certified as Verified — even on the Free plan." },
    { icon: CalendarCheck, title: "Public links kept for 1 year", body: "Links published with a pass are kept for one year from publication — suited for records like accident evidence." },
    { icon: FileText, title: "Certificate PDF at no extra cost", body: "Issuing and reissuing the certificate PDF for pass proofs costs nothing extra." },
    { icon: Gift, title: "Giftable", body: "You receive a redemption code at purchase. Pass it on and anyone can redeem it — gift it to family or friends for the day they need it." },
  ],
};

const RULES = {
  ko: [
    "등록 즉시 24시간 사용 기간이 시작됩니다 (일시정지 불가).",
    "촬영 인증 10회 — 사진 크기와 무관하게 1회씩 차감됩니다.",
    "패스가 활성인 동안 촬영 인증은 잔여 건수(크레딧) 대신 패스에서 우선 차감됩니다.",
    "기기 검증을 통과한 촬영은 Verified로 인증됩니다 (미통과 시 Standard로 인증).",
    "공개링크는 발행 시점부터 1년 보관됩니다 (Pro 구독 전환 시 무기한).",
    "활성 패스는 계정당 1장 — 10회를 모두 쓰거나 24시간이 지나면 곧바로 새 패스를 등록할 수 있습니다.",
    "파일 업로드·붙여넣기 인증은 패스가 아닌 잔여 건수에서 차감됩니다.",
    "미등록 코드의 유효기간은 발급일로부터 1년입니다.",
    "미등록 코드는 환불할 수 있으나, 등록(사용 개시) 후에는 환불이 불가합니다.",
    "본 패스는 OriPics 서비스 전용 이용권으로, 타 서비스 사용·현금 환급·재판매가 불가합니다.",
  ],
  en: [
    "Your 24-hour window starts immediately upon redemption (cannot be paused).",
    "10 capture proofs — 1 per photo regardless of size.",
    "While active, capture proofs are deducted from the pass first, instead of your credits.",
    "Captures that pass device attestation are certified as Verified (Standard otherwise).",
    "Public links are kept for 1 year from publication (unlimited if you subscribe to Pro).",
    "One active pass per account — once all 10 proofs are used or 24 hours pass, you can redeem a new pass right away.",
    "File-upload and paste proofs are deducted from your credits, not the pass.",
    "Unredeemed codes are valid for 1 year from issuance.",
    "Unredeemed codes are refundable; once redeemed, the pass is non-refundable.",
    "This pass is valid only within OriPics — no use in other services, cash-out, or resale.",
  ],
};

export default function PassProductPage() {
  const params = useParams();
  const ko = ((params?.locale as string) || "ko") !== "en";
  const features = FEATURES[ko ? "ko" : "en"];
  const rules = RULES[ko ? "ko" : "en"];

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <div className="max-w-4xl mx-auto px-6 py-12">
        <Link href="/" className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-900 transition-colors mb-10">
          <ArrowLeft size={16} /> {ko ? "메인으로" : "Back to home"}
        </Link>

        {/* 히어로 */}
        <div className="mb-12">
          <p className="text-xs font-bold text-blue-600 uppercase tracking-[0.25em] mb-3 flex items-center gap-2">
            <Ticket size={14} /> One-Day Pass
          </p>
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight leading-snug mb-4">
            {ko ? "원데이 패스 — 필요한 그 하루, 확실하게" : "One-Day Pass — for the day it matters"}
          </h1>
          <p className="text-slate-600 leading-relaxed max-w-2xl">
            {ko
              ? "교통사고 현장, 이사 전 점검, 중고 거래… 사진이 증거가 되어야 하는 날이 있습니다. 구독 없이 딱 하루, 촬영하는 사진마다 인증과 공개링크·인증서까지 자동으로 챙겨 드립니다."
              : "An accident scene, a move-out inspection, a second-hand deal… some days your photos must stand as evidence. No subscription — for just one day, every capture is certified automatically with a public link and certificate."}
          </p>
        </div>

        {/* 가격 카드 + 구매(준비 중) */}
        <div className="p-8 rounded-3xl bg-white border border-slate-200 shadow-sm mb-14 sm:flex items-center justify-between gap-8">
          <div>
            <p className="text-sm text-slate-500 mb-1">{ko ? "1장" : "One pass"}</p>
            <p className="text-4xl font-extrabold tracking-tight">
              ₩3,300
              <span className="text-sm font-normal text-slate-500"> {ko ? "(부가세 포함)" : "(VAT included)"}</span>
            </p>
            <p className="text-xs text-slate-500 mt-2">
              {ko ? "등록 후 24시간 이내 · 촬영 인증 10회 · 인증서 PDF · 공개링크 1년 보관 · 선물 가능" : "24h from redemption · 10 capture proofs · certificate PDF · 1-year links · giftable"}
            </p>
          </div>
          <div className="mt-6 sm:mt-0 shrink-0 text-center">
            {/* 판매 개시 시 이 버튼을 결제 플로우로 교체 (Phase 3 결제 연동) */}
            <button
              type="button"
              disabled
              className="px-8 py-4 rounded-2xl bg-slate-300 text-slate-600 font-bold cursor-not-allowed"
            >
              {ko ? "출시 준비 중" : "Coming soon"}
            </button>
            <p className="text-[11px] text-slate-400 mt-2">
              {ko ? "결제 오픈을 준비하고 있어요" : "Payments are being prepared"}
            </p>
          </div>
        </div>

        {/* 기능 카드 */}
        <div className="grid sm:grid-cols-3 gap-4 mb-14">
          {features.map((c) => (
            <div key={c.title} className="p-6 rounded-3xl bg-white border border-slate-200 shadow-sm">
              <c.icon className="text-blue-600 mb-4" size={26} />
              <h3 className="font-bold mb-2 text-sm">{c.title}</h3>
              <p className="text-xs text-slate-600 leading-relaxed">{c.body}</p>
            </div>
          ))}
        </div>

        {/* 사용 흐름 */}
        <h2 className="text-2xl font-bold tracking-tight mb-6">{ko ? "이렇게 씁니다" : "How it works"}</h2>
        <ol className="grid sm:grid-cols-3 gap-4 mb-14">
          {(ko
            ? ["구매하면 등록 코드를 받아요 (선물해도 돼요)", "찍을 일이 생긴 날, 앱 홈탭이나 웹 프로필에서 코드를 등록해요 — 이 순간부터 24시간", "촬영탭에서 평소처럼 찍기만 하면 인증·공개링크·인증서가 자동으로 완성돼요"]
            : ["Buy and receive a redemption code (or gift it)", "On the day you need it, redeem the code in the app home tab or web profile — 24 hours start now", "Just shoot as usual — certification, public link and certificate are completed automatically"]
          ).map((step, i) => (
            <li key={step} className="p-6 rounded-3xl bg-white border border-slate-200 shadow-sm">
              <p className="text-blue-600 font-extrabold text-lg mb-2">{i + 1}</p>
              <p className="text-sm text-slate-700 leading-relaxed">{step}</p>
            </li>
          ))}
        </ol>

        {/* 이미 코드가 있다면 */}
        <div className="p-6 rounded-3xl bg-blue-50 border border-blue-200 mb-14 sm:flex items-center justify-between gap-6">
          <p className="text-sm text-slate-700">
            {ko ? "이미 패스 코드를 갖고 계신가요? 프로필에서 바로 등록할 수 있어요." : "Already have a pass code? Redeem it right away in your profile."}
          </p>
          <Link
            href="/profile#pass"
            className="mt-3 sm:mt-0 shrink-0 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold transition-colors"
          >
            <Ticket size={15} /> {ko ? "원데이 패스 등록하기" : "Redeem One-Day Pass"}
          </Link>
        </div>

        {/* 이용 안내 (전체 규칙) */}
        <h2 className="text-2xl font-bold tracking-tight mb-4">{ko ? "이용 안내" : "Terms of use"}</h2>
        <ul className="space-y-2 mb-16">
          {rules.map((r) => (
            <li key={r} className="flex gap-2 text-sm text-slate-600 leading-relaxed">
              <CheckCircle size={15} className="shrink-0 text-emerald-600 mt-0.5" /> {r}
            </li>
          ))}
        </ul>

        <Link href="/" className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-900 transition-colors">
          <ArrowLeft size={16} /> {ko ? "메인으로 돌아가기" : "Back to home"}
        </Link>
      </div>
    </div>
  );
}
