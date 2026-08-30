"use client";

// 인증 방식 소개 (2026-08-29 대표 기획) — 히어로 "어떻게 믿을 수 있나요?" 링크의 목적지.
// 이중 인증(자체 인증 + C2PA) 구조를 시각적으로 설명. 문구는 verified-trust-model.md
// 가이드 준수 — "촬영 시점 기기 검증" 등 검증 가능한 표현만, 과장 금지.
import { Link } from "@/navigation";
import { useParams } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Fingerprint,
  ShieldCheck,
  Smartphone,
  Link2,
  Globe2,
  BadgeCheck,
  FileSearch,
  Layers,
} from "lucide-react";

const SEAL_CARDS = {
  ko: [
    {
      icon: Fingerprint,
      title: "① 디지털 지문 (스테가노그래피)",
      body: "인증 순간, 보이지 않는 워터마크를 이미지 픽셀 자체에 새깁니다. 파일에 붙이는 꼬리표가 아니라 그림 안에 스며든 서명이라, 단 한 픽셀만 수정돼도 판독에서 즉시 감지됩니다. (이중 해시 구조, 특허 출원)",
    },
    {
      icon: ShieldCheck,
      title: "② 서버 서명",
      body: "촬영·인증 시각, GPS 좌표, 해상도를 OriPics 서버가 서명해 기록합니다. 사후에 시각이나 위치를 바꾸는 것이 불가능합니다 — EXIF처럼 편집기로 고칠 수 있는 메타데이터와는 다릅니다.",
    },
    {
      icon: Smartphone,
      title: "③ 기기 검증 (Verified)",
      body: "모바일 앱 촬영 인증은 iOS App Attest / Android Play Integrity로 '실제 기기의 정품 앱이 촬영 시점에 인증했음'까지 Apple·Google이 확인합니다. 셔터 순간 하드웨어 키로 해시를 봉인해 촬영과 인증 사이의 파일 바꿔치기도 잡아냅니다.",
    },
  ],
  en: [
    {
      icon: Fingerprint,
      title: "① Digital fingerprint (steganography)",
      body: "At the moment of certification, an invisible watermark is embedded into the image pixels themselves. It's not a tag attached to the file — it's a signature woven into the picture, so changing even a single pixel is instantly detected. (Dual-hash structure, patent pending)",
    },
    {
      icon: ShieldCheck,
      title: "② Server signature",
      body: "The capture/certification time, GPS coordinates, and resolution are signed and recorded by the OriPics server. They cannot be altered afterwards — unlike EXIF metadata, which anyone can edit.",
    },
    {
      icon: Smartphone,
      title: "③ Device verification (Verified)",
      body: "For mobile camera certification, iOS App Attest / Android Play Integrity let Apple and Google confirm that a genuine app on a real device certified the photo at capture time. A hardware-key seal at the shutter moment also catches file swaps between capture and certification.",
    },
  ],
};

const DUAL = {
  ko: {
    heading: "이중 인증 — 두 개의 독립된 보호막",
    sub: "OriPics 인증본에는 서로 다른 원리의 검증 체계 두 개가 함께 들어갑니다.",
    left: {
      title: "OriPics 자체 인증",
      tag: "픽셀 단위",
      points: [
        "지문이 픽셀 안에 있어 파일 형식 변환·메타데이터 삭제에도 살아남음",
        "픽셀이 그대로면 언제든 판독 가능 — 1픽셀 변조도 감지",
        "시각·GPS는 서버 서명으로 고정",
      ],
    },
    right: {
      title: "C2PA Content Credentials",
      tag: "국제 표준 · 파일 단위",
      points: [
        "Adobe·Microsoft·Sony가 주도하는 콘텐츠 출처 국제 표준 (ISO/IEC 21617)",
        "파일 전체를 서명 — 표준을 지원하는 어떤 도구에서도 출처 확인 가능",
        "메타데이터까지 포함해 봉인 — 수정 흔적이 표준 방식으로 드러남",
      ],
    },
    bandTitle: "서로가 서로를 보완합니다",
    bands: [
      "누군가 파일을 재저장해 C2PA 서명이 깨져도 — 픽셀이 그대로면 OriPics 판독으로 원본임을 확인할 수 있습니다.",
      "표준 생태계(Adobe 등)에서 확인이 필요하면 — C2PA 자격증명이 그 역할을 합니다.",
      "EXIF를 조작해도 — 두 체계 모두 EXIF를 신뢰 근거로 쓰지 않아 검증 결과가 흔들리지 않습니다.",
    ],
  },
  en: {
    heading: "Dual certification — two independent layers of protection",
    sub: "Every OriPics-certified image carries two verification systems built on different principles.",
    left: {
      title: "OriPics native certification",
      tag: "Pixel-level",
      points: [
        "The fingerprint lives inside the pixels — it survives format conversion and metadata stripping",
        "As long as the pixels are intact it stays verifiable — even a 1-pixel change is detected",
        "Time and GPS are fixed by the server signature",
      ],
    },
    right: {
      title: "C2PA Content Credentials",
      tag: "International standard · file-level",
      points: [
        "The content-provenance standard led by Adobe, Microsoft and Sony (ISO/IEC 21617)",
        "Signs the whole file — provenance can be checked in any standards-compliant tool",
        "Seals metadata too — tampering leaves standard, visible traces",
      ],
    },
    bandTitle: "Each layer covers for the other",
    bands: [
      "If someone re-saves the file and breaks the C2PA signature — the pixels still verify as original through OriPics.",
      "If you need verification inside the standards ecosystem (Adobe etc.) — the C2PA credential does that job.",
      "If EXIF is manipulated — neither system relies on EXIF, so the verdict doesn't budge.",
    ],
  },
};

const VERIFY_STEPS = {
  ko: {
    heading: "검증은 누구나, 3초면 됩니다",
    steps: [
      { icon: Link2, text: "공개링크를 엽니다 — 앱 설치도, 가입도 필요 없습니다" },
      { icon: FileSearch, text: "촬영 시각 · 위치 · 원본 여부가 바로 표시됩니다" },
      { icon: BadgeCheck, text: "파일을 직접 받았다면 ori.pics에 드래그해 즉시 판독할 수도 있습니다" },
    ],
  },
  en: {
    heading: "Anyone can verify, in 3 seconds",
    steps: [
      { icon: Link2, text: "Open the public link — no app, no sign-up required" },
      { icon: FileSearch, text: "Capture time, location and originality are shown instantly" },
      { icon: BadgeCheck, text: "Got the file directly? Drag it onto ori.pics for instant verification" },
    ],
  },
};

const TRUST = {
  ko: {
    heading: "국제적으로 검증된 방식입니다",
    items: [
      "OriPics는 C2PA 적합성 인증(Conformant) 제품입니다 — Google, Qualcomm 등과 함께 공식 적합 제품 목록에 등재되어 있으며, 한국의 개인 사용자용(B2C) 서비스로는 유일합니다.",
      "핵심 검증 알고리즘(이중 해시 스테가노그래피)은 특허 출원되어 있습니다.",
      "Verified 등급은 Apple App Attest·Google Play Integrity라는 두 회사의 하드웨어 기반 검증 위에서 동작합니다.",
    ],
  },
  en: {
    heading: "An internationally validated approach",
    items: [
      "OriPics is a C2PA Conformant product — listed on the official conforming-products list alongside Google and Qualcomm, and the only consumer (B2C) service from Korea.",
      "The core verification algorithm (dual-hash steganography) is patent pending.",
      "The Verified tier runs on hardware-backed attestation from Apple (App Attest) and Google (Play Integrity).",
    ],
  },
};

export default function HowItWorksPage() {
  const params = useParams();
  const locale = params?.locale === "en" ? "en" : "ko";
  const ko = locale === "ko";
  const seal = SEAL_CARDS[locale];
  const dual = DUAL[locale];
  const verify = VERIFY_STEPS[locale];
  const trust = TRUST[locale];

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <div className="max-w-4xl mx-auto px-6 py-12">
        <Link href="/" className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-900 transition-colors mb-10">
          <ArrowLeft size={16} /> {ko ? "메인으로" : "Back to home"}
        </Link>

        {/* 히어로 */}
        <div className="mb-14">
          <p className="text-xs font-bold text-blue-600 uppercase tracking-[0.25em] mb-3">
            {ko ? "인증 방식" : "How it works"}
          </p>
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight leading-snug mb-4">
            {ko ? "OriPics는 어떻게 원본을 증명하나요?" : "How does OriPics prove originality?"}
          </h1>
          <p className="text-slate-600 leading-relaxed">
            {ko
              ? "사진 한 장에 세 겹의 봉인을 넣고, 서로 다른 두 개의 검증 체계로 지킵니다."
              : "Three seals go into every photo, protected by two independent verification systems."}
          </p>
        </div>

        {/* 삼중 보안 — 섹션 헤딩 (2026-08-30 대표 시안: 세 가지 보안키 프레임) */}
        <div className="flex items-center gap-2 mb-2">
          <Layers className="text-blue-600" size={20} />
          <h2 className="text-xl font-bold">
            {ko ? "삼중 보안 — 세 가지의 보안키 적용" : "Triple security — three secret keys"}
          </h2>
        </div>
        <p className="text-sm text-slate-600 mb-6">
          {ko
            ? "OriPics 인증 과정에는 외부에서 절대 알 수 없는 세 가지의 키값을 적용합니다."
            : "The OriPics certification process applies three key values that can never be known from outside."}
        </p>
        <div className="grid sm:grid-cols-3 gap-4 mb-16">
          {seal.map((c) => (
            <div key={c.title} className="p-6 rounded-3xl bg-white border border-slate-200 shadow-sm">
              <c.icon className="text-blue-600 mb-4" size={28} />
              <h3 className="font-bold mb-2 text-sm">{c.title}</h3>
              <p className="text-xs text-slate-600 leading-relaxed">{c.body}</p>
            </div>
          ))}
        </div>

        {/* 이중 인증 다이어그램 */}
        <div className="mb-16">
          <div className="flex items-center gap-2 mb-2">
            <Layers className="text-blue-600" size={20} />
            <h2 className="text-2xl font-bold tracking-tight">{dual.heading}</h2>
          </div>
          <p className="text-sm text-slate-600 mb-6">{dual.sub}</p>
          <div className="grid sm:grid-cols-2 gap-4 mb-4">
            {[dual.left, dual.right].map((col, i) => (
              <div
                key={col.title}
                className={`p-6 rounded-3xl border shadow-sm ${
                  i === 0 ? "bg-blue-600/5 border-blue-200" : "bg-emerald-600/5 border-emerald-200"
                }`}
              >
                <span
                  className={`inline-block text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded-full mb-3 ${
                    i === 0 ? "bg-blue-600/10 text-blue-700" : "bg-emerald-600/10 text-emerald-700"
                  }`}
                >
                  {col.tag}
                </span>
                <h3 className="font-bold mb-3">{col.title}</h3>
                <ul className="space-y-2">
                  {col.points.map((p) => (
                    <li key={p} className="text-xs text-slate-600 leading-relaxed flex gap-2">
                      <span className={i === 0 ? "text-blue-600" : "text-emerald-600"}>•</span> {p}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <div className="p-6 rounded-3xl bg-slate-900 text-white">
            <h3 className="font-bold mb-3 text-sm flex items-center gap-2">
              <Globe2 size={16} /> {dual.bandTitle}
            </h3>
            <ul className="space-y-2">
              {dual.bands.map((b) => (
                <li key={b} className="text-xs text-slate-300 leading-relaxed flex gap-2">
                  <span className="text-blue-400">✓</span> {b}
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* 검증 흐름 */}
        <div className="mb-16">
          <h2 className="text-2xl font-bold tracking-tight mb-6">{verify.heading}</h2>
          <div className="grid sm:grid-cols-3 gap-4">
            {verify.steps.map((s, i) => (
              <div key={s.text} className="p-6 rounded-3xl bg-white border border-slate-200 shadow-sm">
                <div className="flex items-center gap-2 mb-3">
                  <span className="w-6 h-6 rounded-full bg-blue-600 text-white text-xs font-bold flex items-center justify-center">
                    {i + 1}
                  </span>
                  <s.icon className="text-slate-400" size={18} />
                </div>
                <p className="text-xs text-slate-600 leading-relaxed">{s.text}</p>
              </div>
            ))}
          </div>
        </div>

        {/* 신뢰 근거 */}
        <div className="mb-16 p-8 rounded-3xl bg-white border border-slate-200 shadow-sm">
          <h2 className="text-xl font-bold tracking-tight mb-4 flex items-center gap-2">
            <BadgeCheck className="text-emerald-600" size={22} /> {trust.heading}
          </h2>
          <ul className="space-y-3">
            {trust.items.map((it) => (
              <li key={it} className="text-sm text-slate-600 leading-relaxed flex gap-2">
                <span className="text-emerald-600 shrink-0">✓</span> {it}
              </li>
            ))}
          </ul>
        </div>

        {/* CTA */}
        <div className="flex flex-col sm:flex-row gap-3">
          <Link
            href="/"
            className="flex-1 py-4 text-center bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-2xl transition-all shadow-lg shadow-blue-200/50"
          >
            {ko ? "지금 무료로 인증해 보기" : "Try it free now"}
          </Link>
          <Link
            href="/use-cases"
            className="flex-1 py-4 text-center bg-white hover:bg-slate-100 text-slate-900 font-bold rounded-2xl border border-slate-300 transition-all inline-flex items-center justify-center gap-2"
          >
            {ko ? "어디에 쓰나요?" : "Where is it used?"} <ArrowRight size={16} />
          </Link>
        </div>
      </div>
    </div>
  );
}
