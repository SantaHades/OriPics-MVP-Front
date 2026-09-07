"use client";
// 전체화면 라이트박스용 확대·이동 이미지 (A-80 웹, 2026-09-07 대표 요청 "앱·웹 모든 썸네일 → 확대·축소·이동")
// - 마우스 휠/트랙패드: 커서 위치 기준 확대·축소 (1~6배)
// - 터치: 두 손가락 핀치 + 한 손가락 드래그 이동(확대 상태), 더블탭 1배↔2.5배
// - 1배에서 한 번 탭/클릭 → onClose (확대 상태에서는 닫지 않음 — 이동 중 오터치 방지). ESC → onClose
// - 이동 범위는 컨테이너 기준 (배율-1)/2 안으로 제한
import { useCallback, useEffect, useRef, useState } from "react";

const MIN = 1;
const MAX = 6;
const DOUBLE_TAP = 2.5;

type T = { s: number; x: number; y: number };

export default function ZoomableImage({ src, alt, onClose }: { src: string; alt: string; onClose?: () => void }) {
  const box = useRef<HTMLDivElement>(null);
  const [t, setT] = useState<T>({ s: 1, x: 0, y: 0 });
  const tRef = useRef<T>(t);
  tRef.current = t;
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ start: T; dist: number; mid: { x: number; y: number }; moved: boolean } | null>(null);
  const lastTap = useRef(0);
  const tapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clamp = useCallback((n: T): T => {
    const el = box.current;
    const w = el?.clientWidth ?? 0;
    const h = el?.clientHeight ?? 0;
    const mx = Math.max(0, (w * n.s - w) / 2);
    const my = Math.max(0, (h * n.s - h) / 2);
    return { s: n.s, x: Math.min(mx, Math.max(-mx, n.x)), y: Math.min(my, Math.max(-my, n.y)) };
  }, []);

  /** 컨테이너 중심 기준 좌표 */
  const rel = (cx: number, cy: number) => {
    const r = box.current?.getBoundingClientRect();
    if (!r) return { x: 0, y: 0 };
    return { x: cx - (r.left + r.width / 2), y: cy - (r.top + r.height / 2) };
  };

  /** 화면 점 p를 고정한 채 배율 s → ns */
  const zoomAt = useCallback(
    (cur: T, ns: number, p: { x: number; y: number }): T => {
      const s = Math.min(MAX, Math.max(MIN, ns));
      const k = s / cur.s;
      return clamp({ s, x: p.x - (p.x - cur.x) * k, y: p.y - (p.y - cur.y) * k });
    },
    [clamp],
  );

  useEffect(() => {
    setT({ s: 1, x: 0, y: 0 });
  }, [src]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose?.();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const cur = tRef.current;
    const ns = cur.s * Math.exp(-e.deltaY * 0.002);
    setT(zoomAt(cur, ns, rel(e.clientX, e.clientY)));
  };

  const toggleDouble = (p: { x: number; y: number }) => {
    const cur = tRef.current;
    setT(cur.s > MIN ? { s: 1, x: 0, y: 0 } : zoomAt(cur, DOUBLE_TAP, p));
  };

  const onPointerDown = (e: React.PointerEvent) => {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const pts = [...pointers.current.values()];
    const mid = pts.length >= 2
      ? { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 }
      : { x: e.clientX, y: e.clientY };
    const dist = pts.length >= 2 ? Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) : 0;
    gesture.current = { start: tRef.current, dist, mid, moved: gesture.current?.moved ?? false };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId) || !gesture.current) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const pts = [...pointers.current.values()];
    const g = gesture.current;
    if (pts.length >= 2) {
      // 핀치: 시작 거리 대비 배율 + 중점 이동
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      const mid = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
      const ratio = g.dist > 0 ? dist / g.dist : 1;
      const zoomed = zoomAt(g.start, g.start.s * ratio, rel(g.mid.x, g.mid.y));
      setT(clamp({ s: zoomed.s, x: zoomed.x + (mid.x - g.mid.x), y: zoomed.y + (mid.y - g.mid.y) }));
      g.moved = true;
      return;
    }
    const dx = e.clientX - g.mid.x;
    const dy = e.clientY - g.mid.y;
    if (Math.hypot(dx, dy) > 4) g.moved = true;
    if (g.start.s > MIN) setT(clamp({ s: g.start.s, x: g.start.x + dx, y: g.start.y + dy }));
  };

  const onPointerUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    const g = gesture.current;
    if (pointers.current.size > 0) {
      // 손가락 하나가 남으면 그 지점부터 새 제스처 시작
      const p = [...pointers.current.values()][0];
      gesture.current = { start: tRef.current, dist: 0, mid: p, moved: true };
      return;
    }
    gesture.current = null;
    if (!g || g.moved) return;
    // 탭 판정: 더블탭(300ms) → 배율 토글, 단일탭 → 1배일 때만 닫기
    const now = Date.now();
    const p = rel(e.clientX, e.clientY);
    if (now - lastTap.current < 300) {
      lastTap.current = 0;
      if (tapTimer.current) clearTimeout(tapTimer.current);
      tapTimer.current = null;
      toggleDouble(p);
      return;
    }
    lastTap.current = now;
    if (tapTimer.current) clearTimeout(tapTimer.current);
    tapTimer.current = setTimeout(() => {
      tapTimer.current = null;
      if (tRef.current.s <= MIN) onClose?.();
    }, 300);
  };

  return (
    <div
      ref={box}
      className="absolute inset-0 flex items-center justify-center overflow-hidden select-none"
      style={{ touchAction: "none", cursor: t.s > MIN ? "grab" : onClose ? "zoom-out" : "zoom-in" }}
      onWheel={onWheel}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onDoubleClick={(e) => e.preventDefault()}
    >
      <img
        src={src}
        alt={alt}
        draggable={false}
        className="max-w-full max-h-full object-contain"
        style={{ transform: `translate(${t.x}px, ${t.y}px) scale(${t.s})`, transition: gesture.current ? "none" : "transform 120ms ease-out", willChange: "transform" }}
      />
    </div>
  );
}
