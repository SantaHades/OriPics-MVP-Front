// 모바일 앱 설치/실행 링크 (2026-08-28) — 한 곳에서 관리.
// ⚠️ 현재는 베타 배포 링크 — 정식 출시 시 아래 PROD 링크로 교체할 것:
//   iOS  → https://apps.apple.com/app/id6804357260
//   And  → https://play.google.com/store/apps/details?id=com.santahades.oripics
export const IOS_APP_URL = "https://testflight.apple.com/join/zNwF6DKZ";
// ⚠️(2026-09-25) Android 새 앱 ori.pics.app 전환 예정 — 새 앱이 프로덕션에 게시된 뒤에 이 URL과 아래 intent의 package를
//   ori.pics.app(https://play.google.com/store/apps/details?id=ori.pics.app)으로 바꾼다. 게시 전에 바꾸면 설치 버튼이 404.
export const ANDROID_STORE_URL = "https://play.google.com/apps/testing/com.santahades.oripics";

// Android: 앱이 설치돼 있으면 실행, 없으면 스토어로 폴백 (Chrome intent 스킴).
// scheme=oripics 는 app.json "scheme"과 일치해야 함.
// 경로는 반드시 빈 값(→ oripics:///, 홈 탭) — 임의 경로(예: open)는 expo-router가
// Unmatched Route 화면을 띄움 (2026-08-28 Galaxy 실측)
export const ANDROID_INTENT_URL =
  "intent:///#Intent;scheme=oripics;package=com.santahades.oripics;S.browser_fallback_url=" +
  encodeURIComponent(ANDROID_STORE_URL) +
  ";end";
