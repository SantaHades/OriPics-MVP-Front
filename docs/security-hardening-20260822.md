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

안전했던 것: `links` 테이블·`oripics-proofs` 버킷은 처음부터 RLS + 정책이 올바랐다
(익명 쓰기 시도가 RLS 위반으로 차단됨).

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

-- (2) links: 공개 뷰어용 SELECT 정책만 유지하고 쓰기 권한 회수
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.links FROM anon, authenticated;
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

## 4. 잔여 권고

- [ ] **대표·데모 계정 비밀번호 재설정 + Google 재로그인** — 노출됐던 해시/토큰 무효화
      (실사용자 2명, 외부 접근 정황 없음 → 예방 조치)
- [ ] CSP 도입 — Next 인라인 스크립트·PortOne SDK 충돌 위험이 있어 `report-only`로 관측 후 강제
- [ ] anon 키 로테이션(선택) — RLS 정비 후에는 유출돼도 무해하나 위생 차원
- [ ] Vercel WAF 룰(선택) — 앱 레벨 레이트리밋 위에 엣지 차단 계층 추가
