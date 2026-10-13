// 모바일 앱 설치/실행 링크 (2026-08-28) — 한 곳에서 관리.
// ⚠️ iOS는 아직 TestFlight — App Store 정식 출시 시 https://apps.apple.com/app/id6804357260 으로 교체할 것
export const IOS_APP_URL = "https://testflight.apple.com/join/zNwF6DKZ";
// (2026-10-13) Android 새 앱 ori.pics.app(조직 계정) 프로덕션 게시 확인 → 정식 스토어 링크로 전환.
//   옛 앱 com.santahades.oripics(테스트 트랙)는 스토어 404.
export const ANDROID_STORE_URL = "https://play.google.com/store/apps/details?id=ori.pics.app";

// Android: 앱이 설치돼 있으면 실행, 없으면 스토어로 폴백 (Chrome intent 스킴).
// scheme=oripics 는 app.json "scheme"과 일치해야 함.
// 경로는 반드시 빈 값(→ oripics:///, 홈 탭) — 임의 경로(예: open)는 expo-router가
// Unmatched Route 화면을 띄움 (2026-08-28 Galaxy 실측)
export const ANDROID_INTENT_URL =
  "intent:///#Intent;scheme=oripics;package=ori.pics.app;S.browser_fallback_url=" +
  encodeURIComponent(ANDROID_STORE_URL) +
  ";end";
