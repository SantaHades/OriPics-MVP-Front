"use client";

// 메인 소개 영상 팝업 (2026-09-28 대표) — 메인 진입 시 자동 표시, '오늘 다시 보지 않기'는 오늘 날짜(기기 시각)까지 숨김.
// 다시 보기 버튼(IntroVideoButton)은 창 이벤트로 팝업을 연다 — 네비(xs+)·히어로(모바일) 두 곳에 배치.
// 영상은 youtube-nocookie 임베드(추적 쿠키 최소화), 닫으면 iframe을 내려 재생을 멈춘다.
import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { PlayCircle, X } from "lucide-react";

const VIDEO_ID = "mY0VND4YU_Q";
const HIDE_KEY = "oripics.introVideo.hideDate";
const OPEN_EVENT = "oripics:open-intro-video";

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function useKo() {
  const params = useParams();
  return ((params?.locale as string) || "ko") !== "en";
}

export function IntroVideoButton({ variant = "nav" }: { variant?: "nav" | "hero" }) {
  const ko = useKo();
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        window.dispatchEvent(new Event(OPEN_EVENT));
      }}
      className={`${variant === "nav" ? "hidden xs:inline-flex" : "inline-flex xs:hidden"} items-center gap-1 px-2.5 py-1 rounded-full bg-rose-50 text-rose-700 text-[10px] sm:text-xs font-semibold border border-rose-200 hover:bg-rose-100 transition-colors whitespace-nowrap`}
    >
      <PlayCircle size={14} aria-hidden="true" /> {ko ? "소개 영상" : "Intro video"}
    </button>
  );
}

export default function IntroVideo() {
  const ko = useKo();
  const [open, setOpen] = useState(false);
  const [hideToday, setHideToday] = useState(false);

  useEffect(() => {
    try {
      if (localStorage.getItem(HIDE_KEY) !== today()) setOpen(true);
    } catch {
      setOpen(true);
    }
    const onOpen = () => {
      setHideToday(false);
      setOpen(true);
    };
    window.addEventListener(OPEN_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_EVENT, onOpen);
  }, []);

  const close = useCallback(() => {
    try {
      if (hideToday) localStorage.setItem(HIDE_KEY, today());
    } catch {
      // 저장 불가(사파리 개인 모드 등)면 이번만 닫힘
    }
    setOpen(false);
  }, [hideToday]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4" onClick={close}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={ko ? "OriPics 소개 영상" : "OriPics intro video"}
        className="w-full max-w-3xl overflow-hidden rounded-2xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3">
          <p className="font-bold text-slate-900">{ko ? "OriPics 소개 영상" : "OriPics intro video"}</p>
          <button type="button" onClick={close} aria-label={ko ? "닫기" : "Close"} className="rounded-full p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900">
            <X size={20} />
          </button>
        </div>
        <div className="relative w-full bg-black" style={{ aspectRatio: "16 / 9" }}>
          <iframe
            className="absolute inset-0 h-full w-full"
            src={`https://www.youtube-nocookie.com/embed/${VIDEO_ID}?rel=0&playsinline=1`}
            title={ko ? "OriPics 소개 영상" : "OriPics intro video"}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
          />
        </div>
        <div className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
          <label className="flex cursor-pointer select-none items-center gap-2 text-slate-600">
            <input type="checkbox" checked={hideToday} onChange={(e) => setHideToday(e.target.checked)} className="h-4 w-4 accent-blue-600" />
            {ko ? "오늘 다시 보지 않기" : "Don't show again today"}
          </label>
          <button type="button" onClick={close} className="rounded-lg bg-slate-900 px-4 py-2 font-semibold text-white hover:bg-slate-700">
            {ko ? "닫기" : "Close"}
          </button>
        </div>
      </div>
    </div>
  );
}
