# 원데이 패스 (A-60) — 설계 문서

> 2026-08-31 대표 정책 확정분 반영. 포트원 사전 협의(portone-oneday-pass-inquiry.md)
> 회신 전에는 Phase 1(결제 무관 코어)까지만 구현한다.

## 1. 확정 정책 (2026-08-31 대표)

| 항목 | 정책 |
|---|---|
| 가격 | **3,300원 (VAT 포함)** — 소비자 표시가 그대로 3,300원 (2026-08-31 대표 확정) |
| 내용 | 사이즈 무관 촬영 인증 10회 + 인증서 PDF, 등록 후 24시간 |
| 구매/등록 자격 | 로그인만 하면 가능 (free 포함). 구매자≠등록자 가능(선물) |
| Verified | Pro와 동일하게 포함 — 패스 활성 중 free여도 verified 촬영 허용 |
| 공개링크 보관 | **발행 시점부터 1년 고정** (expires_at=발행+365일) — 사고 증거 등 용도라 확정 기간 고지 (8/31 대표: 초안의 "Pro 동일 37일 유예"는 너무 짧아 폐기). 1년 경과분은 cleanup cron 자연 삭제. Pro 구독 전환 시 기존 규칙대로 무기한 |
| 보관소 | **전용 보관소 없음** — 기존 보관함(같은 버킷·links)을 공유하고 기존 5GB 쿼터 체크를 패스 활성 사용자에게도 동일 적용. 별도 1GB 인프라·초과분 애드온은 만들지 않음 (기획 원안의 "전용 1GB"는 폐기, 대표 8/31 재검토 지시) |
| 차감 규칙 | 등록 직후~24시간 내 **촬영(P/C 경로) 인증은 무조건 패스 1건씩 차감** (크레딧·티어 불문 패스 우선). 사이즈 배수 무시 |
| 자동 발행 | 셔터 → 공개링크 생성 + 인증서 PDF 생성까지 백그라운드 자동 |
| 동시 등록 | 계정당 활성 패스 1장. 소진(10회 사용 또는 24h 경과) 즉시 새 패스 등록 가능 |
| 표시 | 앱 홈탭·웹 프로필 내 계정 정보에 등록된 패스 번호+등록하기 버튼. 목록탭 카드·웹 최근 내역·공개링크 목록에 "패스" 태그 |

### 확정 대기 (기본값으로 진행, 대표 veto 가능)

1. **패스 발행분 인증서 PDF는 패스에 포함(차감 0)** — Pro 규칙(월 무료 5회
   `FREE_PDF_PER_CYCLE=5` + 이후 CERTIFICATE_PDF 10크레딧)을 그대로 적용하면 자동 PDF
   10장 중 6장째부터 크레딧 차감이 필요한데 free 패스 사용자는 크레딧이 없어 성립 불가.
   자동 생성이 확정 정책이므로 패스 링크의 PDF는 무조건 무료로 정의. 재발급은 기존 캐시 경로라 원래 무료.
2. **소진/만료 후 폴백** — 활성 패스가 없으면 기존 크레딧 플로우로 자연 폴백.
3. **웹 업로드(F 경로)는 패스 차감 대상 아님** — "촬영하는 사진" 문언대로 P/C 전용.
   패스 활성 중 웹 업로드는 기존 크레딧 차감.
4. **미등록 코드 유효기간 1년** (심사 리스크 완화 권장안).
5. Pro 구독자가 패스를 등록해도 촬영은 패스 우선 차감 ("무조건" 문언).

## 2. 데이터 모델

```prisma
model DayPass {
  id            String    @id @default(cuid())
  code          String    @unique   // 등록 코드. crypto 랜덤 (형식 §3.1)
  status        String    @default("issued") // issued|redeemed|exhausted|expired|revoked
  purchaserId   String?   // 구매 계정 (어드민 발급 시 null)
  redeemerId    String?   // 등록 계정
  issuedAt      DateTime  @default(now())
  codeExpiresAt DateTime  // 미등록 유효기간 (issuedAt + 1년)
  redeemedAt    DateTime?
  expiresAt     DateTime? // redeemedAt + 24h
  totalProofs   Int       @default(10)
  usedProofs    Int       @default(0)
  paymentId     String?   // PortOne paymentId (Phase 3)
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt
}
```

- **동시 1장 강제**: Postgres partial unique index (raw migration, db_migrations)
  `CREATE UNIQUE INDEX day_pass_one_active ON "DayPass"("redeemerId") WHERE status = 'redeemed';`
  redeem 시 INSERT/UPDATE가 인덱스 위반이면 409. 상태 전이(redeemed→exhausted/expired)는
  차감·등록·조회 시점 lazy — 링크 보관이 1년 고정이라 별도 cron 스윕 불필요.
- **links.pass_id** (nullable, Supabase links 테이블) — 공개링크 목록·뷰어 태그용.
- **ProofHistory.passId** (nullable) — 앱 목록탭 카드 태그용.
- **CreditTransaction**에 amount=0, action="day_pass_proof", metadata={pass_id, link_id}
  기록 — 웹 프로필 최근 내역에 "패스 사용" 표시가 기존 화면 로직으로 자연 노출.

## 3. API / 파이프라인 통합

### 3.1 신규 API
- `POST /api/pass/redeem` `{code}` — 원자적 등록. 레이트리밋 필수(코드 브루트포스 방어),
  코드 형식은 `OP-` + crypto 랜덤 base32 12자(~60bit) 권장. 활성 패스 존재 시 409.
- `GET /api/pass/active` — 홈탭/프로필용: {code_masked, remaining, expires_at}.
- 어드민 발급 스크립트 `scripts/admin-issue-daypass.ts` (Phase 1 테스트·베타 선물용).

### 3.2 기존 라우트 분기
- **sign**: upload_type P/C + 활성 패스 → ①크레딧 잔액 검사 생략 ②verified의
  Pro 티어 요구 우회(패스=Pro 동급) ③sign JWT에 pass_id 포함.
- **confirm**: pass_id 있으면 consumeCredits 대신 패스 원자 차감
  (`UPDATE ... SET usedProofs=usedProofs+1 WHERE id=? AND usedProofs<totalProofs AND expiresAt>now()`),
  실패 시 402 pass_exhausted → 클라이언트는 크레딧 플로우 폴백 or 안내.
- **publish**: pass_id 링크는 LINK_CREATE 차감 생략, expires_at=발행+365일(1년 고정,
  유료 티어면 null), links.pass_id 기록. 쿼터는 기존 5GB 체크에 패스 발행 포함.
- **certificate**: 패스 링크는 tier_required·크레딧 차감 생략(§1 확정 대기 1).
- **cron**: 추가 작업 없음 — 1년 경과 링크는 기존 cleanup cron이 자연 삭제.

### 3.3 모바일 (빌드 10+)
- 코드 등록 화면(홈탭 진입) — ⚠️ 앱 내 "구매" 버튼·웹 구매 유도 문구 금지(iOS 3.1.1).
  등록·사용만. 판매는 웹 전용.
- 패스 모드 촬영: 셔터 → 기존 publishFlow 큐로 sign→upload→confirm→publish 자동 진행
  + publish 성공 후 certificate GET을 fire-and-forget으로 호출해 PDF 캐시 워밍.
  촬영 즉시 공개 URL이 생기므로 패스 모드 첫 진입 시 1회 고지(§4-5).
- 홈탭 패스 카드: 코드(마스킹)·잔여 횟수·남은 시간 카운트다운 + 등록하기 버튼.
- 목록탭 카드 "패스" 태그 (ProofHistory.passId).

### 3.4 웹
- 프로필 내 계정 정보: 패스 상태·번호 + 등록하기 버튼. 최근 내역 "패스 사용" 행.
- 공개링크 목록 "패스" 태그.
- 구매 페이지 + 선물 링크 랜딩(`/pass/{code}` — 코드 등록 유도, 앱 딥링크,
  **QR 이미지 제공**: 기존 qrcode 패키지 재사용, 스캔 시 등록 화면에 코드 자동 입력) —
  Phase 3(포트원 회신 후). 앱 등록 화면에는 코드 직접 입력 + QR 스캔 옵션(Phase 2).

## 4. 구현 전 남은 결정·주의 (대표 확인)

1. 자동 공개링크 생성 고지: 패스 모드에선 촬영 즉시 공개 URL 생성 — 첫 사용 시 안내 문구 확정 필요.
2. 1인/1회 구매 수량 제한 여부 (상품권 리스크 완화 — 예: 1회 최대 5매).
3. 24h 만료 임박 알림: 푸시 인프라 부재(A-58과 동일) — 앱 내 카운트다운 표시만으로 시작.
4. 포트원 회신 전 Phase 3(결제·판매 페이지) 착수 금지 (A-60 심사 분석).

## 5. 단계

- **Phase 1 (지금)**: DB(DayPass·pass_id 컬럼·partial index) → redeem/active API +
  어드민 발급 → sign/confirm/publish/certificate 분기. e2e는 어드민 발급 코드로.
- **Phase 2**: 모바일 등록·자동발행·홈탭/목록 + 웹 프로필/목록 표시.
- **Phase 3 (포트원 회신 후)**: 단건 결제 → 코드 발급 → 선물 링크. 약관·환불 문구.
