# OriPics 모바일 앱 개발 계획서 (iOS / Android)

> **작성**: 2026-06-18 · **최종 갱신**: 2026-08-07 (스택 재검증 — 부록 B)
> **상태**: 착수 전 계획. 작성 후 변화: C2PA **CONFORMANT 승인 완료**(6/23, §1.3의 "approver 대기" 해소), 웹 결제 실운영 가동(7/24), 요금제 v3 확정, **§8-A 재확정(2026-08-23 결정 B): 모바일 인앱결제 없음·웹 구독만 → M6 IAP 폐기·U-35 취소**, SSL.com cert Validation 진행 중(단 **Free Tier는 cert 1개=웹 1개 — 모바일은 추가 cert/Premium 협상 필요**, c2pa_esigner 메모 참조)
> **범위**: 웹과 동일 가치(원본 증명)를 모바일 네이티브 카메라(Verified 경로) 중심으로 확장하는 iOS/Android 앱 개발의 전체 실행 계획
> **관련 문서**: [roadmap.md](roadmap.md)(트랙 B/D 전략), [c2pa-security-architecture-document.md](c2pa-security-architecture-document.md)(DISTRIBUTED 아키텍처), [pricing-policy.md](pricing-policy.md)(Verified 게이팅), [app-store-metadata.md](app-store-metadata.md)(스토어 메타), [follow-ups.md](follow-ups.md)(미결 항목)

---

## 0. 한눈 요약 (TL;DR)

- **스택 확정**: React Native + **Expo SDK** (TypeScript / Expo Router / expo-secure-store / NativeWind / Zustand+TanStack Query / EAS Build·Submit·Update). roadmap.md D.2에서 확정, **2026-08-07 재검증으로 유지 확정**(결정 근거: `@oripics/stamp` 해시·LSB 로직의 TS 단일 소스 유지 — Flutter/네이티브는 재작성으로 해시 불일치 리스크). 단 부품 3가지 보정: 카메라=**react-native-vision-camera**(expo-camera 대체, `lens_position`·정밀 줌), 픽셀 파이프라인=**react-native-skia**(readPixels/PNG 무손실 인코딩), 기기 무결성=**expo-app-integrity**(공식 모듈, App Attest+Play Integrity 통합). Expo Go 불가 — 처음부터 **dev build 전제**.
- **모바일의 존재 이유**: 웹은 `F`(파일)·`C`(클립보드) 경로만 가능 → **`P`(네이티브 카메라 촬영) 경로는 모바일 전용**이며, 이게 **Verified 티어(Pro 한정)의 유일한 진입점**. 즉 모바일 = 매출(Pro 전환)의 핵심 차별재.
- **백엔드는 그대로 재사용**: 서명·발급·검증 API(`/api/sign` → `confirm` → `publish`, `/api/verify`, `/api/attest/challenge`)가 이미 모바일을 전제로 설계됨(verified 분기·`com.oripics.verified` assertion·platform 필드 존재). 모바일은 **새 백엔드가 아니라 새 Edge 클라이언트**.
- **현재 실측 상태(2026-06-18)**: 모노레포는 **미착수** — `apps/web` 단일, `packages/`·`apps/mobile` 없음, pnpm/turbo 미설정, npm+`legacy-peer-deps` 사용. attest 검증(`verifyToken.ts`)은 **stub**. C2PA 운영 인증서는 **approver 승인 대기**.
- **3대 선행 블로커**: ① 모노레포 추출(트랙 B Phase 2–8) ② C2PA Conformance Letter + SSL.com 운영 인증서(→ CONFORMANT 완료, cert Validation 진행 중) ③ ~~앱스토어 IAP 정책 결정~~ → **§8-A 재확정(2026-08-23, 결정 B: 인앱결제 없음·웹 구독만)** — 잔여 선행은 사실상 ①뿐.

---

## 1. 현재 상태 grounding (착수 시 사실관계)

### 1.1 이미 존재하는 자산 (재사용·의존)

| 자산 | 위치 | 모바일 관점 |
|---|---|---|
| 서명 API `/api/sign` | `apps/web/src/app/api/sign/route.ts` | verified 분기 + `platform`/`attest_token`/`nonce`/`zoom_factor`/`lens_position` 입력 이미 수용. 모바일이 그대로 호출 |
| 발급 흐름 `confirm`→`publish` | `api/links/{confirm,publish}` | 3단계 JWT 체인(sign JWT→receipt JWT). 모바일 동일 사용 |
| C2PA verified 경로 | `lib/oripics-stamp/c2pa.ts` (`com.oripics.verified`, `C2paAttachInput.verifiedInfo`) | `platform: 'ios'\|'android'`, `attestTokenHash`, `zoomFactor`, `lensPosition` 필드 존재 → 모바일이 채워 보냄 |
| attest 챌린지 | `lib/attest/challenge.ts` + `GET /api/attest/challenge` | stateless HMAC nonce(5분). **구현 완료** |
| 스테가노 알고리즘 / 포맷 상수 | `lib/oripics-stamp/{common,v2,v3,v4}.ts` | 비트단위 LSB embed/extract·메타(v2/v3/v4) 로직은 **순수 이식 가능**(아래 §5) |
| 인증/세션 | `lib/authOptions.ts` (Google·Kakao·Naver·Email, JWT 세션) | 모바일은 동일 provider로 OAuth → 토큰 보관 필요 |
| 스토어 메타데이터 초안 | `docs/app-store-metadata.md` | 앱명·부제·카테고리·Privacy Label 매트릭스 초안 완료 |

### 1.2 아직 없는 것 (이번 계획의 작업 대상)

- ❌ 모노레포 구조: `packages/`(공유 lib)·`apps/mobile` 없음. pnpm workspace·turborepo 미설정. 현재 npm 단일.
- ❌ attest **검증** 본 구현: `lib/attest/verifyToken.ts` = `AttestVerifierNotImplementedError` stub (A-4 iOS / A-5 Android).
- ❌ 모바일 앱 자체(트랙 D) 일체.
- ❌ 모바일 클라이언트용 stamp 인터페이스(`@oripics/stamp` 추출 + 네이티브 이미지 코덱 어댑터).
- ⚠️ C2PA 운영 인증서: approver 승인 → Conformance Letter → SSL.com cert. 현재 dev 인증서(untrusted)로만 동작.

### 1.3 외부 의존성 현황 (2026-06-18)

| 항목 | 상태 | 모바일 영향 |
|---|---|---|
| C2PA approver 승인 | 대기(6/17 큐 이동) | 운영 서명. dev 인증서로 개발은 가능, 출시 전 운영 cert 필수 |
| SSL.com 운영 인증서 | Letter 의존 | 동일 |
| Google Play Console 신원확인(U-2) | 미확인 | Android 출시·Play Integrity 전제 |
| Apple Developer Program | 가입 완료 | iOS 빌드·App Attest 가능 |
| 결제(PortOne/KG이니시스) | 실운영(7/24 e2e) | **웹 결제만 — 모바일 인앱결제 없음(§8-A 결정 B, 2026-08-23). 앱은 순수 클라이언트** |

---

## 2. 확정 사항 (재논의 불필요, 근거 명시)

| 결정 | 내용 | 근거 |
|---|---|---|
| 프레임워크 | **React Native + Expo SDK** (TypeScript) | roadmap.md D.2 L506 · **2026-08-07 재검증 유지**(TS 해시 로직 단일 소스가 결정 요인) |
| 내비/카메라/저장/해시 | Expo Router · **react-native-vision-camera**(2026-08-07 expo-camera에서 변경 — 렌즈 선택·수동 제어) · expo-secure-store(Keychain/Keystore) · expo-crypto | roadmap.md D.2 + 재검증 |
| 픽셀 파이프라인 | **react-native-skia**: decode → readPixels(RGBA, unpremul 지정) → LSB 임베드 → MakeImage → encodeToBytes(**PNG 무손실**). expo-image-manipulator는 raw pixel 미노출로 부적합 | 2026-08-07 재검증 |
| 기기 무결성 모듈 | **expo-app-integrity**(공식) — App Attest+Play Integrity 통합 JS API. 서버 검증(A-4/A-5)은 별도 | 2026-08-07 재검증 |
| 경로 모델 | 웹=`F`+`C` / 모바일=`P`+`F`+`C`. `P`=네이티브 카메라(Verified), `F`=갤러리/파일(Standard), `C`=붙여넣기(Standard) | roadmap.md L19,96 |
| Verified 게이팅 | **Pro 구독 한정**. Free는 Standard만 | pricing-policy §1 |
| C2PA 아키텍처 | **DISTRIBUTED** — iOS/Android Edge(IN TOE) + 공통 백엔드 서명(IN TOE), 웹은 TOE 외 | c2pa-arch C.1.3–C.1.5 |
| 서명 인증서 | **백엔드 공유 단일 cert**(SSL.com). 단 iOS·Android는 **각각 별도 Intake Form** 제출 | c2pa-arch C.1.3 L124 |
| 기기 무결성 | iOS=**App Attest**(`DCAppAttestService`) / Android=**Play Integrity** | c2pa-arch C.2.2 |
| GPS 토글 | 모바일 `P` 경로에서만 노출(웹 제거) | roadmap 결정표 |

---

## 3. 시스템 아키텍처 — 모바일 ↔ 백엔드

### 3.1 큰 그림

```
[iOS/Android 앱 (Edge, IN TOE)]
  카메라 촬영(P) / 갤러리(F) / 붙여넣기(C)
  → 이미지 디코드 → inner/border 해시 계산 → (Verified면) App Attest/Play Integrity 토큰
        │  HTTPS TLS 1.3
        ▼
[백엔드 (Vercel Functions, IN TOE)]
  /api/sign         : 세션 검증 + (verified) nonce·attest 검증 → sign JWT(final_hash, 5분)
  /api/links/confirm: sign JWT 검증 + 크레딧 차감 → receipt JWT(30일)
  /api/links/publish: receipt JWT 검증 + LSB 해시 대조(timingSafeEqual) → C2PA 매니페스트 서명·첨부 → 공개 URL
        │
        ▼
[Supabase Storage/DB]  (서명된 직접 업로드 URL로 Edge가 PNG 업로드)
```

### 3.2 모바일이 호출할 API 계약 (요약)

| 엔드포인트 | 메서드 | 인증 | 핵심 입력 | 반환 |
|---|---|---|---|---|
| `/api/attest/challenge` | GET | 없음 | — | `{nonce, exp}` (5분) |
| `/api/sign` | POST | 세션 | `inner_hash,border_hash,width,height,upload_type(P/F/C),lat_e6?,lng_e6?,tier,nonce?,attest_token?,platform?,zoom_factor?,lens_position?` | `signed_upload_url, upload_token, jwt(sign), link_id, final_hash…` |
| (Storage 직접 PUT) | PUT | signed URL | 스탬프된 PNG | — |
| `/api/links/confirm` | POST | JWT only | `{jwt_token}` | `{receipt, proof_cost, tier…}` |
| `/api/links/publish` | POST | 세션 | `{receipt, thumbnail?}` | `{public_url, link_id…}` |
| `/api/links/publish/upload-url` | POST | 세션 | `{receipt}` | 만료 시 새 signed URL |
| `/api/verify` | POST | 세션 | `{meta_hex,inner_hash,border_hash,extracted_final_hash,link_id?}` | `{match, trust_report…}` |
| `/api/credits/me` | GET | 세션 | — | `{tier,credits,creditsRenewAt…}` |

### 3.3 Verified(P 경로) 촬영 시퀀스

1. 앱: `GET /api/attest/challenge` → `nonce`
2. 앱: 카메라 촬영 → 이미지 디코드 → inner/border 해시 계산(공유 lib)
3. 앱: iOS App Attest / Android Play Integrity 호출(payload에 `nonce` 포함) → `attest_token`
4. 앱: `POST /api/sign` (`tier:'verified'`, `platform`, `nonce`, `attest_token`, `zoom_factor`, `lens_position`, GPS 옵션)
5. 백엔드: 세션·구독(Pro) 확인 → nonce 검증 → **`verifyAttestToken()`**(A-4/A-5 본 구현 필요) → sign JWT 발급
6. 앱: final_hash를 PNG border LSB에 임베드 → signed URL로 PNG 업로드
7. 앱: `confirm` → `publish` → 공개 URL + C2PA(`c2pa.created`+`digitalCapture`+`com.oripics.verified`)

---

## 4. 코드 재사용 분석 (`@oripics/stamp` 추출)

### 4.1 그대로 이식 가능 (순수 로직 → `packages/stamp`)

- `common.ts`: 매직바이트·오프셋·포맷(v2/v3/v4) 상수, 좌표 생성, 바이너리 유틸
- LSB embed/extract **비트 로직**(v2/v3/v4의 Canvas 비의존 부분)
- 메타데이터 구성(버전별), 해시 규약(HMAC-SHA256/SHA-256 — 모바일은 expo-crypto/네이티브 crypto)
- `c2pa-trust-list.ts`(정적 트러스트 앵커 데이터)
- attest nonce 포맷 규약

### 4.2 네이티브 재구현 필요 (플랫폼 어댑터)

| 웹 구현 | 모바일 대체 |
|---|---|
| Canvas 디코드/인코드(`v2.ts`) | **react-native-skia** — readPixels(RGBA)로 디코드, encodeToBytes로 PNG 무손실 인코딩 (2026-08-07 확정. ⚠️ alphaType **unpremul** 지정 필수 — 프리멀티플라이 시 픽셀값 변형 → 웹과 해시 불일치) |
| 워터마크 합성(`watermark.ts`) | Skia(`@shopify/react-native-skia`) — 픽셀 파이프라인과 동일 라이브러리로 통일 |
| 영수증 localStorage(`receipts.ts`) | `expo-secure-store`(Keychain/Keystore) |
| XHR 업로드(`index.ts`) | `fetch`/`expo-file-system` 업로드 |

> **핵심 설계 원칙**: `@oripics/stamp`는 **이미지 픽셀 입출력을 인터페이스로 추상화**하고(주입식 codec), 순수 해시·임베드·메타 로직만 공유. 웹은 Canvas 어댑터, 모바일은 네이티브 어댑터를 주입. → 인증 알고리즘이 양 플랫폼에서 **단일 소스**로 유지되어 검증 호환성 보장.

---

## 5. 단계별 실행 계획

> 각 단계: **목표 · 작업 · 산출물 · 수용기준 · 의존성 · 예상기간**. 기간은 1인 풀타임 환산 추정.

### Phase M0 — 모노레포 기반 마련 (트랙 B Phase 2–8) · ✅ 완료 (2026-08-07)

> **구현 결과** (계획과의 차이 포함):
> - **M0-1**: 루트 npm workspace 도입 — 단 **`apps/web` 제외**(§8-D 확정 참조). `vercel.json`/rootDirectory **무변경** — 배포 파이프라인 그대로.
> - **M0-2**: `@oripics/stamp` 추출 완료. 위치는 **`apps/web/packages/stamp`** (repo 루트 아님 — 아래 M0-3). 순수 코어(common·v2·v3·v4)와 codec 인터페이스(`codec.ts`: PixelData·Sha256Fn·ImageCodec, RGBA/sRGB/unpremul 규약 명문화). sha256은 주입식. 웹은 기존 경로(`src/lib/oripics-stamp/*`)가 얇은 어댑터로 남아 **임포트 사이트 8곳 무변경**. c2pa-trust-list는 서버 전용+갱신 스크립트 의존이라 웹에 잔류.
> - **회귀 증명**: `golden.test.ts` — 추출 전 구현으로 기록한 해시·스탬프 픽셀 골든값(innerHash·borderV2/V3/V4·stamped)과 비트 단위 일치. 전체 68 테스트 통과 + `next build` 통과.
> - **M0-3**: subtree 영향 해소 — 패키지를 apps/web 내부에 두어 front repo(=apps/web subtree)에 포함, Vercel 빌드 자립성 유지. tsconfig paths(`@oripics/stamp`)로 소스 컴파일(웹은 node_modules 심링크 불필요).
> - **M0-4**: `apps/mobile` Expo SDK 57 스캐폴드(Expo Router·TS, name/slug/scheme=oripics), metro.config 모노레포 설정(watchFolders·nodeModulesPaths), stamp 어댑터 스켈레톤(`src/lib/stamp`). 검증: `tsc --noEmit` 클린 + `expo export --platform ios` 번들 성공(스모크 임포트 포함).
> - **잔여(M0 밖으로 이월)**: EAS 프로젝트 초기화(`eas init` — Expo 계정 로그인 필요, User), 3-플랫폼 해시 일치 스파이크 실측(M2에서 skia codec 구현 후 — 골든값은 이미 고정됨).

- **목표**: `apps/web` 단일 → 모노레포로 전환하고 `@oripics/stamp` 추출, `apps/mobile` 부트스트랩.
- **작업**:
  - M0-1 워크스페이스 도입(pnpm workspace 또는 npm workspace — **결정필요 §8-D**), turborepo 설정, `vercel.json`/`rootDirectory` 조정
  - M0-2 `packages/stamp` 추출(§4.1) + codec 인터페이스 설계 + 웹 어댑터로 회귀 검증
  - M0-3 `packages/tsconfig` 공유, GitHub subtree prefix 영향 점검
  - M0-4 `apps/mobile` Expo 앱 스캐폴드(Expo Router/NativeWind/EAS 초기화)
- **산출물**: 빌드되는 모노레포, `@oripics/stamp` 패키지, 빈 Expo 앱(빌드/실행 OK)
- **수용기준**: 웹 회귀 테스트 전부 통과(서명·발급·검증 라운드트립 무변화), Vercel 배포 정상, `eas build` dev client 성공
- **필수 스파이크(2026-08-07 추가)**: **동일 이미지 → 웹/iOS/Android 3곳 inner/border 해시 완전 일치 + Skia PNG 재인코딩 라운드트립 무손실** 검증. 실패 시(코덱 차이·프리멀티플라이 등) 해법은 스택 교체가 아니라 **stamp 코어의 C++/JSI 모듈화**(RN 유지)
- **의존성**: 없음(지금 착수 가능)
- **기간**: ~1.5주
- ⚠️ **리스크**: 현재 `legacy-peer-deps`(nodemailer8↔next-auth) — pnpm 전환 시 peer 해석 재발 가능. workspace 도구 결정과 함께 검증.

### Phase M1 — 앱 셸 & 인증 · ✅ 코어 완료 (2026-08-07), 잔여 = OAuth 콘솔 등록(M1.5)

> **구현 결과**:
> - **백엔드 Bearer 경로 (보강 완료)**: 자체 HS256 JWT(`src/lib/auth/mobileTokens.ts` — NEXTAUTH_SECRET 서명, access 7일/refresh 90일 무상태 회전, aud=oripics-mobile, 6개 유닛테스트). `getSessionUserId()` 헬퍼가 Bearer→쿠키 순 수용(Bearer 무효 시 쿠키 폴백 안 함 — 명확한 401로 refresh 트리거). **6개 라우트 전환**: credits/me·sign·verify·links/publish·publish/upload-url·proof/history(email→id 조회 전환).
> - **엔드포인트**: `POST /api/mobile/auth/login`(이메일+비밀번호, 실패 사유 비구분) / `refresh`(회전+탈퇴 차단) / `oauth`(google=id_token aud 검증·kakao/naver=access_token 프로필 조회 — 웹 signIn 콜백과 동일한 계정 연결 규칙: 기존 Account 매칭→이메일 충돌 409 OAuthAccountNotLinked→신규 생성+가입 보너스).
> - **모바일**: expo-secure-store 토큰 보관(`tokenStore.ts`), `apiFetch` 래퍼(Bearer 자동 첨부, 401→refresh 1회→재시도→로그아웃 통지), `AuthContext`(부팅 복원→credits/me로 세션 검증, signInWithPassword/signInWithProviderToken/signOut), 홈 화면 = 로그인 폼 ↔ 계정 카드(티어·잔여 건수 칩+갱신일+새로고침+로그아웃). 로컬 dev는 `EXPO_PUBLIC_API_URL=http://<맥IP>:3939`.
> - **검증**: 웹 74 테스트+next build 통과, 모바일 tsc 클린+iOS export 번들 성공. 실기기 로그인 왕복은 배포 후 확인.
> - **잔여(M1.5)**: ①OAuth 콘솔 등록(User) — Google iOS/Android 클라이언트 ID(`GOOGLE_MOBILE_CLIENT_IDS` env)·Kakao/Naver 앱에 모바일 플랫폼 추가 ②모바일 OAuth 버튼 활성화(expo-auth-session, 백엔드·컨텍스트는 준비됨) ③레이트리밋·refresh 폐기 = **A-38**(P2, 베타 전).
- **원 계획**: Google/Kakao/Naver OAuth + 이메일 로그인 → 토큰 `expo-secure-store` 보관; 인증 인터셉터; `/api/credits/me` 연동 잔액 칩. 수용기준: 4개 provider 로그인, 토큰 안전 보관, 재기동 세션 유지, 401 자동 갱신.

### Phase M2 — `F` 경로 (Standard) · ✅ 코드 완료 (2026-08-07), 잔여 = 실기기 검증

> **구현 결과**:
> - **skia codec 본 구현** (`src/lib/stamp/index.ts`): decode=MakeImageFromEncoded→readPixels(**RGBA_8888·AlphaType.Unpremul 강제**), encodePng=MakeImage→encodeToBytes(PNG). sha256=expo-crypto digest. **뷰어 경량본**(A-36)도 skia로 — Surface 리스케일 1600px→JPEG78 base64 dataURL(>700KB일 때만, 실패 시 null 폴백).
> - **발급 흐름** (`publishFlow.ts`): 웹 index.ts V4 흐름 미러 — decode→inner/borderV4 해시→`/api/sign`(F)→meta+final_hash 페이로드 임베드→PNG→signed URL 직접 PUT(expo/fetch, ArrayBuffer body)→`confirm`(receipt 보관)→`publish`(+preview). 인증은 Bearer(apiFetch, 401 자동 갱신).
> - **receipt 보관** (`receiptStore.ts`): 문서 디렉터리 JSON(50개 롤링) — SecureStore 2KB 제한 회피. 재드롭 대응(A-32 모바일판)의 저장 기반.
> - **인증 화면** (explore 탭→"인증"): 갤러리 선택→7단계 진행 라벨→결과 카드(공개 URL·복사·공유·차감 표시)→크레딧 칩 갱신. iOS 사진 권한 문구 등록.
> - **해시 호환 스파이크 준비**: `selfTest.ts` — 웹 golden.test.ts와 동일 결정적 픽셀·골든값으로 기기에서 해시 5종 대조 + **skia PNG 라운드트립 무손실**+페이로드 생존 검사. 인증 화면 [DEV] 버튼으로 실행.
> - **검증**: tsc 클린 + iOS export 번들 성공. **잔여(실기기, User와 함께)**: ①dev build에서 셀프테스트 실행(skia는 Expo Go 불가 → `npx expo run:ios|android` 또는 EAS dev client) ②실사진 발급 e2e→공개링크를 웹 검증기에 드롭해 valid 확인 ③고해상(48MP) 메모리 실측.
> - 범위 노트: `C`(붙여넣기) 경로는 모바일 UX상 수요 낮아 보류(공유 시트 수신 확장으로 대체 검토), GPS 옵션은 M3(P 경로)에서.
- **원 계획**: 이미지 선택 → 디코드 → 해시 → sign(standard) → 업로드 → confirm→publish → 공개 URL/공유; 영수증 보관+재드롭. 수용기준: 웹과 동일 이미지 해시 일치, 공개링크가 웹 검증기에서 valid.

### Phase M3 — `P` 경로 카메라 UX (Verified 골격, attest 전) · ✅ 코드 완료 (2026-08-07), 잔여 = 실기기 검증

> **구현 결과**:
> - **vision-camera v5** (설치 시점 5.2.2 — ⚠️ v4와 전혀 다른 훅 기반 API): `useCameraDevice('back', {physicalDevices})` + `usePhotoOutput().capturePhotoToFile()` + `<Camera device isActive outputs zoom>`. **v5는 config plugin이 없음** → 권한은 app.json `ios.infoPlist.NSCameraUsageDescription` + `android.permissions=[CAMERA]` 직접 선언.
> - **촬영 화면**(`src/app/capture.tsx`, '촬영' 탭 신설 — Home/촬영/인증 3탭): 배율 프리셋(기기 `minZoom`<1 → 0.5×, `zoomLensSwitchFactors` 기반 2×/3×) + 핀치줌(Gesture.Pinch, min/max 클램프) + GPS 토글(expo-location, 촬영 시점 좌표) + 셔터→발급 파이프라인(진행 단계 오버레이)→결과 카드(URL 복사·공유·다시 촬영). 웹은 `capture.web.tsx` 폴백(vision-camera 웹 번들 제외).
> - **메타 수집**: `zoom_factor`(표시 배율), `lens_position`(zoom 구간 휴리스틱: <0.95→ultra-wide / ≥렌즈 전환점→telephoto / wide) — sign body로 전달. 서버는 verified 요청에서만 기록(M4부터 유효), GPS는 지금도 V4 메타에 인코딩.
> - **publishFlow 확장**: `uploadType('F'|'P')`·`gps`·`zoomFactor`·`lensPosition` 옵션 — P는 M4 전까지 서버에서 standard 처리(계획대로 임시 라운드트립).
> - **검증**: tsc 클린 + iOS/웹 export 번들 성공. **잔여(실기기)**: 줌/렌즈 전환 실측(특히 lens_position 휴리스틱 vs 실제 활성 렌즈), GPS on/off 반영, 고해상(48MP) 촬영→발급 시간·메모리.
- **원 계획**: vision-camera 커스텀 UI, zoom/lens 캡처, GPS 토글, 촬영 즉시 해시 → (임시) standard 라운드트립. 수용기준: 줌/렌즈 메타 수집, GPS 정확 반영, 대용량 처리 허용범위.

### Phase M4 — 기기 무결성 (App Attest / Play Integrity) · ✅ 코드 완료 (2026-08-07), 잔여 = U-34 설정 + 실기기

> **구현 결과**:
> - **백엔드 A-4 (iOS App Attest)**: `lib/attest/appleAppAttest.ts` — 자체 CBOR 최소 디코더(`cbor.ts`) + Apple App Attestation Root CA 임베드(공식 PEM, SHA1 지문 검증 후 고정) + 검증 6단계(체인·유효기간 / nonce=SHA256(authData‖SHA256(challenge)) ↔ leaf 확장 OID 1.2.840.113635.100.8.2 / 공개키 SHA256=keyId / credentialId=keyId / rpIdHash=SHA256(TeamID.BundleID) / counter=0·aaguid 운영·개발 분기). 토큰 계약: `base64(JSON{key_id, attestation})`, 매 인증마다 새 키+attestation(서버 무상태).
> - **백엔드 A-5 (Play Integrity)**: `lib/attest/playIntegrity.ts` — 서비스 계정 JWT-bearer OAuth(직접 서명, SDK 무의존) → `decodeIntegrityToken` → **verdict 판정 순수함수**(challenge 바인딩: standard `requestHash`/classic `nonce` 겸용+base64 재인코딩 수용, 패키지 일치, 10분 신선도, PLAY_RECOGNIZED, MEETS_DEVICE/STRONG_INTEGRITY).
> - **게이트**: `verifyToken.ts` 디스패처 — 플랫폼별 필수 env 미설정 시 기존 개발 폴백(토큰 해시만) 유지, env 설정 즉시 실검증 전환(**U-34**). 유닛테스트 19종(CBOR·authData·nonce 추출·verdict 전 경로) — 전체 93 테스트 통과.
> - **클라이언트**: `@expo/app-integrity`(SDK 57 공식, ⚠️ npm 무스코프 `expo-app-integrity`는 구식 커뮤니티 패키지 — 혼동 금지) — iOS `generateKeyAsync→attestKeyAsync(keyId, nonce)`, Android `prepareIntegrityTokenProviderAsync(GCP프로젝트번호)→requestIntegrityCheckAsync(nonce)`. 촬영 화면: **Pro 이상이면 Verified 자동 시도, attest 실패 시 Standard 폴백**(경고 로그), 결과 카드에 티어 표시.
> - **앱 식별자 확정**: iOS bundleIdentifier=Android package=**`com.santahades.oripics`** (attest 앱 바인딩·U-34 env와 일치 필수).
> - **잔여**: ①U-34 운영 설정(Apple env 2개 / Play Console↔GCP 연결+서비스 계정+env 3개) ②실기기 수용기준 검증(위조/재생 거부·nonce 만료 거부·정상 기기 통과 — App Attest는 시뮬레이터 불가) ③Xcode App Attest capability(dev build 시 자동 entitlement 확인).
- **원 계획 수용기준**: 위조/재생 토큰 거부, nonce 만료(5분) 거부, 정상 기기 통과; `com.oripics.verified`에 `attest_token_hash`·`device_integrity` 기록.

### Phase M5 — 발급·검증·크레딧 완성 + 운영 C2PA 연동 · ✅ 코드 완료 (2026-08-07), 잔여 = 운영 cert(외부)·실기기

> **구현 결과**:
> - **Verified E2E 체인 실측 확인**: 서버는 이미 완결 상태였음 — sign JWT `verified_info` → confirm receipt → publish → C2PA `c2pa.created`+digitalCapture DST+`com.oripics.verified`(platform·attest_token_hash·zoom_factor·lens_position). M4의 클라이언트 verified 요청과 결합되어 코드상 end-to-end 연결 완료. **추가 서버 작업 불필요 판정.**
> - **인앱 검증 (M5 신규)**: `verifyFlow.ts` — 웹 detectStamp/verifyImage의 V4/V3/V2 분기 완전 미러. 2단계 UX: ①로컬 무료 판독(LSB 추출+magic, 서버 호출 없음 → 버전·타임스탬프·크기·GPS 미리보기) ②서버 검증(1건 차감 사전 고지, Bearer) → **match·owner_exempt(내 이미지 면제)·metadata·trust_report(overall_trust 한글화·verify_url) 표시**. 판독 픽셀을 검증에 재사용(중복 디코드 없음). `verify-panel.tsx`로 인증 탭에 통합(+ScrollView 전환).
> - **크레딧 차감 UI**: 발급 결과에 차감 건수·티어(M4), 검증 버튼에 "1건 차감" 사전 고지, owner_exempt 시 면제 표시, 각 동작 후 잔액 칩 갱신.
> - **운영 cert 연동**: 코드 없음 — cert 도착 시 Vercel env swap 런북(현황 트래커·메모리에 보존)만 실행하면 모바일 포함 trusted 전환. 현재 SSL.com Validation 단계 대기.
> - **잔여**: ①실기기에서 Verified 공개링크 생성 → c2patool로 `c2pa.created`+digitalCapture valid 확인(수용기준) ②운영 cert 적용 후 trusted 회귀 ③U-34 설정 전 Verified는 개발 폴백 attest로 동작.
- **원 계획 수용기준**: Verified 공개링크가 외부 C2PA 도구에서 `c2pa.created`+digitalCapture로 valid, 운영 cert 적용 시 trusted.

### Phase M6 — 결제/구독 (모바일) · **정책 의존**

- **목표**: 모바일에서 Pro 구독(=Verified 잠금 해제).
- ✅ **코드 완료 (2026-08-07)**, 잔여 = U-35 App Store Connect 설정 + Sandbox 실기기:
  > - **서버**: `lib/payment/appleIap.ts` — StoreKit 2 JWS 검증(x5c 체인→**Apple Root CA G3 임베드**(지문 검증 후 고정)·ES256 raw→DER 변환·유효기간), 트랜잭션 필드 검증 순수함수(번들ID·제품 매핑·만료·환불·Sandbox 게이트), **부여=PortOne subscriptionGrant 패턴 미러**(advisory lock 멱등 by transactionId, 크레딧 정액 SET 1000, previous_credits, Subscription upsert gateway='apple_iap', 연결제도 renewAt 30일 앵커), **이중 구독 가드**(타 게이트웨이 active 구독 → 409). 유닛테스트 12종(전체 105 통과).
  > - **엔드포인트**: `POST /api/mobile/iap/apple/verify`(구매/복원 공용, Bearer) + `POST /api/mobile/iap/apple/notifications`(**Server Notifications V2**: DID_RENEW/SUBSCRIBED/DID_RECOVER→재부여, EXPIRED/REFUND/GRACE_PERIOD_EXPIRED/REVOKE→다운그레이드+링크 grace 37일, DID_CHANGE_RENEWAL_STATUS→cancelAtPeriodEnd 기록. signedPayload JWS 자체가 인증). env `APPLE_IAP_BUNDLE_ID` 미설정 시 503(안전 게이트).
  > - **모바일**: `expo-iap`(v5, StoreKit 2) `subscribe-panel.tsx` — **iOS+Free 티어만 노출**(가드 1차), 상품 2종 displayPrice 표시, 구매→서버 verify→finishTransaction→잔액 갱신, **구매 복원**, 웹 가격 언급 0(3.1.1 철칙 주석 명문화). Home 화면 통합.
  > - **Android**: 계획대로 결제 구현 없음(소비 전용) — 패널이 iOS 외 플랫폼에서 null 반환.
  > - **잔여**: U-35(SBP 가입·제품 등록·Notifications URL·env) → Sandbox 실기기 구매/복원/환불 왕복 → 수용기준 검증. 패스 상품(non-renewing)은 2차 출시 시.
- **원 수용기준**: 구독 성공 시 Verified 즉시 해금, 갱신/취소/복원·환불 웹훅 처리, 서버 권위 검증, 웹 구독자 로그인 시 전 기능 동작(IAP 미구매 상태).

### Phase M7 — 베타 (TestFlight / Play 내부 테스트) · ✅ 코드 완료 (2026-08-07), 실행 = [베타 런북](mobile-beta-runbook.md)

> **구현 결과** (계정 불요 부분 완료):
> - **EAS 설정** (`eas.json` 커밋): development(dev client)/preview(internal, autoIncrement)/production 3개 프로파일, `appVersionSource: remote`, 전 프로파일 `EXPO_PUBLIC_API_URL` 주입, submit 스켈레톤(iOS ascAppId placeholder·Android internal track, `play-service-account.json`은 gitignore).
> - **크래시/진단**: `@sentry/react-native`(v7, expo config plugin) — **DSN 게이트**: `EXPO_PUBLIC_SENTRY_DSN` 미설정 시 완전 no-op(로컬 dev 무영향), 설정 시 init+Sentry.wrap. PII 전송 off, traces 20%. DSN 발급=U-36.
> - **베타 안내·임시 인증서 표기**: 홈 화면 `BetaNotice` — "베타 기간에는 인증 서명이 임시 인증서로 표기될 수 있습니다"(SSL.com 운영 cert 전 untrusted 고지). 정식 출시 시 `EXPO_PUBLIC_BETA=false`.
> - **실행 단계는 전부 대표 계정 작업** → [mobile-beta-runbook.md](mobile-beta-runbook.md): 선행 체크리스트(실기기 검증·U-2·U-16·U-34·U-35·U-36) → eas login/init/credentials → build/submit 명령 → 베타 검증 시나리오 8종 → 이슈 대응 원칙.
- **원 수용기준**: 양 스토어 베타 트랙에 빌드 게시, 핵심 플로우 무크래시 — 런북 §2·§3에서 달성.

### Phase M8 — 스토어 심사·출시

- **목표**: App Store / Play Store 정식 등재.
- **작업(User 결정 동반, follow-ups U-14~U-23)**: 앱 아이콘(U-16, P0)·피처 그래픽(U-17)·스크린샷(U-18)·연령등급(U-14)·키워드(U-15)·Privacy Label(U-20)·Data Safety(U-21) 입력; 심사 대응.
- **수용기준**: 양 스토어 승인·공개.
- **의존성**: M7 + 운영 C2PA cert + 스토어 자산 일체.
- **기간**: 1–3주(외부 심사 변동)

---

## 6. 크리티컬 패스 & 의존 트리

```
M0 모노레포 (지금 착수 가능, 블로커 없음)
  └─ M1 인증 ──┬─ M2 Standard(F/C)
               └─ M3 카메라(P) ── M4 attest(클라+백엔드 A-4/A-5)
                                      └─ M5 Verified+검증 ──┬─ M6 결제 ~~(IAP)~~ 취소(§8-A B: 웹 구독만)
                                                            └─ M7 베타 ── M8 출시

병렬 외부 트랙(앱 코드와 무관하게 진행):
  • C2PA approver 승인 → Conformance Letter → SSL.com 운영 cert  ⇒ M5/M8의 "trusted" 표시에 필요
  • Google Play Console 신원확인(U-2)                          ⇒ M4(Android)·M8 전제
  • 스토어 자산 제작(U-16~U-19)                                 ⇒ M8 전제
```

**순수 개발 기간(추정)**: M0–M8 합산 ~14–17주(1인 풀타임). 외부 심사·블로커 대기 별도.

---

## 7. 타임라인 정합성 — ⚠️ 결정 필요

- 메모리/초기 계획엔 "2026-06 베타 동시 론칭"이 있었으나, 현 시점(2026-06-18) **모노레포 미착수 + C2PA 운영 cert 미발급 + attest 검증 stub** 상태로 6월 베타는 **불가능**.
- roadmap.md의 트랙 D 타임라인(2026-09~10)이 현실적. 본 계획의 ~14–17주 추정과 정합.
- **사용자 결정 필요**: (가) 웹 단독 베타를 먼저 출시하고 모바일은 9~10월 별도 출시, vs (나) 모바일 포함까지 동시 출시를 9~10월로 미루기. → §8-C.

---

## 8. 결정 필요 항목 (착수 전/중 사용자 판단)

| ID | 결정 | 선택지 | 영향 |
|---|---|---|---|
| **§8-A** | **모바일 결제 방식** | ✅ **재확정 (2026-08-23 대표 결정 B): iOS·Android 모두 인앱결제 없음 = 순수 클라이언트.** 구독은 **웹(ori.pics)에서만**(PortOne+KG 실운영), 앱은 로그인해 Pro 상태만 사용. 앱 내 결제·가격·웹결제 유도 문구 전면 없음(App Store 3.1.3 멀티플랫폼/리더 모델). Apple/Google 수수료 0. **트레이드오프**: iOS 사용자는 앱에서 Pro 전환 불가(웹으로 이동), 앱에서 그 경로 안내도 불가. → **~~(라) 하이브리드(2026-08-07): iOS=IAP 병행 ₩12,900/월~~ 폐기.** 조치: `SubscribePanel`·`expo-iap` 제거(커밋 `4e7420a`), 서버 IAP 라우트는 503 게이트로 잔존. 근거 자료: [mobile-iap-policy-research.md](mobile-iap-policy-research.md) | **완료** — U-35(App Store Connect IAP 설정) 취소. 서버 IAP 잔재(`appleIap.ts`, `/api/mobile/iap/apple/*`)는 추후 제거 가능 |
| **§8-B** | iOS·Android **동시 vs 순차** 출시 | 동시(리스크 분산 X, 일정 김) / iOS 먼저(App Attest 성숙) | M4~M8 일정·QA 부하 |
| **§8-C** | **베타/출시 타임라인** | 웹 먼저 출시 후 모바일 9~10월 / 모바일까지 동시 9~10월 | §7 참조 |
| **§8-D** | 워크스페이스 도구 | ✅ **확정(2026-08-07, M0 구현)**: **npm workspaces, 단 `apps/web`은 워크스페이스에서 의도적 제외**(독립 npm 프로젝트 유지 — 오픈 직전 웹의 의존성 트리·legacy-peer-deps·Vercel 빌드 불변 보장). 루트 workspace = `apps/mobile` + `apps/web/packages/*`. turborepo는 보류(2앱 규모에서 불필요, 필요 시 도입) | 해소 |
| **§8-E** | C2PA Intake Form | iOS·Android 각각 별도 제출(arch 문서 기준) 시점·담당 | approver 트랙과 병행 |
| **§8-F** | 연령등급(U-14) | 4+ vs 12+(GPS 사유) | 심사·노출 |

---

## 9. 리스크 레지스터

| 리스크 | 영향 | 완화 |
|---|---|---|
| ~~IAP 강제(§8-A)~~ → **해소(2026-08-23 결정 B)** | — | 인앱결제 자체를 안 함 = 앱에서 디지털 구독 판매 없음(웹 구독만, 3.1.3 멀티플랫폼). Apple IAP 강제 대상 아님 → 리스크 구조적 소멸. 대신 iOS 사용자 전환 마찰(웹 이동)은 감수 |
| 백엔드 세션이 쿠키 전제 | 모바일 인증 마찰 | M1에서 Bearer 토큰 경로 보강(백엔드 작업) |
| 공유 lib codec 추상화 누수 | 웹·모바일 해시 불일치 → 검증 깨짐 | M0에서 codec 인터페이스 + 양 플랫폼 동일 입력 해시 일치 테스트 고정. **특히 iOS 알파 프리멀티플라이·색공간 변환**(Skia alphaType unpremul 지정으로 대응, M0 스파이크에서 실측). 해결 불가 시 C++/JSI로 stamp 코어 이식 — 스택 교체 아님 |
| App Attest/Play Integrity 검증 난도 | Verified 신뢰 근거 약화 | A-4/A-5에 충분한 기간 + replay/nonce 테스트 |
| 운영 C2PA cert 지연(approver) | trusted 표시 불가 | dev cert로 개발 진행, 출시 게이트에만 운영 cert 요구 |
| Play Console 신원확인 미완(U-2) | Android 빌드/출시 중단 | M4 Android 착수 전 선완료 |
| 고해상 이미지 모바일 성능 | UX 저하 | 청크/네이티브 처리, 사이즈별 처리(웹 sizeMultiplier 정책 재사용) |
| pnpm 전환 peer 충돌 재발 | M0 지연 | §8-D 신중 결정 + 격리 브랜치 검증 |

---

## 10. 다음 즉시 액션 (블로커 무관, 지금 가능)

1. ~~§8-A 결제 정책 사전 조사~~ → **완료·확정(2026-08-07)** — [mobile-iap-policy-research.md](mobile-iap-policy-research.md).
2. **§8-D 워크스페이스 도구 결정** → **Phase M0 착수** (모노레포 추출은 외부 블로커와 무관하게 지금 진행 가능, 트랙 D의 실질 출발점).
3. **U-2 Google Play Console 신원확인** 완료(Android 전제, 1~3일 자연 진행).
4. **U-16 앱 아이콘** 디자인 발주(P0, 리드타임 김).
5. C2PA·결제 등 외부 트랙은 기존대로 대기(상대방 차례).

---

## 부록 A — `apps/mobile` 초기 구조(안)

```
apps/mobile/
  app/                 # Expo Router
    (auth)/            # 로그인
    (tabs)/            # 홈·인증·프로필
    capture/           # P 경로 카메라
  src/
    api/               # @oripics/api-client 또는 fetch 래퍼
    stamp/             # @oripics/stamp 네이티브 codec 어댑터
    attest/            # App Attest / Play Integrity 래퍼
    store/             # Zustand
  app.config.ts        # EAS·권한(NSCameraUsageDescription, ACCESS_FINE_LOCATION 등)
packages/
  stamp/               # @oripics/stamp (순수 로직 + codec 인터페이스)
  attest/              # 플랫폼 추상화(선택)
  api-client/          # 타입 공유 API 클라이언트(선택)
  tsconfig/
```

## 부록 B — 변경 이력

| 일자 | 변경 |
|---|---|
| 2026-08-21 | **빠른 연속 촬영 개편 + V5 스탬프(촬영시각)** — 촬영 UX 병목(장당 5~15초) 해소: 셔터=전처리만(원본 JPEG+촬영 컨텍스트[시각·GPS·줌·렌즈] 앱 문서 디렉터리 큐 저장, <0.3s) → 목록 탭에서 후처리(해시→서명→임베드→업로드→링크). 4탭 재배치(홈-촬영-**목록**-판독), 갤러리 인증(F)은 목록 [+ 갤러리]로 통합, 로그인 전 촬영 허용(인증 버튼만 로그인 게이트), GPS는 watchPositionAsync 지속 구독(이동 중 촬영 정확도 — 셔터는 최신 fix 0ms 사용, 첫 fix 전 1장만 단발 대기), attest는 인증 시점 실행(nonce TTL). **트레이드오프 보완 = V5**: 지연 인증으로 서버 timestamp(인증시각)가 촬영보다 늦어지는 문제를 촬영시각 필드(meta 64B, +15B ASCII, 기기 기록·서명에 묶임)로 해소 — 판독·검증·뷰어에 "촬영(기기 기록)/인증(서버 증명)" 병기. 신규 파일: `lib/capture/{queueStore,certify}.ts`·`app/queue.tsx`·`lib/stamp/formatTs.ts`·탭 아이콘 2종(pngjs SDF 생성). 서버: sign `stamp_version:5` 옵트인(하위호환), links.captured_at 컬럼. 잔여: A-38(maestro yaml·스토어 스크린샷 재촬영), A-39(C2PA manifest 촬영시각) |
| 2026-08-19 | **실기기 검증 라운드 통과 (iPhone 12 Pro Max, iOS 26.6)** — 촬영(P) 발급 e2e: 후면·전면(셀카)·GPS ON/OFF 모두 서버 verify match=true, GPS 좌표 V4 메타 인코딩 확인, 12MP 대용량 처리 실증(M3 수용기준). 피드백 반영 9건: 홈/로그인 스크롤 레이아웃, 탭 아이콘(카메라/마크), **HEIC→JPEG(decode_failed 해소)**, 셔터 위치, 배율 pill 순환, 전/후면 전환 버튼, **배율 애플 표기 정규화(0.5×/1×/2×)**, ori.pics 링크 표시, 402 친화 메시지. U-18 스크린샷 4장 완성. 발견 절차: 기기 개발자 모드+Apple PLA 동의 필요(런북 반영 대상) |
| 2026-08-07 | **Phase M7 코드 완료** — eas.json 3 프로파일(+submit 스켈레톤), Sentry DSN 게이트 연동(U-36), 베타 안내·임시 인증서 표기(BetaNotice). 실행 단계는 [mobile-beta-runbook.md](mobile-beta-runbook.md)로 문서화(선행 체크리스트·명령·검증 시나리오 8종) |
| 2026-08-07 | **Phase M6 코드 완료** — Apple IAP 서버(JWS 검증·멱등 부여·이중 구독 가드·Server Notifications V2 웹훅·환불 다운그레이드+grace 37일)+expo-iap 구독 패널(iOS·Free만 노출, 복원 포함). U-35(App Store Connect 설정) 신규. 유닛테스트 12종 |
| 2026-08-07 | **Phase M5 코드 완료** — Verified E2E 서버 체인 실측 확인(추가 작업 불필요), 인앱 검증 신규(무료 판독→서버 검증 2단계, trust_report·owner_exempt 표시, verifyFlow=웹 V4/V3/V2 미러), 차감 UI 정비. 잔여: 운영 cert(SSL.com 외부 대기)·실기기 c2patool 검증 |
| 2026-08-07 | **Phase M4 코드 완료** — A-4(App Attest 서버 검증: CBOR·Root CA 체인·nonce/키/앱 바인딩)+A-5(Play Integrity: 서비스계정 OAuth·verdict 순수함수) 본 구현, env 게이트(U-34 전 개발 폴백 유지), @expo/app-integrity 클라이언트+Verified 자동 시도/Standard 폴백, 앱 식별자 com.santahades.oripics 확정. 유닛테스트 19종 |
| 2026-08-07 | **Phase M3 코드 완료** — vision-camera v5(훅 API·config plugin 없음→권한 직접 선언), 촬영 탭(배율 프리셋+핀치줌+GPS 토글+촬영→발급), zoom/lens 메타 수집, publishFlow P 경로 확장(서버는 M4 전까지 standard 처리). 웹 폴백 분리. 잔여: 실기기 검증 |
| 2026-08-07 | **Phase M2 코드 완료** — skia codec(unpremul 강제)+expo-crypto sha256, V4 발급 흐름 미러(sign→임베드→PUT→confirm→publish, receipt 보관), 인증 화면(갤러리→공개 URL·공유), skia 프리뷰(A-36), 해시 호환 셀프테스트([DEV] 버튼). 잔여: dev build 실기기 검증(Expo Go는 skia 불가) |
| 2026-08-07 | **Phase M1 코어 완료** — 백엔드 Bearer 토큰 경로(mobileTokens+getSessionUserId, 6개 라우트 전환), 모바일 auth 엔드포인트 3종(login/refresh/oauth), 모바일 인증 인프라(secure-store·apiFetch 401 자동갱신·AuthContext)+홈 로그인/계정 화면. 잔여 M1.5=OAuth 콘솔 등록(User)+버튼 활성화, A-38(레이트리밋·refresh 폐기) 신규 |
| 2026-08-07 | **Phase M0 완료** — ①루트 npm workspace(web 제외, §8-D 확정) ②`@oripics/stamp` 추출(`apps/web/packages/stamp`, codec/sha256 주입식, 웹 어댑터로 경로 호환) ③골든 회귀 테스트(비트 단위 동일 증명)+68 테스트+next build 통과 ④Expo SDK 57 스캐폴드+metro 모노레포+iOS export 검증. 잔여: eas init(User)·해시 일치 스파이크 실측(M2) |
| 2026-08-07 | **§8-A 확정 (대표 승인)** — 하이브리드: Android 소비 전용 / iOS IAP 병행 ₩12,900·연 ₩129,000 할증(웹 ₩9,900 유지). M6 작업 내용을 확정안 기준으로 개편(SBP 가입·Server Notifications·이중 구독 가드·non-renewing subscription). 리스크 레지스터의 "IAP 강제(§8-A 미해결)" 항목 해소 |
| 2026-08-07 | **§8-A IAP 정책 조사 완료** — 3갈래 병렬 조사(Apple·Google·한국 관행). 결론: 하이브리드 권고(Android 소비 전용 / iOS IAP 병행 ₩12,900 할증). Apple 3.1.3(b) IAP 병행 조건+2025-12·2026-01 거절 사례로 iOS 소비 전용 배제, Google은 소비 전용 명문 허용. 상세 [mobile-iap-policy-research.md](mobile-iap-policy-research.md) |
| 2026-08-07 | **스택 재검증 — RN+Expo 유지 확정**(TS 해시 로직 단일 소스가 결정 요인, Flutter/네이티브는 재작성으로 해시 불일치 리스크). 부품 3가지 보정: ①카메라 expo-camera→**react-native-vision-camera**(lens_position·수동 제어) ②픽셀 파이프라인 **react-native-skia** 확정(expo-image-manipulator는 raw pixel 미노출, unpremul 필수) ③기기 무결성 **expo-app-integrity** 공식 모듈 채택(M4 난도 하락). M0에 3-플랫폼 해시 일치+PNG 무손실 라운드트립 스파이크 추가. Expo Go 불가 — dev build 전제 |
| 2026-06-18 | 최초 작성 — 현재 코드/모노레포 상태 실측 기반. 트랙 B/D·C2PA 아키텍처·pricing·스토어 메타 통합. M0–M8 단계화 + 결정필요 6건 + 리스크 레지스터 |
