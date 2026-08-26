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
| U-38 | **네이버 로그인 검수 (오픈 게이트)** — 네이버 OAuth 앱이 "개발 중" 상태라 **등록된 테스트 계정 외 로그인 불가**(2026-08-26 실측: "입력하신 아이디로 로그인할 수 없습니다" — 구글·카카오는 정상). 구글·카카오와 달리 네이버는 검수 통과 전 일반 사용자 사용 불가. 콘솔: developers.naver.com/apps → OriPics. ①**임시(베타)**: "멤버관리" 탭에 대표·테스터 네이버 아이디 등록 — 즉시 로그인 가능 ②**정식(오픈 전 필수)**: 검수요청 제출. 준비물: 서비스 URL(https://www.ori.pics)에 네이버 로그인 버튼 실동작 노출, 개인정보처리방침 URL, 수집 프로필 항목(이메일 등)별 사용 목적 기재. 통상 영업일 2~5일 — **정식 오픈 전 여유 있게 신청** | **오픈 전** | 없음 | P1 |
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
| A-49 | **verified 런타임 후킹 대응 — Play Integrity STRONG 상향 옵션 + 무결성 수준 기록** (2026-08-26 대표 질의 후속, A-48 다음 단계). ①현재 서버는 `MEETS_DEVICE_INTEGRITY`면 승인(`lib/attest/playIntegrity.ts`) — `MEETS_STRONG_INTEGRITY`(하드웨어 부팅 상태 증명+최근 보안 패치, Magisk 은닉류 루팅 대부분 차단) 요구를 **env 플래그**로 준비, 사용자 기기 분포 확인 후 활성(구형 기기 정상 사용자 탈락 트레이드오프) ②attest 판별에서 이미 얻는 deviceIntegrity 수준(STRONG/DEVICE)을 links에 기록 — 분쟁 시 인증별 신뢰 근거 제시용. 참고: "셔터 시점 즉시 전체 파이프라인 실행"은 검토 후 기각 — 후킹은 시간 갭이 아니라 처리 길목을 가로채므로 무효 + 촬영 시 네트워크 필수·셔터당 차감 비용(상세: [verified-trust-model.md](verified-trust-model.md) §4-2). RASP(freeRASP류)는 PMF 이후 별도 검토 | 오픈 후 | P3 |
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
| 2026-08-26 | **보안 심화(A-48·A-49) + 모바일 UX 개편 + 웹 FAQ·판독 현행화 (커밋 14건, 양 기기 실기기 검증)** — ①**verified 신뢰 모델 문서화**: 8/25 재점검(알고리즘 공개 안전·A-47) 후속 대표 질의로 **촬영~인증 갭 공격 식별**(루팅 기기 큐 파일 교체 — 후킹 불요) → 보증 범위·공격 비용 7종 표·**마케팅 문구 가이드(금지 표현 포함)**·강화 로드맵을 [verified-trust-model.md](verified-trust-model.md)로 신설 ②**A-48 셔터 해시 봉인 당일 구현·Galaxy 실기기 검증 완료**(`lib/capture/seal.ts` — SecureStore 하드웨어 키 HMAC, 인증 시 MAC+재계산 대조, `seal_mismatch` 거부) ③**A-49 등재**(Play Integrity STRONG 상향 옵션+무결성 수준 기록 — "즉시 전체 파이프라인"은 후킹에 무효+셔터당 차감 문제로 기각) ④**인증마크 UX 로고 통일**: 촬영탭 로고 pill 맨 왼쪽(셔터 시점 확정)·촬영 항목은 목록 메타 줄 로고 ✓(OFF=미표시, 칩은 갤러리 F만)·**pill ON/OFF 상태 영속화**(`prefs.ts` — GPS 명시적 OFF는 기본 ON 초기화 스킵) ⑤**미발행 인증 서버 무저장**: 모바일 업로드를 공개링크 발행 시점으로 이연(웹 B-2'' 정렬, 사후 발행=receipt로 fresh upload-url·409=구버전 선업로드 허용) — FAQ "발행 시에만 저장"과 동작 일치 ⑥**웹 FAQ 현행화**(S/V 구분 항목 신설→최하단, Safari GPS 항목 삭제, 서버저장·GPS 서버기록·고해상도 사이즈선택·링크 유효기간 사실 정합 수정, EXIF 항목에 C2PA 영향+이중 보호 추가) ⑦**판독 결과 OriPics 스탬프 ↔ C2PA 자격증명 구분 표시**(웹 홈+모바일 — 기존 `trust_report.evidence` 렌더링만, 상태 4단계+서명자. sandbox cert 단계라 "신뢰 목록 외"가 현재 정상) ⑧판독탭 스크롤 뷰포트 수정(목록탭 8/21 패턴 정렬) ⑨부수: expo lint 표준 설정(eslint.config.js) 자동 추가, SSL.com 마케팅 수신동의 메일=무시 판단(Validation 대기 유지). ⚠️**기기 상태**: Galaxy는 Play 테스트판 제거 후 로컬 release 사이드로드(서명 충돌 — 스토어 복귀=Play 재설치), iPhone=로컬 dev서명 Release. ⚠️**오늘 모바일 변경분은 TestFlight 1.0.0(4)·Play Alpha에 미포함** — 테스터 확산 전 1.0.0(5) 빌드 필요 |
| 2026-08-25 | **Play 비공개 테스트 라이브 + 베타 모집 인프라 완성** — ①**Google 심사 1일 만에 통과·출시됨**: Android 옵트인 링크 확보(`play.google.com/apps/testing/com.santahades.oripics`) — 테스터 배포 가능 상태 ②**iOS 1.0.0(4) 빌드+TestFlight 업로드 완료**(8/24 수정분 — A-45 회원탈퇴·attest 폴백·UI 정렬 포함. 잔여: 외부 테스트 그룹→베타 앱 심사→공개 링크) ③**모집 인프라**: 오픈카톡방 개설, 모집 자산 6종(`beta-tester-recruiting.md` — 카페/디스콰이엇/스노볼/아이폰×2/온보딩), 이메일 수집=1:1 원칙(단체방 금지), Pro 부여=플랫폼 무관 tier 수동(부여 목록 기록·베타 후 원복) ④**모두의창업 2차 공고 대조 검토**: 결격 없음, Q7-1에 세세분류(58222→63120) 논거 추가 수정 재제출, 서비스 론칭과 무관 확인, 3R 시 개인사업자 이종창업 경로 확정. 특허(임시명세서 2026-04-21, 출원인 손효연) 확인→**U-37 등재**(정규화 2027-04-21/06-21·명의이전) ⑤SSL.com: 8/24 Carlo 회신(Validation 팀 팔로업 중) — 회신 발송, 재촉 기준일 8/31로 조정 |
| 2026-08-24 | **Play 비공개 테스트 Google 심사 제출 (A안 착수)** — 앱 설정 11항목 전부 완료: 데이터 보안(U-21)·콘텐츠 등급(IARC, UGC 아니요)·타겟층 18+·개인정보방침 URL·앱 액세스(데모 계정 demo-screenshots@, 프로덕션 로그인 검증)·광고/광고 ID 아니요·정부/금융/건강 해당없음·카테고리(사진)+태그 3종·연락처(hi@ori.pics)·스토어 등록정보(설명은 사실 정합 수정: C2PA "적합성 인증 제품+자동 첨부는 인증서 적용 후", Pro "월 1,000회") → **비공개 테스트 Alpha 트랙 생성(vc3·대한민국·internal 목록)·검토 제출**. 이어서 **U-20 ASC App Privacy 게시 완료 — 양대 스토어 개인정보 양식 종결**. 잔여: Google 심사(1~3일) + 테스터 12명 모집(Gmail·실기기) → 옵트인 시점부터 14일. iOS는 14일 요건 없음 — A-45 포함 1.0.0(4) 빌드로 정식 심사 병행 가능 |
| 2026-08-24 | **결제 회귀 수정 + 심사 준비 + 프로필 UX 배치** — ①**결제(중요)**: PortOne SDK 원격 변경으로 빌링키 발급창 호출 거부 회귀(offerPeriod AT_LEAST_ONE_REQUIRED) → `interval: '1m'` 명시로 수정·배포·실기기 검증(`912135d`). A-46(결제 헬스체크) 등재 ②**심사 준비**: A-45 앱 내 회원탈퇴 진입점 완료(+차감규칙 카드 승격), U-20/U-21 콘솔 입력값 문서(`store-privacy-forms.md`) 확정, **Play 12명×14일 비공개 테스트 요건 대상 확인**(개인계정 — 조직계정은 면제, D-U-N-S 신청 안내→U-4 진행), jsi 57.0.5 로컬 Xcode 패치 런북 갱신 ③**웹 프로필 UX**: 비로그인 무한 스피너→로그인 리다이렉트(버그), "발행한 공개링크 목록" 개칭, 모달 링크 복사/열기 버튼, PDF tier_required 친화 문구+Pro 구독 CTA, 현재 플랜 카드 구독 버튼 ④**웹↔모바일 동기화**: 웹에서 링크 삭제 시 모바일 목록이 미발행 복귀(포커스 시 404 확인) ⑤**크레딧 정액 SET 고지**: 체크아웃에 "무료 잔여는 이월 없이 플랜 제공량으로 대체" 안내 박스(ko/en) — SET은 의도된 정책(충전·선불 성격 회피, 7/24 `87c3161`)임을 재확인, 기대치 정렬용 고지만 추가(`13160a2`) ⑥**실결제 구독→환불 왕복 e2e 검증(A-34 잔여 종결)**: 실구독 ₩9,900 → SET(847→1000) 실측 → 원클릭 전액환불 → free·847 원복. 부수 수정: 환불 후 크레딧 카드 stale(useCredits refresh 누락, `fa0a1a9`)·내역 라벨 refund_cancel/subscription_downgrade 한글화(`01dc778`)·환불 버튼 간격(`9965e7a`) |
| 2026-08-23 | **U-34 완전 종결 + Play 내부 테스트 트랙 첫 배포** — Android AAB 1.0.0(2) EAS 빌드 → Play Console 수동 업로드(첫 릴리스는 API 불가) → 내부 테스터 등록·스토어 설치 → **verified 인증 PLAY_RECOGNIZED 정식 통과**. iOS 1.0.0(3) 빌드+auto-submit, Android AAB 1.0.0(3)도 내부트랙 배포 완료(오후 UI 수정분 양 플랫폼 반영, 8/23 저녁). 이후 Android 제출 자동화는 Play API 서비스 계정 키 세팅 필요(`play-service-account.json`, 미설정). 홈탭 히어로·글로우·스플래시 오버레이 브랜드 블루 통일, 홈 스크롤 영역 목록탭과 통일 |
| 2026-08-23 | **TestFlight 첫 업로드 + Android 실기기 e2e** — ①EAS: Expo 조직 `santahades`·프로젝트 `oripics`(fd34f87f) 생성, Apple 배포 인증서·프로파일(~2027-08)·ASC API 키(APP_MANAGER) EAS 보관, 프로덕션 빌드 1.0.0(2) → **ASC 앱 자동 생성(OriPics, ascAppId 6804357260) + TestFlight 업로드 성공**. 이후 제출은 `--auto-submit` 자동. Apple Developer 유료 멤버십=개인(팀 4V67H4KGQS) 확인. jsi 57.0.5 업그레이드(수동 패치 해소)·`SENTRY_DISABLE_AUTO_UPLOAD=true` eas.json 전 프로필(U-36까지) ②Android: Galaxy A16 로컬 빌드 verified e2e 성공(U-34 행 참조), clean prebuild로 블루 아이콘 반영+마크 76.4% 축소(안전영역 초과 시정), CameraX 무해 토스트 억제, 로컬 빌드용 `.env`(GCP 프로젝트 번호) 신설 |
| 2026-08-23 | **verified 등급 표시 3면 배포 + links.tier 신설** — ①DB: `links.tier` 컬럼 추가(프로덕션 ALTER, 당일 verified 링크 백필. null=standard 하위호환) + publish가 verified 인증 시 기록 ②웹 뷰어: 정보 패널 최상단 BadgeCheck 배지+attest 설명(ko/en) ③판독: `/api/verify`가 tier 조회·응답 포함(표시용, 실패해도 검증 무영향) → 웹 결과표 "인증 등급: Verified (촬영 검증)" 행 + 모바일 판독 "Verified · 촬영 시점 기기 검증" 줄. 4면(목록탭·뷰어·웹판독·모바일판독) 전부 실측 확인 — 모바일=실기기 스크린샷, 웹판독=프로덕션 API 재현 호출(`tier:"verified"` 응답). 함께: 모바일 목록·촬영탭 UI 폴리시 다수(옵션칩 한 줄+브랜드블루 차별화, 버튼 라벨 한 줄+언어별 세로 중앙 튜닝, GPS 표시 📍→"GPS ✓", 인증마크 항목 마크 인라인 표시, +파일 후 최상단 스크롤, 메타·링크 텍스트 축소 — 전부 실기기 확인) |
| 2026-08-23 | **U-34 iOS 실기기 verified e2e 성공 + 서버 버그 2건 수정** — Tim's iPhone 로컬 Debug 빌드(엔타이틀먼트 production)로 App Attest 왕복 통과, `verified_proof −8` DB 확인. 수정: ①`AAGUID_PROD` 12바이트→16바이트("appattest"+0x00×7) — 기존엔 production attestation이 전부 `aaguid_invalid` 거부되는 출시 블로커, 회귀 테스트 추가(119 tests) ②sign의 nonce/attest 거부·publish/upload-url/confirm의 receipt/JWT 거부를 401→403 — 모바일 apiFetch가 401을 세션 만료로 간주해 로그아웃(토큰 삭제)하는 연쇄 실측. 기타: O-1 CRON_SECRET 확인, 로컬 빌드 실패 원인=Sentry 소스맵 업로드(`SENTRY_DISABLE_AUTO_UPLOAD=true`로 우회, U-36에서 근본 해소). 잔여: Android 실기기 e2e |
| 2026-08-22 | **애플리케이션 계층 보안 조치(2차)** — [security-hardening-20260822.md §5](security-hardening-20260822.md) 참조. H-1 결제 위조 차단(complete·billing-key 소유권 검증), H-2 크론 fail-closed(`lib/security/cron.ts`), H-3 sign 레이트리밋(사용자 120/h), M-1 attest fail-closed(`ALLOW_UNVERIFIED_ATTEST` 옵트인), M-2 c2pa-poc 라우트 삭제, M-3 proof/history POST 소유권+썸네일 상한, M-4 비번변경 재인증(프로필 UI에 현재비번), M-5 계정열거 차단, M-6 인증코드 CSPRNG, L-1 confirm 세션검증, L-2 clientIp 스푸핑 방지, L-7 CSP report-only. **운영 확인 필요: O-1 CRON_SECRET(프로덕션), O-2 attest env 또는 ALLOW_UNVERIFIED_ATTEST** (아래 1.1) |
