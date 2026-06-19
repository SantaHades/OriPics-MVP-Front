# OriPics 모바일 앱 개발 계획서 (iOS / Android)

> **작성**: 2026-06-18
> **상태**: 착수 전 계획 — 외부 블로커 대기 중 작성
> **범위**: 웹과 동일 가치(원본 증명)를 모바일 네이티브 카메라(Verified 경로) 중심으로 확장하는 iOS/Android 앱 개발의 전체 실행 계획
> **관련 문서**: [roadmap.md](roadmap.md)(트랙 B/D 전략), [c2pa-security-architecture-document.md](c2pa-security-architecture-document.md)(DISTRIBUTED 아키텍처), [pricing-policy.md](pricing-policy.md)(Verified 게이팅), [app-store-metadata.md](app-store-metadata.md)(스토어 메타), [follow-ups.md](follow-ups.md)(미결 항목)

---

## 0. 한눈 요약 (TL;DR)

- **스택 확정**: React Native + **Expo SDK** (TypeScript / Expo Router / expo-camera / expo-secure-store / NativeWind / Zustand+TanStack Query / EAS Build·Submit·Update). roadmap.md D.2에서 확정됨.
- **모바일의 존재 이유**: 웹은 `F`(파일)·`C`(클립보드) 경로만 가능 → **`P`(네이티브 카메라 촬영) 경로는 모바일 전용**이며, 이게 **Verified 티어(Pro 한정)의 유일한 진입점**. 즉 모바일 = 매출(Pro 전환)의 핵심 차별재.
- **백엔드는 그대로 재사용**: 서명·발급·검증 API(`/api/sign` → `confirm` → `publish`, `/api/verify`, `/api/attest/challenge`)가 이미 모바일을 전제로 설계됨(verified 분기·`com.oripics.verified` assertion·platform 필드 존재). 모바일은 **새 백엔드가 아니라 새 Edge 클라이언트**.
- **현재 실측 상태(2026-06-18)**: 모노레포는 **미착수** — `apps/web` 단일, `packages/`·`apps/mobile` 없음, pnpm/turbo 미설정, npm+`legacy-peer-deps` 사용. attest 검증(`verifyToken.ts`)은 **stub**. C2PA 운영 인증서는 **approver 승인 대기**.
- **3대 선행 블로커**: ① 모노레포 추출(트랙 B Phase 2–8) ② C2PA Conformance Letter + SSL.com 운영 인증서 ③ **앱스토어 인앱결제(IAP) 정책 결정** (아래 §8 — 모바일 수익모델을 좌우하는 미결 정책).

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
| 결제(PortOne/KG이니시스) | 입점 심사중 | 웹 결제만. **모바일 IAP는 별도 정책 결정 필요(§8)** |

---

## 2. 확정 사항 (재논의 불필요, 근거 명시)

| 결정 | 내용 | 근거 |
|---|---|---|
| 프레임워크 | **React Native + Expo SDK** (TypeScript) | roadmap.md D.2 L506 |
| 내비/카메라/저장/해시 | Expo Router · expo-camera · expo-secure-store(Keychain/Keystore) · expo-crypto | roadmap.md D.2 |
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
| Canvas 디코드/인코드(`v2.ts`) | iOS ImageIO / Android Bitmap (Expo: `expo-image-manipulator`/네이티브 모듈) |
| 워터마크 합성(`watermark.ts`) | Core Graphics / Skia(`@shopify/react-native-skia` 검토) |
| 영수증 localStorage(`receipts.ts`) | `expo-secure-store`(Keychain/Keystore) |
| XHR 업로드(`index.ts`) | `fetch`/`expo-file-system` 업로드 |

> **핵심 설계 원칙**: `@oripics/stamp`는 **이미지 픽셀 입출력을 인터페이스로 추상화**하고(주입식 codec), 순수 해시·임베드·메타 로직만 공유. 웹은 Canvas 어댑터, 모바일은 네이티브 어댑터를 주입. → 인증 알고리즘이 양 플랫폼에서 **단일 소스**로 유지되어 검증 호환성 보장.

---

## 5. 단계별 실행 계획

> 각 단계: **목표 · 작업 · 산출물 · 수용기준 · 의존성 · 예상기간**. 기간은 1인 풀타임 환산 추정.

### Phase M0 — 모노레포 기반 마련 (트랙 B Phase 2–8) · 선행 필수

- **목표**: `apps/web` 단일 → 모노레포로 전환하고 `@oripics/stamp` 추출, `apps/mobile` 부트스트랩.
- **작업**:
  - M0-1 워크스페이스 도입(pnpm workspace 또는 npm workspace — **결정필요 §8-D**), turborepo 설정, `vercel.json`/`rootDirectory` 조정
  - M0-2 `packages/stamp` 추출(§4.1) + codec 인터페이스 설계 + 웹 어댑터로 회귀 검증
  - M0-3 `packages/tsconfig` 공유, GitHub subtree prefix 영향 점검
  - M0-4 `apps/mobile` Expo 앱 스캐폴드(Expo Router/NativeWind/EAS 초기화)
- **산출물**: 빌드되는 모노레포, `@oripics/stamp` 패키지, 빈 Expo 앱(빌드/실행 OK)
- **수용기준**: 웹 회귀 테스트 전부 통과(서명·발급·검증 라운드트립 무변화), Vercel 배포 정상, `eas build` dev client 성공
- **의존성**: 없음(지금 착수 가능)
- **기간**: ~1.5주
- ⚠️ **리스크**: 현재 `legacy-peer-deps`(nodemailer8↔next-auth) — pnpm 전환 시 peer 해석 재발 가능. workspace 도구 결정과 함께 검증.

### Phase M1 — 앱 셸 & 인증

- **목표**: 로그인/세션, 기본 내비, 크레딧·티어 표시.
- **작업**: Google/Kakao/Naver OAuth(네이티브 SDK 또는 AuthSession) + 이메일 로그인 → 토큰 `expo-secure-store` 보관; 인증 인터셉터(세션 만료 처리); `/api/credits/me` 연동 잔액 칩.
- **산출물**: 로그인→홈→프로필(크레딧) 흐름.
- **수용기준**: 4개 provider 로그인 성공, 토큰 안전 보관, 재기동 시 세션 유지, 401 자동 갱신/재로그인.
- **의존성**: M0. ⚠️ 백엔드 인증이 **NextAuth 쿠키 세션** 중심 → 모바일용 **Bearer 토큰 수용 경로** 점검·보강 필요(백엔드 작업 항목).
- **기간**: ~1주

### Phase M2 — `F`/`C` 경로 (Standard) 먼저

- **목표**: 갤러리/파일·붙여넣기로 Standard 인증 end-to-end.
- **작업**: 이미지 선택 → 디코드(네이티브 codec 어댑터) → 해시 → `/api/sign`(standard) → 업로드 → `confirm`→`publish` → 공개 URL/공유 시트; 영수증 secure-store 보관 + 재드롭 대응(A-32 모바일판).
- **산출물**: Standard 인증·공개링크 생성 동작.
- **수용기준**: 웹과 **동일 이미지의 해시/메타 일치**(공유 lib 검증), 공개링크가 웹 검증기에서 valid.
- **의존성**: M0(stamp), M1(세션).
- **기간**: ~1.5주

### Phase M3 — `P` 경로 카메라 UX (Verified 골격, attest 전)

- **목표**: 커스텀 카메라(핀치줌·렌즈 선택), GPS 토글, 촬영 후 처리 파이프라인.
- **작업**: expo-camera 커스텀 UI, `zoom_factor`/`lens_position` 캡처, GPS 권한·토글(`lat_e6`/`lng_e6`), 촬영본 즉시 해시.
- **산출물**: 촬영→해시→(임시) standard 서명으로 라운드트립.
- **수용기준**: 줌/렌즈 메타 수집, GPS on/off 정확 반영, 대용량(고해상) 이미지 처리 시간 허용범위.
- **의존성**: M0, M1.
- **기간**: ~2–3주

### Phase M4 — 기기 무결성 (App Attest / Play Integrity) · 양면 작업

- **목표**: Verified 티어의 신뢰 근거 확립(클라이언트 토큰 + **백엔드 검증 본 구현**).
- **작업(클라이언트)**: iOS App Attest(`DCAppAttestService`) 키 생성·attestation·assertion; Android Play Integrity 토큰 요청(nonce 바인딩).
- **작업(백엔드, A-4/A-5)**: `lib/attest/verifyToken.ts` 본 구현 — Apple App Attest 인증서 체인 검증 + nonce 일치; Google Play Integrity 토큰 디코드·검증. stub 제거.
- **산출물**: `tier:'verified'` 서명이 실제 무결성 검증을 통과해야만 발급.
- **수용기준**: 위조/재생(replay) 토큰 거부, nonce 만료(5분) 거부, 정상 기기 통과; `com.oripics.verified`에 `attest_token_hash`·`device_integrity:'passed'` 기록.
- **의존성**: M3 + Apple Developer(완료) + **Google Play Console 신원확인(U-2)**.
- **기간**: ~2.5주(클라이언트 양 플랫폼 + 백엔드 검증)

### Phase M5 — 발급·검증·크레딧 완성 + 운영 C2PA 연동

- **목표**: Verified end-to-end + 인앱 검증 + 운영 서명 인증서.
- **작업**: Verified `publish`(C2PA `c2pa.created`+`digitalCapture`+`com.oripics.verified`); 인앱 `/api/verify` 결과·trust_report 표시; 크레딧 차감(Verified proof −4 등) UI; 운영 cert 도착 시(A-2) 백엔드 env swap 후 모바일 영향 회귀.
- **수용기준**: Verified 공개링크가 외부 C2PA 도구에서 `c2pa.created`+digitalCapture로 valid, 운영 cert 적용 시 trusted.
- **의존성**: M4 + (출시 trusted 표시엔) **C2PA Letter→SSL.com cert**.
- **기간**: ~1.5주

### Phase M6 — 결제/구독 (모바일) · **정책 의존**

- **목표**: 모바일에서 Pro 구독(=Verified 잠금 해제).
- **작업**: §8-A 결정에 따라 분기 — (가) Apple/Google **IAP**(StoreKit2 / Play Billing, expo-in-app-purchases 계열) + 서버 영수증 검증 + 구독 상태↔티어 동기화, 또는 (나) 웹 결제 유도(앱 외 결제 — 스토어 정책 위반 위험 큼).
- **수용기준**: 구독 성공 시 Verified 즉시 해금, 갱신/취소/복원(restore) 처리, 서버 권위 검증.
- **의존성**: §8-A 결정, M5.
- **기간**: ~2주(IAP 경로 기준)

### Phase M7 — 베타 (TestFlight / Play 내부 테스트)

- **목표**: 실기기 베타 배포·피드백.
- **작업**: EAS Build(프로덕션 프로파일), TestFlight·Play Internal 업로드, 크래시/분석(diagnostic) 연동, 베타 안내·임시 인증서 표기.
- **수용기준**: 양 스토어 베타 트랙에 빌드 게시, 핵심 플로우 무크래시.
- **의존성**: M5(+가능하면 M6).
- **기간**: ~2주

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
                                      └─ M5 Verified+검증 ──┬─ M6 결제(IAP, §8-A 결정 필요)
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
| **§8-A** | **모바일 결제 방식** | (가) Apple/Google **IAP** 도입 (수수료 15–30%, 스토어 정책 준수) / (나) 웹 결제 유도(정책 위반·리젝 위험 큼) / (다) 출시 초기 Verified를 웹에서만 구매·모바일은 소비만 | **모바일 수익모델·심사 통과 좌우.** 디지털 구독은 통상 IAP 강제. 가장 큰 미결 |
| **§8-B** | iOS·Android **동시 vs 순차** 출시 | 동시(리스크 분산 X, 일정 김) / iOS 먼저(App Attest 성숙) | M4~M8 일정·QA 부하 |
| **§8-C** | **베타/출시 타임라인** | 웹 먼저 출시 후 모바일 9~10월 / 모바일까지 동시 9~10월 | §7 참조 |
| **§8-D** | 워크스페이스 도구 | pnpm+turbo(roadmap 안) / npm workspace 유지(legacy-peer-deps 안정) | M0 리스크·CI |
| **§8-E** | C2PA Intake Form | iOS·Android 각각 별도 제출(arch 문서 기준) 시점·담당 | approver 트랙과 병행 |
| **§8-F** | 연령등급(U-14) | 4+ vs 12+(GPS 사유) | 심사·노출 |

---

## 9. 리스크 레지스터

| 리스크 | 영향 | 완화 |
|---|---|---|
| IAP 강제(§8-A 미해결) | 출시 리젝 또는 수익 30% 잠식 | 착수 전 Apple/Google 가이드라인 확인 + 가격모델 재계산. M6 전 결정 |
| 백엔드 세션이 쿠키 전제 | 모바일 인증 마찰 | M1에서 Bearer 토큰 경로 보강(백엔드 작업) |
| 공유 lib codec 추상화 누수 | 웹·모바일 해시 불일치 → 검증 깨짐 | M0에서 codec 인터페이스 + 양 플랫폼 동일 입력 해시 일치 테스트 고정 |
| App Attest/Play Integrity 검증 난도 | Verified 신뢰 근거 약화 | A-4/A-5에 충분한 기간 + replay/nonce 테스트 |
| 운영 C2PA cert 지연(approver) | trusted 표시 불가 | dev cert로 개발 진행, 출시 게이트에만 운영 cert 요구 |
| Play Console 신원확인 미완(U-2) | Android 빌드/출시 중단 | M4 Android 착수 전 선완료 |
| 고해상 이미지 모바일 성능 | UX 저하 | 청크/네이티브 처리, 사이즈별 처리(웹 sizeMultiplier 정책 재사용) |
| pnpm 전환 peer 충돌 재발 | M0 지연 | §8-D 신중 결정 + 격리 브랜치 검증 |

---

## 10. 다음 즉시 액션 (블로커 무관, 지금 가능)

1. **§8-A 결제 정책 사전 조사** — Apple App Store §3.1.1 / Google Play 결제 정책상 디지털 구독 IAP 강제 여부 확정. (가장 큰 미결, 코드 착수 전 권장)
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
| 2026-06-18 | 최초 작성 — 현재 코드/모노레포 상태 실측 기반. 트랙 B/D·C2PA 아키텍처·pricing·스토어 메타 통합. M0–M8 단계화 + 결정필요 6건 + 리스크 레지스터 |
