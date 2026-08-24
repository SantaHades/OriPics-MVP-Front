# 스토어 개인정보 양식 입력값 — Apple Privacy Label · Google Data Safety (U-20 · U-21)

> **작성**: 2026-08-23 — 코드 실사 기반 (모바일 앱 1.0.0(3) 기준)
> **원칙**: 라벨은 **모바일 앱이 수집·전송하는 데이터** 기준. 웹 전용 수집(결제·휴대폰번호)은 앱 라벨에 포함하지 않음(결정 B — 앱 내 결제·구매 유도 없음).
> **입력 시점**: U-20=App Store Connect → 앱 → App Privacy / U-21=Play Console → 앱 콘텐츠 → 데이터 보안

---

## 1. 데이터 인벤토리 (코드 근거)

| 데이터 | 수집 경로 | 저장 | 근거 |
|---|---|---|---|
| 이메일 | 로그인/계정 (필수) | User 테이블 | `api/mobile/auth/*`, AuthContext |
| 이름(닉네임) | 웹 가입 시 선택 입력 — 앱은 표시만 | User 테이블 | `user.name` |
| 사용자 ID | 내부 식별자 (자동) | User.id, links.user_id | prisma schema |
| 사진 | 인증 시 업로드 (핵심 기능, 필수) | Supabase Storage — free 7일 / 유료 보관함 무기한 | publish 흐름 |
| 정확한 위치(GPS) | 촬영 시 **opt-in 토글** (선택) | links.lat/lng, 스탬프 메타 | capture GPS pill, `optGps` |
| 촬영시각 | 촬영 시 기기 기록 (사진 메타로 취급) | links.captured_at, V5 스탬프 | queueStore `capturedAtMs` |
| 기기 무결성 토큰 | Verified 인증 시 (Pro) — App Attest/Play Integrity | **해시만** 저장 (`attest_token_hash`), 원토큰 미보관 | `lib/attest/*`, sign route |
| 크래시 진단 | Sentry — **U-36 DSN 설정 후 활성** (`sendDefaultPii: false`) | Sentry (수탁) | `_layout.tsx` DSN 게이트 |
| 수집 안 함 | 광고 ID·추적·연락처·브라우징 기록·전화번호(앱)·결제정보(앱) | — | 결정 B, 광고 SDK 없음 |

- **공유(제3자 제공)**: 없음. Supabase(호스팅)·Sentry(진단)는 수탁 처리자(service provider) — 두 스토어 정의상 "공유" 아님.
- **추적(Tracking, ATT)**: 없음 — 광고·데이터브로커 목적 없음. **ATT 프롬프트 불필요.**
- **전송 암호화**: 전 구간 HTTPS. **삭제 수단**: 웹 프로필에서 계정 삭제(`/api/user/delete`).

---

## 2. Apple Privacy Label (App Store Connect → App Privacy)

**시작 질문**: "Do you or your third-party partners collect data from this app?" → **Yes**

각 카테고리 선택값 — 공통으로 **Tracking: No**:

| ASC 카테고리 → 항목 | 수집 | 용도(Purposes) | Linked to Identity |
|---|---|---|---|
| Contact Info → **Email Address** | Yes | App Functionality | **Yes** |
| Contact Info → **Name** | Yes | App Functionality | **Yes** |
| User Content → **Photos or Videos** | Yes | App Functionality | **Yes** |
| Location → **Precise Location** | Yes | App Functionality | **Yes** |
| Identifiers → **User ID** | Yes | App Functionality | **Yes** |
| Identifiers → **Device ID** | Yes | App Functionality (기기 무결성 검증 — 해시만) | **No** |
| Diagnostics → **Crash Data** (한국어 UI: 충돌 데이터) | Yes | Analytics(분석) | **No** |
| Diagnostics → **Performance Data** (한국어 UI: **실적 데이터**) | Yes (Sentry traces 20%) | Analytics(분석) | **No** |

그 외 카테고리(Health, Financial, Contacts, Browsing, Search History, Purchases, Advertising Data 등)는 전부 **미수집**으로 두면 됨.

> 결과 라벨: "Data Linked to You" = 이메일·이름·사진·위치·사용자 ID / "Data Not Linked to You" = 기기 ID·진단. "Data Used to Track You" = 없음.

⚠️ **함께 확인 (심사 리젝 1순위)**: Apple 5.1.1(v) — 계정 생성이 있는 앱은 **앱 내에서 계정 삭제 진입점** 필수. 현재 삭제는 웹 프로필에만 있음 → 모바일 홈탭(내 계정)에 "계정 삭제" 링크(웹 프로필로 연결) 추가 필요. **A-45로 트래커 등재** — 코드 몇 줄이라 심사 제출 전에 처리.

---

## 3. Google Data Safety (Play Console → 앱 콘텐츠 → 데이터 보안)

**개요 질문**:
- 데이터 수집? → **예** / 데이터 공유? → **아니요**
- 전송 중 암호화? → **예** / 삭제 요청 수단 제공? → **예**
  - 삭제 링크: `https://www.ori.pics/ko/profile` (로그인 후 계정 삭제) — 별도 안내 페이지 만들면 교체

**데이터 유형별** — 공통: 공유 안 함, 임시 처리 아님(ephemeral No):

| 카테고리 → 유형 | 수집 | 필수/선택 | 목적 |
|---|---|---|---|
| 개인 정보 → **이메일 주소** | 예 | 필수 | 앱 기능, 계정 관리 |
| 개인 정보 → **이름** | 예 | 선택 | 계정 관리 |
| 개인 정보 → **사용자 ID** | 예 | 필수 | 앱 기능, 계정 관리 |
| 사진 및 동영상 → **사진** | 예 | 필수 | 앱 기능 |
| 위치 → **정확한 위치** | 예 | **선택** (토글 opt-in) | 앱 기능 |
| 앱 활동 → 기타 → **기기 무결성 토큰(해시)** | 예* | 필수(Verified 시) | 앱 기능, 사기 방지·보안 |
| 앱 정보 및 성능 → **비정상 종료 로그** | 예 | 필수(자동) | 분석(진단) |
| 앱 정보 및 성능 → **진단** | 예 | 필수(자동) | 분석(진단) |

\* 기기 무결성: Play Integrity 토큰은 서버 검증 후 해시만 저장 — "기기 또는 기타 ID" 카테고리로 선언해도 무방(보수적). 둘 중 하나만 선택하면 됨.

그 외(금융 정보, 건강, 연락처, 메시지, 오디오, 캘린더, 웹 기록, 설치된 앱 등) 전부 **수집 안 함**.

**독립 보안 검토(선택 배지)**: 해당 없음 — 건너뛰기.

---

## 4. 연계 결정 권장값 (U-14 · U-22 참고)

| 항목 | 권장 | 근거 |
|---|---|---|
| Apple 연령 등급 | **4+** | GPS 사용 자체는 등급 사유 아님(민감 콘텐츠 없음). 4+ 무방 — 단순 유틸리티 |
| Google 등급 설문 | **전체이용가** 방향으로 응답 | 폭력·도박·UGC 공개 피드 없음. 공개링크는 본인이 공유하는 URL이라 "사용자 간 콘텐츠 공유 플랫폼" 아님으로 응답 |
| 카테고리 | Apple **사진 및 비디오** / Google **사진** | "유틸리티"보다 탐색 노출·기대 맥락 유리. 경쟁 밀도는 높지만 키워드(원본증명·C2PA)로 차별화 |

---

## 5. 변경 이력

| 일자 | 변경 |
|---|---|
| 2026-08-23 | 최초 작성 — 코드 실사 기반 U-20/U-21 콘솔 입력값 확정. 앱 내 계정 삭제 진입점 필요(A-45) 발견 |
