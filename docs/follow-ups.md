# Follow-ups — 점검·결정 필요 항목 통합 트래커

> **작성**: 2026-05-10
> **갱신 정책**: 항목 완료 시 표에서 행 삭제 + 본 문서 하단 "변경 이력"에 한 줄 기록.
> **관련 분산 출처**: 본 문서가 통합한다. 산재된 출처는 표 마지막 컬럼에 명시.

---

## 0. 우선순위·발효 시점 범례

| 표기 | 의미 |
|---|---|
| **P0** | Blocker — 다음 단계 진입 전 반드시 해결 |
| **P1** | High — 발효 시점 안 미루면 risk |
| **P2** | Medium — 미루어도 운영 가능, 적절한 시점에 처리 |
| **P3** | Low / Defer — 트리거 도착 시점에 처리 |

| 발효 시점 | 의미 |
|---|---|
| **NOW** | 즉시 처리 가능 / 지연 risk 있음 |
| **SSL.com 회신 후** | 한국시간 2026-05-12 화 오전 예상 |
| **포트원 계약 후** | J-7 본 구현 시점 |
| **모바일 본 시작** | 트랙 D 진입 시점 |
| **베타 직전** | D.3.5 베타 빌드 완성 시점 |
| **앱 심사 직전** | D.3.6 스토어 제출 시점 |
| **B2B 영업 시작** | Business 티어 활성화 시점 |
| **언젠가** | 트리거 미정 |

| 담당 | 의미 |
|---|---|
| **User** | 사용자(SantaHades 대표)가 결정·실행 |
| **AI** | AI 어시스턴트가 코드/문서로 처리 |
| **Both** | 사용자 결정 + AI 실행 |

---

## 1. 사용자 결정 필요 (User)

### 1.1 외부 의존성 대기

| ID | 항목 | 시점 | 의존성 | P |
|---|---|---|---|---|
| ~~O-1~~ | **✅ 2026-08-23 완료** — `CRON_SECRET` 프로덕션 존재 확인(`vercel env ls`: Preview·Production, 114d 전 설정 = 기존 값). 크론 3종 fail-closed 전환에 영향 없음 | 완료 | 2026-08-22 보안조치 | ✅ |
| ~~O-2~~ | **✅ 2026-08-23 완료** — verified 티어 attest 운영 설정(U-34 서버 측). 프로덕션 Vercel env 4종 설정+재배포(front `9508ef3`): `APPLE_APP_ATTEST_TEAM_ID=4V67H4KGQS`, `APPLE_APP_ATTEST_BUNDLE_ID=com.santahades.oripics`, `ANDROID_PACKAGE_NAME=com.santahades.oripics`, `GOOGLE_PLAY_INTEGRITY_SERVICE_ACCOUNT_JSON`(sensitive). Play Integrity: Play Console 앱(OriPics) 생성→GCP 프로젝트 `oripics-sns-login`(154917484728) 연결→서비스계정 `play-integrity-verifier` JSON 키. 모바일 `eas.json` 3개 프로필에 `EXPO_PUBLIC_GCP_PROJECT_NUMBER=154917484728` 추가(다음 EAS 빌드부터). iOS App Attest 엔타이틀먼트=`app.json ios.entitlements`에 `com.apple.developer.devicecheck.appattest-environment: production` 추가완료(Apple 포털 토글 아님 — Expo 관리형은 엔타이틀먼트 방식). **잔여: EAS 재빌드 후 실기기 verified e2e(iOS/Android) — U-34 잔여.** `ALLOW_UNVERIFIED_ATTEST` 미설정 유지 | 완료 | 2026-08-22 보안조치 | ✅ |
| U-1 | SSL.com C2PA Certificates 영업팀 회신 8개 질문 답변 | NOW | 회신 도착 | P0 |
| ~~U-2~~ | **✅ 완료** — Google Play Console 개인 계정 신원확인. 2026-08-23 실측: 계정 세부정보에 법적이름·주소 등록, 연락처 이메일·전화 인증됨(✓), 경고 배너 없음. Android 개발자 인증도 패키지 `com.santahades.oripics` 등록됨(✓) | 완료 | — | ✅ |
| U-3 | Porkbun Tucker (Change of Registrant) 최종 회신 | NOW | 형식 확인용 | P3 |
| ~~U-4~~ | **✅ 2026-08-24 완료** — D-U-N-S **963267517** (Apple duns-lookup 조회로 기존 발급 확인, 신규 신청 불필요). Apple 법인 멤버십·Play 조직 계정 전환에 사용 가능. ⚠️ D&B 표기="Santa Hades Co., Ltd."(띄어쓰기) — 전환 시 표기 일치 주의 | 완료 | — | ✅ |

### 1.2 가격·정책 결정 (SSL.com 비용 응답 후)

| ID | 항목 | 시점 | 출처 | P |
|---|---|---|---|---|
| U-5 | SSL.com 정확한 월 비용 확인 → 손익분기 갱신 | SSL.com 회신 후 | [pricing-policy §7](pricing-policy.md) | P1 |
| U-6 | 글로벌 USD 가격 확정 ($7.99/Pro 잠정) | 베타 직전 | [pricing-policy §7](pricing-policy.md) | P2 |
| U-7 | ~~연간 결제 환불 정책 (한국 7일 청약철회)~~ → [/terms §11](../src/app/[locale]/terms/page.tsx) 본문에 반영 완료 (2026-05-12). PG 본계약 시 환불 수수료 수치 최종 검증 필요. | 포트원 계약 후 | [pricing-policy §7](pricing-policy.md) | P2 |
| U-8 | B2B 인보이스 부가세 표기 정책 | B2B 영업 시작 | [pricing-policy §7](pricing-policy.md) | P2 |

### 1.3 법무·문서 결정

| ID | 항목 | 시점 | 출처 | P |
|---|---|---|---|---|
| U-10 | 개인정보 처리방침 법무 검토 (국외 이전·아동 연령 기준) | 모바일 본 시작 | [privacy/page.tsx](../src/app/[locale]/privacy/page.tsx) | P1 |
| U-11 | 마케팅 카피의 CAI 로고/Wordmark 가이드라인 검토 | 마케팅 자료 발행 전 | [marketing-copy §7](marketing-copy-jpeg-trust.md) | P2 |
| U-12 | "JPEG Trust" 단독 사용 시 위원회 문맥 명시 검토 | 동일 | 동일 | P2 |
| U-13 | ~~이용약관 §10·§11 (유료 서비스·환불) 갱신~~ → 토스페이먼츠 가입 신청용 초안 작성 완료 (2026-05-12). PG 본계약 후 실제 환불 수수료·결제 수단 목록을 반영하여 재검토. | 포트원 계약 후 | [/terms](../src/app/[locale]/terms/page.tsx) §10·§11 | P2 |

### 1.4 앱스토어 메타데이터 (베타~심사 직전)

| ID | 항목 | 시점 | P |
|---|---|---|---|
| U-14 | 연령 등급 결정 — **Google 완료(2026-08-24)**: 타겟 18+·IARC 설문 제출(UGC 아니요·위치공유 아니요·전연령 콘텐츠). **잔여: Apple만** (4+ 권장, store-privacy-forms.md §4) | 앱 심사 직전 | P1 |
| U-15 | English keywords 길이 조정 (107 → 100자) | 앱 심사 직전 | P1 |
| U-16 | ~~앱 아이콘 디자인~~ → **완료 (2026-08-18, 발주 불필요)** — 기존 브랜드 마크(`image/투명로고-1024x1024.png`, 육각+체크)에서 전 슬롯 생성: iOS 1024(무알파)·adaptive 3종(safe zone 58%)·splash·favicon·Play 512(`image/oripics-playstore-icon-512.png`). 홈 히어로 AnimatedIcon도 Expo 로고→OriPics 마크 교체. 잔여(선택): 정식 출시 전 마크 벡터화(현 PNG 1024 기반으로 충분히 선명) | 완료 | P0 |
| U-17 | ~~Feature graphic 디자인~~ → **완료 (2026-08-18)** — `image/oripics-feature-graphic-1024x500.png`: 브랜드 마크(좌) + OriPics 워드마크(Avenir Next Condensed) + "사진 원본 증명 · The Original Proof" 태그라인, 연한 블루 그라데이션 배경, 중앙 정렬(양쪽 여백 110px). Play 콘솔 스토어 등록정보에 업로드 | 완료 | P0 |
| U-18 | ~~스크린샷 캡처~~ → **완료 (2026-08-19)** — `image/screenshots/` 4장(로그인·홈 Pro·인증/검증·**촬영 실기기컷**, 전부 1320×2868 = App Store 6.9"·Play 겸용). 재캡처: 시뮬 3장=`scripts/capture-screenshots.sh`, 촬영컷=실기기. 데모 계정 demo-screenshots@ori.pics = App Review 심사 계정 겸용 | 완료 | P0 |
| U-19 | Promo video 제작 (선택) | 베타 직전 | P3 |
| ~~U-20~~ | **✅ 2026-08-24 완료** — ASC App Privacy 게시([store-privacy-forms.md §2](store-privacy-forms.md) 기준: 8개 유형, 추적 없음, 진단 2종=분석·비연결. 한국어 UI에서 Performance Data="실적 데이터"). 개인정보 처리방침 URL도 입력 확인 | 완료 | ✅ |
| ~~U-21~~ | **✅ 2026-08-24 완료** — Play Console 데이터 보안 설문 제출([store-privacy-forms.md §3](store-privacy-forms.md) 기준: 공유 없음·수집 8종·삭제 URL·암호화). 계정 생성=앱 외(웹) 선언, 데모 계정(로그인 검증 완료) 등록 포함 | 완료 | ✅ |
| U-22 | 카테고리 검토 (Photo & Video vs Utilities — 검색 노출) | 앱 심사 직전 | P2 |
| U-23 | What's New 카피 매 버전 갱신 (출시 후 지속) | 매 버전 | P3 |

> 출처: [app-store-metadata.md §5](app-store-metadata.md)

### 1.5 외부 가입·계약

| ID | 항목 | 시점 | 의존성 | P |
|---|---|---|---|---|
| ~~U-24~~ | **✅ 완료(실운영)** — PortOne 가입 + 사업자 KYC. 카드사 10개사 "등록"(7/24), 실 MID `MOI3425377`, 프로덕션 env(PORTONE_API_SECRET·WEBHOOK_SECRET·STORE_ID) 설정 확인(2026-08-23 실측). [[payment_gateway_strategy]] | 완료 | — | ✅ |
| ~~U-25~~ | **✅ 완료(실운영)** — PG 직계약=**KG이니시스**(토스 직결 폐기). 정기결제(빌링키) 채널키 `NEXT_PUBLIC_PORTONE_CHANNEL_KEY_INICIS`(Production) 설정, 실결제 e2e 검증(7/24). | 완료 | — | ✅ |
| U-26 | 카카오페이·토스페이 간편결제 추가 (포트원 통합) | 포트원 계약 후 | PG 계약 | P1 |
| U-27 | CAI(Content Authenticity Initiative) 무료 멤버십 가입 | NOW | 없음 | P3 |
| U-36 | **Sentry 프로젝트 생성 (M7 후속)** — sentry.io에서 React Native 프로젝트 생성 → DSN 발급 → `npx eas env:create --name EXPO_PUBLIC_SENTRY_DSN --value <DSN>`. 미설정이어도 앱 정상(진단만 꺼짐). 절차 전체: [mobile-beta-runbook.md](mobile-beta-runbook.md) | M7 베타 전 | 없음 | P2 |
| ~~U-35~~ | **❌ 취소(2026-08-23 결정 B)** — iOS 인앱결제(IAP) 미채택. 모바일 앱은 **순수 클라이언트**(구독은 웹 ori.pics에서만, 앱 내 판매·웹 결제 유도 없음 = App Store 3.1.3 멀티플랫폼/리더 모델). 조치: 모바일 `SubscribePanel` 삭제, `expo-iap` 플러그인·의존성 제거, credit-rules 주석 갱신. **§8-A(iOS=IAP 병행) 폐기.** 서버 IAP 라우트(`/api/mobile/iap/apple/*`)·`appleIap.ts`는 env(`APPLE_IAP_BUNDLE_ID`) 미설정으로 503 게이트 상태로 남김(추후 제거 가능). 수수료(15~30%) 회피 ↔ iOS 사용자는 웹에서 구독해야 하는 마찰 | 취소 | — | ❌ |
| ~~U-34~~ | **✅ 2026-08-23 완전 종결** — 모바일 attest 운영 설정+실기기 verified e2e 전 채널 검증. 서버측(O-2)·엔타이틀먼트 완료 후: ①iOS 로컬 빌드(production aaguid) ②**TestFlight 릴리즈 빌드**(15:17) ③Android 사이드로드(ALLOW_UNRECOGNIZED 임시) ④**Play 스토어 내부트랙 빌드 — PLAY_RECOGNIZED 포함 정식 경로**(17:12, `P260823-081201-4162289`) 전부 통과. 과정에서 치명 버그 2건 수정(AAGUID 12→16바이트, 401→403) + 서버 attest 거부 시 Standard 폴백 신설. 임시 조치(tier flip·ALLOW_* env) 전부 원복 확인 | 완료 | — | ✅ |
| U-37 | **특허 정규화 기한 + 명의 이전** — "이중 해시 기반 스테가노그래피" 임시명세서 출원(2026-04-21, 출원인=손효연 개인·발명자=손용석). ①**정식 명세서 보정 최종 기한 2027-06-21**(미이행 시 취하 간주), 내용 보강 정규출원(국내우선권)은 **2027-04-21**까지 — 늦어도 2027 초에 변리사 상담 착수 ②출원인 명의를 법인/창업주체로 이전 검토(IP 실사·투자·모두의창업 3R 대비) ③출원번호 확인해 본 행에 기록 | **2027-04-21 전** | P1 |
| U-38 | **네이버 로그인 검수 (오픈 게이트)** — 네이버 OAuth 앱이 "개발 중" 상태라 등록된 테스트 계정 외 로그인 불가(2026-08-26 실측). 조사 결과 **2026-04-27 검수 1회 거부 이력**(반려 사유 1건: 개발 중이라 서비스 확인 불가 → 소개 자료+이미지 수집·보관·파기 정책 소명 요구). **✅ 2026-08-26 조치 완료**: ①멤버관리에 테스터 ID 등록 → 웹 네이버 로그인 실동작 확인(임시 경로 확보) ②**재검수 신청 제출** — 소명 500자 + 서비스 소개 PDF(`docs/naver-review/` — 메뉴별 화면·기능, 이미지 데이터 정책, 라이브 스크린샷 3종·GPS 마스킹) + 적용 형태 캡처 교체. **✅ 검수 승인(2026-08-27, 재신청 하루 만)** — 콘솔 검수 상태=승인, 웹 네이버 로그인 전체 사용자 개방(코드 변경 불요 — NaverProvider 기존 라이브). 후속=앱용 네이버 SDK(A-50 ③). 참고: 네이버는 브라우저의 기존 네이버 세션으로 자동 로그인(계정 선택 UI 없음 — 다른 계정은 시크릿 창/네이버 로그아웃 경유) | 완료 | 없음 | P1 |
| U-33 | **네이버페이 결제형 — PortOne 채널 등록** — 네이버페이센터 가입 심사 **승인 완료**(7/4 신청 → 2026-08-07 확인). 다음 절차: 네이버페이센터에서 연동 정보 확인 → admin.portone.io에 네이버페이 채널 추가 → 채널키 발급 (A-37 전제) | 결제수단 확장 결정 시 | 없음 | P2 |

### 1.6 인프라 (Vercel)

| ID | 항목 | 시점 | 의존성 | P |
|---|---|---|---|---|
| U-28 | Vercel env 갱신 — eSigner CSC API 자격증명 5개 | SSL.com 회신 후 | SSL.com 응답 | P0 |
| U-29 | Preview에 `ORIPICS_C2PA_ENABLED=true` + dev cert 사전 검증 | NOW | Vercel 대시보드 | P2 |
| U-30 | Vercel env 갱신 — `ORIPICS_ATTEST_SECRET` (선택, 없으면 JWT_SECRET 재사용) | 모바일 본 시작 | 없음 | P2 |
| U-31 | ~~Supabase Free → Pro($25/월) 전환~~ → **완료 (2026-08-22, 대표 실행·화면 확인)** — Pro Plan 활성 + Spend Cap ON(Cost Control "enabled" 확인) + 일일 백업 7일 자동 활성. Storage Global file size limit 500MB 상향 완료(8/22 화면 확인). 잔여(선택): Vercel Spend Management 예산·알림 확인. **이로써 서비스 오픈 게이트 전부 해소** | 완료 | P0 |
| U-32 | **KG이니시스 일반결제(원타임) 추가 계약 확인** — 3차 회신(6/30)에서 "일반결제 없음(구독만)" 답변했으므로, 패스 상품(라이트·사고) 출시 전 PortOne/KG에 일반결제 추가 심사 필요 여부 문의 (v3 §11.5 Phase C 전제) | 패스 출시 결정 시 | KG 계약 | P2 |

---

## 2. AI 코드 작업 잔여 (AI)

### 2.1 라이브러리 stub → 본 구현

| ID | 항목 | 위치 | 트리거 | P |
|---|---|---|---|---|
| A-1 | 포트원 어댑터 본 구현 (J-7) | [lib/payment/portone.ts](../src/lib/payment/portone.ts) | U-24~26 완료 | P0 |
| A-2 | C2PA 본 통합 — eSigner CSC API 호출로 LocalSigner 교체 | [lib/oripics-stamp/c2pa.ts](../src/lib/oripics-stamp/c2pa.ts) | U-28 완료 | P0 |
| A-3 | Stripe 어댑터 본 구현 (Phase 2) | [lib/payment/stripe.ts](../src/lib/payment/stripe.ts) | 글로벌 사용자 5%+ | P3 |
| A-4 | ~~iOS App Attest 토큰 검증~~ → **본 구현 완료 (2026-08-07, M4)** — CBOR 파싱+Apple Root CA 체인+nonce/키/앱 바인딩+counter/aaguid 검증([lib/attest/appleAppAttest.ts](../src/lib/attest/appleAppAttest.ts)). **실기기 attestation 왕복 검증 완료(2026-08-23, U-34 — TestFlight 정식 경로 포함).** AAGUID 16바이트 수정 반영 | [lib/attest/verifyToken.ts](../src/lib/attest/verifyToken.ts) | U-34 | P1 |
| A-5 | ~~Android Play Integrity 토큰 검증~~ → **본 구현 완료 (2026-08-07, M4)** — 서비스 계정 OAuth→decodeIntegrityToken, verdict 판정 순수함수(nonce/requestHash·패키지·10분 신선도·PLAY_RECOGNIZED·MEETS_DEVICE_INTEGRITY, 유닛테스트 19종)([lib/attest/playIntegrity.ts](../src/lib/attest/playIntegrity.ts)). **실기기 왕복 검증 완료(2026-08-23, U-34 — Play 스토어 PLAY_RECOGNIZED 정식 경로 포함)** | 동일 | U-2·U-34 | P1 |

### 2.2 기능 추가 (J 트랙)

| ID | 항목 | 트리거 | P |
|---|---|---|---|
| A-6 | J-7 결제 webhook 처리 + 구독 lifecycle (subscription_grant 충전 포함) | A-1 완료 후 | P0 |
| A-8 | ~~J-9 증명서 PDF 발급~~ → 1차 구현 완료 (2026-05-13). [lib/certificate/render.tsx](../src/lib/certificate/render.tsx) + [GET /api/links/[id]/certificate](../src/app/api/links/[id]/certificate/route.ts). 트레이드오프는 A-23·A-24·A-25 참조 | DONE | — |
| A-20 | ~~매월 크레딧 자동 갱신~~ → **완료 (구현 `8722e11`, 2026-08-22 검증)** — `renewCredits.ts`(멱등·이월 불가 SET·기존 갱신일 기준 +1month 드리프트 방지) + Vercel Cron daily 00:30(`/api/cron/renew-credits`, CRON_SECRET 인증 — 프로덕션 401 확인) + `/api/credits/me` lazy refresh 이중 안전망. 정액 = **Free 20**/Pro 1000/Business 10000 (`PLAN_GRANTS` — 구 기재 "Free 10"은 오기). 테스트 8건 통과 | 완료 | P1 |
| A-21 | 어드민 크레딧 조정 UI/API — CS 대응(환불·보너스). 권한 가드 + `manual_adjust` 트랜잭션 기록 | 베타 운영 중 | P2 |
| A-22 | **익명 메시지 전송 기능 구현 — say2you와 연계 검토** — 메타 V4의 link_id로 검증자가 원본 등록자에게 익명 메시지 송수신. 등록자 통제 하에 답신 시점에만 이메일 노출. 이메일을 메타에 직박하는 대안의 안전 우회 경로 (개보법·GDPR·스팸 risk 회피) | 베타 후 | P3 |
| A-23 | ~~증명서 PDF — 한글 폰트 번들링~~ → **완료 (구현 `0d243ba`, 2026-08-22 검증)** — gstatic CDN 제거, `@fontsource/noto-sans-kr` npm 로컬 번들(korean woff 400/700) + `next.config.js` `outputFileTracingIncludes`로 서버리스 함수 포함 보장. 로컬 스모크 렌더로 한글 포함 PDF 생성·NotoSansKR 임베드 실측 확인 | 완료 | P1 |
| A-25 | **증명서 PDF — 사진 썸네일 임베드** — 현재 PDF에 실제 이미지는 미포함, QR로 검증 URL 참조만. 사진을 PDF 본문에 직접 임베드하면 B2B/소송 제출 시 단독 문서로 가치 상승. 단 음란물·저작권 침해 이미지 임베드 위험 → 신고 시스템 + 모더레이션 게이트 필요 | 첫 B2B 영업 미팅 시점 | P3 |
| A-26 | **`/api/links/publish` 마무리 단계 진행 표시** — 업로드(PUT) 진행률은 XHR onprogress로 실측 가능하나, publish 단계(C2PA 매니페스트 첨부·Storage 재업로드·DB write 등)는 단일 요청이라 진행률 측정 불가. SSL.com eSigner 본 통합 후 서명 호출이 추가되면 publish 응답이 1~3s 길어짐 → "마무리 중" stage 라벨만이라도 추가하여 사용자 체감 개선. SSE/streaming 응답까지 가면 더 정확하지만 비용 큼. (2026-05-17 라우트명 변경: `confirm` → `publish`) | A-2(C2PA 본 통합) 후 | P2 |
| A-27 | **클라이언트 stego embed 진행률** — 200MP 이미지에서 LSB 임베드 루프가 ~500ms 동기 실행됨. setTimeout/requestIdleCallback로 chunked 처리하여 진행률 콜백 노출 가능. 1800px 이하에선 의미 없지만 기가픽셀 이미지에서 체감 개선 | 기가픽셀 사용 사례 발생 시 | P3 |
| A-28 | **업로드 취소 버튼** — `handleCreateLink`/멀티 publish 진행 중 사용자 취소 (`xhr.abort()`). 큰 PNG 업로드 중간에 마음 바뀌면 새로고침 외 방법 없음 → cancel 버튼 + 진행 중 abort + 크레딧 환불(인증 차감은 이미 confirm에서 일어났으므로 publish 시 abort하면 LINK_CREATE만 환불) | 베타 직전 | P2 |
| A-29 | ~~c2pasign.com sandbox cert로 Preview C2PA PoC 검증~~ → 완료 (2026-05-14). 진행 중 **중요 버그 발견·수정**: `builder.sign()`은 매니페스트 box(JUMBF)를 반환값으로 돌려주고, 실제 서명된 PNG는 `outputAsset.buffer`에 mutate. 코드가 반환값을 PNG로 가정 → Storage에 JUMBF 박스만 저장됨. 수정 커밋 `875faf6`. 향후 production cert로 전환 시 env vars 교체만으로 가동 가능 확인 | DONE | — |
| A-30 | **Multi-result 미공개 재검출 미지원** — 사이즈 선택에서 양쪽 체크한 경우 multi-result 카드 2개가 생성됨. 현재 publish 안 한 채로 stamped PNG 다운로드 후 같은 브라우저에서 재드롭 시 single-result 흐름의 receipt만 매칭. multi-result 흐름에서도 `saveReceipt` 호출하도록 통일 필요 | 베타 직전 | P2 |
| A-31 | **Multi-result confirm 진행률 UI** — 2026-05-17 B-2'' 흐름에서 confirm은 작은 JSON이라 거의 즉시 완료되지만 UI는 여전히 "confirming" phase 진행 바를 보여줌. phase 상수 단순화(confirming → ready를 단일 transition으로 합치고 진행률 표시 제거) | 정리 작업 | P3 |
| A-33 | **인증 후 미사용 30일 cleanup** — receipt JWT TTL이 30일이라 그 사이 사용자가 publish 안 하면 차감된 proof 비용은 사실상 소실. UX 측면에서 30일 도래 전 "사용 안 한 인증 X건 남았습니다" 알림 또는 환불 정책 검토 | 베타 운영 중 | P3 |
| A-34 | ~~환불 자동화 2단계~~ → **완료 (2026-08-22)** — **단위 확정(대표): 사용횟수 = 사진인증당**(proof TX 1건=1회, 배율·링크·검증·PDF 무관, 회당 ₩1,000). ① 중도해지 자동 환불: `lib/payment/refund.ts`(제11조 산식, 테스트 7건) + `/api/billing/subscription` `refund_preview`/`refund_cancel`(멱등, PortOne 부분취소 → 즉시 종료·free 다운그레이드·`previous_credits` 원복·links grace 37일. creditsRenewAt은 유지=기존 anchor에서 free 정액 자연 리셋) ② webhook `Transaction.Cancelled/PartialCancelled`: 콘솔/외부 환불 시 구독 자동 회수(자체 처리분은 멱등 스킵) ③ CS 스크립트 `scripts/admin-refund-quote.ts <email>`(산식 분해+수동 절차 출력) ⑤ 크레딧 previous_credits 원복 구현. 프로필 UI: 예상 환불액 모달(산식 분해)+원클릭 환불. ④ dunning은 **A-42로 분리**. **실결제 환불 e2e 검증 완료(2026-08-24)** — 실구독 ₩9,900 → 7일 내 미사용 원클릭 전액환불 → PortOne 취소·free 다운그레이드·previous_credits(847) 원복 전 구간 실측. 잔여: 부분취소(사용분 공제) 케이스만 실사례 발생 시 확인 | 완료 | P1 |
| A-43 | **CSP(Content-Security-Policy) 도입** — 2026-08-22 보안 조치에서 다른 헤더는 적용했으나 CSP는 Next 인라인 스크립트·PortOne SDK 충돌 위험으로 보류. `report-only`로 위반 관측 → nonce 적용 후 강제 전환. 배경: [security-hardening-20260822.md](security-hardening-20260822.md) | 오픈 후 | P2 |
| A-44 | **계정 자격증명 위생 조치** — 2026-08-22 취약점으로 비밀번호 해시·OAuth 토큰이 노출 가능 상태였음(실사용자 2명, 외부 접근 정황 없음). 대표·데모 계정 비밀번호 재설정 + Google 재로그인, 필요 시 anon 키 로테이션 | **오픈 전** | P1 |
| A-46 | **결제 흐름 헬스체크(외부 회귀 감시)** — PortOne 브라우저 SDK는 CDN 원격 로드라 **우리 배포 없이 PortOne측 변경으로 결제가 깨질 수 있음**(2026-08-24 실측: offerPeriod 검증 강화로 빌링키 발급창 호출 거부 — 코드 무변경 회귀, `912135d` 수정). 주기적으로 체크아웃 페이지 로드+발급창 호출 직전까지 도달하는 synthetic 테스트(Playwright cron 또는 Vercel Checkly류) + 실패 시 알림. 발급창 호출 자체는 headless로 검증 한계 있으니 SDK 초기화·파라미터 검증 단계까지라도 커버 | 오픈 후 | P2 |
| A-42 | **dunning (청구 실패 재시도)** — A-34 ④에서 분리. 빌링키 자동청구 실패 시 7일 재시도(백오프) → 실패 지속 시 다운그레이드 + 안내 메일. 현재는 charge cron이 1회 실패 시 다음 cron 재집계만 수행 | 오픈 후 실결제 실패 사례 발생 전 | P2 |
| A-47 | **모바일 access 토큰 TTL 단축** — 2026-08-25 모바일 보안 재점검에서 유일한 개선 항목. access 토큰이 무상태 7일이라 유출 시 서버측 개별 폐기 불가(refresh는 A-38②로 폐기 가능). refresh 회전이 이미 서버측 상태라 `mobileTokens.ts`의 `ACCESS_TTL_S`를 1일 이하(권장 1~24h)로 줄이면 클라 무변경으로 유출 창이 축소됨(apiFetch가 401 시 자동 refresh). 점검 결론 요지: 스탬프 알고리즘은 웹 JS로 이미 공개돼도 안전(위조 방지 근거=서버 전용 salt+attest, Kerckhoffs 설계), 토큰=SecureStore, 번들 내 비밀 없음 — 난독화·인증서 피닝·탈옥탐지는 불채택 | 오픈 후 | P3 |
| A-50 | **모바일 소셜 로그인 (M1.5 실행)** — 앱 로그인 화면은 이메일 방식뿐이라 **웹 소셜(구글/카카오/네이버) 가입자는 password=null → 앱 로그인 불가**(2026-08-26 식별. 임시 우회=비밀번호 재설정으로 비번 생성 — 온보딩 안내문에 반영됨). 서버는 완비: `/api/mobile/auth/oauth` + `AuthContext.signInWithProviderToken`. **✅ Apple 트랙 완료(2026-08-26, `57e3670`)**: 콘솔(Services ID `com.santahades.oripics.web`·Key `27FA93NZQ8`·p8=`.secrets/apple/`) → 웹 NextAuth AppleProvider(client_secret 런타임 생성 `appleClientSecret.ts`, exp 180일 — **~2027-02 만료 전 재기동/재배포로 자동 갱신되나 키 회전 시 env 교체**) + pkce 쿠키 SameSite=None(form_post) + 로그인/가입 버튼 → 서버 apple 검증(JWKS, aud=번들ID) → 앱 iOS 공식 버튼(expo-apple-authentication, 심사 4.8 대응). Vercel env 4종(`APPLE_CLIENT_ID/TEAM_ID/KEY_ID/PRIVATE_KEY`) 설정 완료. 알려진 한계: Private Relay 이메일이면 기존 소셜 계정과 미매칭(신규 생성). ✅**재로그인 배너 종결(8/27)**: 전파 지연 가설 기각(하루 지나도 지속). scope 3변형 실측(`name email`/`email`/무scope, 세션 상태별 재현) 끝에 **scope에서 name 제외**(`bfde351` — name은 어차피 최초 인증 user 필드로만 오고 NextAuth v4 미파싱, 기본 이름은 createUser 백필)·**재로그인 완주 실측**(가입→탈퇴→재가입·이름 표시까지). 잔여 관찰(무해): Apple 호스팅 화면이 [계속] 클릭 후 같은 동의 화면을 한 번 더 그림 — 인증은 첫 클릭에 이미 완료, 몇 초 뒤 자동으로 메인 진입. 두 번째 화면에서 또 클릭하면 중복 제출로 빨간 배너(기다리면 됨 — 온보딩 한 줄 안내 후보). 우리 제어 밖(Apple 페이지 내부). 부수 수정(8/27): 가입 충돌 오류에 이메일·provider 표시(`OAuthAccountNotLinked_<provider>_<email>`, 웹+앱, `dacb079`/`6a07ecd`), 가입 직후 세션 이름 폴백+프로필 세션 지연 동기화(`17285ea`). 검증 방식은 state 유지(`checks:["state"]`+쿠키 SameSite=None — Apple 공식 지원 방식) **✅ 구글·카카오 2차 완료(8/26 밤, `e92b604`~`c07de9e`)**: 클라 버튼·인증 흐름 + 콘솔 전부(Google iOS `...n8h6m5j674qvk02t4r3tdmqr33gj3gqo` + Android debug SHA-1 클라이언트, Kakao 네이티브 키 `284d92fc…`+Android 키해시+iOS 번들ID 플랫폼 등록). 서버 env 불요(구글 aud=기존 웹 클라이언트). **✅ 실기기 로그인 전 항목 통과(8/27)**: Galaxy=Google·Kakao, iPhone=Apple(409 충돌 감지 포함)·Google·Kakao. 단 콘솔 교정 필요했음 — **어젯밤 등록한 SHA-1·카카오 키해시가 `~/.android/debug.keystore`(머신 공용 키) 값이었고 실제 APK 서명은 프로젝트 키(`android/app/debug.keystore`)** → Google SHA-1을 `5E:8F:16:06:2E:A3:CD:2C:4A:0D:54:78:76:BA:A6:F3:8C:AB:F6:25`로, 카카오 키해시를 `Xo8WBi6jzSxKDVR4drqm84yr9iU=`로 교체 후 성공(증상=계정 선택 직후 즉시 실패 DEVELOPER_ERROR 패턴). **스토어판 콘솔(8/27~28, 2차 교정)**: Play Console "앱 서명 키(기존 키)" 표기 SHA-1(`84:C4:…`)로 등록했으나 **실배포 서명은 "이전 앱 서명 키"(`F9:E6:BB:50:F1:68:3F:D8:DF:6D:A5:CD:FD:D1:FF:1A:A4:17:7A:D6`)로 확인**(8/28, Play 설치본 apksigner 실측 — 8/22 키 업그레이드 이력 탓에 콘솔 표기≠실배포) → Google 클라이언트 "OriPics Android Play legacy"(F9:E6) + 카카오 키해시 `+ea7UPFoP9jfbaXN/dH/GqQXetY=` 추가 등록(84:C4 계열도 향후 전환 대비 유지). ⚠️교훈 재확인: 콘솔 화면 표기보다 **기기 설치본 추출값이 정답**(`adb pull` + `apksigner verify --print-certs`). **✅ 8/28 Play 스토어판 Galaxy 실기기 Google·Kakao 로그인 통과**(카카오는 해시 끝 `=` 누락 재입력 후) — 스토어 배포판 소셜 전 경로 검증 완료, 모집 발송 기술 리스크 제로. **✅ 네이버 3차 완료(8/27 오후)**: U-38 승인 직후 @react-native-seoul/naver-login 5.0.1 + config plugin(urlScheme=oripicsnaver) + 네이버 콘솔 모바일 환경(Android 패키지명·iOS 번들ID+스킴) + consumerKey/secret 앱 내장(네이버 SDK 표준 — 리포는 로컬 전용·front push에서 모바일 제외). Galaxy·iPhone 실기기 네이버 로그인 검증 통과(4사 전 조합 완료). 네이버 로그인 이메일=vitamind7@naver.com(네이버 계정 이메일 — daum 아님, 계정 매칭 시 주의). **소셜 세션 정리 2단(8/27 저녁)**: ①로그아웃·탈퇴 시 SDK 로컬 토큰 폐기(clearProviderSessions) ②탈퇴 시 provider 연동(grant) 철회(revokeProviderConnections — google revokeAccess·kakao unlink·naver deleteToken. 로컬 logout만으론 네이버앱이 기존 grant로 화면 없이 자동 재승인·재가입돼 혼동, 실기기 실측). 계정 전환 자체는 네이버앱에서(네이버 설계 — 인증 중 계정선택 UI 없음). 옵션: Android용 Apple 로그인(웹 OAuth 흐름) — 보류 | 1.0.0(5) EAS 빌드 진행 | P2 |
| A-53 | **iOS Universal Links / Android App Links** — 홈 앱 버튼(2026-08-28, `lib/appLinks.ts`)의 iOS는 현재 링크만(설치 시 자동 실행 없음 — 스킴 강제는 미설치 시 오류 팝업이라 기각). 정식 출시 시: ①웹에 `/.well-known/apple-app-site-association` + 앱 associated domains 엔타이틀먼트(재빌드) ②Android `assetlinks.json` + intentFilters(autoVerify)로 승격 ③appLinks.ts를 스토어 정식 링크로 교체(주석에 링크 기재됨). 공개링크 뷰어를 앱에서 열기(딥링크 라우팅)도 이때 함께 검토 | 정식 출시 시 | P3 |
| A-55 | **제보 버티컬** — 제보 사진의 조작·AI합성 리스크를 OriPics 검증으로 해소하는 트랙 (2026-08-28 대표 확정). **①MVP(빌드 7)**: 목록 탭 인증 항목에 [제보하기] → 제보처 시트(방송사 카톡채널 딥링크/이메일 mailto+검증링크 템플릿, 클립보드 복사 안내) — JS만, 신규 네이티브 없음 ②제휴 영업: JTBC·SBS 디지털뉴스팀(카톡 제보 최활발=검증 페인 실재)·지역 언론 콜드메일, 보배드림 뱃지 제휴 ③과금 모델: 제보자 무료+제출처 B2B 월정액(제휴 제출 완료 건만 소급 무료 — 무료 인증 우회 방지 설계 필수) ④공공(안전신문고 연 수백만 건이 최대 시장이나 API 없음·조달 필요 — A-52 연동). 자동 제출 현실: 이메일=완전 자동 가능, 카톡 채널=반자동(딥링크), 공공·방송사 앱=불가 | 빌드 7 스토어 제출 완료 | P2 |
| A-56 | **촬영 세부정보 수집·서명 확대 (Verified 상세)** — ✅**전 구간 구현 완료(2026-08-29)**: ①웹 1단계(어서션의 플랫폼·렌즈·배율을 PDF·판독·뷰어 표시) ②2단계 서버(sign이 device_model/os_version/app_version/iso/exposure_time/f_number/focal_length 수신·sanitize → verified 어서션 서명 기재) ③2단계 앱(빌드 8): EXIF 최소 파서(`lib/capture/exif.ts` — VisionCamera v5는 메타 미노출이라 JPEG 직접 파싱, LE/BE 합성 검증) + expo-device 모델명·OS + expo-application 앱버전 → 큐 영속 → sign 전송 ④표시 = 쉬운 말(확인된 사실)+촬영 기기+촬영 정보+기술 상세+증명 데이터(mono) 병기, PDF 1페이지 유지. **부수 버그 수정**: publish→C2PA 첨부의 verified_info snake/camel 불일치로 zoom/lens/attest 해시가 어서션에서 조용히 탈락하던 문제(기존 verified 발행본은 platform만 있음 — 신규 발행부터 전체 기재). 신규 인증부터 적용, 잔여=실기기 EXIF 실측(빌드 8 설치 후) | 빌드 8 반영 | P2 |
| A-54 | **앱 내 증명서 PDF 발급** — 현장 직군은 폰에서 찍고 그 자리에서 PDF를 카톡·문자로 보내는 흐름이 자연스러움. 발급 API(/api/links/[id]/certificate)는 Bearer 인증 기지원이라 앱은 버튼+파일 저장/공유 시트만 붙이면 됨(소규모). 베타에서 웹 PDF 사용 신호 확인 후 착수 (2026-08-28 등재, 대표 확정) | 베타 피드백 후 | P3 |
| A-52 | **B2G 공공조달 경로 검토 (PMF 후)** — 공공 시설점검·안전진단·현장감독·재난조사 사진 증빙은 정합 유스케이스(IR 시장 확장 스토리로는 지금도 활용). 실행 관문: 공공 SaaS 판매=디지털서비스몰 경로가 표준이며 **CSAP(클라우드 보안인증) 사실상 필수**(하등급 간소화라도 수개월·수천만원) + 국내 리전 요건으로 현 스택(Vercel+Supabase) 부적합 → 공공용 인프라 별도 필요. 진입 시 우선순위: 벤처나라(벤처창업혁신조달상품)·혁신장터 테스트베드(시범구매+실증) > 나라장터 일반 입찰. 조달업체 등록(입찰 자격)만은 저비용이라 수요처 생기면 즉시 (2026-08-28 등재) | PMF 후 | P3 |
| A-51 | **가입 보너스 파밍 방지** — 소셜 즉석 가입은 탈퇴 후 재로그인 시 자동 재가입되며 가입 보너스 20건이 매번 재지급됨(2026-08-27 탈퇴 테스트 중 확인). 무료 크레딧뿐이라 피해 제한적이나 오픈 후 어뷰징 여지 — 후보: 소셜 providerAccountId(해시) 기준 보너스 1회 제한 또는 재가입 시 보너스 미지급 유예기간. 개인정보 최소화(해시 보관)와 함께 설계 | 오픈 후 | P3 |
| A-49 | **verified 런타임 후킹 대응 — Play Integrity STRONG 상향 옵션 + 무결성 수준 기록** (2026-08-26 등재). ✅**①·② 구현 완료(2026-08-29)**: ①`PLAY_INTEGRITY_REQUIRE_STRONG=true` env 플래그(기본 off — 구형 기기 정상 사용자 탈락 트레이드오프, 기기 분포 확인 후 활성) ②attest의 deviceIntegrity 수준(STRONG/DEVICE, iOS=passed)을 verified_info→C2PA 어서션 `device_integrity`에 서명 기록 — 증명서·판독·뷰어 증명 데이터 줄에 표시(분쟁 시 인증별 신뢰 근거). links 컬럼 별도 기록은 불요 판정(어서션이 서명 원본). 참고: "셔터 시점 즉시 전체 파이프라인 실행"은 검토 후 기각(상세: [verified-trust-model.md](verified-trust-model.md) §4-2). RASP(freeRASP류)는 PMF 이후 별도 검토 | ①② 완료 (env는 미활성) | P3 |
| ~~A-48~~ | **✅ 2026-08-26 구현 완료 — 셔터 시점 해시 봉인 (verified 공격면 축소)** — 촬영~[인증하기] 사이 루팅 기기의 큐 파일 교체로 편집본이 verified 인증되는 갭(대표 질의로 식별)을 차단. `lib/capture/seal.ts`: 셔터 직후 백그라운드 순차 해시 계산 → SecureStore 하드웨어 키 HMAC 봉인 → 인증 시 MAC 검증+재계산 대조, 불일치 시 `seal_mismatch` 거부(친화 문구). **인증마크 UX 이동**: 촬영 화면 pill(기본 ON)로 셔터 시점 확정, 목록탭 칩은 봉인 항목 잠금(안내 알럿), 갤러리(F)는 기존 토글 유지. best-effort(봉인 부재 항목은 기존 흐름). 상세: [verified-trust-model.md](verified-trust-model.md) §4-1. **Galaxy 실기기 검증 완료(8/26 대표 확인 — 촬영→인증 정상, 봉인 해시 일치)**. UX 후속 반영: 인증마크=로고 pill(맨 왼쪽)·촬영 항목은 메타 줄 로고 ✓ 표시(칩은 갤러리만)·pill ON/OFF 상태 재시작 복원(`prefs.ts`) | 완료 | ✅ |
| A-35 | **외국인·해외 결제 트랙 (2026-07-24 대표 질의)** — 휴대폰 +82 형식은 정규화로 해결됐으나(체크아웃, 국내 번호 한정), 근본 제약: ①**KG이니시스 국내 MID는 해외 발급 카드 미지원**(해외카드 별도 계약 또는 PortOne 해외결제 채널 필요) ②INICIS 빌링키 발급이 해외 휴대폰 번호를 수용하는지 미검증 ③글로벌(USD) 가격 미정(pricing-policy §7 잔여 변수, 잠정 $7.99/Pro). 선택지: PortOne 해외카드 채널 추가 vs Stripe/Paddle 별도 트랙(Merchant of Record면 부가세 처리 단순). 글로벌 마케팅 시작 전 결정 | 글로벌 진출 결정 시점 | P3 |
| A-38 | **모바일 인증 보안 강화** — M1(2026-08-07)에서 도입한 `/api/mobile/auth/*`의 후속: ①~~로그인 엔드포인트 레이트리밋~~ **완료**(`RATE_LIMITS.login`, IP+이메일 키) ②~~refresh 토큰 서버측 폐기~~ **완료(2026-08-24 배포)** — `mobile_refresh_tokens` 테이블(jti 단위, raw SQL 생성 — **`prisma db push` 금지**: 스키마 밖 links 드롭 시도), 회전 시 구 토큰 폐기+재사용 감지 시 전 기기 무효화, logout 엔드포인트, refresh 레이트리밋. 구현: `lib/auth/refreshStore.ts` ③기기별 세션 관리 UI — 잔여 | ③만 잔여 (오픈 후) | P2 |
| A-37 | **체크아웃 네이버페이 수단 추가** — U-33 채널키를 env(`NEXT_PUBLIC_PORTONE_CHANNEL_KEY_NAVERPAY`)로 추가 + 결제수단 선택 UI. **선결 확인**: 현 구독 구조는 빌링키 필수 — PortOne V2 네이버페이 빌링키(정기결제) 지원 조건 및 네이버페이 정기결제 별도 심사 필요 여부 확인(정기 미지원이면 패스 상품 Phase C 일반결제 전용 수단으로 범위 축소). "크레딧/충전" 표현 금지 제약은 네이버 가맹 심사에도 동일 적용 | U-33 완료 후 | P2 |

### 2.3 모바일·모노레포

| ID | 항목 | 트리거 | P |
|---|---|---|---|
| A-9 | 트랙 B Phase 2~7 모노레포 추출 (`packages/stamp/`) | 모바일 본 시작 | P1 |
| A-10 | 모바일 앱 본 개발 (트랙 D, 8~10주) | A-9 + U-2·U-16 완료 | P0 |
| A-11 | 모바일용 stamp 클라이언트 인터페이스 (Verified mode) | 모바일 본 시작 | P1 |
| A-38 | ~~maestro e2e yaml 갱신~~ → **완료 (2026-08-22)** — 4탭+8/22 개편(옵션 칩·+파일·내보내기) 반영. `screenshots.yaml`: clearKeychain으로 세션 초기화(로그아웃 UI 경유 제거 — 확인 알럿 탭 불안정 실측), 캡처=로그인·홈·판독·목록·촬영폴백. `certify-e2e.yaml`: 목록 +파일→사진 보관함→PHPicker 멀티(셀 탭 후 추가 확정)→인증하기→링크 복사 — **시뮬 전 단계 통과 실측**(차감 -5 정확, 내보내기 표시=인증본 저장 검증). `capture-screenshots.sh`: expo run 로그테일 미종료 대응(마커 감시 후 종료)+simctl privacy 사전 부여(GPS 기본 ON 팝업 차단). 스크린샷(gitignored image/screenshots/) 8/22 재캡처 4장 + 실기기 촬영컷(8/19) 유지, 구 3탭 인증컷 삭제. 스토어 목록컷은 e2e-02-result 구도 권장 | 완료 | P1 |
| A-39 | **C2PA manifest에 촬영시각 반영 검토** — V5 스탬프·DB·뷰어에는 반영 완료. c2pa manifest assertion(예: `c2pa.actions`의 when 또는 exif assertion)에도 captured_at을 넣을지 검토 (수정 범위: `lib/oripics-stamp/c2pa.ts` attachC2paManifest 입력 확장) | SSL.com cert 도착·C2PA 재활성화 시 | P2 |
| A-41 | **모바일 증명서 PDF 발급** — 목록탭 완료 항목(공개링크 발행분)에 '증명서 PDF' 버튼 → `GET /api/links/{id}/certificate`(Bearer) 다운로드 → 문서 폴더 캐시 → 공유 시트(내보내기 패턴 재사용). Pro·Business 전용 — 월 5건 무료/이후 −10 표시는 서버 응답 기반. 사고·분쟁(현장 촬영→증빙) 시나리오의 모바일 완결 흐름. 서버·발급 로직은 완성(A-8·A-24) — 클라 반나절 수준 | **iOS IAP 출시(U-35) 직후** (모바일 Pro 경로 생긴 뒤) | P2 |
| ~~A-45~~ | **✅ 2026-08-24 완료** — 홈탭에 "회원탈퇴" 진입점(웹 프로필 연결, ko/en) 추가·실기기 확인(`d8d73a1`). Apple 5.1.1(v) 충족. 함께: 웹 프로필 비로그인 무한 스피너 → 로그인 리다이렉트 수정·배포(`43102be`), 차감규칙 링크→카드 승격. **심사 제출 빌드에 포함 필수**(현재 로컬 main에만) | 완료 | ✅ |
| A-40 | **썸네일·뷰어 경량본 서버 생성 통합** — publish가 이미 PNG를 다운로드·디코드하므로 sharp로 리사이즈해 `{linkId}_thumb.jpg`·`_preview.jpg`를 Storage에 생성(클라 업로드 ~400KB/건 제거, 웹·모바일 중복 구현 제거, 누락 불가). ProofHistory.thumbnail dataURL(DB 저장)은 경로 참조로 이전 + 기존 행 backfill. sharp 네이티브 의존성 추가라 **오픈 후** 진행. 두 파생본을 하나로 합치는 안은 기각(뷰어 1장 고화질 vs 그리드 다수 저화질 — 요구 스펙 상충, 그리드 egress 역증가) — 파일은 2종 유지, 생성 파이프라인만 단일화 (2026-08-21 검토) | 오픈 후 | P2 |

### 2.4 테스트 보강

| ID | 항목 | 트리거 | P |
|---|---|---|---|
| A-12 | Prisma 의존 헬퍼 단위 테스트 (consumeCredits·refundCredits·grantSignupCredits) — DB mock 셋업 | 베타 직전 | P2 |
| A-13 | API route handler 통합 테스트 (Next.js test setup) | 베타 직전 | P2 |
| A-14 | C2PA 본 통합 e2e 회귀 테스트 (Reader round-trip) | A-2 완료 후 | P2 |

### 2.5 정리·기술부채

| ID | 항목 | 트리거 | P |
|---|---|---|---|
| A-15 | PoC 라우트 `/api/c2pa-poc/*` 제거 | A-2 + production 검증 후 | P3 |
| A-16 | todo.md 갱신 (구버전 — Free 30 크레딧 → 10, 비로그인 정책 등) | NOW | P3 |
| A-17 | **Next.js 14 → 15 major upgrade** (2026-08-06 트리아지: 잔여 next 알림 전부 이 항목으로 수렴 — 목표 15.5.21+. Server Actions 미사용·rewrites 없음·App Router라 대부분 미해당, 잔여 RSC DoS는 Vercel 플랫폼 완화로 수용. next 내장 postcss 8.4.31도 함께 해소). 자동 Dependabot 차단 중, 별도 PR로 수동 진행 | 별도 트랙 | P2 |
| A-18 | next-auth v5 마이그레이션 — ~~nodemailer advisory 해소 목적~~ 2026-08-06 트리아지에서 nodemailer 9 직접 패치·next-auth 4.24.15(critical 해소)로 **시급성 소멸**. v5는 기능적 필요 발생 시에만 | 별도 트랙 | P3 |
| A-19 | SOC 2 시작 | 첫 B2B 미팅 시점 | P3 |

---

## 3. 결정 의존 트리

```
SSL.com 회신 (U-1)
  ├── U-5 손익분기 갱신
  ├── U-28 Vercel env 갱신
  └── A-2 C2PA 본 통합
       └── A-15 PoC 라우트 제거

포트원 가입 (U-24)
  ├── U-25 PG 계약
  │    └── U-26 간편결제 추가
  │         └── A-1 포트원 어댑터 본 구현
  │              ├── A-6 J-7 webhook + lifecycle
  │              └── A-7 J-8 영구 보관
  └── U-7 환불 정책

모바일 본 시작
  ├── U-9·U-10 privacy 책임자/법무
  ├── U-16 앱 아이콘
  ├── A-9 모노레포 추출
  ├── A-11 stamp 클라이언트 인터페이스
  └── A-10 모바일 앱 본 개발 (D)
       ├── A-4·A-5 attest 본 구현 (D-pre-5)
       ├── 베타 직전 (U-17·U-18·U-24)
       └── 앱 심사 (U-14·U-15·U-20·U-21)
```

---

## 4. 분산된 원본 출처 (참고)

본 문서가 통합한 항목들의 원본 위치 — 항목 갱신 시 원본도 함께 갱신:

| 출처 | 다루는 영역 |
|---|---|
| `~/.claude/projects/.../memory/current_phase.md` | 외부 의존성 대기 + 옵션 작업 큰 그림 |
| `~/.claude/projects/.../memory/c2pa_esigner_integration.md` | eSigner 본 구현 시 빈 칸 채울 9개 항목 |
| [pricing-policy.md §7](pricing-policy.md) | 가격·환불·게이트웨이 잔여 변수 |
| [app-store-metadata.md §5](app-store-metadata.md) | 앱스토어 발효 전 결정 10개 |
| [marketing-copy-jpeg-trust.md §7](marketing-copy-jpeg-trust.md) | 법무 검토 권장 항목 |
| [privacy/page.tsx](../src/app/[locale]/privacy/page.tsx) | 책임자 성명·법무 검토 placeholder |
| `lib/{attest/verifyToken,payment/portone,payment/stripe}.ts` | NotImplementedError stub 3개 |
| 루트 [todo.md](../../../todo.md) | 사용자 작성 구버전 — 일부 superseded |

---

## 5. 변경 이력

| 일자 | 변경 |
|---|---|
| 2026-08-21 | **빠른 연속 촬영 개편 + V5 스탬프(촬영시각)** — ①스탬프 V5: meta 64B(=V4+촬영시각 15B ASCII "yymmddHHMMSSmmm" UTC, 0×15=기록 없음), payload 96B. 촬영시각은 기기 자기주장(GPS와 동일 신뢰 수준)이나 서버 서명(final_hash)에 묶여 사후 변조 불가. 골든 테스트 V5 고정(borderV5 `346c26c0…`, stampedV5 `c12d31f7…` — 절대 갱신 금지). sign은 `stamp_version:5` 옵트인(구 클라이언트 V4 유지), receipt에 stamp_version·captured_at 전파, publish 해시검증 버전 인식, links에 `captured_at text` 컬럼 추가(프로덕션 적용 완료), verify 응답·웹 뷰어·웹 판독·모바일 판독에 "촬영(기기 기록)/인증(서버 증명)" 병기. ②모바일 4탭 개편(홈-촬영-목록-판독): 셔터=전처리만(원본 JPEG+컨텍스트 즉시 저장, <0.3s) → 목록 탭 [인증하기·n건]에서 후처리, 모두 인증·재시도·삭제·[+ 갤러리](F 경로 이동), 로그인 전 촬영 허용(인증만 로그인), GPS watchPositionAsync 지속 구독(이동 중 촬영 대응, pill에 좌표 라이브), 촬영 스낵바 [지금 인증], attest는 인증 시점 실행. 신규: `lib/capture/{queueStore,certify}.ts`, `app/queue.tsx`, 탭 아이콘 queue/verify. A-38(maestro·스크린샷 재촬영)·A-39(C2PA manifest 촬영시각) 신규 |
| 2026-08-07 | **A-4·A-5 본 구현 완료** (M4) — App Attest 서버 검증(CBOR·체인·바인딩)+Play Integrity(decodeIntegrityToken·verdict 판정). env 게이트로 안전 전환(미설정 시 기존 개발 폴백). U-34(attest 운영 설정) 신규. 모바일 식별자 확정: `com.santahades.oripics` |
| 2026-08-07 | **네이버페이 가입 심사 승인 확인**(7/4 신청 → 승인) — U-33(PortOne 채널 등록)·A-37(체크아웃 수단 추가, 정기결제 지원 선결 확인 포함) 신규 등록. 오픈 차단 아님(카드결제만으로 오픈 가능) |
| 2026-08-06 | **A-7·A-24·A-36 완료** (커밋 `e052578`, Phase A) — 보관함 2계층 retention(expires_at, cleanup cron 개편, grace 37일, 재구독 복원, 5GB 체크, cacheControl 1년), 뷰어 경량 표시본(뷰 트래픽 ~1/60), PDF 월 5건 무료 하이브리드, '영구 보관' 문구 전면 전환. 잔여: U-31 Supabase Pro 전환(User)·Phase B 보관함 확장 애드온 결제 |
| 2026-05-10 | 최초 작성 — 30 사용자 항목 + 19 AI 항목 통합. 의존 트리·원본 출처 매핑 |
| 2026-05-11 | U-13 이용약관 골격 완성 (KO/EN, KCC 표준약관 16개 조항). §10·§11(유료 서비스·환불)은 J-7 시점 갱신 필요로 축소 |
| 2026-05-11 | U-9 개인정보 보호 책임자 성명 확정 (대표이사 손용석). 행 제거 |
| 2026-05-11 | A-20 매월 자동 갱신·A-21 어드민 조정 UI 추가 — 현재 구현 갭 노출 (1개월 후 사용자 0크레딧 멈춤 risk) |
| 2026-05-11 | 차감 정책 정합 강화 — verify_query 로그인 필수 + −1 / link_create 통합 −1 (Standard −3·Verified −4) / detectStamp 무료 분리(magic only) / 사용자 UI를 크레딧 + 차감기준으로 변경. pricing-policy §2 갱신, 테스트 anchor 갱신(33 tests) |
| 2026-05-13 | A-23·A-24·A-25 추가 (J-9 PDF 발급 트레이드오프). A-26·A-27·A-28 추가 (업로드 진행률 후속 — confirm stage 라벨, stego chunking, 취소 버튼) |
| 2026-05-17 | **B-2'' 흐름 분리·운영 강화** — pricing-policy §10 동일 항목 참조. A-26 라우트명 갱신(confirm→publish). A-30·A-31·A-32·A-33 신규 추가(multi-result 미공개 재검출 미지원, multi confirm 진행률 단순화, 인증 결과 안내 강화, 30일 미사용 cleanup). 용어 통일 간편링크→공개링크 |
| 2026-06-18 | A-32 완료 — result_stamped UI에 `save_for_later_hint` 안내 한 줄 추가(다운로드 버튼 아래, `!generatedLink` 조건). 저장한 파일을 ~30일 내 같은 브라우저에서 재드롭하면 공개링크 생성 가능 안내. ko/en i18n 추가. [page.tsx](../src/app/[locale]/page.tsx) |
| 2026-08-22 | **의존성 취약점 해소 + Next 15 업그레이드** — dependabot 26건(오픈시점) → **0건**. postcss/nanoid는 npm overrides(빌드타임), next 14.2.35→15.5.23 업그레이드(codemod로 async request API 변환, next.config 키 이동 `serverExternalPackages`/`outputFileTracingIncludes`), 신규 표면화된 sharp<0.35(libvips CVE)도 override로 해소. React 18.3.1 유지. 검증: tsc·테스트 118·빌드·런타임 스모크·프로덕션 배포 통과 |
| 2026-08-29 (새벽) | **제보 탭 완성 + 1.0.0(7) 양 플랫폼 스토어 제출** — 제보처 14곳(이메일 7: 연합·JTBC·MBC·SBS·KBS·YTN·채널A / 카톡 7) + 추천 버튼, 원격 목록(웹 JSON v3 + 버전 비교 임베딩 폴백 — EMBEDDED_VERSION은 웹 version과 동반 상향 필수), 이력(썸네일·상세 재현·확대 보기·삭제), 실기기 왕복 다듬기 10여 회(스크롤 flexShrink·중첩 Pressable·타이틀 48pt·뷰어 ✕ 통일 등). iOS=Beta 자동 배포(후속 빌드 심사 승계), Android=Alpha 승인(8/29 오전) — **양 플랫폼 1.0.0(7) 라이브** |
| A-62 | **인증 파이프라인 지연 해소 — Vercel 함수 리전을 DB 옆으로 (2026-09-01 [timing] 실측 결론)** — 실측(verified 촬영 1체인, 9/1): sign 6.3s+confirm 2.8s+publish 13.4s=**서버 처리만 22.5s**. 병목=**DB 왕복 지연이 전체의 ~70%**: 함수는 iad1(워싱턴, Vercel 기본값)인데 **Supabase는 ap-south-1(뭄바이)** — 왕복 ~200ms × Prisma 트랜잭션당 4~14회(BEGIN·DEALLOCATE·쿼리·COMMIT) = consume_credits 2.8s·preflight_db 2.2~3.3s·pass_check 1.9s. storage_download 3.9s(7.5MB 대륙 간)도 동일 원인. **Google Play Integrity/TSA는 무죄**(attest_verify 105ms — 토큰 캐시 유효. 단 이번 샘플은 iOS 추정, Android 데이터 대기). **처방: vercel.json에 `\"regions\": [\"bom1\"]` 한 줄**(뭄바이 — DB 옆) → DB 왕복 200ms→1~2ms, 예상 22.5s→**2.5~3s**(잔여=png_decode 1.2s CPU+인리전 스토리지). 한국 사용자 관점에서도 서울→뭄바이(~140ms)가 서울→워싱턴(~190ms)보다 가까워 클라이언트 왕복도 소폭 개선. 대안(장기)=Supabase 서울(ap-northeast-2) 신규 프로젝트 이전+icn1 — 데이터 이전 작업 커서 PMF 후. 주의: C2PA cert 도착 후 TSA(미국)가 켜지면 bom1→美 왕복이 publish에 +수백ms 추가되나 허용 범위 | ✅**종결(9/1)** — bom1 배포 후 실측: sign 6.3s→0.27s·confirm 2.8s→0.03s·publish 13.4s→1.5s, **합계 22.5s→1.8s(−92%)**. DB 단계 전부 예측대로 붕괴(preflight 3281→11ms 등). 후속 건은 standard·1.4MB라 스토리지/디코드는 비대칭 비교(7.5MB verified 예상 ~3s) | **P1** |
| A-61 | **보관함 사용량 표시 + 용량 임계 알림** — ①✅**사용량 표시 구현·배포(2026-08-31)**: `/api/user/storage`(원본 PNG+뷰어 프리뷰+PDF 캐시 크기 합산 — storage.objects 메타데이터), 프로필 4번째 카드 "보관함 사용량" — **온디맨드(버튼 클릭 시 조회, 대표 결정: 확장 시 쿼리 비용 대비)**, Pro/Business=5GB 게이지·Free=7일 보관 안내. 실측=대표 계정 416.8MB/99파일. 앱 표시는 빌드 10 후보 ②**임계 알림(후속, 보관함 확장 애드온 출시와 한 묶음)**: 용량 증가는 발행 시점뿐 → publish API가 발행 직후 사용량 검사 → 80% 도달 시 응답 플래그(발행 결과·프로필 배너), 95% 도달 시 이메일 1회(A-58 nodemailer 재사용, 임계 진입 시 1회). **100% 도달 정책은 기확정(§11.2)**: 기존 링크 유지 + 새 공개링크 생성 차단(발행 시 체크) — 구현만 하면 됨. 선결=확장 애드온(+20GB ₩2,900/**월 정기**, Pro 전용, §11 — 1차 미출시) 출시 결정. 현재 시급성 낮음(최대 사용자 5GB의 8%) | ①완료 ②애드온 출시 시 | P3 |
| A-60 | **원데이 패스 (선물 가능 1일 이용권)** — 2026-08-31 대표 기획. 상품: 사이즈 무관 촬영인증 10회+인증서 PDF+전용 스토리지 1GB(초과분 별도 구매), 가격 미정. **구조**: 구매 시 공개링크형 코드 발급 → 앱에서 누구나 코드 등록 → 등록 시점부터 24시간 유효(구매자≠사용자 가능 — 선물하기·사용자 확보 유인). **심사 분석(8/31)**: ①상품 추가 자체는 재심사 불요, 단 **단건 일반결제가 MID에 활성인지 선확인**(현 MID=빌링키 정기결제 용도 — 미활성 시 추가 신청 3~7영업일) ②양도 가능 코드는 **상품권 분류 리스크**(고위험 업종 별도 심사·카드 구매 제한 가능) — 방어 논리=자사 단일 서비스 전용·현금성 없음(선불전자지급수단 비해당) ③리스크 완화 설계: 명칭 '원데이 패스(선물 가능)'(상품권·쿠폰·충전 금지), 유효기간 10년→1년 권장, 약관(전용·재판매 금지·미등록 환불·등록 후 환불 불가), **구현 전 포트원 담당자 서면 사전 협의 필수**. **8/31 정책 확정(대표)**: 가격 **3,300원(VAT 포함)**, free도 구매/등록 가능, verified·PDF 규칙 Pro 동일, 전용 1GB 폐기(기존 보관함·5GB 쿼터 공유), **패스 링크 보관=발행 시점부터 1년 고정**(8/31 재정정 — 사고 증거 용도, 초안의 37일 유예 폐기), 촬영(P/C)만 패스 차감(사이즈 무관 10회 유지 — "100건" 안은 충전 외형 심사 리스크로 기각), 셔터→링크+PDF 자동 발행(패스 발행분 PDF 차감 0), 활성 패스 계정당 1장, 홈탭/프로필 표시+태그. 설계=[oneday-pass-design.md](oneday-pass-design.md), 포트원 문의 초안=[portone-oneday-pass-inquiry.md](portone-oneday-pass-inquiry.md) | **Phase 1·2·3 코드 완료 + 스토어판 실검증(9/1)** — 빌드 10 양 플랫폼 라이브·테스터 공지+코드 9장 발송 완료. **갤럭시 Play 스토어판 e2e 통과**: 패스 등록(OP-RGXX)→촬영→verified+패스 차감(P260901-064804, [timing] 체인 2.8s — attest 234ms·bom1).  **Phase 3 결제 연동 선작성 완료(9/1)**: /pass/checkout→/pass/success→purchase/complete+webhook 안전망·환불 revoke. **판매 개시=KG 일반결제 MID 발급 후 `NEXT_PUBLIC_PORTONE_CHANNEL_KEY_INICIS_ONETIME` env 설정+재배포만** (미설정 시 "출시 준비 중" 유지). **⚠️9/1 포트원 재질문 회신 도착**: 선불충전금/상품권 분류 가능성 有(판정=KG 심사) — 분류 시 월한도 100만·할부불가·부분취소불가+무거운 서류(인지세·등기부등본 등). 권장 수정 3안=A 본인전용(양도불가·즉시귀속)/B 구독전환/C 서비스이용료(즉시개시·코드무). **대표 결정 대기** — AI 권장=A안 변형(구매 즉시 본인 귀속+활성화만 사용자 타이밍, 선물 제거)+/pass 선물 문구 선제 제거(KG 심사관 사이트 열람 대비)+포트원 1문 재확인. 잔여=구조 결정→문구·코드 수정→실결제 e2e | P2 |
| A-59 | **해외 결제 모듈 검토 (2026-08-31 대표 요청 — 웹 리서치 완료)** — 결론: ①**Stripe는 한국 법인 직접 가입 불가**(2026 현재 지원 46개국에 韓 없음 — "Stripe 쓰는 한국 스타트업"은 미국 법인 보유 케이스) ②실질 선택지=MoR 2파전: **Paddle**(5%+50¢ 올인, dunning·proration 성숙, 2012~) vs **Polar**(무료 플랜 5%+50¢+국제카드 1.5%≈실효 6.5%, 유료 플랜으로 인하 가능, **한국 셀러 공식 지원**=Stripe Connect Express 페이아웃, usage-based billing 내장, 신생 2023~·proration/dunning 미지원) ③**권장: B2C Pro 구독 글로벌 오픈=Paddle 1순위** / API 종량 과금(B2B) 병행 시 Polar 재부상 → 둘 다 PoC 후 결정 ④국내=PortOne+KG 유지, Stripe는 미국 법인(플립) 계획 생기면 재검토. 우리 정책(정액 SET·proration 없음)은 Polar 약점과 무충돌. Polar는 2026 요금 인상 전력 — 채택 시 연 1회 재평가. **심사 리드타임(9/1 조사)**: Paddle=도메인 5~7·사업자 2~4·신원 1~3영업일(자동 승인 시 수일, 전부 수동 시 ~2주 — 약관·환불·가격 페이지 필수, ori.pics 기구비), Polar=페이아웃 승인까지 ~2주(상품·연동·라이브 사이트 세팅 후 리뷰가 빠름) → **글로벌 오픈 일정 확정 시 심사부터 선행**(Paddle은 사전 검증 공식 권장 — 신청 가이드=[paddle-onboarding-guide.md](paddle-onboarding-guide.md)), 한/영 병기 사업자등록증명(.secrets/ssl-com) 재사용 가능 | 글로벌 USD 요금 확정 시 | P3 |
| A-58 | **보관 유예(grace) 이메일 알림** (§5.3, 2026-08-30 대표 지시로 즉시 구현) — ①다운그레이드 즉시 안내(만기 해지=charge cron·즉시환불=billing route 양 경로): 링크 수+정확한 삭제일+재구독 시 복원 고지 ②삭제 7/3/1일 전 리마인더: charge cron(일 1회)에서 (6,7]·(2,3]·(0,1]일 창 매칭=상태 테이블 없이 자연 중복 방지, 대상=subscription canceled 이력자 한정(Free 기본 7일 링크엔 미발송 — 스팸 방지) ③발송=기존 nodemailer(Gmail SMTP) 재사용, 전부 best-effort ④**제품 내 표시(8/30 추가)**: credits/me가 grace{count,expires_at} 요약 반환(해지 이력+free만 집계 — 일반 사용자 무부담) → 웹 프로필 앰버 배너(재구독 CTA)+앱 홈 카드 경고 줄(빌드 9). **잔여**: 앱 푸시(§5.3 "앱 알림" — expo-notifications 인프라 부재, PMF 후), 실발송 e2e(실해지 사례 발생 시 확인), dunning(A-42)과 연계 | 구현 완료 (실발송 검증 대기) | P2 |
| A-57 | **SSL.com 운영 cert 수령 시 — 뷰어 다운로드 안내 문구 검토** (2026-08-30 대표 등재). C2PA_ENABLED 활성화 후에는 서버 발행본(C2PA 매니페스트 포함)과 결과 화면의 로컬 저장본(C2PA 미포함)이 달라짐 → 결과 화면 "인증 이미지를 파일로 저장" 근처와 뷰어 다운로드에 "C2PA 포함본은 공개링크 페이지에서" 류 안내 검토·문구 확정. env swap 체크리스트와 함께 실행 | cert 수령 시 | P2 |
| 2026-08-31 | **테스터 확장 + 수익화 검토 3건 + 보관함 사용량** — ①**테스터 5~9호 Pro**(박안숙 ansuk98@naver·박성훈 huna75@daum·허노욱 nougi@hanmail·박성탁 beetle486@gmail·윤승주 sjharu@naver — **전원 전달받은 주소와 실가입 이메일 상이**, 이름 매칭으로 발견. 대기=박미라 1명, Play 등록 완료) + 실사용 계정 전원 Pro + **개발기 테스트 잔재 6계정 삭제**(전부 links=0 실측, 네아로 유지) — DB 13계정으로 정리 ②온보딩 전면 갱신(iOS=TestFlight '교환 화면' 안내·Android=옵트인 링크 명시+구글 계정 안내, 빌드 9 기능 반영) ③**A-59**(해외결제: Stripe 한국 법인 불가 확정, Paddle vs Polar — Polar도 한국 셀러 지원 확인)·**A-60**(원데이 패스: 선물 가능 코드 구조+상품권 분류 리스크 분석)·**A-61**(보관함 사용량 카드 배포 — 온디맨드 버튼, 실측 416.8MB/99파일 + 임계 알림 설계, 100% 정책=§11.2 기확정) ④use-cases 헤드라인 "증거가 되는 순간"·how-it-works 밴드 slate-600/카드 브랜드 톤·부제 쉬운 표현 ⑤앱 차감규칙 이월 중복 제거(빌드 9엔 잔존 — 빌드 10 편승) |
| 2026-08-31 (오후~저녁) | **A-60 원데이 패스 하루 완주 — 기획 확정→Phase 1·2 구현→실기기 검증→빌드 10 제출**. ①**정책 확정(대표)**: 3,300원 VAT포함·촬영 10회(사이즈 무관, "100건" 안은 충전 외형 리스크로 기각)·**링크 보관=발행+1년 고정**(37일 유예안 폐기 — 사고 증거 용도)·전용 보관소 폐기(기존 보관함·5GB 공유)·**Verified=기기 검증 통과 시에만**(무조건 부여안 기각, 문구 "(기기 검증 통과 시 Verified)" 통일+폴백 목록 고지+attest 1회 자동 재시도) ②**Phase 1(서버)**: day_passes(RLS on·활성 1장 partial unique)·redeem/active API(레이트리밋 10/h)·sign/confirm/publish/certificate 분기(패스 우선 차감·verified 게이트 우회·PDF 무료)·어드민 발급 스크립트 — 프로덕션 e2e 5시나리오 통과 ③**Phase 2(UI)**: 웹=프로필 패스 카드·등록 확인 모달(4항 고지)·자세히 보기(9항)·최근 내역 라벨·히스토리 태그·**PDF 준비 중 스핀 태그+8초 폴링 자동 전환**·미리보기 모달 준비중 비활성/무료 라벨 / 앱=홈 패스 카드·QR 등록(확인 Alert)·**셔터→자동 인증·발행·PDF 워밍**(직렬 체인)·목록 "원데이 패스" 태그 — 갤럭시 실기기 검증(free 계정 실촬영) ④**버그픽스 6건**: QR Android 크래시(vision-camera object output=iOS 전용→**expo-camera 교체**), **certificate 라우트 Bearer 미지원**(PDF 자동 워밍 401 전멸 — A-54 앱 PDF 발급도 해소), 뷰어 PDF 버튼 패스 허용(is_pass), 인증서 "(Verified)" 하드코딩 오표기(**cert 0.0.11**+발급 대상 이메일 병기 — 전 인증서 적용), **package-lock file: dep 함정**(npm이 version 미갱신→Vercel 배포 2연속 실패, 수동 편집 필요), 모달 중복 발급 UX ⑤**빌드 10 양 플랫폼 제출**: iOS=EAS+ASC 자동 제출, Android=vc10 AAB 수동 업로드(EAS 503 1회 재시도) — 탑승분=패스 전체+expo-camera+attest 재시도+'건'→'회'+이월 중복 제거 ⑥포트원 사전 협의 발송(cs@portone.io — 단건결제 활성+상품권 분류, Phase 3 게이트)·테스터 코드 9장 발급·공지 초안(채팅방+개별). 상세 설계=[oneday-pass-design.md](oneday-pass-design.md) |
| 2026-08-31 (밤) | **A-60 Phase 3 선제작 + 베타 모집 팝업 (전부 배포)**. ①**/pass 상품 페이지**: ₩3,300(VAT포함)·기능 6카드·흐름 3단계·이용 안내 10항·환불 고지 — 구매 버튼 "출시 준비 중"(**MID 발급 후 이 버튼만 결제 플로우로 교체하면 판매 개시**), KG MID 심사 "사이트 상품 노출" 요건 충족 ②**/pass/[code] 선물 랜딩**: 코드 표시·복사·QR(앱 스캐너 호환)·등록 유도, 프로필 `?pass_code=` 자동 입력 연동. 코드 검증은 등록 시점에만(공개 검증 API는 코드 열람 채널이라 미제공) ③홈 요금제 원데이 패스 배너 ④**약관 제10조·환불정책 2-1 조항 초안 — ⚠️대표 법적 검토 필요**(선불전자지급수단 비해당·등록 후 청약철회 제한 — 포트원 재질문 답과 맞춰 확정) ⑤**베타 모집 팝업**: 네비(데스크톱)+히어로 위(모바일) 배지 → 이메일 신청(`/api/beta/apply`→hi@ori.pics 메일, IP 5/h 제한, **실수신 e2e 확인**)+iOS TestFlight 2링크+Android 옵트인(등록 후 접속 안내)+2주 유지 부탁+단톡방. ⚠️함정: glass(backdrop-filter) 네비 안의 fixed 모달은 네비 기준으로 잘림 → **createPortal(body) 필수**(실측) ⑥문구: 표준크기 사진인증 6회 통일·요금제 각주 부가세 삭제·패스 가격 표기 정리. **포트원 당일 회신**: 정기 MID로 일반결제 불가→일반결제 MID 추가 필요(문의2 상품권 분류는 무응답→재질문 발송) → **KG이니시스 MID 추가발급 신청 접수됨**(코리아포트원 ID 행·신용카드·월1회, 접수대기 1~5영업일, 발급 시 키파일 "일반결제용" cs@portone.io 전송) |
| 2026-09-01 | **[timing] 실측→A-62 리전 이전(−92%) + A-60 Phase 3 배포·빌드 10 라이브·베타 확산 개시**. ①**[timing] 실측·병목 확정(A-62)**: 05:43 verified 체인(iad1)=**sign 6.3s**(preflight_db 3,281ms·pass_check 1,858ms — attest_verify는 105ms로 무죄)+**confirm 2.8s**(consume_credits 단일 트랜잭션 2,800ms)+**publish 13.4s**(storage_download 3,912ms/7.5MB·consume 2,798ms·preflight 2,246ms)=**서버 22.5s**. 원인=함수 iad1(워싱턴)↔**Supabase ap-south-1(뭄바이)** 왕복 ~200ms×Prisma 트랜잭션당 4~14회(BEGIN·DEALLOCATE·COMMIT 포함) — 모든 DB 단계가 이 산수와 일치 ②**처방 적용**: vercel.json `regions:["bom1"]`(3923c76) → 직후 실측 **standard 1.8s**(sign 267·confirm 34·publish 1,486 — preflight_db 3,281→11ms, consume 2,800→10ms) / **verified 스토어판 2.8s**(sign 1,597: attest 234ms=뭄바이→Google 정상, counter_rpc 1,003ms 콜드 추정·confirm 35·publish 1,213) — **22.5s→1.8~2.8s(−92%), "인증 느려짐" 원질문 종결**. 로그 조회=`vercel logs -p ori-pics-mvp-front --query "timing" --json`. DB 서울 이전+icn1은 PMF 후 ③**A-60 Phase 3 결제 연동 선작성·배포(1d91494)**: /pass/checkout(단건 CARD·휴대폰 필수·청약철회 고지)→/pass/success(코드·복사·선물 링크·QR·멱등 재조회)→purchase/complete(PortOne 재질의 PAID·3,300·customData userId/product 검증·advisory lock·레이트리밋 10/h)+웹훅(Paid 안전망 발급 — 코드는 day_pass_purchase metadata.code로 회수 가능·Cancelled 미등록 revoke). **판매 개시=`NEXT_PUBLIC_PORTONE_CHANNEL_KEY_INICIS_ONETIME` env+재배포만**(미설정 시 "출시 준비 중") ④**빌드 10 양 플랫폼 라이브**: iOS TestFlight 확인(대표)·Android Alpha `completed`(⚠️versionCode 11 — vc10 기록과 한 칸 차이, 파일명·실제 vc 불일치 추정) → **테스터 공지+패스 코드 9장 발송**(매핑은 redeemer_id 사후 확인, §5 쿼리) ⑤**갤럭시 Play 스토어판 e2e 통과**: 패스 등록(OP-RGXX 1/10)→촬영→**verified+패스 차감**(P260901-064804) — DB·[timing] 교차 확인, A-60 검증 전부 종료(잔여=실결제 e2e만) ⑥**Play API SA 키 가동**: `play-publisher@oripics-sns-login` 생성·Play Console 초대·트랙 조회 검증(edit insert→tracks→delete), 키=`apps/mobile/play-service-account.json`(gitignored), eas.json 트랙 internal→alpha(227ebe0) — 이후 Android 자동 제출·상태 조회 가능 ⑦**베타 확산**: 팝업에 메일보내기 버튼(mailto hi@ori.pics 제목·본문 프리필) 배포·디스콰이엇 §2-f 최종본 게시(대표)·모집글 "월 1,000건" 표기 통일 ⑧**외부**: SSL.com 재촉 발송(Carlo 휴가 자동회신→**Kervin에게 발송**, 에스컬레이션 요구 제거한 정중 버전)·KG MID 접수대기 확인(iniweb "8. 서비스 신청현황" — 상점ID 추가발급 메뉴는 양식만 보임, 9/3~4까지 무변동 시 1588-4954). 부수: Vercel auth.json 토큰→REST 만료 확인(점검은 CLI로) |
| 2026-08-30 | **홈·how-it-works 폴리시 배치(대표 시안 5건, 전부 배포·모바일 확인)** — ①how-it-works: "삼중 보안 — 세 가지의 보안키 적용" 섹션 헤딩 신설(크기=이중 인증과 통일), 카드① "디지털 지문(스테가노그래피)"·본문 "워터마크" 용어 정리(히어로 링크와 일치) ②**EXIF 항목 사실 정정**: C2PA는 EXIF 영역이 아닌 전용 블록(PNG=caBX 청크/JPEG=APP11 JUMBF)에 저장되며 해시 바인딩이 caBX 외 전체 바이트를 커버 — "검증 결과가 흔들리지 않는다"→"OriPics는 픽셀로 확인, C2PA는 파일 변경 자체를 감지"로 교체 ③메인: 업로드 섹션 타이틀 "사진/이미지 판독하기 · 인증하기"(모바일 2줄=i18n \n 분리) + 서브텍스트 "붙여넣기(Ctrl V)·파일 선택(밑줄)" ④인증마크 토글=드래그 영역 좌상단 아이콘형(체크+로고+?, stopPropagation), 도움말 모달 제목 "인증 이미지에 로고 표시하기" ⑤섹션 제목 3종 모바일 크기 통일(text-2xl sm:text-3xl). **[저녁 배치]** ⑥**'증명'→'인증' 전면 통일(79곳)** — 증명서→인증서(PDF 0.0.10), 약관·방침 포함, 표준 용어(자격증명·하드웨어/키 증명) 보호 ⑦링크 결과 문구 티어 분기(Pro=보관함 계속 보관)+'간편공유 링크'→'공개링크' ⑧**공개링크 생성 카운트다운 제거** — 발행 권한=영수증(30일)이라 시간제한 무의미, URL 만료 시 fresh 재발급 자동 폴백(초당 리렌더도 제거) ⑨발행 전 다운로드 파일명 '임시저장-{ID}.png' + **미저장 이탈 가드**(확인창+beforeunload) ⑩**A-58 구현**(유예 이메일+웹/앱 배너)·A-57 등재 ⑪요금제 표기 개편(월 N건+표준크기 인증 회수 병기·일반파일 인증·이월 불가 노트 웹/앱)+앱 요금제 안내 문구(링크 없음—3.1.3) ⑫how-it-works 톤 정리(부제 쉬운 표현·카드 브랜드 블루/슬레이트·밴드 slate-600)+STEP 카드 개편 ⑬**빌드 9 양 스토어**: iOS ASC 업로드·Android vc9(~/Desktop)·아이폰 로컬 설치, 탑승분=빌드 9 대기 전체. ⚠️교훈: `git subtree split`은 반드시 리포 루트 cwd(`git -C <root>`) — apps/web에서 실행 시 조용히 실패 |
| 2026-08-29 | **홈 콘텐츠 2페이지 + Verified 상세 3면 + A-56·A-49 구현 + 빌드 8** — ①`/how-it-works`(3중 봉인·이중 인증 다이어그램·검증 3단계·신뢰 근거)·`/use-cases`(직군 6+언론제보) 신설 + 히어로 진입 링크(간격 2차 조정) ②**Verified 상세 표시**: 증명서 PDF "기기 검증" 섹션 + 판독·뷰어(공용 VerifiedDetailLines) — 검증 주체/확인된 사실(쉬운 말)/촬영 기기/촬영 정보/기술 상세/증명 데이터(mono, device_integrity·stamp_version·attest_sha256) 병기. 패키지 0.0.7→0.0.9(연속 수정마다 버전 범프 — Vercel·로컬 npm 둘 다 같은 버전 file: 미갱신) + 여백 조정으로 1페이지 유지(풀 필드 ko/en 실측) ③**매핑 버그 수정**: publish→attachC2paManifest의 verified_info snake/camel 불일치 — 기존 verified 어서션엔 platform만 실려 있었음(신규 발행부터 zoom/lens/해시/등급 전체) ④**A-56**: 서버(sign 7필드 수신·sanitize) + 앱(EXIF 최소 파서 — VisionCamera v5 메타 미노출로 JPEG 직접 파싱·합성 LE/BE 검증, expo-device·expo-application 신규) ⑤**A-49①②**: REQUIRE_STRONG env 플래그 + device_integrity 어서션 기록 ⑥증명서 후속(P링크 Invalid time value=15자리 컴팩트 파싱, KST 표기, 뷰어 PDF 버튼 소유자+Pro 한정) ⑦빌드 8 EAS 양 플랫폼(8/29 오전 폴리시 4건 동승) — iOS=TestFlight 심사 제출, Android=**vc7 Alpha 출시·갤럭시 실기기에서 모델명·ISO 표시 확인**(Play 버전 코드는 iOS 빌드 번호-1 — 아침 "빌드 7"=vc6이었음). vc8(이름·이메일 수정 선반영)은 라이브러리 대기 — vc7 검토 후 제출 시 Android 빌드 9 대기분 해소 ⑧**실발급 검증 중 발견·해결**: 프로덕션은 `ORIPICS_C2PA_ENABLED=off`(운영 cert 대기)라 어서션 자체가 미첨부 → verified 상세 증발 → **links.verified_info(jsonb 신설, 프로덕션 ALTER)에 발행 시 영속 + 어서션 우선/DB 폴백**으로 해소, 대표 실기기 재촬영 PDF에서 전 항목 표시 확인 ⑨앱 재시작 시 홈탭 '내 계정' 폴백 수정(credits/me가 user{id,name,email} 반환→부팅 복원)+이름 아래 이메일 병기 — **iOS만 빌드 9 대기분**(서버측 배포됨. Android는 vc8에 선반영 — 라이브러리 업로드 상태, vc7 검토 후 출시). **+빌드 9 대기 추가(8/30)**: 앱 '이용횟수→이용건수 차감규칙' 문구 + **'증명→인증' 용어 통일 앱 분(tagline·rules.costPdf 등 5곳)** (웹 79곳은 8/30 배포됨 — 증명서→인증서 포함 PDF 0.0.10, 자격증명·하드웨어/키 증명은 표준 용어라 유지. 기존 발급 PDF는 재발급 시 반영) |
| 2026-08-28 | **스토어판 검증 완결 + 증명서 PDF v2 + 모집 개시** — ①Play 실배포 서명 실측(F9:E6)으로 Google·Kakao 스토어판 로그인 통과(콘솔 2차 교정 — 기기 추출값이 정답) ②**증명서 PDF Next15 회귀(#31) 수정**: react가 Next 내장 React19로 별칭돼 react-pdf(react18)와 사본 불일치 → 렌더 전체를 로컬 패키지 @oripics/certificate(esbuild 번들·react만 외부)로 분리+serverExternalPackages. 함정 3중: 심링크 file: 의존성은 외부화 무시(.npmrc install-links=true), Vercel 캐시가 동일 버전 file: 패키지 미갱신(수정 시 version 범프 필수), react-pdf Image는 고정 치수 필수(max*만 주면 렌더 미수렴) ③**증명서 v2**: 대상 사진 썸네일(비율 박스)·워터마크+이중 프레임(공문서 무드)·촬영(기기)/인증/발행 시각 구분·GPS 한글 폰트 수정·회귀 테스트(로컬 렌더 ~20초/로케일 — 타임아웃 180s) ④**탈퇴 시 소셜 grant 서버측 철회**(웹 탈퇴→앱 재로그인도 동의 복원)+재로그인 토큰 최신화 ⑤소셜 FAQ 4항·요금제 표준크기 병기·중복클릭 방지·홈 앱 설치 버튼(Android intent 실행/폴백 — 경로는 루트 필수)·미발행 다운로드 파일명=링크 ID ⑥부동산 카페 3곳 모집글 게시, 테스터 3명 Pro(대표 포함 4) ⑦A-52(B2G)·A-53(Universal Links)·A-54(앱 PDF 발급) 등재 |
| 2026-08-27 | **소셜 로그인 완결 + 1.0.0(6) 양 플랫폼 스토어 제출** — ①**A-50 종결**: 웹 Apple 재로그인 배너 원인 특정(scope name — 3변형 실측)·수정, 구글·카카오·네이버 실기기 전 조합 통과(Galaxy·iPhone), 콘솔 교정(debug SHA-1/키해시 = 머신 공용 키 값 오등록 → 프로젝트 키 값으로) ②**U-38 네이버 검수 승인**(재신청 하루 만) → 당일 앱 네이버 SDK 3차 구현·검증 ③**UX/보안 배치**: 가입 충돌 안내에 이메일·provider 표시(웹+앱)+credentials 프리필, 가입 직후 세션 이름 폴백, 프로필 세션 지연 동기화, 앱 '비밀번호를 잊으셨나요?'(웹 forgot-password?from=app + 앱 복귀 안내), 웹 탈퇴 완료 알림, **소셜 세션 정리 2단**(로그아웃=SDK 토큰 폐기 / 탈퇴=grant 철회 — revokeAccess·unlink·deleteToken) ④**스토어판 콘솔**: Play 앱 서명 SHA-1 Google 클라이언트+카카오 키해시 ⑤**1.0.0(6) EAS 빌드**: iOS TestFlight 제출 완료, Android AAB Alpha 트랙 제출 완료(Google 검토 대기) — 이 빌드부터 테스터 모집 발송 조건 충족 ⑥A-51 등재(가입 보너스 파밍, P3). 테스트 계정 정리(timson@daum.net 2회 삭제) |
| 2026-08-26 (저녁) | **Apple 로그인 트랙 완료 + 계정 흐름 정비 (커밋 16건, 전부 실기기·라이브 검증)** — ①**U-38 등재**: 네이버 로그인 "개발 중" 상태 발견(등록 계정 외 불가) → 검수 요건 체크리스트 포함 오픈 전 P1 ②**A-50 등재+Apple 트랙 당일 완료**: 콘솔(Services ID `com.santahades.oripics.web`·Key `27FA93NZQ8`·p8=`.secrets/apple/`) → 웹 NextAuth(`appleClientSecret.ts` 런타임 서명) → 서버 JWKS 검증(aud=번들ID) → 앱 iOS 공식 버튼(4.8 대응) + Vercel env 4종. **최초 가입·로그인 웹/앱 정상 실측**, 재로그인 배너만 관찰 중(A-50 행 참조) ③**소셜 로그인 정비**: 버튼 순서 Apple·Google·Kakao·Naver 통일(로그인·가입), 가입 동의 팝업([동의하고 계속하기]로 즉시 진행 — 작은 창 인라인 에러 안 보임 해소), **간주 동의 고지**(웹 로그인+앱 Apple 버튼 아래 — 소셜 즉석 가입의 동의 공백 마감) ④**앱 내 회원탈퇴**: 웹 링크(브라우저의 다른 계정 세션 표시·오삭제 위험 실측) → 본인 Bearer로 직접 삭제, `/api/user/delete` getSessionUserId 전환, **확인 단어 입력 모달**('탈퇴합니다'/'DELETE' — 웹 동등 보호) ⑤**탈퇴 후 stale 세션(양방향)**: credits/me 404→**401**(존재하지 않는 사용자 토큰=무효 세션 — 앱 자동 로그아웃 경로) + 웹도 동일(`useCredits`가 인증 상태의 401을 무시하던 것 → signOut — 앱 탈퇴 후 웹 프로필에 이전 정보 표시되던 문제) ⑥**잔여 건수 표기 통일**: 주 숫자=크레딧(앱 20 vs 웹 6 혼선 해소), '6회 인증 가능' 추정 제거→차감 규칙 요약(기본3·Verified4·대형 2~3배), 프로필 ⓘ→차감 규칙 패널 펼침(앱 패턴 일체감) ⑦수정: 탈퇴 모달 다크 배경에 다크 텍스트(가독성), 이름 미제공 가입 기본 이름=이메일 앞부분('님' 공백), 프로필 이름칸 autoComplete(브라우저 이메일 오채움) ⑧부수 확인: 앱↔웹 Apple 계정 연결 정상(sub 그룹 공유), Chrome이 주소창 www 숨김(apex 오탐 주의) |
| 2026-08-26 | **보안 심화(A-48·A-49) + 모바일 UX 개편 + 웹 FAQ·판독 현행화 (커밋 14건, 양 기기 실기기 검증)** — ①**verified 신뢰 모델 문서화**: 8/25 재점검(알고리즘 공개 안전·A-47) 후속 대표 질의로 **촬영~인증 갭 공격 식별**(루팅 기기 큐 파일 교체 — 후킹 불요) → 보증 범위·공격 비용 7종 표·**마케팅 문구 가이드(금지 표현 포함)**·강화 로드맵을 [verified-trust-model.md](verified-trust-model.md)로 신설 ②**A-48 셔터 해시 봉인 당일 구현·Galaxy 실기기 검증 완료**(`lib/capture/seal.ts` — SecureStore 하드웨어 키 HMAC, 인증 시 MAC+재계산 대조, `seal_mismatch` 거부) ③**A-49 등재**(Play Integrity STRONG 상향 옵션+무결성 수준 기록 — "즉시 전체 파이프라인"은 후킹에 무효+셔터당 차감 문제로 기각) ④**인증마크 UX 로고 통일**: 촬영탭 로고 pill 맨 왼쪽(셔터 시점 확정)·촬영 항목은 목록 메타 줄 로고 ✓(OFF=미표시, 칩은 갤러리 F만)·**pill ON/OFF 상태 영속화**(`prefs.ts` — GPS 명시적 OFF는 기본 ON 초기화 스킵) ⑤**미발행 인증 서버 무저장**: 모바일 업로드를 공개링크 발행 시점으로 이연(웹 B-2'' 정렬, 사후 발행=receipt로 fresh upload-url·409=구버전 선업로드 허용) — FAQ "발행 시에만 저장"과 동작 일치 ⑥**웹 FAQ 현행화**(S/V 구분 항목 신설→최하단, Safari GPS 항목 삭제, 서버저장·GPS 서버기록·고해상도 사이즈선택·링크 유효기간 사실 정합 수정, EXIF 항목에 C2PA 영향+이중 보호 추가) ⑦**판독 결과 OriPics 스탬프 ↔ C2PA 자격증명 구분 표시**(웹 홈+모바일 — 기존 `trust_report.evidence` 렌더링만, 상태 4단계+서명자. sandbox cert 단계라 "신뢰 목록 외"가 현재 정상) ⑧판독탭 스크롤 뷰포트 수정(목록탭 8/21 패턴 정렬) ⑨부수: expo lint 표준 설정(eslint.config.js) 자동 추가, SSL.com 마케팅 수신동의 메일=무시 판단(Validation 대기 유지). ⚠️**기기 상태**: Galaxy는 Play 테스트판 제거 후 로컬 release 사이드로드(서명 충돌 — 스토어 복귀=Play 재설치), iPhone=로컬 dev서명 Release. ⚠️**오늘 모바일 변경분은 TestFlight 1.0.0(4)·Play Alpha에 미포함** — 테스터 확산 전 1.0.0(5) 빌드 필요 |
| 2026-08-25 | **Play 비공개 테스트 라이브 + 베타 모집 인프라 완성** — ①**Google 심사 1일 만에 통과·출시됨**: Android 옵트인 링크 확보(`play.google.com/apps/testing/com.santahades.oripics`) — 테스터 배포 가능 상태 ②**iOS 1.0.0(4) 빌드+TestFlight 업로드 완료**(8/24 수정분 — A-45 회원탈퇴·attest 폴백·UI 정렬 포함. 잔여: 외부 테스트 그룹→베타 앱 심사→공개 링크) ③**모집 인프라**: 오픈카톡방 개설, 모집 자산 6종(`beta-tester-recruiting.md` — 카페/디스콰이엇/스노볼/아이폰×2/온보딩), 이메일 수집=1:1 원칙(단체방 금지), Pro 부여=플랫폼 무관 tier 수동(부여 목록 기록·베타 후 원복) ④**모두의창업 2차 공고 대조 검토**: 결격 없음, Q7-1에 세세분류(58222→63120) 논거 추가 수정 재제출, 서비스 론칭과 무관 확인, 3R 시 개인사업자 이종창업 경로 확정. 특허(임시명세서 2026-04-21, 출원인 손효연) 확인→**U-37 등재**(정규화 2027-04-21/06-21·명의이전) ⑤SSL.com: 8/24 Carlo 회신(Validation 팀 팔로업 중) — 회신 발송, 재촉 기준일 8/31로 조정 |
| 2026-08-24 | **Play 비공개 테스트 Google 심사 제출 (A안 착수)** — 앱 설정 11항목 전부 완료: 데이터 보안(U-21)·콘텐츠 등급(IARC, UGC 아니요)·타겟층 18+·개인정보방침 URL·앱 액세스(데모 계정 demo-screenshots@, 프로덕션 로그인 검증)·광고/광고 ID 아니요·정부/금융/건강 해당없음·카테고리(사진)+태그 3종·연락처(hi@ori.pics)·스토어 등록정보(설명은 사실 정합 수정: C2PA "적합성 인증 제품+자동 첨부는 인증서 적용 후", Pro "월 1,000회") → **비공개 테스트 Alpha 트랙 생성(vc3·대한민국·internal 목록)·검토 제출**. 이어서 **U-20 ASC App Privacy 게시 완료 — 양대 스토어 개인정보 양식 종결**. 잔여: Google 심사(1~3일) + 테스터 12명 모집(Gmail·실기기) → 옵트인 시점부터 14일. iOS는 14일 요건 없음 — A-45 포함 1.0.0(4) 빌드로 정식 심사 병행 가능 |
| 2026-08-24 | **결제 회귀 수정 + 심사 준비 + 프로필 UX 배치** — ①**결제(중요)**: PortOne SDK 원격 변경으로 빌링키 발급창 호출 거부 회귀(offerPeriod AT_LEAST_ONE_REQUIRED) → `interval: '1m'` 명시로 수정·배포·실기기 검증(`912135d`). A-46(결제 헬스체크) 등재 ②**심사 준비**: A-45 앱 내 회원탈퇴 진입점 완료(+차감규칙 카드 승격), U-20/U-21 콘솔 입력값 문서(`store-privacy-forms.md`) 확정, **Play 12명×14일 비공개 테스트 요건 대상 확인**(개인계정 — 조직계정은 면제, D-U-N-S 신청 안내→U-4 진행), jsi 57.0.5 로컬 Xcode 패치 런북 갱신 ③**웹 프로필 UX**: 비로그인 무한 스피너→로그인 리다이렉트(버그), "발행한 공개링크 목록" 개칭, 모달 링크 복사/열기 버튼, PDF tier_required 친화 문구+Pro 구독 CTA, 현재 플랜 카드 구독 버튼 ④**웹↔모바일 동기화**: 웹에서 링크 삭제 시 모바일 목록이 미발행 복귀(포커스 시 404 확인) ⑤**크레딧 정액 SET 고지**: 체크아웃에 "무료 잔여는 이월 없이 플랜 제공량으로 대체" 안내 박스(ko/en) — SET은 의도된 정책(충전·선불 성격 회피, 7/24 `87c3161`)임을 재확인, 기대치 정렬용 고지만 추가(`13160a2`) ⑥**실결제 구독→환불 왕복 e2e 검증(A-34 잔여 종결)**: 실구독 ₩9,900 → SET(847→1000) 실측 → 원클릭 전액환불 → free·847 원복. 부수 수정: 환불 후 크레딧 카드 stale(useCredits refresh 누락, `fa0a1a9`)·내역 라벨 refund_cancel/subscription_downgrade 한글화(`01dc778`)·환불 버튼 간격(`9965e7a`) |
| 2026-08-23 | **U-34 완전 종결 + Play 내부 테스트 트랙 첫 배포** — Android AAB 1.0.0(2) EAS 빌드 → Play Console 수동 업로드(첫 릴리스는 API 불가) → 내부 테스터 등록·스토어 설치 → **verified 인증 PLAY_RECOGNIZED 정식 통과**. iOS 1.0.0(3) 빌드+auto-submit, Android AAB 1.0.0(3)도 내부트랙 배포 완료(오후 UI 수정분 양 플랫폼 반영, 8/23 저녁). 이후 Android 제출 자동화는 Play API 서비스 계정 키 세팅 필요(`play-service-account.json`, 미설정). 홈탭 히어로·글로우·스플래시 오버레이 브랜드 블루 통일, 홈 스크롤 영역 목록탭과 통일 |
| 2026-08-23 | **TestFlight 첫 업로드 + Android 실기기 e2e** — ①EAS: Expo 조직 `santahades`·프로젝트 `oripics`(fd34f87f) 생성, Apple 배포 인증서·프로파일(~2027-08)·ASC API 키(APP_MANAGER) EAS 보관, 프로덕션 빌드 1.0.0(2) → **ASC 앱 자동 생성(OriPics, ascAppId 6804357260) + TestFlight 업로드 성공**. 이후 제출은 `--auto-submit` 자동. Apple Developer 유료 멤버십=개인(팀 4V67H4KGQS) 확인. jsi 57.0.5 업그레이드(수동 패치 해소)·`SENTRY_DISABLE_AUTO_UPLOAD=true` eas.json 전 프로필(U-36까지) ②Android: Galaxy A16 로컬 빌드 verified e2e 성공(U-34 행 참조), clean prebuild로 블루 아이콘 반영+마크 76.4% 축소(안전영역 초과 시정), CameraX 무해 토스트 억제, 로컬 빌드용 `.env`(GCP 프로젝트 번호) 신설 |
| 2026-08-23 | **verified 등급 표시 3면 배포 + links.tier 신설** — ①DB: `links.tier` 컬럼 추가(프로덕션 ALTER, 당일 verified 링크 백필. null=standard 하위호환) + publish가 verified 인증 시 기록 ②웹 뷰어: 정보 패널 최상단 BadgeCheck 배지+attest 설명(ko/en) ③판독: `/api/verify`가 tier 조회·응답 포함(표시용, 실패해도 검증 무영향) → 웹 결과표 "인증 등급: Verified (촬영 검증)" 행 + 모바일 판독 "Verified · 촬영 시점 기기 검증" 줄. 4면(목록탭·뷰어·웹판독·모바일판독) 전부 실측 확인 — 모바일=실기기 스크린샷, 웹판독=프로덕션 API 재현 호출(`tier:"verified"` 응답). 함께: 모바일 목록·촬영탭 UI 폴리시 다수(옵션칩 한 줄+브랜드블루 차별화, 버튼 라벨 한 줄+언어별 세로 중앙 튜닝, GPS 표시 📍→"GPS ✓", 인증마크 항목 마크 인라인 표시, +파일 후 최상단 스크롤, 메타·링크 텍스트 축소 — 전부 실기기 확인) |
| 2026-08-23 | **U-34 iOS 실기기 verified e2e 성공 + 서버 버그 2건 수정** — Tim's iPhone 로컬 Debug 빌드(엔타이틀먼트 production)로 App Attest 왕복 통과, `verified_proof −8` DB 확인. 수정: ①`AAGUID_PROD` 12바이트→16바이트("appattest"+0x00×7) — 기존엔 production attestation이 전부 `aaguid_invalid` 거부되는 출시 블로커, 회귀 테스트 추가(119 tests) ②sign의 nonce/attest 거부·publish/upload-url/confirm의 receipt/JWT 거부를 401→403 — 모바일 apiFetch가 401을 세션 만료로 간주해 로그아웃(토큰 삭제)하는 연쇄 실측. 기타: O-1 CRON_SECRET 확인, 로컬 빌드 실패 원인=Sentry 소스맵 업로드(`SENTRY_DISABLE_AUTO_UPLOAD=true`로 우회, U-36에서 근본 해소). 잔여: Android 실기기 e2e |
| 2026-08-22 | **애플리케이션 계층 보안 조치(2차)** — [security-hardening-20260822.md §5](security-hardening-20260822.md) 참조. H-1 결제 위조 차단(complete·billing-key 소유권 검증), H-2 크론 fail-closed(`lib/security/cron.ts`), H-3 sign 레이트리밋(사용자 120/h), M-1 attest fail-closed(`ALLOW_UNVERIFIED_ATTEST` 옵트인), M-2 c2pa-poc 라우트 삭제, M-3 proof/history POST 소유권+썸네일 상한, M-4 비번변경 재인증(프로필 UI에 현재비번), M-5 계정열거 차단, M-6 인증코드 CSPRNG, L-1 confirm 세션검증, L-2 clientIp 스푸핑 방지, L-7 CSP report-only. **운영 확인 필요: O-1 CRON_SECRET(프로덕션), O-2 attest env 또는 ALLOW_UNVERIFIED_ATTEST** (아래 1.1) |
