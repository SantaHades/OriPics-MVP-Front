# 앱스토어 메타데이터 (정식 출시용)

> **작성**: 2026-05-10 초안 → **2026-09-03 전면 현행화** (정식 심사 제출용)
> **상태**: 현행화 초안 — 대표 검토 대기. ⚠️아래 "가정한 결정 3가지" 확인 필요.
> **용도**: App Store Connect / Play Console에 복붙하는 원본. 심사 노트 포함(§6).

## ⚠️ 현행화에서 가정한 결정 (대표 veto 가능)

1. **연령 등급 Apple 4+** — GPS는 선택 기능(사용자 명시 동의)이라 등급 사유 아님. store-privacy-forms.md 권장과 일치.
2. **원데이 패스는 앱 설명에서 제외** — 웹 전용 판매 상품이라 앱 메타데이터에 넣으면 3.1.1(외부 결제 유도) 심사 리스크만 생김. 웹 마케팅에서만 노출.
3. **개인정보 라벨 "결제 정보" = 수집 안 함** — 앱에는 결제가 없음(결정 B). 게시된 U-20 라벨과 정합.

---

## 0. 공통 정보

| 항목 | 값 |
|---|---|
| 앱 이름 (브랜드) | OriPics |
| 카테고리 | Photo & Video (Apple) / Photography (Google) |
| 개발사 | SantaHades Co., Ltd. (주식회사 산타하데스) |
| 도메인 | https://www.ori.pics |
| 지원 메일 | hi@ori.pics |
| 개인정보 처리방침 URL | https://www.ori.pics/ko/privacy · https://www.ori.pics/en/privacy |
| 연령 등급 (Apple) | **4+** (가정 1 — ASC 설문에서 전 항목 "없음") |
| 콘텐츠 등급 (Google) | **완료(8/24)** — IARC 전체이용가, 타겟 18+ |
| 광고 포함 | No |
| 인앱 결제 | **No** — 구독·상품 판매는 웹 전용(결정 B, 2026-08-23). 앱 내 결제·구매 유도 없음 |

---

## 1. Apple App Store

### 1.1 App Name (30자 제한)

| 언어 | 카피 | 글자수 |
|---|---|---|
| 한국어 | OriPics — 사진 원본 인증 | 16 |
| English | OriPics: Original Proof | 23 |

### 1.2 Subtitle (30자 제한)

| 언어 | 카피 | 글자수 |
|---|---|---|
| 한국어 | 촬영 순간을 증거로 — C2PA 표준 | 18 |
| English | Capture-time proof · C2PA | 25 |

### 1.3 Promotional Text (170자, 수시 변경 가능)

| 언어 | 카피 |
|---|---|
| 한국어 | 사고 현장·퇴실 점검·중고거래 — 사진이 증거가 되어야 하는 순간, 촬영과 동시에 원본임을 인증하세요. C2PA 신뢰 목록에 등재된 인증서로 서명되어 어떤 표준 도구에서도 검증됩니다. |
| English | Accident scenes, move-out checks, secondhand deals — certify your photo is the original the moment you shoot. Signed with a C2PA trust-listed certificate, verifiable in any standard tool. |

### 1.4 Description (4000자)

#### 한국어

```
"그 사진, 나중에 찍은 거 아니에요?"

사진이 증거가 되어야 하는 순간, 그 말 한마디면 증거 가치가 무너집니다.
OriPics는 촬영하는 순간 사진에 보이지 않는 디지털 지문을 새기고 서버가
서명합니다. 픽셀 한 점만 바뀌어도 감지되고, 공개링크 하나로 누구에게나
원본임을 보여줄 수 있습니다.

▣ 이런 순간에 필요합니다
• 교통사고 — 사고 현장 사진을 보험사·상대방에게 제출할 때
• 부동산·임대 — 입주·퇴실 시점의 상태를 기록할 때
• 시공·인테리어 — 시공 전후 현장을 하자 분쟁에 대비해 남길 때
• 중고거래 — 물건 상태를 거래 상대에게 증명할 때
• 창작자 — 작품의 원본과 창작 시점을 지킬 때
• 언론 제보 — 제보 사진의 신뢰를 더할 때 (앱에서 방송사 제보까지 한 번에)

▣ 핵심 기능
• 촬영 인증 (Verified) — 카메라로 직접 촬영, iOS 기기 무결성 검증(App Attest)
  통과 시 촬영 기기·시각·렌즈 정보까지 기록됩니다
• 파일 인증 (Standard) — 갤러리의 사진·이미지 파일도 인증할 수 있습니다
• GPS 좌표 동봉 (선택) — 원할 때만 촬영 위치를 증거에 포함
• 공개링크 — 링크 하나로 상대방·보험사 누구든 앱 없이 검증
• 인증서 PDF — 제출용 공문서 스타일 인증서 발급
• 방송사 제보 — 인증된 사진을 검증 링크와 함께 언론사에 바로 제보

▣ 폐쇄형 인증이 아닌 국제 표준
OriPics는 C2PA(Adobe·Microsoft·Sony·BBC·Intel 공동 제정, ISO/IEC 21617
JPEG Trust 채택) 표준의 적합성 인증(Conformant) 제품입니다. 발행되는
사진에는 C2PA 신뢰 목록에 등재된 인증서로 서명된 Content Credentials가
자동 첨부되어, OriPics가 아닌 표준 지원 도구에서도 출처를 검증할 수
있습니다.

▣ 요금제
• Free — 월 5회 사진 인증(표준 크기 기준), 공개링크 7일 보관
• Pro — 월 9,900원: 월 1,000건 이용(표준 크기 사진 인증 기준 약 330회),
  보관함 계속 보관, 촬영 검증(Verified), 인증서 PDF
※ 사용하지 않은 이용 건수는 다음 달로 이월되지 않습니다.

▣ 개인정보 보호
• 비밀번호는 단방향 해시로 저장, 모든 통신 HTTPS 암호화
• 광고 식별자·추적 쿠키 사용 안 함
• 자세한 내용: https://www.ori.pics/ko/privacy

문의: hi@ori.pics
운영: 주식회사 산타하데스 (SantaHades Co., Ltd.)
```

#### English

```
"Wasn't that photo taken afterwards?"

When a photo needs to stand as evidence, that one question can destroy
its value. OriPics embeds an invisible digital fingerprint the moment
you shoot, and our server signs it. A single changed pixel is detected,
and one public link proves originality to anyone.

▣ Built for the moments that matter
• Traffic accidents — submit scene photos to insurers
• Real estate — record move-in / move-out conditions
• Construction — document before/after against defect disputes
• Secondhand deals — prove item condition to buyers
• Creators — protect originality and creation time
• News tips — send certified photos to newsrooms, right from the app

▣ Key features
• Capture proof (Verified) — direct camera capture with iOS device
  integrity attestation (App Attest); device, time and lens are recorded
• File proof (Standard) — certify photos and images from your gallery
• GPS coordinates (optional) — include location only when you choose
• Public links — anyone can verify with one link, no app needed
• Certificate PDF — issue a formal certificate for submissions
• News tips — send certified photos with verification links to media

▣ Open standards, not a walled garden
OriPics is a C2PA Conformant product (the standard by Adobe, Microsoft,
Sony, BBC and Intel, adopted as ISO/IEC 21617 JPEG Trust). Published
photos carry Content Credentials signed with a certificate on the C2PA
trust list — verifiable in any standards-aware tool, independent of
OriPics.

▣ Pricing
• Free — 5 photo proofs per month (standard size), 7-day public links
• Pro — ₩9,900/month: 1,000 usage credits per month (≈330 standard-size
  photo proofs), continuous storage, Verified capture, certificate PDFs
※ Unused credits do not roll over to the next month.

▣ Privacy
• Passwords stored with one-way hashing; all transport HTTPS encrypted
• No advertising identifiers or tracking cookies
• Full policy: https://www.ori.pics/en/privacy

Support: hi@ori.pics
Operated by SantaHades Co., Ltd.
```

### 1.5 Keywords (100자 한도, 콤마 구분)

| 언어 | 카피 | 글자수 |
|---|---|---|
| 한국어 | 원본인증,사진인증,원본증명,교통사고,사고증거,중고거래,위변조방지,사진출처,C2PA,디지털지문 | ~64 |
| English | photo proof,image authenticity,c2pa,content credentials,provenance,jpeg trust,evidence,deepfake | 96 ✓ |

- KO: 검색어로는 "증명"도 여전히 쓰이므로 `원본증명` 유지(검색 키워드는 UI 용어 통일 대상 아님).
- EN: 구 초안 107자 → `no blockchain`·`real photo` 제거, 96자로 조정 (U-15 해소).

### 1.6 What's New — v1.0.0 (출시 버전)

| 언어 | 카피 |
|---|---|
| 한국어 | 첫 정식 출시 — 촬영 인증(Verified: 기기 검증·촬영 정보 기록) · 갤러리 파일 인증(Standard) · GPS 선택 동봉 · 공개링크 검증 · 인증서 PDF · 방송사 제보 · C2PA 신뢰 목록 등재 인증서로 서명(Content Credentials 자동 첨부) |
| English | First release — capture proof (Verified: device attestation, shot metadata) · gallery file proof (Standard) · optional GPS · public link verification · certificate PDF · news tips · signed with a C2PA trust-listed certificate (Content Credentials auto-attached) |

---

## 2. Google Play Store — **게시 완료(2026-08-24), 프로덕션 전환 시 §1.4 신판으로 갱신**

- 스토어 등록정보·데이터 보안·IARC 등급 제출 완료(8/24 심사 통과분).
- 8/24 게시본에는 "C2PA 자동첨부 — 인증서 적용 후 제공 예정" 문구 있음 → **운영 cert 라이브(9/2)로 원복 필요** (프로덕션 전환 작업에 포함).
- Full description은 §1.4 한국어판과 동일 사용. Short description(80자): "촬영하는 순간 원본임을 인증하세요. 사고·분쟁·거래의 증거 사진에. C2PA 표준." (~44자)

---

## 3. Apple Privacy Label · Google Data Safety — **양쪽 게시 완료(U-20/U-21, 2026-08-24)**

기준표 (재제출 시 참조 — 게시본과 정합 확인됨):

| 데이터 카테고리 | 수집? | 사용자 식별 연결? | 추적 목적? | 비고 |
|---|---|---|---|---|
| 이메일 주소 | Yes | Yes | No | 계정 (필수) |
| 이름 | Yes | Yes | No | 닉네임 (선택) |
| 사용자 ID | Yes | Yes | No | 내부 식별자 |
| 사진 (콘텐츠) | Yes | Yes | No | 인증 처리. 공개링크 발행 시에만 서버 저장 |
| 위치 (정확) | Optional | Yes | No | GPS 좌표, 사용자 명시 동의 시 |
| 결제 정보 | **No** | — | — | **앱 내 결제 없음(결정 B)** — 웹 결제는 PG 위탁, 앱 라벨 대상 아님 |
| 디바이스 ID | Yes (Verified) | No | No | App Attest / Play Integrity 토큰 해시만 |
| 진단 정보 | Yes | No | No | 게시 라벨 기준(분석) 유지 |
| 광고 데이터 / 추적 쿠키 | **No** | — | — | 사용 안 함 |

---

## 4. 키워드 리서치 (한국) — 5/10 리서치 유지, `사고증거`·`중고거래` 반영

| 키워드 | 의도 | 경쟁도 |
|---|---|---|
| 원본 인증/증명 | 핵심 가치 | 낮음 |
| 사진 인증 | 검색 빈도 높음 | 중간 |
| 교통사고·사고 증거 | 강한 use case | 중간/낮음 |
| 중고거래 | use-cases 페이지 반영 | 중간 |
| C2PA·디지털 지문 | 기술 신뢰·선점 | 매우 낮음 |

---

## 5. 정식 심사 제출 체크리스트 (2026-09-03 기준)

| # | 항목 | 상태 |
|---|---|---|
| 1 | 아이콘 (U-16) | ✅ 완료 |
| 2 | 스크린샷 (U-18) | ✅ 4장 (1320×2868, 6.9") — iPad 미지원이라 iPhone만 |
| 3 | Privacy Label (U-20) / Data Safety (U-21) | ✅ 양쪽 게시 완료 |
| 4 | EN 키워드 100자 (U-15) | ✅ 본 문서에서 96자로 해소 |
| 5 | Apple 연령 등급 설문 (U-14) | ⬜ ASC에서 답변 (전 항목 "없음" → 4+) |
| 6 | ASC 버전 페이지 입력 (§1 카피) | ⬜ 대표 콘솔 작업 — 본 문서 확정 후 복붙 |
| 7 | 심사 노트 + 데모 계정 (§6) | ⬜ 본 문서 확정 후 입력 |
| 8 | 배포 국가 결정 | ⬜ **대표 결정** — Play는 한국 한정, App Store도 한국만? (권장: 한국만으로 시작 — 글로벌 USD 요금 미정) |
| 9 | 출시 방식 | ⬜ **수동 출시** 권장 (Android 프로덕션 승인과 동시 오픈) |
| 10 | 제출 빌드 | ⬜ 빌드 11 (가입 링크 등 대기분 탑승) |
| 11 | 정식 전환 스위치 | ⬜ appLinks.ts 베타→정식 링크, BetaNotice 해제(EXPO_PUBLIC_BETA=false), Play 설명 "제공 예정" 원복 |

---

## 6. App Review 심사 노트 초안 (ASC "App Review Information"에 입력)

```
[Demo Account]
Email: demo-screenshots@ori.pics
Password: (.secrets/demo-screenshots-account.txt)

[Notes]
OriPics certifies photo authenticity at the moment of capture.

- Camera permission: used to capture photos that are certified with an
  invisible steganographic fingerprint and server-side signature at
  capture time. This is the core feature ("Verified" tier).
- App Attest: we use DeviceCheck App Attest to verify device integrity
  for the Verified tier. Captures on the demo account will work end to
  end: shoot in the Capture tab → certify in the List tab → publish a
  public link → open the link in any browser to see verification.
- Location (optional): GPS coordinates are embedded only when the user
  enables the toggle on the capture screen.
- Sign in with Apple is offered alongside Google/Kakao/Naver.
- Account deletion is available in-app (Home tab → bottom).
- The app contains no in-app purchases and no purchase links; paid plans
  exist on our website only and the app does not direct users there.
```

---

## 7. 변경 이력

| 일자 | 변경 |
|---|---|
| 2026-05-10 | 최초 작성 — Apple/Google 카피, Privacy Label 표, 키워드 리서치 |
| 2026-09-03 | **정식 출시용 전면 현행화** — 인앱결제 No(결정 B)·'인증' 용어 통일·요금 표기 현행화(월 1,000건·이월 불가)·신기능 반영(제보 탭·인증서 PDF·Verified 상세·C2PA 신뢰 목록 서명)·EN 키워드 96자(U-15 해소)·연령 4+ 확정안·심사 노트(§6)·체크리스트 갱신. 가정한 결정 3가지는 문서 상단 |
