"use client";

// 출시기념 이벤트 배지 (2026-09-05 대표 지시) — 기존 '베타테스트가 진행중입니다…' 배지(BetaRecruit 트리거) 자리.
// 클릭 시 /events(두 이벤트 소개)로 이동. nav=데스크톱(xs+), hero=모바일 전용 — BetaRecruit와 같은 배치 규칙.
import { useParams } from "next/navigation";
import { Link } from "@/navigation";

export default function EventBadge({ variant = "nav" }: { variant?: "nav" | "hero" }) {
  const params = useParams();
  const ko = ((params?.locale as string) || "ko") !== "en";
  return (
    <Link
      href="/events"
      onClick={(e) => e.stopPropagation()}
      className={`${variant === "nav" ? "hidden xs:inline-flex" : "inline-flex xs:hidden"} items-center gap-1 px-2.5 py-1 rounded-full bg-amber-100 text-amber-800 text-[10px] sm:text-xs font-semibold border border-amber-200 hover:bg-amber-200 transition-colors whitespace-nowrap`}
    >
      🎉 {ko ? "출시기념 이벤트 진행 중" : "Launch events now on"}
    </Link>
  );
}
