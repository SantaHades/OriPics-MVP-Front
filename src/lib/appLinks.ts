// 모바일 앱 설치/실행 링크 (2026-08-28) — 한 곳에서 관리.
// ⚠️ 현재는 베타 배포 링크 — 정식 출시 시 아래 PROD 링크로 교체할 것:
//   iOS  → https://apps.apple.com/app/id6804357260
//   And  → https://play.google.com/store/apps/details?id=com.santahades.oripics
export const IOS_APP_URL = "https://testflight.apple.com/join/zNwF6DKZ";
export const ANDROID_STORE_URL = "https://play.google.com/apps/testing/com.santahades.oripics";

// Android: 앱이 설치돼 있으면 실행, 없으면 스토어로 폴백 (Chrome intent 스킴).
// scheme=oripics 는 app.json "scheme"과 일치해야 함.
export const ANDROID_INTENT_URL =
  "intent://open#Intent;scheme=oripics;package=com.santahades.oripics;S.browser_fallback_url=" +
  encodeURIComponent(ANDROID_STORE_URL) +
  ";end";
