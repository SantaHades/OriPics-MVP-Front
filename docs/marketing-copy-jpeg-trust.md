# JPEG Trust / C2PA 마케팅 카피 초안

> **작성**: 2026-05-10
> **상태**: 초안 — 본 문구로 바로 배포 전 법무·브랜드 검토 권장
> **사용처 후보**: 랜딩 페이지 hero/섹션, About, 보도자료, 영업 자료

---

## 0. 표현 가능 범위 (정확성 가드)

OriPics가 현 시점(2026-05-10)에 **사실로** 표현해도 되는 것:

| 주장 | 근거 |
|---|---|
| C2PA 표준 매니페스트 첨부 (Standard 티어) | `/api/links/confirm`에서 `c2pa-node` Builder로 첨부, 기능 플래그 OFF는 production 배포 대기 상태일 뿐 코드는 검증됨 |
| ISO/IEC 21617-1 (JPEG Trust Part 1) Trust Report 응답 | `/api/verify`에 `trust_report` 필드 추가 (overall_trust + evidence[]) |
| ISO/IEC 21617-2 (JPEG Trust Part 2) 자동 충족 | Part 2는 C2PA 사양을 그대로 채택 — Standard 티어가 자동 부합 |
| Content Credentials 배지 + 외부 검증 링크 | 링크 페이지에서 `contentcredentials.org/verify`로 위임 |

**아직 표현 불가** (production 활성화 후 가능):
- "모든 OriPics 링크에 Content Credentials가 첨부됩니다" — SSL.com C2PA Certificates 발급 후 production env 활성화 시점부터 사실
- "C2PA Trust List 등재 인증서로 서명됩니다" — 동일

**절대 표현 불가**:
- "ISO/IEC 21617 인증" / "JPEG Trust 인증" — 이 표준에 인증 제도는 없음. **호환** 또는 **준수** 표현만 가능.
- "Part 3 (워터마크) 지원" — 미구현

---

## 1. 짧은 캡션 / 배지 (10~30자)

### KO
- 원본 인증, 국제 표준 호환
- C2PA 표준으로 출처 보존
- ISO/IEC 21617 호환 인증
- JPEG Trust 호환 — 누구나 검증
- 표준 매니페스트 첨부됨

### EN
- Open standard provenance
- C2PA · JPEG Trust compatible
- Verifiable on any tool
- Content Credentials attached

---

## 2. 한 문장 (랜딩 hero 보조)

### KO
- 모든 증명 이미지에 **C2PA 표준 매니페스트**를 첨부합니다. ISO/IEC 21617(JPEG Trust) 호환 검증 리포트를 제공해 어떤 도구로도 출처를 확인할 수 있습니다.
- OriPics는 **Adobe·Microsoft·Sony가 채택한 C2PA 표준**으로 이미지 출처를 보존합니다. 우리 사이트 밖에서도 검증 가능합니다.
- 폐쇄형 인증이 아닌 **열린 국제 표준**(C2PA · JPEG Trust)에 따라 모든 이미지의 출처와 무결성을 기록합니다.

### EN
- Every proof image carries a **C2PA standard manifest**, with an **ISO/IEC 21617 (JPEG Trust)-compatible** verification report — verifiable in any compatible tool.
- OriPics records image provenance using **C2PA**, the open standard adopted by Adobe, Microsoft, and Sony — verifiable outside our platform too.

---

## 3. 한 단락 (About / FAQ 섹션)

### KO

**우리는 폐쇄형 인증이 아닌 국제 표준을 따릅니다.**

OriPics가 발급하는 모든 증명 이미지에는 **C2PA(Coalition for Content Provenance and Authenticity) 표준 매니페스트**가 첨부됩니다. C2PA는 Adobe·Microsoft·Sony·BBC·Intel·Truepic 등이 결성한 국제 컨소시엄이 만든 콘텐츠 출처·무결성 표준이며, ISO/IEC 21617(JPEG Trust) Part 2에 그대로 채택되었습니다.

OriPics 링크 페이지의 검증 응답(`/api/verify`)은 ISO/IEC 21617-1(JPEG Trust Part 1)이 정의하는 **Trust Report 구조**를 따라 (1) 픽셀 무결성 시일 검증 결과 (2) C2PA 매니페스트 검증 결과 (3) 종합 신뢰 등급(`overall_trust`)을 함께 반환합니다.

따라서 사용자는 OriPics 사이트가 사라지더라도 C2PA를 지원하는 어떤 도구(예: [contentcredentials.org/verify](https://contentcredentials.org/verify), Adobe Photoshop, Verify by Truepic)에서도 동일한 출처 정보를 확인할 수 있습니다.

### EN

**We don't run a walled-garden certification — we follow open international standards.**

Every proof image OriPics issues carries a **C2PA (Coalition for Content Provenance and Authenticity) standard manifest**. C2PA is built by an international consortium including Adobe, Microsoft, Sony, BBC, Intel, and Truepic, and was directly adopted as Part 2 of **ISO/IEC 21617 (JPEG Trust)**.

Our verification endpoint follows the **Trust Report structure defined in ISO/IEC 21617-1 (JPEG Trust Part 1)**, returning (1) pixel-integrity seal verification, (2) C2PA manifest validation, and (3) an overall trust level — together in one response.

Even if our site disappears, the provenance is independently verifiable in any C2PA-aware tool: [contentcredentials.org/verify](https://contentcredentials.org/verify), Adobe Photoshop, Verify by Truepic, and others.

---

## 4. B2B / 영업 자료용 한 단락 (압축)

### KO
OriPics는 자체 인증서·자체 뷰어 같은 폐쇄형 솔루션이 아닙니다. 모든 증명 이미지는 **C2PA 표준 매니페스트**(=ISO/IEC 21617 Part 2)를 첨부하고, 검증 API는 **ISO/IEC 21617 Part 1 Trust Report 구조**로 응답합니다. 결과적으로 (1) 외부 도구 호환 (2) 표준 감사 가능 (3) 벤더 락인 없음 — 세 가지를 동시에 충족합니다.

### EN
OriPics avoids walled-garden authentication. Every proof image attaches a **C2PA standard manifest** (= ISO/IEC 21617 Part 2), and our verification API responds in the **ISO/IEC 21617 Part 1 Trust Report shape** — giving you (1) external-tool compatibility, (2) auditability against an ISO standard, and (3) zero vendor lock-in.

---

## 5. 적용 권장 위치

| 위치 | 권장 카피 | 비고 |
|---|---|---|
| 랜딩 hero 보조 문구 | §2 KO 첫 번째 | 메인 CTA 아래 1줄로 |
| About 섹션 | §3 KO 전체 | OriPics가 C2PA·JPEG Trust 호환임을 분명히 |
| FAQ "OriPics가 사라지면 증명은 어떻게 되나요?" 답변 | §3 KO 마지막 단락 | 자주 묻는 질문 |
| 링크 페이지 verified_desc 보강 | §1 KO 캡션 1~2개 | 기존 verified_desc에 한 줄 추가 가능 |
| 영업 1pager · 미디어킷 | §4 KO·EN | B2B 미팅 자료 |
| GitHub README 헤더 | §1 EN 캡션 | 개발자 노출 |

---

## 6. 활성화 타이밍 의존성

§0의 "production 활성화 후 가능" 문구는 **SSL.com C2PA Certificates 발급 + Vercel env 갱신 + `ORIPICS_C2PA_ENABLED=true` 배포** 이후에 표현이 정확해짐.

그 전까지의 가용 표현:
- "곧 출시 — Content Credentials 표준 첨부" (pre-launch teaser)
- "베타 단계: C2PA 매니페스트 자동 첨부" (베타 배지와 함께)

활성화 후:
- 모든 캡션·문구 그대로 사용 가능
- "모든 OriPics 링크" 문구는 활성화 시점 이후 발급분에만 해당하므로 FAQ에 시점 명시 권장 (예: "2026-XX월 X일 이후 발급된 모든 링크")

---

## 7. 법무 검토 권장 항목

1. C2PA / Content Credentials는 CAI(Content Authenticity Initiative)의 등록 상표. 로고/Wordmark 사용 시 가이드라인 준수 필요 — [contentauthenticity.org/brand](https://contentauthenticity.org/brand)
2. ISO 표준 번호(ISO/IEC 21617) 표기는 자유롭게 가능하나 "ISO 인증"으로 오해될 표현 금지
3. "JPEG Trust" 단독 사용 시 JPEG 위원회(ISO/IEC JTC 1/SC 29) 문맥 명시 권장
4. Adobe·Microsoft·Sony 등 이름 인용은 "C2PA 컨소시엄 멤버"임을 함께 명시 (제휴/파트너십 오해 방지)
