# OriPics 경쟁 분석 — C2PA Conforming Products List 기반 (2026-07-06)

> 출처: [C2PA Conformance Explorer](https://spec.c2pa.org/conformance-explorer/) 공식 JSON
> (`conforming-products-list.json`, 2026-07-06 취득) + 업체별 웹 조사(4개 병렬 트랙).
> 확정 수치: **92개 레코드 / 71개 고유 제품 / 48개 기업 / 전원 conformant**.

---

## 1. 리스트 구조 분석 (원본 JSON 실측)

### 1.1 기본 분포
- Generator 78 / Validator 14
- Assurance Level: **L1 71개 / L2 단 7개** (Google Pixel Camera ×3, Qualcomm Snapdragon 8 Elite Gen 5, Evergreen GreenCheckmark Android, Nuevo VWFNDR, EZDRM)
- 국가: US 52, CN 11(vivo·Xiaomi), **KR 3**(마크애니·뮤즈블라썸·**OriPics**), DK 3, 기타 1~2

### 1.2 시장 가속화
월별 conformance 등재: 2025년 월 2~8건 → **2026-05 20건, 2026-06 17건**.
최근 두 달이 전체의 40%. 컨포먼스 등재 경쟁이 본격화되는 변곡점.

### 1.3 OriPics의 리스트 내 객관적 위치
- **리스트 전체에서 유일하게 단일 제품으로 Google Play Integrity + Apple App Attest를
  동시 선언** (경쟁사는 iOS/Android 별개 등재: GreenCheckmark, CertifiedPhotos, ProofSnap, InReality)
- 모바일 attestation 선언 제품은 92개 중 9개(6개사 + OriPics)뿐
- **포맷 갭**: generator 78개 중 66개가 JPEG 생성 지원. PNG-only는 3개뿐이고
  나머지 둘은 Google AI 도구(NotebookLM, Pomelli). 46개는 비디오까지 지원.
  → **image/jpeg (및 장기적으로 video) 추가가 가장 명확한 컨포먼스 확장 과제**

---

## 2. 경쟁사 지도

### 2.1 🎯 직접 경쟁 — 모바일 인증촬영/스탬핑 (7개 실질 사업자)

| 순위 | 제품 (회사/국가) | 모델 | 상태 | OriPics 대비 |
|---|---|---|---|---|
| 1 | **CertifiedPhotos** (Platform Technology Ventures/US) | 촬영앱 + 사진별 공개 검증링크 `cert.photos/v/<id>` + Free/Pro/Enterprise | **스토어 미출시**, 직원 ~1명, NSF SBIR $275k | 구조 최유사(검증링크+티어+동일 attestation). 실행력 창 열려 있음 |
| 2 | **ODDR** (ODDR Group/호주) | **웹 업로드→백엔드 서명→공개 검증 페이지** + 신원확인 결합 | 웹만, 매우 초기(스테이징 노출) | OriPics 웹 흐름과 동일한 유일 서비스 |
| 3 | **Zerofake** (Actual Intelligence/호주) | iOS 인증촬영, 해시만 전송 하이브리드 | iOS 베타, 프리론치 | 버티컬(보험·마켓플레이스·법률) 최다 겹침 |
| 4 | **ProofSnap** (Numbers/대만) | 촬영앱 + 블록체인 앵커링(ERC-7053), 무료+광고 | **유일하게 양대 스토어 출시**, $6M 펀딩, GNI 그랜트 | attestation 미선언(우리 우위). 무료 모델 = 가격 압박 요인 |
| 5 | **InReality Capture** (InReality/덴마크) | 보험·뉴스 B2B SDK(FNOL 통합, 4-8주 배포), DNG 지원, gen+validator 풀스택 | B2B 세일즈, 앱스토어 미발견 | 엔터프라이즈 확장 시 만날 상대 |
| - | GreenCheckmark (Evergreen/캐나다) | 사진+영상, **Android L2** | 1인 개발, 설치 10+ | 트랙션 없음. Android L2 실증 사례로만 의미 |
| - | Proofmode (Guardian Project 연계/US) | 인권·저널리즘 오픈소스, 무료 | Play 10K+ (니치 최다 배포) | 그랜트 재원 비영리, 세그먼트 다름 |

결이 다른 등재사: TrueTake(AI 초상권 라이선싱), Neat Photo(사진 게임 — C2PA는 안티치트),
VWFNDR(무료 카메라앱 — 하드웨어 판매용), CHECKHC(프랑스, 크레딧 9€/100 + Solana 토큰).

**핵심**: 직접 경쟁 7개사 전원 프리론치~초기 트랙션. **컨포먼스 등재 ≠ 시장 지배.**
**한국어 현지화·국내 GTM 보유 업체 0곳 — 한국 시장은 완전 공백.**
**구독+크레딧+검증된 dual attestation 조합은 리스트 내 OriPics 유일.**

### 2.2 🇰🇷 한국 등재사 — 직접 경쟁 아님 (세그먼트 상이)

| | 마크애니 AI Trust | 뮤즈블라썸 Contents Defence | OriPics |
|---|---|---|---|
| 세그먼트 | B2B SDK — AI 생성물 표시(AI기본법 컴플라이언스) | B2B/크리에이터 — 저작권 워터마크·유출 추적 | **B2C 실사진 진본성 스탬핑** |
| 벡터 | "AI가 만든 것" 표시 (negative labeling) | 불법복제 방어 (anti-piracy) | **"진짜 사진" 증명 (positive provenance)** |
| 과금 | **무상 배포**(선점 전략, AIIA MOU) | 미공개/무료 베타 | 크레딧·구독 |
| 검증 UX | 없음(SDK) | 암호키 파일 이메일 방식 | **공개 검증 링크** |
| attestation | 없음 | 없음 | **PlayIntegrity+AppAttest (KR 유일)** |
| 규모 | 직원 ~206명, 매출 ~236억 | 직원 5~6명, 매출 ~4,500만원 | - |

- 마크애니: 1999년 설립 DRM/워터마크 기업. "AI Trust" 제품 페이지 부재 — C2PA 서명 SDK를
  AI기본법 대응용으로 **무상 배포**(2026-01-29). 포맷 18종(이미지+비디오+오디오).
- 뮤즈블라썸: BGM 구독→오디오 워터마크 피벗한 초기 스타트업. 웹툰/일러스트 보호 지향.
- ⚠️ 리스트 밖 국내 잠재 위협: **스크루AI 카메라**(2026-03 보도, 단일 출처 — 센서 기반 촬영 입증
  +공개 인증 URL 무료 B2C 앱, "C2PA 상호운용성 개발 중"=미구현·CPL 미등재).

### 2.3 🏢 플랫폼/API형 12개사 — 소비자 셀프서브 스탬핑 운영 중 **0곳**

- **Trufo**(US): 유일한 셀프서브 — 단 개발자/기업용 인증서·API 인프라(C2PA cert 연 $300~,
  엔터프라이즈 연 $20k~). 자체가 C2PA Trust List 등재 CA. 부분 겹침.
- **Lumid**(독일 Valid Technologies, 직원 5명): "기업·관공서·개인" 표방, 2026-05 출시 직후.
  독일어권에서 OriPics와 가장 유사한 컨셉이 될 잠재 경쟁자 — 모니터링 대상.
- 무경합: DigiCert Content Trust Manager(엔터프라이즈 전용, 2026-04-30 출시),
  Encypher(텍스트 프로비넌스 본진 — C2PA 텍스트 표준 저자), Archive Origin(교육기관 LMS),
  Stability Monolith(ML 모델 포맷 프로비넌스+블록체인), Inborn ContentLens(인도 B2B),
  Digitality(이탈리아 컨설팅), Pixelstream(크리에이터 워크플로우, 얼리액세스),
  Gelatin Labs(필름 현상소 니치), SamuRAI OS·DAEGIS Pro(공개 실체 없음).

### 2.4 🌐 빅테크/디바이스 (생태계 기반 — 상세는 §3)

Google(24개 레코드 — Pixel Camera L2, Photos, Media Processing 등), OpenAI, Qualcomm(칩셋 L2),
vivo·Xiaomi(중국 폰). 이들은 경쟁이 아니라 **C2PA 생태계를 보편화해 주는 조력자**:
폰이 서명할수록 "검증·유통·증거화" 레이어의 수요가 커짐.

---

## 3. 리스트 밖 인접 위협 (별도 트랙 조사 완료)

| 플레이어 | 실체 | OriPics 대체 가능성 |
|---|---|---|
| **Adobe Content Authenticity 웹앱** | 무료 퍼블릭 베타(2025-04~). 기존 JPG/PNG에 CC 배치 부착(최대 50개), LinkedIn 신원검증, Do Not Train. **창작자 귀속 표시**용 — 촬영 시점·원본성 증명 아님(AI 생성물도 부착 가능). CPL 미등재(미확인) | **중간** — 표면 기능 겹침, "진짜 원본" 증명 니즈는 못 채움 |
| **Truepic** | 원조 사진 진위인증(2015~) → **완전 B2B 전환**(Lens SDK + Vision 검사 플랫폼, 보험·금융). 자체 C2PA 전용 CA 운영. Conformance Task Force 공동의장인데도 미등재(등재 시점 문제로 추정, 향후 가능성 높음) | 소비자: **낮음** / B2B 확장 시: **직접 경쟁**(강력한 선점자) |
| **삼성 갤럭시** | S25 = 제조사 최초 C2PA 가입·탑재, 단 **AI 편집물 라벨링 중심**(전 촬영 서명 여부는 소스 상충, 다수설은 미서명). S26 언팩에서 C2PA 확대 발표 미확인. CPL 미등재. 국내 언론 대서특필 → **한국 인지도 형성 중** | 현재 **낮음~중간**, 전 촬영 서명+등재 시 **최대 잠재 위협**. 단 기존 사진 스탬핑은 폰 내장으로 원천 불가 |
| **Google Pixel 10** | 최초 네이티브 전 사진 서명 + **AL2 최초 달성·CPL 등재**(Titan 하드웨어 키) | 한국 점유율 미미 → **제한적**. 오히려 "Pixel 서명 사진을 trusted ingredient로 받는" OriPics 시나리오의 기반 |
| **카메라 제조사** | Leica(M11-P 최초)·Sony(뉴스룸 유료 구독)·Canon(2026-05 Authenticity Imaging System — 매니지드 인증서+TSA+뉴스룸 B2B). **Nikon은 2025-09 서명 위조 취약점으로 전 인증서 폐기·서비스 8개월+ 중단** | **낮음**(프로 바디+B2B). Nikon 사태 = "서명 존재 ≠ 서명 신뢰" 각인 → conformance 지위 마케팅 소재 |
| **ProofSnap/Capture(Numbers)·Click(Nodle)** | 무료 캡처 앱 + 자체 블록체인 앵커. CPL 미등재(ProofSnap generator는 등재 — §2.1), 캡처 전용, 한국어 없음 | **중간(신규 촬영)/낮음(기존 사진)** |

**§3 핵심 결론 — 무료 대안 세계에서 유료 스탬핑의 구조적 차별화 5요소:**
1. **"기존 사진" 처리 + trusted ingredient 체인 보존은 구조적 공백** — 폰 내장·캡처 앱은
   전부 새 촬영 전용, Adobe는 신원 표시일 뿐. 원본(예: Pixel 서명 사진)을 ingredient로 받아
   trusted 체인을 유지한 채 재서명하는 소비자 서비스는 사실상 OriPics뿐
   (Scott 심사에서 검증한 바로 그 역량)
2. **공식 Conformance 등재 + trust list 준수 = 검증 가능한 신뢰**. 무료 대안 중 이 지위는
   Pixel 10(기기)뿐. Nikon 사태가 그 가치를 시장에 각인
3. **한국어·국내 결제·국내 CS 전무** — 조사 전체에서 0곳. 삼성 S25 보도로 국내 인지도가
   막 형성되는 시점의 공백
4. **기기 불문 접근성** — 무료 내장 서명은 최신 플래그십 한정(Apple 미지원). 서버측 스탬핑은
   아이폰·구형 안드로이드·DSLR JPEG까지 커버 = 실사용 인구 대다수가 무료 대안 밖
5. **'표시'가 아닌 '증명' 계층** — Canon·Sony가 뉴스룸에 유료로 파는 것이 정확히
   "매니지드 인증서+신뢰 TSA+검증 서비스" 계층. 같은 계층을 소비자 가격으로 제공하는 것이
   유료 정당화 논리. 소셜 재인코딩 메타데이터 소실(업계 공인 최대 갭)을 파일 외부 검증
   링크로 흡수

---

## 4. 한국 시장 환경 (규제·수요)

**규제 순풍:**
- AI기본법 2026-01-22 시행, 제31조 생성물 표시 의무. 과기정통부 「AI 투명성 확보 가이드라인」
  (2026-01-21)이 기계판독 표시 예시로 **C2PA를 공식 인용** — 정부 문서 준거 표준급 첫 사례
- 표시 의무 주체는 AI사업자(~2,000개 기업), 일반 이용자 의무 없음. 계도기간 1년+
- 정보통신망법 개정안(표시 훼손 금지) 계류 — 통과 시 편집에도 살아남는 암호학적 출처증명 수요↑
- 정부 조달·R&D는 아직 탐지(detection) 중심, C2PA 명시 조달 미발견

**수요 실증 (2024-2026):**
1. **중고거래**: 사기 연 12만 건·피해 8,741억원. 2026-03 생성형 AI 위조 물품사진 전국 사기 검거
   (피해자 157명). 플랫폼 대응(당근·번개장터·중고나라)은 전부 사후 탐지 — **원본증명 갭**
2. **보험**: 사기 적발 1.16조원. 금융위 'AI 기반 보험사기 방지체계 TF' 출범(2026-06-04,
   9월 방안·10월 법령 개정 예정) — B2B 파트너십 적기
3. **법정 증거**: 법원 AI연구회 가이드라인 — AI 의심 증거에 소명 명령 가능 →
   **"AI가 아님" 입증 부담이 당사자에게 생기는 구조** = positive provenance 수요
4. **언론/선거**: 선거 딥페이크 삭제요청 27배 폭증. KPF C2PA 소개 리포트 — 인지 시작 단계
5. 국내 유사 서비스: Artify(시각 스티커, 위조 가능), 카이캐치(탐지형, 스토어 404),
   샌즈랩·딥브레인AI(탐지형), TSA 업체(B2B 문서) — **B2C positive provenance는 OriPics 유일**

---

## 5. OriPics 경쟁력 극대화 방안

_(최종 전략 — 인접 위협 트랙 반영 후 확정)_

### 5.1 지금 가진 구조적 우위 (사실 기반)
1. **리스트 유일의 단일 제품 dual attestation 선언** (PlayIntegrity+AppAttest)
2. **한국 B2C positive provenance 유일 사업자** + 한국어 GTM 보유 경쟁자 0
3. **구독+크레딧+공개 검증 링크 조합** — 리스트 내 유일한 검증된 소비자 과금 모델
4. 직접 경쟁 7개사 전원 프리론치~초기 — **선점 창(window)이 열려 있으나 좁아지는 중**
   (등재 폭증: 2026-05~06 두 달간 37건)
5. 규제 타이밍: AI기본법 시행 + C2PA 정부 가이드라인 인용 + 보험 TF + 중고거래 사기 실사건
6. **기존 사진 + trusted ingredient 체인 보존 역량** — 전 세계 무료·유료 대안을 통틀어
   구조적 공백이며, Scott 컨포먼스 심사 과정에서 이미 검증된 OriPics 고유 역량 (§3 결론 1)

> ⚠️ 유보 표기: ①삼성 S25 네이티브 촬영 서명 여부는 소스 상충(다수설: AI 편집물만) —
> 실기기 확인 권장 ②Adobe 웹앱·Truepic의 conformance 신청 여부는 공개 정보 미발견
> ③마크애니 "AI Trust" 실체는 강한 추정(제품 페이지 부재) ④스크루AI는 단일 출처

### 5.2 보완해야 할 갭 (사실 기반)
1. **JPEG generate 미지원** — 78개 generator 중 66개 지원, PNG-only는 사실상 OriPics뿐
2. **모바일 앱 미출시** — attestation은 선언했으나 실제 스토어 제품은 ProofSnap 등이 선행
3. **Assurance Level 1** — L2는 7개뿐(차별화 기회이자 장기 과제; GreenCheckmark Android가
   인디 개발로도 L2 달성 실증)
4. 운영 인증서 미발급(SSL.com 진행 중) — PoC untrusted 해소가 대외 신뢰 전제

### 5.3 경쟁력 극대화 전략 (우선순위순)

#### P0. 신뢰 완결 — "국내 유일" 지위의 대외 실증 (진행 중인 것을 끝내기)
- **SSL.com 운영 인증서 발급 완료 → PoC Signer untrusted 해소** (이미 진행 중, 최우선 유지).
  경쟁 관점: 직접 경쟁 7개사 중 상당수가 아직 프리론치인 지금, "완전히 trusted한 체인"을
  먼저 보여주는 것 자체가 차별화.
- **Conformance 지위 마케팅 자산화**: "C2PA 공식 적합성 인증(Conformance ID 019e4988…),
  한국 유일 B2C" + "리스트 전체 유일의 단일 제품 dual attestation 선언" — 랜딩/검증 페이지/
  보도자료에 명시. Conformance Explorer 공개 레코드 링크가 그 자체로 제3자 증빙.
- 정부 가이드라인의 C2PA 공식 인용(2026-01-21)을 신뢰 근거로 인용.

#### P1. 한국 시장 선점 GTM — 공백이 닫히기 전에
경쟁자 0인 지금이 유일한 무혈입성 구간. 등재 폭증(월 17~20건) 추세상 12~18개월 내
글로벌 플레이어의 한국어 지원 가능성.
- **버티컬 1 — 중고거래 "인증샷"**: AI 위조 물품사진 사기 실사건(피해자 157명)이 마케팅
  훅. 개인 판매자용 셀프서브(현 크레딧 모델 그대로) + 플랫폼(당근·번개장터·중고나라)
  API 제휴 타진. 플랫폼 대응이 전부 사후 탐지라 원본증명은 보완재 — 경쟁 아닌 제휴 구도.
- **버티컬 2 — 보험**: 금융위 AI 보험사기 방지 TF(9월 방안·10월 법령 개정) 타임라인에
  맞춰 보험사/손보협회 접촉. InReality(덴마크)가 같은 모델(FNOL SDK)로 유럽에서 검증 중
  이라는 사실 = 국내 제안서의 레퍼런스 논리.
- **버티컬 3 — 법률 증거**: 법원의 "AI 의심 증거 소명 명령" 구조 = positive provenance
  수요의 제도적 근거. 법률 플랫폼/손해사정/공증 채널.
- **언론**: KPF가 C2PA 리포트를 낸 인지 시작 단계 — 기고·세미나로 "국내 유일 conformant"
  포지션 선점(비용 낮고 권위 효과 큼).

#### P2. 포맷 확장 — JPEG generate (최대 컨포먼스 갭 해소)
- 78개 generator 중 66개가 JPEG 지원, PNG-only는 사실상 OriPics뿐. 사용자 원본이
  JPEG/HEIC인 현실에서 PNG 강제 재인코딩은 용량·워크플로우 마찰.
- ingest는 이미 PNG+JPEG 선언(GPSA v2.2.4) — **generate에 image/jpeg 추가**가 다음 단계.
  컨포먼스 레코드 변경 절차(Scott/Conformance Admin에 변경 신고 필요 여부) 확인 후 진행.
- 장기: video/mp4 (46개사가 지원 — 시장 표준 방향).

#### P3. 모바일 출시 — dual attestation을 선언에서 실증으로
- 선언(PlayIntegrity+AppAttest)은 리스트 유일이나, 실제 스토어 출시는 ProofSnap 등이 선행.
  모바일 계획서(6/18) 실행으로 "선언→실증" 전환 시 국내외 모두에서 실질 우위.
- 장기 목표선: **Assurance Level 2** (Android KeyAttestation 추가). L2는 리스트에 7개뿐이고
  모바일 앱 L2는 GreenCheckmark Android·VWFNDR 단 2개 — 1인 개발사도 달성한 실증이 있으므로
  기술적으로 도달 가능. L2 달성 시 "국내 유일"에서 "아시아 최초 소비자 L2"급 지위.

#### P4. 가격 방어 논리 — "무료 서명" 시대의 과금 근거
마크애니 무상 SDK, ProofSnap 무료+광고, **Adobe 무료 웹앱(확인됨 — 단 귀속 표시용)**,
폰 내장 서명(Pixel 10, 삼성 확대 가능성) 등 "서명 자체"는 빠르게 무료화되는 중.
**과금은 서명이 아니라 '증명 계층'에 세운다** (§3 결론 5요소와 정합):
1. **촬영/업로드 무결성 보증** (attestation + 서버측 이중 해시 검증 — 이미 구현됨.
   Adobe 웹앱은 AI 생성물도 스탬핑 가능 — 이 차이가 핵심 판매 포인트)
2. **기존 사진 + trusted ingredient 체인 보존** — 구조적 공백을 채우는 유일 소비자 서비스
   (폰 내장·캡처 앱은 새 촬영 전용)
3. **공개 검증 링크** (받는 사람이 앱 설치 없이 확인, 소셜 재인코딩 후에도 유효 —
   업계 공인 최대 갭 흡수. 마크애니 SDK·뮤즈블라썸 암호키 파일 방식엔 없는 UX)
4. **보관·재발급** (30일 재드롭 창, 증명서)
5. **법적 증거 패키지** (향후: 신뢰 TSA 타임스탬프 증명서, 법원 소명 대응 리포트 —
   Canon·Sony가 뉴스룸 B2B에서 이미 과금 실증한 계층의 소비자 버전)

**신뢰 서사 소재**: Nikon 사태(서명 위조 취약점 → 전 인증서 폐기, 8개월+ 중단) =
"서명이 있다 ≠ 서명이 신뢰된다". OriPics의 conformance 지위 + trust list 준수 검증이
바로 그 차이라는 메시지.

#### P5. 방어적 모니터링 (분기 1회)
- CPL 신규 등재 중 KR·소비자 셀프서브 모델 감시 (jq 스크립트로 자동화 가능)
- 국내: 스크루AI(C2PA 미구현 주장 추적), 뮤즈블라썸 B2C 확장 여부, 삼성 갤럭시
  Content Credentials의 CPL 등재 여부(등재 시 게임 체인저 — §3에서 상세)
- 해외: Lumid(독일, 유사 컨셉), CertifiedPhotos·ODDR 출시 여부

---

*작성: 2026-07-06, Claude Code 조사 파이프라인 — 공식 CPL JSON 구조 분석 + 병렬 4트랙
(모바일 인증촬영 11종 / 한국 등재사·규제 / 플랫폼형 12종 / 리스트 밖 인접 6종) 완료본.*
