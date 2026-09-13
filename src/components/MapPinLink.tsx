// 좌표 옆 "지도에서 위치 열기" 핀 링크 (2026-09-13 대표) — 훅 없음, 서버/클라이언트 양쪽에서 사용 가능.
// 파란 핀(둥근 머리 + 아래 꼭지) · 흰 점 · 꼭지 아래 빈 타원. fill=currentColor 라 className 으로 색 지정.
import { mapsUrl } from "@/lib/mapsUrl";

type Props = {
  lat: number;
  lng: number;
  /** 아이콘 높이(px). 기본 18 */
  size?: number;
  className?: string;
  /** 호출 측이 ko/en 라벨을 넘긴다 (title·aria-label 겸용) */
  title?: string;
};

export default function MapPinLink({ lat, lng, size = 18, className = "text-blue-600 hover:text-blue-800", title = "지도에서 위치 열기" }: Props) {
  const w = Math.round((size * 24) / 30);
  return (
    <a
      href={mapsUrl(lat, lng)}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={title}
      title={title}
      className={`inline-flex items-center align-middle ${className}`}
    >
      <MapPinIcon width={w} height={size} />
    </a>
  );
}

/** 핀 SVG 본체 — 링크 없이 아이콘만 필요할 때도 재사용 */
export function MapPinIcon({ width = 14, height = 18 }: { width?: number; height?: number }) {
  return (
    <svg width={width} height={height} viewBox="0 0 24 30" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
      <path
        d="M12 1C6.76 1 2.5 5.2 2.5 10.4c0 6.7 8.1 13.5 8.9 14.2a.95.95 0 0 0 1.2 0c.8-.7 8.9-7.5 8.9-14.2C21.5 5.2 17.24 1 12 1z"
        fill="currentColor"
      />
      <circle cx="12" cy="10.4" r="3.4" fill="#fff" />
      <ellipse cx="12" cy="27.2" rx="5" ry="1.8" stroke="currentColor" strokeWidth="1.2" fill="none" />
    </svg>
  );
}
