# 보안 점검·조치 기록 (2026-08-22)

> 오픈 직전 Supabase 저수준 보안 점검에서 **CRITICAL 취약점 발견 → 당일 차단 완료**.
> DB 측 조치는 코드에 남지 않으므로(대시보드/SQL 직접 적용) 이 문서가 재현·감사 기록.

## 1. 발견: 공개 anon 키로 DB 전체 노출 (CRITICAL)

`NEXT_PUBLIC_SUPABASE_ANON_KEY`는 브라우저 번들에 노출되는 공개 키인데(www.ori.pics 실측),
Prisma가 생성한 테이블에 **RLS 미적용 + anon/authenticated 전체 CRUD 권한**이 남아 있었다.
Supabase는 이 조합에서 PostgREST(`/rest/v1/*`)로 테이블을 그대로 노출한다.

프로덕션 실측 결과(조치 전 → 조치 후):

| 공격 | 전 | 후 |
|---|---|---|
| `GET /rest/v1/User` — 이메일 + **비밀번호 해시** + 크레딧 | 200 유출 | 401 |
| `GET /rest/v1/Account` — **OAuth access/refresh/id_token** | 200 유출 | 401 |
| `GET /rest/v1/CreditTransaction` — 전 결제·크레딧 내역 | 200 유출 | 401 |
| `PATCH /rest/v1/User` — **크레딧 임의 조작** | 204 성공 | 401 |
| avatars 버킷 익명 업로드 / 타인 파일 삭제 | 200 성공 | 400 |
| `GET /rest/v1/links?select=*` — **전 사용자 인증 목록·GPS·user_id 열거** | 200 유출(21건) | 401 |

안전했던 것: `oripics-proofs` 버킷은 처음부터 RLS + 정책이 올바랐다(익명 쓰기 RLS 위반으로 차단).
`links`는 RLS는 켜져 있었으나 `public_read` 정책이 행 전체를 허용해 **열거가 가능**했다 —
"링크를 아는 사람만 본다"는 전제가 깨지는 프라이버시 이슈(별도 조치, 아래 3.)

## 2. 적용한 DB 조치 (SQL)

앱은 Prisma가 `postgres` role(`rolbypassrls=true`, 테이블 owner)로 접속하므로 **RLS 적용에도 무영향**.
검증: 홈·로그인·공개 뷰어·API 인증 게이트 정상, 공개 이미지 읽기 정상.

```sql
-- (1) Prisma 테이블: RLS 활성화(정책 없음 = 기본 거부) + 권한 회수
--     User, Account, Session, VerificationToken, PasswordResetToken,
--     ProofHistory, CreditTransaction, Subscription
ALTER TABLE public."<T>" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."<T>" FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public."<T>" FROM anon, authenticated;

-- (2) links: 1차로 쓰기만 회수했으나, 남은 anon SELECT가 **전체 열거**를 허용해
--     (?select=* → 전 사용자 인증 목록 + GPS + user_id) 뷰어를 서버 API로 옮긴 뒤 전면 회수.
REVOKE ALL ON public.links FROM anon, authenticated;
DROP POLICY IF EXISTS public_read ON public.links;
REVOKE ALL ON public.link_counter FROM anon, authenticated;

-- (3) 향후 생성 테이블 기본 차단 (같은 실수 재발 방지)
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;

-- (4) avatars 버킷: "Public Access"(ALL, bucket_id만 검사) 등 익명 쓰기 정책 제거 → 읽기 전용
DROP POLICY IF EXISTS "Public Access" ON storage.objects;             -- + anon INSERT/UPDATE/DELETE 정책 4종
CREATE POLICY "avatars public read" ON storage.objects FOR SELECT USING (bucket_id = 'avatars');
```

**신규 테이블을 만들 때 체크리스트**: `ENABLE/FORCE RLS` + `REVOKE ALL FROM anon, authenticated`.
(`rate_limits` 생성 시 즉시 적용함.)

## 3. 코드 조치

- `f098ec4` 아바타 업로드 서버 경유 전환 — `/api/profile/avatar`(세션 인증 + 서비스 키,
  경로를 `userId.<ext>`로 고정해 타인 덮어쓰기 차단, MIME 화이트리스트 + 2MB). 브라우저의
  anon 직접 업로드 제거.
- `494ebba` 공개 뷰어 서버 API 전환 — `GET /api/links/[id]/public`(단건 조회, 만료 판정 서버,
  `user_id` 대신 `is_owner`만 반환). 뷰어의 anon 직접 조회 제거 → `lib/supabase.ts`(anon 클라이언트) 삭제.
  이로써 **앱 내 anon 키 사용처 0**.
- `423215b` 레이트리밋 + 보안 헤더:
  - `lib/security/rateLimit.ts` — Postgres fixed-window(원자 UPSERT). 서버리스 in-memory 무효,
    Redis/KV 의존성 없음. **fail-open**(DB 장애가 로그인 차단으로 번지지 않게).
  - 적용: 웹/모바일 로그인 IP+이메일 10회/10분, 회원가입·비밀번호 재설정 IP 5회/1h,
    인증코드 발송 IP 10회/1h. 429 + `Retry-After`.
  - 헤더: `X-Content-Type-Options`, `X-Frame-Options(SAMEORIGIN)`, `Referrer-Policy`,
    `Permissions-Policy(camera/mic/geolocation 전면 차단 — 웹 촬영 제거로 불필요)`,
    `/api/*`는 `Cache-Control: no-store` + `X-Robots-Tag: noindex`.
  - `cleanup` cron이 `rate_limits` 24h 경과분 정리.

프로덕션 실측: 비밀번호 재설정 6회째 429, 모바일 로그인 11회째 429, 헤더 전부 반영 확인.
links 열거 401 차단 + 뷰어/홈/이미지 정상(회귀 없음) 확인.

**RLS만으로는 열거를 막을 수 없다**: 정책은 행 조건만 표현하고 필터는 클라이언트가 정하므로,
"특정 ID 조회만 허용"은 서버 경유로만 구현된다. 공개 데이터라도 목록화가 문제면 API를 둘 것.

## 4. 잔여 권고

- [ ] **대표·데모 계정 비밀번호 재설정 + Google 재로그인** — 노출됐던 해시/토큰 무효화
      (실사용자 2명, 외부 접근 정황 없음 → 예방 조치)
- [x] CSP 도입 — `report-only`로 도입(§5 L-7). 위반 관측 후 강제(Content-Security-Policy) 승격 남음
- [ ] anon 키 로테이션(선택) — RLS 정비 후에는 유출돼도 무해하나 위생 차원
- [ ] Vercel WAF 룰(선택) — 앱 레벨 레이트리밋 위에 엣지 차단 계층 추가

## 5. 애플리케이션 계층 재점검·조치 (2026-08-22, 2차)

1차(저수준 DB/스토리지)는 견고함을 실측 확인. 이어 API 라우트 전수 코드감사에서
결제·인증 계층의 HIGH급 결함을 발견 → 당일 코드로 조치(타입체크·테스트 118·빌드 통과).

### HIGH
- **H-1 결제 위조** — `complete`가 결제 소유권을 확인하지 않고, 멱등 체크가 `(userId,paymentId)`
  스코프라 남의 paymentId로 자기 계정을 Pro 승격 가능. 빌링키 라우트는 타인 billingKey를
  받아 타인 카드로 결제 가능.
  → `lib/payment/subscriptionGrant.ts`: `payment.customData.userId`가 호출자와 불일치하면
  `ownership_mismatch`(403). 빌링키 최초 구독 경로는 `verifyOwnership:true`로 billingKey의
  `customData.userId` 대조 + 타 사용자 DB 바인딩 충돌 시 `billing_key_not_owned`(403).
  (cron 갱신은 서버가 DB에서 고른 신뢰 키라 소유권 검증 생략.)
- **H-2 크론 fail-open** — `if (CRON_SECRET){…}` 구조라 시크릿 미설정 시 익명 GET 노출.
  → `lib/security/cron.ts` `assertCron()`: 시크릿 없으면 **503**, `timingSafeEqual`로 상수시간
  비교. cleanup·renew-credits·charge-subscriptions 3종 적용. **운영: CRON_SECRET 필수(O-1).**
- **H-3 무제한·무료 서명** — `/api/sign` 레이트리밋 없음 + 전역 일일 카운터 소진(전 사용자
  서명 차단) + 고아 signed-url 남발. → `RATE_LIMITS.sign`(사용자 120/시간) 적용.

### MEDIUM / LOW
- **M-1** attest 미설정 시 fail-open → `ALLOW_UNVERIFIED_ATTEST=true` 옵트인일 때만 개발폴백,
  운영은 503(`verified_not_available`). **운영: attest env 또는 옵트인 결정(O-2).**
- **M-2** `/api/c2pa-poc`·`/api/c2pa-poc/sign` 삭제(무인증 프로덕션 키 서명·스택 노출).
- **M-3** `/api/proof/history` POST에 링크 소유권 검증(`links` 조인) + 썸네일 200,000자 상한.
  (클라이언트 POST 호출자 없음 확인 — 회귀 없음.)
- **M-4** 비밀번호 변경 시 현재 비밀번호 재인증 + 최소 6자. 프로필 UI에 현재비번 입력 추가.
  `reset-password`에도 최소 길이. (`user/update`, `auth/reset-password`, profile 페이지+i18n)
- **M-5** 계정 열거 차단 — `forgot-password` 항상 동일 성공응답, 로그인 오류 `CredentialsSignin`
  통일(`authOptions.ts`).
- **M-6** 인증코드 `Math.random()` → `crypto.randomInt`.
- **L-1** `/api/links/confirm` 세션 검증(세션 userId == JWT user_id) 추가.
- **L-2** `clientIp()` XFF 맨앞(스푸핑 가능) 대신 `x-vercel-forwarded-for`/`x-real-ip` 우선.
- **L-7** CSP **report-only** 도입(`frame-ancestors 'self'` 포함) — 관측 후 강제 승격 예정.

### 감사에서 clean 확인(조치 불요)
PortOne 웹훅 서명검증·금액 서버검증, Apple IAP 체인검증, 모바일 JWT(alg 혼동 방지·
timingSafeEqual), 대부분 라우트 소유권 스코프, publish 무결성 재검증, SQL 인젝션·SSRF 없음,
서버/클라이언트 env 분리, 시크릿 커밋 이력 없음.

### 인프라·위생 (별도 조치)
- `.gitignore` 3종(root/web/mobile): `.env`만 무시 → `.env.*`(+`!.env.example`)·`*.pem`·
  `*.key`·`*.p12`·`*.p8`·service-account/google-services JSON 추가. `git check-ignore` 검증.
- `.claude/settings.json` 신규: 프로젝트 허용/거부 규칙(.env 읽기·`git push`·`rm -rf` deny 포함).
