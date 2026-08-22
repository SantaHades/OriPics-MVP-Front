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
- [ ] CSP 도입 — Next 인라인 스크립트·PortOne SDK 충돌 위험이 있어 `report-only`로 관측 후 강제
- [ ] anon 키 로테이션(선택) — RLS 정비 후에는 유출돼도 무해하나 위생 차원
- [ ] Vercel WAF 룰(선택) — 앱 레벨 레이트리밋 위에 엣지 차단 계층 추가
