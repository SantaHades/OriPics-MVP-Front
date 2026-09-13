// PDF용 지도 핀 (2026-09-13 대표) — 좌표 옆에 붙여 탭하면 지도가 열리는 클릭 가능한 핀.
// 웹 src/components/MapPinLink.tsx 와 같은 모양(viewBox 0 0 24 30: 파란 핀·흰 점·꼭지 아래 빈 타원).
// mapsUrl 은 apps/web/src/lib/mapsUrl.ts 와 동일 형식 — 이 패키지는 독립 esbuild 번들이라 사본 유지.
import React from "react";
import { Svg, Path, Circle, Ellipse } from "@react-pdf/renderer";

export function mapsUrl(lat: number, lng: number): string {
  return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
}

/** 핀 아이콘 — size = 높이(pt), 폭은 24:30 비율 */
export function MapPinIcon({ size = 12, color = "#1d4ed8" }: { size?: number; color?: string }) {
  const w = (size * 24) / 30;
  return (
    <Svg width={w} height={size} viewBox="0 0 24 30">
      <Path
        d="M12 1C6.76 1 2.5 5.2 2.5 10.4c0 6.7 8.1 13.5 8.9 14.2a.95.95 0 0 0 1.2 0c.8-.7 8.9-7.5 8.9-14.2C21.5 5.2 17.24 1 12 1z"
        fill={color}
      />
      <Circle cx={12} cy={10.4} r={3.4} fill="#ffffff" />
      <Ellipse cx={12} cy={27.2} rx={5} ry={1.8} stroke={color} strokeWidth={1.2} fill="none" />
    </Svg>
  );
}
