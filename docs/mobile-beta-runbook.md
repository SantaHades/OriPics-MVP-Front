# 모바일 베타 배포 런북 (M7)

> **작성**: 2026-08-07 · 대상: 대표 (계정·콘솔 작업) + AI (이슈 대응)
> 코드는 M0~M7 완료 상태. 이 문서는 **계정이 필요한 실행 단계**를 순서대로 정리한 체크리스트.

## ⚠️ 로컬 빌드 전제: Xcode 26+ (2026-08-18 실측)

Expo SDK 57의 SwiftPM 패키지가 **Swift tools 6.2**를 요구 — Xcode 16.4(Swift 6.1)에서는
`npx expo run:ios`가 "package 'apple' is using Swift tools version 6.2.0" 오류로 실패한다.
**App Store에서 Xcode 26 업데이트 후 진행** (실기기 검증·시뮬레이터 캡처 공통 전제.
EAS 클라우드 빌드는 이 제약 무관).

## 0.5 실기기 설치 절차 (2026-08-19 실측 확립)

1. iPhone 개발자 모드 ON(설정→개인정보 보호 및 보안) → 재부팅
2. Apple Developer 계정 PLA 동의(developer.apple.com/account 배너) — 미동의 시 기기 등록 API 차단
3. 최초 1회: `xcodebuild -workspace ios/OriPics.xcworkspace -scheme OriPics -configuration Release -destination "id=<UDID>" -allowProvisioningUpdates -allowProvisioningDeviceRegistration build`
4. 이후: `SENTRY_DISABLE_AUTO_UPLOAD=true npx expo run:ios --configuration Release --device <UDID>` (expo 기기 목록에 안 떠도 UDID 직접 지정하면 됨)

## 0. 선행 체크리스트 (스토어 업로드 전)

| # | 항목 | 트래커 | 소요 |
|---|---|---|---|
| 1 | 실기기 검증 라운드 — `cd apps/mobile && npx expo run:ios` → [DEV] 셀프테스트 ✅ → 로그인 → 갤러리 인증 → 웹 검증기 valid → 촬영 | — | ~1h |
| 2 | Google Play Console 신원확인 | U-2 | 1~3일 (자연 대기) |
| 3 | ~~앱 아이콘~~ → **완료(2026-08-18)** — OriPics 브랜드 마크(iOS 1024 무알파·Android adaptive 3종·splash·favicon), app.json 반영 확인(2026-08-23) | ~~U-16~~ 완료 | — |
| 4 | attest 운영 설정 (Apple env 2 + Play↔GCP 서비스 계정) | U-34 | ~1h |
| 5 | ~~App Store Connect IAP 설정(SBP·구독상품·Notifications·APPLE_IAP env)~~ → **취소(§8-A 결정 B, 2026-08-23: 인앱결제 없음·웹 구독만)**. 단 App Store Connect **앱 생성/제출**은 IAP와 무관하게 심사용으로 여전히 필요 | ~~U-35~~ 취소 | — |
| 6 | Sentry 프로젝트 생성 → DSN 발급 | U-36 | ~10분 |

## 1. EAS 초기 설정 (1회)

```bash
cd apps/mobile
npx eas login                 # Expo 계정 (없으면 expo.dev에서 가입)
npx eas init                  # projectId가 app.json에 자동 주입됨 → 커밋
npx eas credentials           # iOS: Apple 계정 연결 (인증서·프로파일 EAS가 자동 관리)
```

- `eas.json`은 커밋되어 있음: `development`(dev client) / `preview`(내부 배포, 버전 자동 증가) / `production`(스토어 제출용).
- 모든 프로파일에 `EXPO_PUBLIC_API_URL=https://www.ori.pics` 주입됨.
- **Sentry DSN**: `npx eas env:create --name EXPO_PUBLIC_SENTRY_DSN --value <DSN>` (U-36 후). 미설정이어도 앱은 정상 동작(진단만 꺼짐).

## 2. 빌드 → 베타 트랙

```bash
# iOS — TestFlight
npx eas build --profile production --platform ios
npx eas submit --platform ios --latest       # ascAppId는 eas.json에서 실제 값으로 교체 후
# App Store Connect → TestFlight → 내부 테스팅 그룹에 빌드 배정

# Android — Play 내부 테스트
npx eas build --profile production --platform android
# Play Console → 설정 → API 액세스에서 서비스 계정 키 다운로드 → apps/mobile/play-service-account.json (gitignore 됨)
npx eas submit --platform android --latest   # track: internal (eas.json)
```

- 첫 iOS 제출 전 App Store Connect에 앱 레코드 생성 필요(U-35와 함께). `ascAppId`(App Store Connect 앱의 Apple ID 숫자)를 eas.json에 기입.
- 첫 Android 제출은 Play Console에 수동 1회 업로드가 필요할 수 있음(신규 앱) — 이후 eas submit 자동화.

## 3. 베타 검증 시나리오 (수용기준: 핵심 플로우 무크래시)

1. 신규 설치 → 이메일 로그인 → 홈 크레딧 칩 표시
2. 갤러리 인증(F) → 공개 URL → **웹 검증기에서 valid**
3. 촬영(P): 줌 프리셋·핀치, GPS ON/OFF 각 1회 → 발급 → 뷰어에서 GPS 표시 확인
4. (U-34 후) Pro 계정으로 촬영 → **Verified 표기** + c2patool에서 `c2pa.created`+digitalCapture 확인
5. ~~(U-35 후) Sandbox 계정 IAP 구매·복원·환불 테스트~~ → **불필요(§8-A 결정 B: 인앱결제 없음).** 대신 **웹에서 Pro 구독 후 iOS 앱 로그인 → Pro 상태·Verified 기능 동작 확인**(멀티플랫폼 클라이언트 검증)
6. 인앱 검증: 인증된 사진 → 판독 → 서버 검증 → 신뢰도 표시 / 원본 아닌 사진 → 불일치
7. 앱 재기동 → 세션 유지 확인 / 7일 후 토큰 자동 갱신 확인
8. Sentry 대시보드에 크래시 0 확인

## 3.5 스토어 스크린샷 (U-18 — 자동화 준비 완료)

Xcode 26 설치 후 **한 줄로 캡처**:
```bash
cd apps/mobile && ./scripts/capture-screenshots.sh    # 재캡처만 할 땐 --no-build
```
- iPhone 16 Pro Max 시뮬레이터(1320×2868 = App Store 6.9" 규격, Play 9:16 겸용)에서
  maestro 플로우(`e2e/screenshots.yaml`)가 로그인→홈→인증(검증 포함)→촬영폴백을 자동 캡처 →
  `image/screenshots/`에 수집. 상태바는 9:41·풀배터리로 자동 정리.
- **데모 계정**: demo-screenshots@ori.pics (비밀번호 `.secrets/demo-screenshots-account.txt`,
  프로덕션 DB에 Pro·244건으로 생성) — **App Review 심사용 데모 계정으로도 재사용**(심사 노트에 기입).
- 촬영(P) 화면은 시뮬레이터에 카메라가 없어 폴백이 찍힘 → **실기기에서 1장 재캡처** 필요
  (`xcrun devicectl` 또는 기기에서 직접 캡처 후 교체).

## 3.6 안드로이드 실기기 로컬 설치 (2026-08-21 확립 — Galaxy A16 SM-A165N 실측)

```bash
cd apps/mobile
npx expo prebuild -p android --no-install   # android/ 없을 때만 (재생성 시 수동 수정 유실 주의)
cd android
SENTRY_DISABLE_AUTO_UPLOAD=true JAVA_HOME=$(/usr/libexec/java_home -v 17) ./gradlew assembleRelease
adb install -r app/build/outputs/apk/release/app-release.apk
adb shell monkey -p com.santahades.oripics -c android.intent.category.LAUNCHER 1
```

- 폰: 개발자 옵션 → USB 디버깅 ON + 케이블 연결 (`adb devices`로 확인)
- Sentry env 없이는 iOS와 동일하게 `SENTRY_DISABLE_AUTO_UPLOAD=true` 필수 (없으면 sentry-cli에서 빌드 실패)
- JDK 17 필요 (`/usr/libexec/java_home -v 17`), 첫 빌드 ~30분(Intel)·이후 2~5분
- 크래시 로그: `adb logcat -d -s AndroidRuntime:E ReactNativeJS:E`
- Play 배포 전이므로 attest는 Standard 폴백 — Verified는 U-34+스토어 배포 후

## 4. 이슈 대응

### 알려진 빌드 이슈 (2026-08-18 실측)
- **expo-modules-jsi + 로컬 Xcode 26.2 컴파일 오류** (2026-08-24 갱신): 57.0.4의 Date 오류는
  57.0.5 업그레이드로 해소됐으나, 57.0.5는 `RuntimeScheduler.h`에서 새 오류
  ("cannot be annotated with SWIFT_RETURNS_RETAINED") 발생 → 해당 파일의
  `SWIFT_RETURNS_RETAINED RuntimeScheduler` 주석 2곳(생성자, 53·61행 부근)을 제거하는 로컬 패치 적용.
  **`npm install` 시 패치 소실 — 재발하면 동일 수정 재적용.** EAS 클라우드 빌드는 Xcode 버전이
  달라 패치 없이 통과(1.0.0(2)/(3) 실측). 근본 해결은 상류 수정 대기.
- **Sentry 소스맵 업로드 실패(org 미설정)**: U-36 전까지 로컬 Release 빌드는 `SENTRY_DISABLE_AUTO_UPLOAD=true` 필요(캡처 스크립트에 반영됨). EAS 빌드는 U-36 후 Sentry env 설정과 함께 해제.
- **새 expo 네이티브 패키지 설치 후 앱이 기기에서 크래시**: `expo install`은 JS 의존성만 추가 — 기존 `ios/` 프로젝트를 유지한 채 xcodebuild로 빌드하면 네이티브 모듈이 링크되지 않아 시작 즉시 크래시. **`cd ios && pod install` 후 재빌드** (expo-localization 추가 시 실측, 2026-08-21).
- **CoreSimulator 버전 충돌**(Xcode 교체 직후): `launchctl remove com.apple.CoreSimulator.CoreSimulatorService` 후 재시도.
- **실기기에서만 긴 Text 줄바꿈 잘림** (2026-08-21, iPhone 12 Pro Max iOS 26.6): 카드 안의 긴 한 줄
  문자열(sub.benefits)이 줄바꿈 없이 화면 밖으로 잘림. 같은 번들이 시뮬레이터(iOS 26.3.1)에선 정상 —
  근본 원인 미확정(스크롤 컨테이너 stretch 적용 후에도 기기에서 지속). **회피책: 긴 안내 문구는
  i18n 키를 줄 단위로 분리**(sub.benefits1/2 참조). 새 화면에 문장형 안내를 넣을 때 실기기 확인 필수.

- 빌드 실패·크래시 로그·검증 불일치 등은 **세션에 그대로 붙여넣으면 AI가 대응** (셀프테스트 불일치 = 코덱/해시 규약 문제 → 최우선).
- 재현 가능한 해시 불일치는 절대 골든값을 바꾸지 말 것 — 코드를 고친다 (`golden.test.ts` 원칙).

## 변경 이력

| 일자 | 변경 |
|---|---|
| 2026-08-07 | 최초 작성 — M7 코드(eas.json·Sentry 게이트·베타 표기) 완료 시점 |
