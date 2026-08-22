# 모바일 결제(§8-A) 정책 조사 — IAP vs 웹 결제 vs 소비 전용

> ⚠️ **최종 결정: B (2026-08-23) — 인앱결제 없음, 웹 구독만.**
> iOS·Android 모두 **순수 클라이언트**(앱에서 구독 판매·가격·웹결제 유도 없음 = App Store 3.1.3
> 멀티플랫폼/리더 모델). 구독은 웹(ori.pics, PortOne+KG 실운영)에서만. Apple/Google 수수료 0,
> 대신 iOS 사용자 전환 마찰(웹 이동) 감수. **이 문서의 아래 "하이브리드(iOS=IAP)" 권고는 폐기**되었으며,
> 조사 근거·트리거 아카이브로만 보존. 반영: 모바일 코드(SubscribePanel·expo-iap 제거, 커밋 `4e7420a`),
> mobile-app-dev-plan §8-A, follow-ups(U-35 취소), 베타 런북.
>
> **작성**: 2026-08-07 · [mobile-app-dev-plan.md](mobile-app-dev-plan.md) §8-A 결정 지원 조사
> **~~당시 결론 요약~~ (폐기, 아래는 2026-08-07 시점 권고)**: 플랫폼별 규칙이 정반대라 단일 답이 없음 → **하이브리드 권고**:
> **Android = 소비 전용**(웹 구독 + 앱 로그인, 공식 허용) / **iOS = IAP 병행 + 할증가**(₩12,900 안,
> Notion·유튜브 모델). 한국 제3자결제(Apple 26%+PG)는 어떤 시나리오에서도 배제.
> 재검토 트리거: 2026-12-31 Google 한국 신체계 / Epic-Apple 대법원 판결 / 방미통위 의결.

---

## 1. 2026-08 현재 플랫폼별 규칙 (한국 스토어 기준)

| | Apple App Store | Google Play |
|---|---|---|
| 소비 전용(웹 구독+앱 로그인만) | **고위험** — 3.1.3(b)가 "동일 상품이 앱 내 IAP로도 제공될 것(provided those items are also available as in-app purchases)"을 요구. 2025-12·2026-01 개발자 포럼에 로그인 전용 B2C 앱 3.1.1 반복 거절 사례 문서화 | **명시적 허용** — 정책 원문 "a user could log in … and access content paid for somewhere else". Netflix 모델. 수수료 0% |
| 앱 내 외부결제 링크(아웃링크) | **한국 불가**. 미국 스토어프런트만 허용 — 수수료 0%는 판결문 원문으로 확정("Apple should not be able to charge any commission … until the district court has approved an appropriate fee", 9th Cir. No. 25-2935). 승인 요율 부재로 0% 유지 중, Spotify·Patreon·Kindle 실사용. 향후 "실비 기반 명목 수수료"만 허용 전망, SCOTUS 판결 2027-06 내 예상 | 한국 현재 불가 → **2026-12-31부터 공식 허용** (Epic 글로벌 합의, 구독 수수료 10% 체계) |
| 한국 법정 제3자결제 | 허용되나 **수수료 26%(SBP 할인 없음) + PG ~3% ≈ 29%+** — IAP 15%보다 명백히 손해, 국내 채택 사례 사실상 0 | 수수료 −4%p(구독 11%) + PG ~3% ≈ 14% — IAP 15%와 사실상 동일, 실익 없음 |
| IAP 수수료 (구독) | 30%, **Small Business Program(연매출 $1M 미만) 15%** — 구독·일회성 모두 적용. 구독 2년차부터는 전원 15% | **첫날부터 15%** (매출 무관) → 12/31 이후 10%+GPB 사용 시 billing fee 5% (실질 15%) |
| 웹 결제 언급/유도 | 앱 내 언급 즉시 3.1.1 리젝 (RevenueCat 사례 다수). 앱 밖(이메일)은 자유 | 링크 없는 "웹사이트에서 구매 가능" 안내까지 허용. 아웃링크는 12/31까지 금지 (2022 카카오톡 업데이트 차단 사례) |
| 기타 예외 | Reader 앱(잡지·신문·도서·오디오·음악·비디오 한정 — **사진 인증 SaaS 비해당**), 3.1.3(f) 웹 도구 컴패니언(VoIP·클라우드스토리지·이메일·웹호스팅으로 한정 해석), 3.1.3(c) B2B 조직 판매(B2C 명시 배제) | — |

### 실제 선례 (조사 확인)
- **Notion**: iOS에 단일 멤버 Plus IAP를 실제 제공 — 3.1.3(b) 병행 조건 충족용 "토큰 IAP" 전략.
- **Figma**: iOS 앱은 무료 기능만, 유료 기능·가격 완전 비노출 → 승인. 단 2026-05 포럼 사례에서 "웹 구독 등급별로 iOS 기능이 달라지는 빌드"는 거절, "전원 동일 기능"만 승인 — **OriPics처럼 Pro 전용 기능(Verified)을 앱에서 열어야 하는 구조에는 부적합**.
- **한국 관행**: 유튜브 프리미엄 웹 14,900/iOS 19,500(+31%), 카카오 이모티콘 플러스 웹 3,900/iOS 6,900(+77%), 리디 iOS 1.2배 환율 — **iOS 할증가는 한국 소비자에게 익숙한 표준 패턴**, 반발 리스크 낮음.

## 2. v3 가격 기준 수수료 시뮬레이션 (Pro ₩9,900/월, VAT 포함)

전제: 웹 KG이니시스 PG 수수료 ~3% 가정(실제 요율 계약서 확인 필요), IAP는 Apple/Google이 부가세 대납(merchant of record) — 공급가 9,000원 기준 수수료 계산.

| 경로 | 소비자가 | 실수취/월 | 웹 대비 |
|---|---|---|---|
| **웹 KG (현행)** | ₩9,900 | **~₩8,700** | 기준 |
| iOS IAP SBP 15% (동일가) | ₩9,900 | ₩7,650 | −₩1,050 (−12%) |
| **iOS IAP SBP 15% + 할증가** | **₩12,900** | **₩9,968** | **+₩1,268** |
| iOS IAP 30% (SBP 미가입) | ₩9,900 | ₩6,300 | −₩2,400 |
| iOS 한국 제3자결제 26%+PG | ₩9,900 | ~₩6,360 | −₩2,340 → **배제** |
| Android 소비 전용 (웹 구독) | ₩9,900(웹) | ~₩8,700 | ±0 |
| Android 아웃링크 (12/31~, 10%+PG) | ₩9,900(웹) | ~₩7,800 | −₩900 (앱 내 전환 편의 대가) |
| Google IAP 15% (동일가) | ₩9,900 | ₩7,650 | −₩1,050 |

- **iOS ₩12,900 할증가는 웹보다 실수취가 오히려 큼** — 할증분이 수수료를 상쇄하고 남음(유튜브·카카오 관행과 동일 원리). ₩11,900로도 웹 수준(+₩495) 확보.
- 일회성 상품(사고 패키지 ₩8,900): iOS 소모성 IAP 15% 실수취 ~₩6,880 vs 웹 ~₩7,820. ⚠️ **Apple 소모성 IAP는 만료 설정 불가**(3.1.1) — 기간 한정 패스(30일/180일)는 iOS에서 **non-renewing subscription** 타입으로 모델링해야 함. "크레딧/충전" 금지 프레이밍(기간 한정 횟수제 이용권)과는 오히려 정합.

## 3. 옵션 평가

| 옵션 | Android | iOS | 판정 |
|---|---|---|---|
| (가) IAP 전면 도입 | 가능 (15%) | 가능 (SBP 15%) | iOS는 이것뿐이지만 Android까지 15% 낼 이유 없음 |
| (나) 앱 내 웹 결제 유도 | 12/31부터 합법 | 한국 불가 (리젝 1순위) | 시기상조. Android 한정 2027 옵션 |
| (다) 소비 전용 | **공식 허용, 최적** | 고위험 (거절 사례 지속) | Android만 채택 |
| **(라) 하이브리드 [권고]** | **소비 전용** | **IAP 병행 + 할증가 ₩12,900** | 각 플랫폼의 규칙에 최적 대응 |

### 권고안 (라) 상세
1. **Android**: 결제 플로우 없음. 웹에서 구독 → 앱 로그인. 앱 내 문구는 "웹사이트에서 구매 가능" 수준(링크 없이)까지만. 12/31 신체계 후 아웃링크 추가 검토(수수료 10%+PG vs 전환율 개선 트레이드오프).
2. **iOS**: Pro 구독 IAP 제공(자동갱신, **₩12,900/월** 또는 ₩11,900 — 웹 ₩9,900 유지). 3.1.3(b) 병행 조건 충족 → 웹 구독자는 로그인만으로 전 기능 사용. 앱 내에서 웹 가격 언급 절대 금지.
   - **선행**: Apple Small Business Program 가입(App Store Connect 신청, 연매출 $1M 미만) — 미가입 시 30%.
   - 서버: IAP 영수증 검증(App Store Server API) + 구독 상태↔tier 동기화, 웹 구독과 이중 구독 방지(이미 Pro면 IAP 구매 버튼 숨김 — 상태 기반 비노출은 허용).
   - 패스 상품(2차): non-renewing subscription 타입으로.
3. **제3자결제(한국 대체결제)는 양 플랫폼 모두 배제** — 경제성 없음(업계 채택 사실상 0).
4. 연간 구독(₩99,000)도 iOS는 동일 원리로 ₩129,000 안.

### 왜 iOS 소비 전용(다)을 권고하지 않나
넷플릭스(Reader 예외)·Figma(유료 기능 완전 비노출)는 OriPics에 없는 예외 조건으로 통과한 것. OriPics 모바일의 존재 이유가 **Pro 전용 Verified 촬영**이라 "유료 기능이 앱의 핵심인데 IAP 없음" 구성이 되며, 이는 2025-12~2026-01 거절 사례와 정확히 같은 패턴. 리뷰어 재량에 앱 출시 일정을 거는 도박이 됨. IAP 병행의 비용은 "웹보다 비싼 iOS 가격을 선택하는 소수 사용자"의 전환 마진인데, 할증가로 인해 오히려 실수취가 늘어나므로 다운사이드가 없음.

## 4. 재검토 트리거 (watch list)

| 시점/이벤트 | 영향 | 액션 |
|---|---|---|
| **2026-12-31 Google 한국 신체계** | 아웃링크 합법 + 구독 10% | Android 앱 내 웹 결제 버튼 추가 검토 |
| Epic v. Apple **대법원 판결** (2026-06-30 상고 허가 → 변론 2026-10 회기, 판결 ~2027-06. 2026-05-06 mandate 정지 신청은 기각됨) | 미국 외부링크 수수료 0% 유지 여부(현재 판결문상 확정 유지) → 파급 시 한국 정책 완화 가능성 | iOS 아웃링크 재평가 |
| **방미통위 과징금 의결** (구글 420억·애플 210억, 2026-08 의결 예정 보도) | Apple 한국 정책 완화 압력 | 한국 External Link Entitlement 등장 여부 주시 |
| 연매출 USD $1M 접근 | SBP 15% → 30% | 가격·믹스 재계산 |
| M6(모바일 결제 구현) 착수 | — | 본 문서 기준 최신 정책 재확인 후 구현 |

## 5. 조사 출처 (요약)

**Apple 1차**: [App Store Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)(3.1.1/3.1.3 원문 2026-08-07 확인) · [한국 StoreKit External Purchase](https://developer.apple.com/support/storekit-external-entitlement-kr/)(26%, KCP·이니시스·토스·NICE 한정) · [Small Business Program](https://developer.apple.com/app-store/small-business-program/) · [Reader apps](https://developer.apple.com/support/reader-apps/) · 개발자 포럼 거절 사례 [811018](https://developer.apple.com/forums/thread/811018)·[812386](https://developer.apple.com/forums/thread/812386)·[825551](https://developer.apple.com/forums/thread/825551)

**Google 1차**: [결제 정책](https://support.google.com/googleplay/android-developer/answer/10281818)(소비 전용 명문 허용) · [서비스 수수료](https://support.google.com/googleplay/android-developer/answer/112622) · [한국 대체결제 −4%p](https://support.google.com/googleplay/android-developer/answer/11222040) · [Epic 합의 발표 2026-03](https://android-developers.googleblog.com/2026/03/a-new-era-for-choice-and-openness.html) · [신체계 상세 2026-06](https://android-developers.googleblog.com/2026/06/play-expanded-billing.html)

**미국 소송**: [제9순회 판결문 원문 No. 25-2935, 2025-12-11](https://cdn.ca9.uscourts.gov/datastore/opinions/2025/12/11/25-2935.pdf)(법정모독 인용, 수수료 전면금지는 파기환송 — 단 요율 승인 전까지 0% 명시) · [SCOTUS mandate 정지 기각 2026-05-06](https://www.cnbc.com/2026/05/06/supreme-court-declines-to-pause-order-holding-apple-in-contempt-in-epic-games-lawsuit.html) · [대법원 상고 허가 2026-06-30](https://ipwatchdog.com/2026/06/30/high-court-grants-cert-in-apples-challenge-to-ninth-circuit-contempt-ruling-in-app-store-dispute/) · [Patreon 웹 결제 수용](https://techcrunch.com/2025/05/06/patreons-app-can-now-accept-web-payments-after-u-s-app-store-changes/) · Epic-Google 금지명령 발효(준수 2027-11-01까지)

**한국**: [토스페이먼츠 수수료 비교](https://www.tosspayments.com/blog/articles/mobile-pay-1) · [카카오톡 아웃링크 차단 사례](https://www.khan.co.kr/article/202207062056005) · [아시아경제 앱·웹 가격 실측](https://www.asiae.co.kr/article/2024073115474992047) · [경향 — 한국 12월 시행](https://www.khan.co.kr/article/202603052151005) · [서울경제 — 방미통위 8월 의결 예정](https://www.sedaily.com/article/20071188)

**미확인/유동 사항**: 방미통위 의결 실제 결과, Apple 한국 정책 완화 여부, 대법원 판결(모두 watch list로 관리).
