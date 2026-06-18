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
| U-7 | ~~연간 결제 환불 정책 (한국 7일 청약철회)~~ → [/terms §11](../src/app/[locale]/terms/page.tsx) 본문에 반영 완료 (2026-05-12). PG 본계약 시 환불 수수료 수치 최종 검증 필요. | 포트원 계약 후 | [pricing-policy §7](pricing-policy.md) | P2 |
| U-8 | B2B 인보이스 부가세 표기 정책 | B2B 영업 시작 | [pricing-policy §7](pricing-policy.md) | P2 |

### 1.3 법무·문서 결정

| ID | 항목 | 시점 | 출처 | P |
|---|---|---|---|---|
| U-10 | 개인정보 처리방침 법무 검토 (국외 이전·아동 연령 기준) | 모바일 본 시작 | [privacy/page.tsx](../src/app/[locale]/privacy/page.tsx) | P1 |
| U-11 | 마케팅 카피의 CAI 로고/Wordmark 가이드라인 검토 | 마케팅 자료 발행 전 | [marketing-copy §7](marketing-copy-jpeg-trust.md) | P2 |
| U-12 | "JPEG Trust" 단독 사용 시 위원회 문맥 명시 검토 | 동일 | 동일 | P2 |
| U-13 | ~~이용약관 §10·§11 (유료 서비스·환불) 갱신~~ → 토스페이먼츠 가입 신청용 초안 작성 완료 (2026-05-12). PG 본계약 후 실제 환불 수수료·결제 수단 목록을 반영하여 재검토. | 포트원 계약 후 | [/terms](../src/app/[locale]/terms/page.tsx) §10·§11 | P2 |

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
| A-6 | J-7 결제 webhook 처리 + 구독 lifecycle (subscription_grant 충전 포함) | A-1 완료 후 | P0 |
| A-7 | J-8 영구 보관 라이프사이클 + 다운그레이드 30일 grace | A-1 완료 후 | P1 |
| A-8 | ~~J-9 증명서 PDF 발급~~ → 1차 구현 완료 (2026-05-13). [lib/certificate/render.tsx](../src/lib/certificate/render.tsx) + [GET /api/links/[id]/certificate](../src/app/api/links/[id]/certificate/route.ts). 트레이드오프는 A-23·A-24·A-25 참조 | DONE | — |
| A-20 | **매월 크레딧 자동 갱신** — `creditsRenewAt` 도래 시 Free 10 / Pro 1000 / Business 10000 충전(`monthly_renewal`). Vercel Cron(daily) 또는 NextAuth session callback에서 lazy refresh. **갭: 미구현 시 1개월 후 모든 사용자가 0크레딧으로 멈춤** | 베타 시작 전 | P1 |
| A-21 | 어드민 크레딧 조정 UI/API — CS 대응(환불·보너스). 권한 가드 + `manual_adjust` 트랜잭션 기록 | 베타 운영 중 | P2 |
| A-22 | **익명 메시지 전송 기능 구현 — say2you와 연계 검토** — 메타 V4의 link_id로 검증자가 원본 등록자에게 익명 메시지 송수신. 등록자 통제 하에 답신 시점에만 이메일 노출. 이메일을 메타에 직박하는 대안의 안전 우회 경로 (개보법·GDPR·스팸 risk 회피) | 베타 후 | P3 |
| A-23 | **증명서 PDF — 한글 폰트 번들링** — 현재 Google gstatic Noto Sans KR CDN URL 하드코딩([render.tsx](../src/lib/certificate/render.tsx)). URL이 깨지면 한글이 □ 박스로 렌더됨. 대안: postinstall에서 폰트 다운로드 → `public/fonts/`(gitignored) → fs.readFileSync로 로드. 또는 jsdelivr npm CDN(Pretendard) 사용 | 베타 시작 전 또는 폰트 깨짐 감지 시 | P1 |
| A-24 | **증명서 PDF — 월 5건 캡 enforcement** — pricing-policy.md상 Pro 월 5건, Business 무제한. 현재는 `pdf_issue` 이력만 기록하고 무제한 발급 허용. `creditsRenewAt - 1 month` 기준으로 카운트 → Pro 5건 초과 시 402 응답 + 잔여 횟수 UI 표시 | Pro 결제 시작 후 | P2 |
| A-25 | **증명서 PDF — 사진 썸네일 임베드** — 현재 PDF에 실제 이미지는 미포함, QR로 검증 URL 참조만. 사진을 PDF 본문에 직접 임베드하면 B2B/소송 제출 시 단독 문서로 가치 상승. 단 음란물·저작권 침해 이미지 임베드 위험 → 신고 시스템 + 모더레이션 게이트 필요 | 첫 B2B 영업 미팅 시점 | P3 |
| A-26 | **`/api/links/publish` 마무리 단계 진행 표시** — 업로드(PUT) 진행률은 XHR onprogress로 실측 가능하나, publish 단계(C2PA 매니페스트 첨부·Storage 재업로드·DB write 등)는 단일 요청이라 진행률 측정 불가. SSL.com eSigner 본 통합 후 서명 호출이 추가되면 publish 응답이 1~3s 길어짐 → "마무리 중" stage 라벨만이라도 추가하여 사용자 체감 개선. SSE/streaming 응답까지 가면 더 정확하지만 비용 큼. (2026-05-17 라우트명 변경: `confirm` → `publish`) | A-2(C2PA 본 통합) 후 | P2 |
| A-27 | **클라이언트 stego embed 진행률** — 200MP 이미지에서 LSB 임베드 루프가 ~500ms 동기 실행됨. setTimeout/requestIdleCallback로 chunked 처리하여 진행률 콜백 노출 가능. 1800px 이하에선 의미 없지만 기가픽셀 이미지에서 체감 개선 | 기가픽셀 사용 사례 발생 시 | P3 |
| A-28 | **업로드 취소 버튼** — `handleCreateLink`/멀티 publish 진행 중 사용자 취소 (`xhr.abort()`). 큰 PNG 업로드 중간에 마음 바뀌면 새로고침 외 방법 없음 → cancel 버튼 + 진행 중 abort + 크레딧 환불(인증 차감은 이미 confirm에서 일어났으므로 publish 시 abort하면 LINK_CREATE만 환불) | 베타 직전 | P2 |
| A-29 | ~~c2pasign.com sandbox cert로 Preview C2PA PoC 검증~~ → 완료 (2026-05-14). 진행 중 **중요 버그 발견·수정**: `builder.sign()`은 매니페스트 box(JUMBF)를 반환값으로 돌려주고, 실제 서명된 PNG는 `outputAsset.buffer`에 mutate. 코드가 반환값을 PNG로 가정 → Storage에 JUMBF 박스만 저장됨. 수정 커밋 `875faf6`. 향후 production cert로 전환 시 env vars 교체만으로 가동 가능 확인 | DONE | — |
| A-30 | **Multi-result 미공개 재검출 미지원** — 사이즈 선택에서 양쪽 체크한 경우 multi-result 카드 2개가 생성됨. 현재 publish 안 한 채로 stamped PNG 다운로드 후 같은 브라우저에서 재드롭 시 single-result 흐름의 receipt만 매칭. multi-result 흐름에서도 `saveReceipt` 호출하도록 통일 필요 | 베타 직전 | P2 |
| A-31 | **Multi-result confirm 진행률 UI** — 2026-05-17 B-2'' 흐름에서 confirm은 작은 JSON이라 거의 즉시 완료되지만 UI는 여전히 "confirming" phase 진행 바를 보여줌. phase 상수 단순화(confirming → ready를 단일 transition으로 합치고 진행률 표시 제거) | 정리 작업 | P3 |
| A-33 | **인증 후 미사용 30일 cleanup** — receipt JWT TTL이 30일이라 그 사이 사용자가 publish 안 하면 차감된 proof 비용은 사실상 소실. UX 측면에서 30일 도래 전 "사용 안 한 인증 X건 남았습니다" 알림 또는 환불 정책 검토 | 베타 운영 중 | P3 |

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
| A-17 | Next.js 14 → 15 major upgrade (Server Components DoS 2건 해결). 자동 Dependabot 차단 중 ([.github/dependabot.yml](../.github/dependabot.yml)), 별도 PR로 수동 진행 | 별도 트랙 | P3 |
| A-18 | next-auth v5 마이그레이션 (nodemailer Low advisory 해소, nodemailer v8 자동 차단 해제). 자동 Dependabot 차단 중 ([.github/dependabot.yml](../.github/dependabot.yml)), 별도 PR로 수동 진행 | 별도 트랙 | P3 |
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
| 2026-05-11 | A-20 매월 자동 갱신·A-21 어드민 조정 UI 추가 — 현재 구현 갭 노출 (1개월 후 사용자 0크레딧 멈춤 risk) |
| 2026-05-11 | 차감 정책 정합 강화 — verify_query 로그인 필수 + −1 / link_create 통합 −1 (Standard −3·Verified −4) / detectStamp 무료 분리(magic only) / 사용자 UI를 크레딧 + 차감기준으로 변경. pricing-policy §2 갱신, 테스트 anchor 갱신(33 tests) |
| 2026-05-13 | A-23·A-24·A-25 추가 (J-9 PDF 발급 트레이드오프). A-26·A-27·A-28 추가 (업로드 진행률 후속 — confirm stage 라벨, stego chunking, 취소 버튼) |
| 2026-05-17 | **B-2'' 흐름 분리·운영 강화** — pricing-policy §10 동일 항목 참조. A-26 라우트명 갱신(confirm→publish). A-30·A-31·A-32·A-33 신규 추가(multi-result 미공개 재검출 미지원, multi confirm 진행률 단순화, 인증 결과 안내 강화, 30일 미사용 cleanup). 용어 통일 간편링크→공개링크 |
| 2026-06-18 | A-32 완료 — result_stamped UI에 `save_for_later_hint` 안내 한 줄 추가(다운로드 버튼 아래, `!generatedLink` 조건). 저장한 파일을 ~30일 내 같은 브라우저에서 재드롭하면 공개링크 생성 가능 안내. ko/en i18n 추가. [page.tsx](../src/app/[locale]/page.tsx) |
