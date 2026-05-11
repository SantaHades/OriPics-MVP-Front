# Follow-ups — 점검·결정 필요 항목 통합 트래커

> **작성**: 2026-05-10
> **갱신 정책**: 항목 완료 시 표에서 행 삭제 + 본 문서 하단 "변경 이력"에 한 줄 기록.
> **관련 분산 출처**: 본 문서가 통합한다. 산재된 출처는 표 마지막 컬럼에 명시.

---

## 0. 우선순위·발효 시점 범례

| 표기 | 의미 |
|---|---|
| **P0** | Blocker — 다음 단계 진입 전 반드시 해결 |
| **P1** | High — 발효 시점 안 미루면 risk |
| **P2** | Medium — 미루어도 운영 가능, 적절한 시점에 처리 |
| **P3** | Low / Defer — 트리거 도착 시점에 처리 |

| 발효 시점 | 의미 |
|---|---|
| **NOW** | 즉시 처리 가능 / 지연 risk 있음 |
| **SSL.com 회신 후** | 한국시간 2026-05-12 화 오전 예상 |
| **포트원 계약 후** | J-7 본 구현 시점 |
| **모바일 본 시작** | 트랙 D 진입 시점 |
| **베타 직전** | D.3.5 베타 빌드 완성 시점 |
| **앱 심사 직전** | D.3.6 스토어 제출 시점 |
| **B2B 영업 시작** | Business 티어 활성화 시점 |
| **언젠가** | 트리거 미정 |

| 담당 | 의미 |
|---|---|
| **User** | 사용자(SantaHades 대표)가 결정·실행 |
| **AI** | AI 어시스턴트가 코드/문서로 처리 |
| **Both** | 사용자 결정 + AI 실행 |

---

## 1. 사용자 결정 필요 (User)

### 1.1 외부 의존성 대기

| ID | 항목 | 시점 | 의존성 | P |
|---|---|---|---|---|
| U-1 | SSL.com C2PA Certificates 영업팀 회신 8개 질문 답변 | NOW | 회신 도착 | P0 |
| U-2 | Google Play Console 신원확인 완료 | NOW | 1~3일 자연 진행 | P1 |
| U-3 | Porkbun Tucker (Change of Registrant) 최종 회신 | NOW | 형식 확인용 | P3 |
| U-4 | D-U-N-S Number 발급 (선택) | 언젠가 | 검증 가속용 | P3 |

### 1.2 가격·정책 결정 (SSL.com 비용 응답 후)

| ID | 항목 | 시점 | 출처 | P |
|---|---|---|---|---|
| U-5 | SSL.com 정확한 월 비용 확인 → 손익분기 갱신 | SSL.com 회신 후 | [pricing-policy §7](pricing-policy.md) | P1 |
| U-6 | 글로벌 USD 가격 확정 ($7.99/Pro 잠정) | 베타 직전 | [pricing-policy §7](pricing-policy.md) | P2 |
| U-7 | 연간 결제 환불 정책 (한국 7일 청약철회) | 포트원 계약 후 | [pricing-policy §7](pricing-policy.md) | P1 |
| U-8 | B2B 인보이스 부가세 표기 정책 | B2B 영업 시작 | [pricing-policy §7](pricing-policy.md) | P2 |

### 1.3 법무·문서 결정

| ID | 항목 | 시점 | 출처 | P |
|---|---|---|---|---|
| U-10 | 개인정보 처리방침 법무 검토 (국외 이전·아동 연령 기준) | 모바일 본 시작 | [privacy/page.tsx](../src/app/[locale]/privacy/page.tsx) | P1 |
| U-11 | 마케팅 카피의 CAI 로고/Wordmark 가이드라인 검토 | 마케팅 자료 발행 전 | [marketing-copy §7](marketing-copy-jpeg-trust.md) | P2 |
| U-12 | "JPEG Trust" 단독 사용 시 위원회 문맥 명시 검토 | 동일 | 동일 | P2 |
| U-13 | 이용약관 §10·§11 (유료 서비스·환불) 갱신 | 포트원 계약 후 | [/terms](../src/app/[locale]/terms/page.tsx) §10·§11 placeholder | P1 |

### 1.4 앱스토어 메타데이터 (베타~심사 직전)

| ID | 항목 | 시점 | P |
|---|---|---|---|
| U-14 | 연령 등급 결정 (Apple 4+ vs 12+ — GPS 사용 검토) | 앱 심사 직전 | P1 |
| U-15 | English keywords 길이 조정 (107 → 100자) | 앱 심사 직전 | P1 |
| U-16 | 앱 아이콘 디자인 (1024×1024 + 512×512) | 모바일 본 시작 | P0 |
| U-17 | Feature graphic 디자인 (1024×500, Google) | 베타 직전 | P0 |
| U-18 | 스크린샷 캡처 (베타 빌드 완성 후) | 베타 직전 | P0 |
| U-19 | Promo video 제작 (선택) | 베타 직전 | P3 |
| U-20 | Apple Privacy Label 입력 (App Store Connect) | 앱 심사 직전 | P0 |
| U-21 | Google Data Safety Form 입력 (Play Console) | 앱 심사 직전 | P0 |
| U-22 | 카테고리 검토 (Photo & Video vs Utilities — 검색 노출) | 앱 심사 직전 | P2 |
| U-23 | What's New 카피 매 버전 갱신 (출시 후 지속) | 매 버전 | P3 |

> 출처: [app-store-metadata.md §5](app-store-metadata.md)

### 1.5 외부 가입·계약

| ID | 항목 | 시점 | 의존성 | P |
|---|---|---|---|---|
| U-24 | 포트원(PortOne) 가입 + 사업자 KYC | 베타 직전 | 사업자등록증 (보유) | P1 |
| U-25 | 토스페이먼츠(또는 KG이니시스) PG 직계약 | 포트원 계약 후 | 포트원 가입 | P1 |
| U-26 | 카카오페이·토스페이 간편결제 추가 (포트원 통합) | 포트원 계약 후 | PG 계약 | P1 |
| U-27 | CAI(Content Authenticity Initiative) 무료 멤버십 가입 | NOW | 없음 | P3 |

### 1.6 인프라 (Vercel)

| ID | 항목 | 시점 | 의존성 | P |
|---|---|---|---|---|
| U-28 | Vercel env 갱신 — eSigner CSC API 자격증명 5개 | SSL.com 회신 후 | SSL.com 응답 | P0 |
| U-29 | Preview에 `ORIPICS_C2PA_ENABLED=true` + dev cert 사전 검증 | NOW | Vercel 대시보드 | P2 |
| U-30 | Vercel env 갱신 — `ORIPICS_ATTEST_SECRET` (선택, 없으면 JWT_SECRET 재사용) | 모바일 본 시작 | 없음 | P2 |

---

## 2. AI 코드 작업 잔여 (AI)

### 2.1 라이브러리 stub → 본 구현

| ID | 항목 | 위치 | 트리거 | P |
|---|---|---|---|---|
| A-1 | 포트원 어댑터 본 구현 (J-7) | [lib/payment/portone.ts](../src/lib/payment/portone.ts) | U-24~26 완료 | P0 |
| A-2 | C2PA 본 통합 — eSigner CSC API 호출로 LocalSigner 교체 | [lib/oripics-stamp/c2pa.ts](../src/lib/oripics-stamp/c2pa.ts) | U-28 완료 | P0 |
| A-3 | Stripe 어댑터 본 구현 (Phase 2) | [lib/payment/stripe.ts](../src/lib/payment/stripe.ts) | 글로벌 사용자 5%+ | P3 |
| A-4 | iOS App Attest 토큰 검증 본 구현 (D-pre-5) | [lib/attest/verifyToken.ts](../src/lib/attest/verifyToken.ts) | Apple Developer 설정 | P1 |
| A-5 | Android Play Integrity 토큰 검증 본 구현 (D-pre-5) | 동일 | U-2 완료 | P1 |

### 2.2 기능 추가 (J 트랙)

| ID | 항목 | 트리거 | P |
|---|---|---|---|
| A-6 | J-7 결제 webhook 처리 + 구독 lifecycle | A-1 완료 후 | P0 |
| A-7 | J-8 영구 보관 라이프사이클 + 다운그레이드 30일 grace | A-1 완료 후 | P1 |
| A-8 | J-9 증명서 PDF 발급 (react-pdf 또는 puppeteer-core) | NOW | P2 |

### 2.3 모바일·모노레포

| ID | 항목 | 트리거 | P |
|---|---|---|---|
| A-9 | 트랙 B Phase 2~7 모노레포 추출 (`packages/stamp/`) | 모바일 본 시작 | P1 |
| A-10 | 모바일 앱 본 개발 (트랙 D, 8~10주) | A-9 + U-2·U-16 완료 | P0 |
| A-11 | 모바일용 stamp 클라이언트 인터페이스 (Verified mode) | 모바일 본 시작 | P1 |

### 2.4 테스트 보강

| ID | 항목 | 트리거 | P |
|---|---|---|---|
| A-12 | Prisma 의존 헬퍼 단위 테스트 (consumeCredits·refundCredits·grantSignupCredits) — DB mock 셋업 | 베타 직전 | P2 |
| A-13 | API route handler 통합 테스트 (Next.js test setup) | 베타 직전 | P2 |
| A-14 | C2PA 본 통합 e2e 회귀 테스트 (Reader round-trip) | A-2 완료 후 | P2 |

### 2.5 정리·기술부채

| ID | 항목 | 트리거 | P |
|---|---|---|---|
| A-15 | PoC 라우트 `/api/c2pa-poc/*` 제거 | A-2 + production 검증 후 | P3 |
| A-16 | todo.md 갱신 (구버전 — Free 30 크레딧 → 10, 비로그인 정책 등) | NOW | P3 |
| A-17 | Next.js 14 → 15 major upgrade (Server Components DoS 2건 해결) | 별도 트랙 | P3 |
| A-18 | next-auth v5 마이그레이션 (nodemailer Low advisory 해소) | 별도 트랙 | P3 |
| A-19 | SOC 2 시작 | 첫 B2B 미팅 시점 | P3 |

---

## 3. 결정 의존 트리

```
SSL.com 회신 (U-1)
  ├── U-5 손익분기 갱신
  ├── U-28 Vercel env 갱신
  └── A-2 C2PA 본 통합
       └── A-15 PoC 라우트 제거

포트원 가입 (U-24)
  ├── U-25 PG 계약
  │    └── U-26 간편결제 추가
  │         └── A-1 포트원 어댑터 본 구현
  │              ├── A-6 J-7 webhook + lifecycle
  │              └── A-7 J-8 영구 보관
  └── U-7 환불 정책

모바일 본 시작
  ├── U-9·U-10 privacy 책임자/법무
  ├── U-16 앱 아이콘
  ├── A-9 모노레포 추출
  ├── A-11 stamp 클라이언트 인터페이스
  └── A-10 모바일 앱 본 개발 (D)
       ├── A-4·A-5 attest 본 구현 (D-pre-5)
       ├── 베타 직전 (U-17·U-18·U-24)
       └── 앱 심사 (U-14·U-15·U-20·U-21)
```

---

## 4. 분산된 원본 출처 (참고)

본 문서가 통합한 항목들의 원본 위치 — 항목 갱신 시 원본도 함께 갱신:

| 출처 | 다루는 영역 |
|---|---|
| `~/.claude/projects/.../memory/current_phase.md` | 외부 의존성 대기 + 옵션 작업 큰 그림 |
| `~/.claude/projects/.../memory/c2pa_esigner_integration.md` | eSigner 본 구현 시 빈 칸 채울 9개 항목 |
| [pricing-policy.md §7](pricing-policy.md) | 가격·환불·게이트웨이 잔여 변수 |
| [app-store-metadata.md §5](app-store-metadata.md) | 앱스토어 발효 전 결정 10개 |
| [marketing-copy-jpeg-trust.md §7](marketing-copy-jpeg-trust.md) | 법무 검토 권장 항목 |
| [privacy/page.tsx](../src/app/[locale]/privacy/page.tsx) | 책임자 성명·법무 검토 placeholder |
| `lib/{attest/verifyToken,payment/portone,payment/stripe}.ts` | NotImplementedError stub 3개 |
| 루트 [todo.md](../../../todo.md) | 사용자 작성 구버전 — 일부 superseded |

---

## 5. 변경 이력

| 일자 | 변경 |
|---|---|
| 2026-05-10 | 최초 작성 — 30 사용자 항목 + 19 AI 항목 통합. 의존 트리·원본 출처 매핑 |
| 2026-05-11 | U-13 이용약관 골격 완성 (KO/EN, KCC 표준약관 16개 조항). §10·§11(유료 서비스·환불)은 J-7 시점 갱신 필요로 축소 |
| 2026-05-11 | U-9 개인정보 보호 책임자 성명 확정 (대표이사 손용석). 행 제거 |
