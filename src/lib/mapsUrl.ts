// 좌표 → 지도 열기 URL (2026-09-13 대표). 웹·PDF 모두 같은 형식 — Google Maps 검색 URL은
// 앱 설치 여부와 무관하게 확대·이동 가능한 인터랙티브 지도로 열린다.
// (PDF 번들 packages/certificate/src/mapPin.tsx 에 동일 함수 사본 — 산출물이 독립 번들이라 import 불가)
export function mapsUrl(lat: number, lng: number): string {
  return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
}
