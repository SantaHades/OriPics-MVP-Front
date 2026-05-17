# 앱스토어 메타데이터 카피 초안 (D-pre-4)

> **작성**: 2026-05-10
> **상태**: 초안 — 텍스트만. 스크린샷·아이콘·feature graphic은 디자인 작업 후 별도.
> **목적**: 베타 직전(D.3.5 종료 시점) 다듬어 바로 제출 가능한 형태로 보관.

---

## 0. 공통 정보

| 항목 | 값 |
|---|---|
| 앱 이름 (브랜드) | OriPics |
| 카테고리 | Photo & Video (Apple) / Photography (Google) |
| 개발사 | SantaHades Co., Ltd. (산타하데스) |
| 도메인 | https://www.ori.pics |
| 지원 메일 | hi@ori.pics |
| 개인정보 처리방침 URL | https://www.ori.pics/ko/privacy · https://www.ori.pics/en/privacy |
| 가격 정책 URL | https://www.ori.pics (요금제 섹션 #pricing) |
| 연령 등급 (Apple) | **4+** (콘텐츠 제한 없음, 단 GPS 사용으로 12+ 검토 필요) |
| 콘텐츠 등급 (Google) | **Everyone** (전체이용가) |
| 타겟 연령대 (Google) | 13세 이상 |
| 광고 포함 | **No** (현재 정책) |
| 인앱 결제 | Yes (Pro · Business 구독, J-7 도입 후) |

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
| 한국어 | C2PA 표준 호환 원본 증명 | 17 |
| English | C2PA · JPEG Trust ready | 23 |

### 1.3 Promotional Text (170자, 수시 변경 가능)

| 언어 | 카피 |
|---|---|
| 한국어 | 사고 사진·분쟁 증거가 진짜임을 증명하세요. C2PA 표준으로 출처를 보존하고, 어떤 도구로도 검증 가능합니다. 가입 즉시 무료 5건. |
| English | Prove your photos are authentic — for accident reports, disputes, portfolios. C2PA-standard provenance, verifiable in any tool. Free tier on signup. |

### 1.4 Description (4000자)

#### 한국어

```
사진이 진짜 원본인지 누가 증명하나요?

OriPics는 모바일로 찍은 사진에 보이지 않는 디지털 지문 + C2PA 표준 매니페스트를 자동으로 새깁니다. 픽셀 한 점만 바뀌어도 감지되고, 출처는 표준을 지원하는 어떤 도구에서도 검증할 수 있습니다.

▣ 이런 분께 필요합니다
• 교통사고 — 사고 현장 사진을 보험사·법원에 제출
• 부동산·임대 — 입주·퇴실 시점 상태 증거
• 작가·포트폴리오 — 작품의 원본·창작 시점 증명
• 미디어·언론 — 보도 사진의 출처 보존
• 데이팅·SNS — 본인 사진 위변조 방지

▣ 핵심 기능
• 모바일 사진 인증 (Verified) — 카메라로 직접 촬영, 기기 무결성 검증
• 이미지 파일 인증 (Standard) — 갤러리·붙여넣기로 업로드
• GPS 좌표 동봉 (선택) — 촬영 위치까지 증거 보존
• 공개링크 — 누구에게나 공유, 7일 또는 영구 보관
• Content Credentials 자동 첨부 — Adobe Photoshop·Truepic Verify 등에서 검증 가능

▣ 폐쇄형 인증이 아닌 국제 표준
OriPics는 C2PA(Coalition for Content Provenance and Authenticity) 표준을 따릅니다. C2PA는 Adobe·Microsoft·Sony·BBC·Intel이 공동 제정한 콘텐츠 출처·무결성 표준으로 ISO/IEC 21617(JPEG Trust) Part 2에 채택되었습니다. OriPics 사이트가 사라져도 표준을 지원하는 어떤 도구에서나 출처를 검증할 수 있습니다.

▣ 요금제
• Free — 월 5건 무료, 7일 보관, C2PA 매니페스트 자동 첨부
• Pro — ₩9,900/월 — 무제한 인증 · 영구 보관 · 모바일 Verified · 증명서 PDF
• Business — 팀 5명, 단체 관리, API, 부가세 인보이스 (영업 협의)

▣ 개인정보 보호
• 비밀번호는 단방향 해시(bcrypt) 저장
• 모든 통신 HTTPS 암호화
• 광고 식별·추적 쿠키 사용 안 함
• 자세한 내용: https://www.ori.pics/ko/privacy

문의: hi@ori.pics
운영: SantaHades Co., Ltd. (산타하데스)
```

#### English

```
Who can prove your photos are real?

OriPics embeds an invisible digital fingerprint plus a C2PA-standard manifest into every photo you take. A single pixel change is detected, and provenance is verifiable in any C2PA-aware tool — even if our service disappears.

▣ Built for
• Traffic accidents — submit scene photos to insurers and courts
• Real estate — move-in/move-out condition evidence
• Creators & portfolios — prove originality and creation time
• Media & journalism — preserve photo provenance
• Dating & social — prevent identity manipulation

▣ Key features
• Verified (mobile) — direct capture with device-integrity attestation
• Standard — gallery upload, paste-from-clipboard
• GPS coordinates (optional) — preserve where the photo was taken
• Shareable links — 7-day or permanent retention
• Content Credentials auto-attached — verify in Adobe Photoshop, Truepic Verify, and more

▣ Open standards, not a walled garden
OriPics is built on C2PA (Coalition for Content Provenance and Authenticity), the open standard created by Adobe, Microsoft, Sony, BBC, and Intel — adopted as Part 2 of ISO/IEC 21617 (JPEG Trust). Provenance stays verifiable independently of our platform.

▣ Pricing
• Free — 5 proofs per month, 7-day storage, Content Credentials auto-attached
• Pro — ₩9,900/month — unlimited proofs · permanent storage · Verified tier · PDF certificates
• Business — 5 seats, admin console, API, VAT invoicing (contact sales)

▣ Privacy
• Passwords stored with one-way hashing (bcrypt)
• All transport HTTPS encrypted
• No advertising or tracking cookies
• Full policy: https://www.ori.pics/en/privacy

Support: hi@ori.pics
Operated by SantaHades Co., Ltd.
```

### 1.5 Keywords (100자, 콤마 구분, 띄어쓰기 X)

| 언어 | 카피 | 글자수 |
|---|---|---|
| 한국어 | 원본증명,사진인증,교통사고,사진출처,C2PA,JPEG Trust,블록체인없는,위변조방지,컨텐츠인증,디지털지문 | ~71 |
| English | photo proof,image authenticity,c2pa,jpeg trust,content credentials,provenance,no blockchain,deepfake,evidence,real photo | ~107 (조정 필요) |

⚠️ EN 키워드는 100자 초과 — 발효 전 다음 중 일부 제거: `evidence`, `real photo`.

### 1.6 What's New (4000자, 버전마다)

#### v1.0.0 (출시 버전, 한/영)

| 언어 | 카피 |
|---|---|
| 한국어 | 첫 출시 — 모바일 카메라 직접 촬영(Verified) · 갤러리·붙여넣기 인증(Standard) · GPS 동봉 · Content Credentials 자동 첨부 · 7일/영구 보관 · 무료 5건/월 |
| English | Initial release — direct camera capture (Verified) · gallery & paste (Standard) · optional GPS · Content Credentials auto-attached · 7-day or permanent storage · 5 free proofs / month |

---

## 2. Google Play Store

### 2.1 App Name (30자)

| 언어 | 카피 |
|---|---|
| 한국어 | OriPics — 사진 원본 인증 |
| English | OriPics: Original Photo Proof |

### 2.2 Short Description (80자)

| 언어 | 카피 | 글자수 |
|---|---|---|
| 한국어 | C2PA 표준으로 사진 원본임을 증명하세요. 사고·분쟁·포트폴리오에. | ~36 |
| English | Prove your photos are authentic with C2PA standard provenance. | ~62 |

### 2.3 Full Description (4000자)

→ Apple §1.4와 동일한 본문 사용. (Google Play도 동일하게 적용 가능, 길이 충분)

### 2.4 Graphics 요구사항 (별도 작업, 카피 아님)

| 자산 | 요구 사양 | 상태 |
|---|---|---|
| 앱 아이콘 | 512×512 PNG | 디자인 필요 |
| Feature graphic | 1024×500 JPG/PNG | 디자인 필요 |
| Phone screenshot | 최소 2장, 최대 8장. 16:9 또는 9:16, 320~3840 px | 베타 빌드 후 캡처 |
| Tablet screenshot (선택) | 동일 규격 | 선택 |
| Promo video (선택) | YouTube URL | 선택 |

---

## 3. Apple Privacy Label · Google Data Safety

두 스토어 모두 처리 데이터 항목을 명시 필수.

| 데이터 카테고리 | 수집? | 사용자 식별 연결? | 추적 목적? | 비고 |
|---|---|---|---|---|
| 이메일 주소 | Yes | Yes | No | 계정 생성 (필수) |
| 이름 | Yes | Yes | No | 닉네임 (선택) |
| 사용자 ID | Yes | Yes | No | 내부 식별자 |
| 사진 (콘텐츠) | Yes | Yes | No | 인증 처리 (필수). 7일 또는 영구. |
| 위치 (정확) | Optional | Yes | No | GPS 좌표, 사용자 명시 동의 시 |
| 결제 정보 | Yes (J-7 후) | Yes | No | PortOne 위탁, 카드 번호 직접 보관 X |
| 디바이스 ID | Yes (Verified) | No | No | App Attest / Play Integrity 토큰 해시만 |
| 진단 정보 | Yes | No | No | 크래시 로그 (자동) |
| 광고 데이터 | **No** | — | — | 사용 안 함 |
| 추적 쿠키 | **No** | — | — | 사용 안 함 |

---

## 4. 키워드 리서치 (한국)

| 키워드 | 의도 | 경쟁도 |
|---|---|---|
| 원본 증명 | 핵심 가치 직접 표현 | 낮음 |
| 사진 인증 | 사용자 검색 빈도 높음 | 중간 |
| 교통사고 사진 | 강한 use case anchor | 중간 |
| 사고 증거 | 보험·법무 사용자 | 낮음 |
| 위변조 방지 | 일반적 우려 | 중간 |
| C2PA | 기술 신뢰 시그널 | 매우 낮음 (선점 가치) |
| JPEG Trust | 동일 (선점 가치) | 매우 낮음 |
| 사진 출처 | 직관적 | 낮음 |
| 디지털 지문 | 차별화 표현 | 낮음 |

→ Apple keywords field: `원본증명,사진인증,교통사고,사진출처,C2PA,JPEG Trust,블록체인없는,위변조방지,컨텐츠인증,디지털지문`

---

## 5. 발효 전 결정·확정 필요 항목

| # | 항목 | 비고 |
|---|---|---|
| 1 | **연령 등급** | Apple 4+ vs 12+ — GPS 사용으로 12+ 권장 검토. Google Everyone vs 13+ |
| 2 | **English keywords 길이 조정** | 100자 한도 — 두세 키워드 제거 필요 |
| 3 | **앱 아이콘 디자인** (1024×1024 + 512×512) | 디자이너 작업 |
| 4 | **Feature graphic** (Google, 1024×500) | 디자이너 작업 |
| 5 | **스크린샷** | 베타 빌드 완성 후 직접 캡처 (iPhone 6.7"/6.5"/5.5", iPad 12.9"/11" — Apple 요구) |
| 6 | **Promo video** | 선택 — 베타 사용자 1~2명 시연 영상 추천 |
| 7 | **Apple App Privacy Label** | App Store Connect에서 §3 표 기반으로 입력 |
| 8 | **Google Data Safety Form** | Play Console에서 §3 표 기반으로 입력 |
| 9 | **카테고리 검토** | Apple "사진 및 비디오" / "유틸리티" 어디가 검색 노출에 유리한지 분석 |
| 10 | **What's New 카피** | 매 버전 업데이트 시 갱신 |

---

## 6. 적용 일정

| 시점 | 작업 |
|---|---|
| 모바일 본 시작 (트랙 D 진입) | 본 문서 카피 한 차례 검토·다듬기 |
| 베타 빌드 완성 (D.3.5) | 스크린샷 캡처 + Promo video 제작 (선택) |
| TestFlight 업로드 (D.3.5) | App Store Connect에 §1 메타데이터 입력 |
| Play Internal 업로드 (D.3.5) | Play Console에 §2 메타데이터 입력 |
| 심사 제출 (D.3.6) | §3 Privacy Label / Data Safety Form 입력 + 최종 카피 락인 |

---

## 7. 변경 이력

| 일자 | 변경 |
|---|---|
| 2026-05-10 | 최초 작성 — Apple + Google 양쪽 메타데이터 카피, Privacy Label / Data Safety 항목, 키워드 리서치 |
