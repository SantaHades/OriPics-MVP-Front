# OriPics 차세대 로드맵

> **작성일**: 2026-05-06
> **범위**: 글로벌 신뢰성·인증 대응을 위한 3개 트랙 (C2PA · 모노레포 · SOC 2) + 차후 단계 옵션
> **상태**: 초안 (실행 전 의사결정 필요)

---

## 개요

OriPics가 "원본 증명" 서비스의 신뢰성을 글로벌 수준으로 끌어올리기 위해 다음 3개 트랙을 단계적으로 진행한다.

| 트랙 | 목표 | 비용 | 기간 | 권장 시작 시점 |
|---|---|---|---|---|
| **A. C2PA 통합** | Adobe·뉴스미디어·콘텐츠 인증 표준 호환 | ~0원 | 약 2주 | 즉시 |
| **B. 모노레포 전환** | 웹·모바일·백엔드 코드 공유 토대 | 인건비만 | 약 1주 | A 머지 후 |
| **C. SOC 2 진입** | 글로벌 엔터프라이즈 영업 신뢰성 | 4,500만~9,500만원 | 12~14개월 | 첫 B2B 고객 요구 시 |

전제: 백엔드는 Vercel + Next.js API Routes 단독 운영 (HF Spaces 제거 완료), DB/Storage는 Supabase, 도메인 ori.pics → www.ori.pics.

---

## 트랙 A — C2PA Content Credentials 통합

### A.1 목표

스테가노그래피 스탬프가 적용된 PNG에 **C2PA 매니페스트**를 추가 첨부해 Adobe Verify·Content Credentials 검증 도구·뉴스 미디어 워크플로우와 자동 상호운용. 기존 OriPics 검증(픽셀 무결성)은 그대로 유지.

### A.2 아키텍처 결정

**첨부 시점**: `/api/links/confirm` 단계 (업로드 후, 서버에서 PNG 다운로드 → 매니페스트 첨부 → 재업로드).

**라이브러리**: `c2pa-node-v2` (구 `c2pa-node`는 deprecated). API는 v2 README에서 검증 후 사용.

**SDK 통합 어려울 시 폴백**: `c2patool` CLI를 `child_process`로 호출.

**인증서 전략**:
- Phase 1: 자체 서명 X.509 (개발/테스트용, Adobe Verify에서 self-signed 경고)
- Phase 2: DigiCert/SSL.com 정식 코드사이닝 인증서 (production)

키 저장: `ORIPICS_C2PA_CERT_PEM`, `ORIPICS_C2PA_KEY_PEM` (Vercel env vars).

**기능 플래그**: `ORIPICS_C2PA_ENABLED=true|false` — 즉시 롤백 가능.

### A.3 매니페스트 콘텐츠 설계

```jsonc
{
  "claim_generator": "OriPics/1.0",
  "title": "OriPics Original Proof",
  "format": "image/png",
  "instance_id": "xmp:iid:{link_id}",
  "assertions": [
    { "label": "c2pa.actions", "data": {
        "actions": [
          { "action": "c2pa.created", "when": "{ISO8601}" },
          { "action": "com.oripics.stamped",
            "parameters": {
              "version": 3,
              "stego_method": "lsb-border-inner-hash"
            }
          }
        ]
      }
    },
    { "label": "com.oripics.proof", "data": {
        "link_id": "{link_id}",
        "verify_url": "https://www.ori.pics/{link_id}",
        "stamp_version": 3,
        "dimensions": { "width": ..., "height": ... },
        "gps": { "lat": ..., "lng": ... }
      }
    }
  ]
}
```

### A.4 변경 파일 목록

```
frontend/
├── package.json                                   # +c2pa-node-v2, +@contentauth/react
├── next.config.js                                 # serverExternalPackages
├── scripts/
│   └── generate-dev-c2pa-cert.sh                  # 신규 — 자체서명 인증서 스크립트
├── src/
│   ├── lib/oripics-stamp/
│   │   └── c2pa.ts                                # 신규 — 매니페스트 빌더
│   ├── app/api/links/confirm/route.ts             # 수정 — 매니페스트 첨부 단계
│   └── app/[locale]/[id]/
│       ├── ContentCredentialsBadge.tsx            # 신규 — 표시 컴포넌트
│       └── page.tsx                               # 수정 — 배지 통합
└── .env.example                                   # 수정 — C2PA 키 자리표시자
```

### A.5 코드 골격 — `lib/oripics-stamp/c2pa.ts`

```ts
import { createC2pa } from 'c2pa-node-v2'; // ⚠️ 정확한 API는 v2 README에서 확인

export interface C2paAttachInput {
  pngBuffer: Buffer;
  linkId: string;
  timestamp: string;
  width: number;
  height: number;
  lat?: number | null;
  lng?: number | null;
  stampVersion: number;
}

const CERT_PEM = process.env.ORIPICS_C2PA_CERT_PEM!;
const KEY_PEM = process.env.ORIPICS_C2PA_KEY_PEM!;

export async function attachC2paManifest(input: C2paAttachInput): Promise<{ buffer: Buffer }> {
  if (!CERT_PEM || !KEY_PEM) throw new Error('c2pa_signing_keys_missing');

  // ⚠️ 아래는 v1 기반 추정. v2 API 확인 후 수정 필요.
  const c2pa = createC2pa({
    signer: {
      type: 'local',
      certificate: Buffer.from(CERT_PEM),
      privateKey: Buffer.from(KEY_PEM),
      algorithm: 'es256',
      tsaUrl: 'https://timestamp.digicert.com',
    },
  });

  const manifest = {
    claim_generator: 'OriPics/1.0 (Next.js)',
    title: 'OriPics Original Proof',
    format: 'image/png',
    instance_id: `xmp:iid:${input.linkId}`,
    assertions: [
      {
        label: 'c2pa.actions',
        data: {
          actions: [
            { action: 'c2pa.created', when: input.timestamp },
            {
              action: 'com.oripics.stamped',
              parameters: {
                version: input.stampVersion,
                stego_method: 'lsb-border-inner-hash',
              },
            },
          ],
        },
      },
      {
        label: 'com.oripics.proof',
        data: {
          link_id: input.linkId,
          verify_url: `https://www.ori.pics/${input.linkId}`,
          stamp_version: input.stampVersion,
          dimensions: { width: input.width, height: input.height },
          ...(input.lat != null && input.lng != null
            ? { gps: { lat: input.lat, lng: input.lng } }
            : {}),
        },
      },
    ],
  };

  const result = await c2pa.sign({
    asset: { mimeType: 'image/png', buffer: input.pngBuffer },
    manifest,
  });

  return { buffer: result.signedAsset.buffer };
}
```

### A.6 코드 골격 — `/api/links/confirm/route.ts` 수정 부분

```ts
import { attachC2paManifest } from '@/lib/oripics-stamp/c2pa';

const C2PA_ENABLED = process.env.ORIPICS_C2PA_ENABLED === 'true';

// ... 기존 verifyJwt 로직 그대로 ...

if (C2PA_ENABLED) {
  try {
    const { data: blob, error: dlErr } = await supabase.storage
      .from(BUCKET_NAME).download(storage_path);
    if (dlErr || !blob) throw new Error(`download_failed:${dlErr?.message}`);
    const pngBuffer = Buffer.from(await blob.arrayBuffer());

    const { buffer: signedBuffer } = await attachC2paManifest({
      pngBuffer, linkId: link_id, timestamp, width, height,
      lat: lat_e6 != null ? lat_e6 / 1_000_000 : null,
      lng: lng_e6 != null ? lng_e6 / 1_000_000 : null,
      stampVersion: lat_e6 != null ? 3 : 2,
    });

    const { error: upErr } = await supabase.storage
      .from(BUCKET_NAME).upload(storage_path, signedBuffer, {
        contentType: 'image/png', upsert: true,
      });
    if (upErr) throw new Error(`reupload_failed:${upErr.message}`);

    console.log(`[confirm] c2pa attached link_id=${link_id} bytes=${signedBuffer.length}`);
  } catch (e: any) {
    // C2PA 실패는 전체 흐름 차단하지 않음
    console.error(`[confirm] c2pa attach failed link_id=${link_id}:`, e.message);
  }
}
```

### A.7 자체서명 인증서 생성 스크립트

`scripts/generate-dev-c2pa-cert.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail
mkdir -p .secrets/c2pa
cd .secrets/c2pa

openssl ecparam -name prime256v1 -genkey -noout -out key.pem
openssl req -new -x509 -key key.pem -out cert.pem -days 90 \
  -subj "/CN=OriPics Dev/O=OriPics/C=KR" \
  -addext "extendedKeyUsage=emailProtection,1.3.6.1.4.1.311.10.3.27"

echo "ORIPICS_C2PA_CERT_PEM=$(cat cert.pem | base64)"
echo "ORIPICS_C2PA_KEY_PEM=$(cat key.pem | base64)"
```

### A.8 테스트 계획

| # | 테스트 | 도구 | 기대 결과 |
|---|---|---|---|
| 1 | `attachC2paManifest` 단위 테스트 | Jest + 픽스처 PNG | C2PA 청크 존재 |
| 2 | confirm 흐름 통합 | curl + `c2patool extract` | 매니페스트 JSON 추출 가능 |
| 3 | Adobe Content Credentials Verify | contentcredentials.org/verify | self-signed 경고 OK, 매니페스트 파싱 성공 |
| 4 | 자체 검증 회귀 | `/api/verify` | 픽셀 무결성 검증 통과 |
| 5 | 기능 플래그 OFF | env 변경 | 기존 흐름 100% 동일 |
| 6 | 매니페스트 첨부 실패 시 | 키 제거 | 에러 로그만 남고 link 생성 성공 |

### A.9 단계적 롤아웃

1. Preview 환경 + 자체서명 + 플래그 OFF 배포
2. 플래그 ON, 내부 사용자 ~10명 테스트 (1주)
3. Production OFF 배포
4. Production ON (월요일 오전), 매니페스트 첨부율 모니터링
5. Sentry 로그에서 실패율 < 1% 확인
6. 별도 PR — DigiCert 정식 인증서로 교체

### A.10 후속 작업

| # | 작업 |
|---|---|
| F1 | `waitUntil`로 매니페스트 첨부 비동기화 |
| F2 | `/api/verify` 응답에 C2PA 검증 결과 포함 |
| F3 | 정식 코드사이닝 인증서 발급 + 교체 |
| F4 | CAI 멤버 등록 (contentauthenticity.org/join) |
| F5 | Verified 티어(네이티브 앱)에서 attestation 정보 매니페스트 추가 |

### A.11 예상 시간

| 영역 | 시간 |
|---|---|
| `c2pa-node-v2` 학습 + Vercel 호환성 검증 | 5~7일 |
| 코드 작성 | 3~4일 |
| 테스트 + Preview 검증 | 2~3일 |
| Production 롤아웃 | 1일 |
| **합계** | **약 2~2.5주** |

### A.12 미해결 항목

1. Supabase Storage 비용: 매니페스트로 PNG 크기 +5~30KB
2. `c2pa-node-v2` Vercel Linux x64 호환성 사전 검증
3. 인증서 만료 모니터링 cron 추가 필요
4. WWW 리다이렉트와 `verify_url` 정합성 확인

---

## 트랙 B — 모노레포 전환

### B.1 결론

**8단계로 분리, 단계마다 별개 커밋. 총 5~10일** (실제 작업 ~2일 + 검증·배포 안정화).

### B.2 현재 → 목표 구조

**현재**:
```
02.oripics-MVP/
├── frontend/                    # Next.js 16 (모든 코드)
├── backend/                     # deprecated FastAPI
├── image/, changelog.md, todo.md
```

**목표**:
```
02.oripics-MVP/
├── apps/
│   ├── web/                     # 현 frontend/
│   └── mobile/                  # (Phase 8, 선택)
├── packages/
│   ├── stamp/                   # frontend/src/lib/oripics-stamp 추출
│   ├── api-client/              # (선택)
│   └── tsconfig/                # 공유 tsconfig
├── package.json                 # 워크스페이스 루트
├── pnpm-workspace.yaml
├── turbo.json
└── .npmrc
```

### B.3 사전 결정사항

| 항목 | 결정 |
|---|---|
| 패키지 매니저 | **pnpm** |
| 빌드 오케스트레이터 | **Turborepo** |
| 패키지 네임스페이스 | `@oripics/*` (비공개) |
| Node 버전 | 24.x |
| Vercel `rootDirectory` | `frontend` → `apps/web` |
| `backend/` 폴더 | 삭제 |
| GitHub sync prefix | `frontend` → `apps/web` |

### B.4 단계별 진행

#### Phase 0: 사전 준비 (30분)

```bash
git tag pre-monorepo-$(date +%Y%m%d)
git checkout -b chore/monorepo-phase-1
npm install -g pnpm  # 필요 시
```

체크리스트:
- [ ] Vercel 환경변수 export (`vercel env pull`)
- [ ] 현재 main의 마지막 커밋 SHA 메모
- [ ] Supabase 백업

#### Phase 1: 디렉토리 이동 (1시간 + 검증 30분)

```bash
mkdir -p apps
git mv frontend apps/web
git rm -r backend/
```

**Vercel 설정 동시 변경 필수**:
```bash
VERCEL_TOKEN=$(python3 -c "import json; d=json.load(open('/Users/ress/Library/Application Support/com.vercel.cli/auth.json')); print(d.get('token',''))")
curl -X PATCH "https://api.vercel.com/v9/projects/prj_VjxLJ6rR2icb09FRKyVpnHQIhAMD?teamId=team_HbbfuMTMN5aPwWnzn09q4C1P" \
  -H "Authorization: Bearer $VERCEL_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"rootDirectory": "apps/web"}'
```

**Subtree push 명령 갱신**:
```bash
# 변경 후
git push front $(git subtree split --prefix=apps/web):main --force
```

→ `~/.claude/projects/-Users-ress-Documents-0000-02-oripics-MVP/memory/project_vercel_config.md` 갱신.

#### Phase 2: pnpm workspaces (30분 + 검증 30분)

루트 `package.json`:
```json
{
  "name": "oripics",
  "private": true,
  "scripts": {
    "dev": "pnpm --filter @oripics/web dev",
    "build": "pnpm --filter @oripics/web build"
  },
  "engines": { "node": ">=24" },
  "packageManager": "pnpm@9.x"
}
```

`pnpm-workspace.yaml`:
```yaml
packages:
  - 'apps/*'
  - 'packages/*'
```

`apps/web/package.json` name → `@oripics/web`.

`apps/web/vercel.json`:
```json
{
  "installCommand": "cd ../.. && pnpm install --frozen-lockfile",
  "buildCommand": "cd ../.. && pnpm --filter @oripics/web build",
  "outputDirectory": ".next",
  "crons": [{ "path": "/api/cron/cleanup", "schedule": "0 18 * * *" }]
}
```

```bash
rm apps/web/package-lock.json
pnpm install
```

#### Phase 3: Turborepo (20분)

`turbo.json`:
```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": [".next/**", "!.next/cache/**", "dist/**"]
    },
    "dev": { "cache": false, "persistent": true },
    "lint": { "outputs": [] },
    "test": { "outputs": [] }
  }
}
```

```bash
pnpm add -D -w turbo
```

빌드 명령 갱신:
```json
"buildCommand": "cd ../.. && pnpm turbo run build --filter=@oripics/web"
```

#### Phase 4: `@oripics/stamp` 추출 (1~2일, **가장 큰 단계**)

```bash
mkdir -p packages/stamp/src
git mv apps/web/src/lib/oripics-stamp/* packages/stamp/src/
```

`packages/stamp/package.json`:
```json
{
  "name": "@oripics/stamp",
  "version": "0.0.0",
  "private": true,
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": {
    ".": "./src/index.ts",
    "./server": "./src/server.ts",
    "./watermark": "./src/watermark.ts"
  }
}
```

`apps/web/package.json` 의존성 추가:
```json
"@oripics/stamp": "workspace:*"
```

Import 일괄 치환:
```bash
cd apps/web
grep -rl '@/lib/oripics-stamp' src/ | xargs sed -i '' 's|@/lib/oripics-stamp|@oripics/stamp|g'
grep -rl '@/lib/oripics-stamp/' src/ | xargs sed -i '' 's|@/lib/oripics-stamp/|@oripics/stamp/|g'
```

검증:
- [ ] `pnpm build` 성공
- [ ] 로컬 dev에서 스탬핑·검증·워터마크 정상
- [ ] 기존 링크 ID로 검증 회귀

#### Phase 5: 공유 tsconfig (30분)

`packages/tsconfig/base.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022"],
    "moduleResolution": "Bundler",
    "module": "ESNext",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": true
  }
}
```

`apps/web/tsconfig.json` 정리.

#### Phase 6: GitHub sync 흐름 갱신 (30분)

**즉시**: subtree push prefix만 변경하면 동일 동작.

**장기 (선택)**: GitHub Actions로 자동화 — `.github/workflows/sync-frontend.yml`. 단 모노레포 본 리포가 GitHub에 별도 존재해야 함 (예: `SantaHades/OriPics-monorepo` private).

#### Phase 7: 회귀 검증 (1~2일)

체크리스트:
- [ ] 로컬 `pnpm dev` 정상
- [ ] 홈 페이지 업로드/스탬핑
- [ ] 검증 흐름
- [ ] 간편링크 생성
- [ ] 카메라 + GPS + 워터마크
- [ ] 카톡 공유 + OG 카드
- [ ] Vercel Preview / Production 배포
- [ ] ori.pics 도메인
- [ ] cron 18시 실행 확인

#### Phase 8 (선택): 모바일 앱 부트스트랩 (4시간)

```bash
cd apps
npx create-expo-app@latest mobile -t blank-typescript
```

설정:
- `package.json` name: `@oripics/mobile`
- tsconfig extends: `@oripics/tsconfig/react-library.json`
- `pnpm add @oripics/stamp@workspace:*`

→ 이 시점부터 웹·모바일이 동일 stamp 라이브러리 공유.

### B.5 위험 시나리오와 대응

| 위험 | 대응 |
|---|---|
| Vercel 빌드 실패 (rootDirectory 직후) | Phase 1만 단독 머지 → Preview 확인 → Production. 실패 시 즉시 롤백 |
| `pnpm install` 실패 | `rm -rf node_modules apps/*/node_modules pnpm-lock.yaml` 후 재시도 |
| Import 누락 | `pnpm tsc --noEmit`로 사전 검출 |
| Turborepo 캐시 오염 | `pnpm turbo run build --force` |
| 메모리 노트 outdated | Phase 1 직후 `project_vercel_config.md` 갱신 |

### B.6 시간 추정

| Phase | 누적 |
|---|---|
| 0 사전 준비 | 30분 |
| 1 디렉토리 이동 | +1.5시간 |
| 2 pnpm workspaces | +1시간 |
| 3 Turborepo | +30분 |
| 4 stamp 추출 | +1~1.5일 |
| 5 공유 tsconfig | +30분 |
| 6 GitHub sync | +1.5시간 |
| 7 회귀 검증 | +0.5~1일 |
| 8 (선택) Expo | +0.5일 |

**Phase 1~7만**: 2~3일 작업 (캘린더 1주). Phase 8 포함: 3~4일 (1.5주).

### B.7 진행 시점 추천

| 시나리오 | 권장 |
|---|---|
| 당분간 웹만 (모바일 미정) | 지금 안 해도 OK |
| 1~3개월 내 모바일 시작 | 지금 진행 |
| C2PA 통합도 함께 진행 | C2PA 머지 후 모노레포 |

**제 추천 순서**:
1. (A) C2PA 통합 — 작은 PR로 먼저
2. (B) 모노레포 — Phase 1~7
3. 모바일 결심 시 Phase 8

---

## 트랙 C — Drata 도입 + SOC 2 진입

### C.1 결론

**총 12~14개월 / 첫해 5,500만~1억 2,000만원** (Type II 기준). Type I 먼저는 4~5개월 / 4,000만원.

작업의 80%가 정책 문서 작성과 통제 운영 증거 축적. 코드 변경은 의외로 작음 (Vercel·Supabase가 인프라 통제 보유).

### C.2 SOC 2 기초

| 개념 | 설명 |
|---|---|
| **SOC 2** | AICPA의 신뢰 서비스 기준에 따른 CPA 감사 보고서 (인증서 아님) |
| **Type I** | 통제 설계 적합성 평가 — 4~6주, "통제 존재" 증명 |
| **Type II** | 6~12개월 운영 평가 — 엔터프라이즈 표준, "실효성" 증명 |
| **TSC** | 5개 기준 — Security(필수), Availability, Confidentiality, Processing Integrity, Privacy |

**OriPics 추천 TSC**:
- 시작: Security + Availability + Confidentiality
- 확장: Privacy (Phase 2)
- 차별화: Processing Integrity (픽셀 무결성이 본업)

### C.3 GRC 도구 비교

| 도구 | 가격 (1~10명) | 강점 | 약점 |
|---|---|---|---|
| **Drata** | $7,500~15,000/년 | 자동화 우수, Vercel·Supabase 통합 | 가격 |
| **Vanta** | $8,000~15,000/년 | 시장 1위, 엔터프라이즈 신뢰도 | UX 무거움 |
| **Sprinto** | $5,000~9,000/년 | 가장 저렴 | 통합 ↓ |
| **Secureframe** | $7,000~13,000/년 | 균형 | 차별점 약함 |

추천: **Drata** (자동화 우선) 또는 **Sprinto** (예산 우선).

### C.4 0단계: 시작 전 의사결정 (1주)

- [ ] TSC 선택
- [ ] Type I vs II 결정 (Type I 먼저 권장)
- [ ] 감사인 후보 3곳 견적 (Prescient Assurance, A-LIGN, Schellman 또는 한국 EY/KPMG/삼일)
- [ ] GRC 도구 결정
- [ ] 감사 범위 정의 (`ori.pics` 서비스 한정)
- [ ] Sub-service organization 명시 (Vercel, Supabase) + 양쪽 SOC 2 보고서 사전 수령
- [ ] 시작 시점 결정

### C.5 1단계: Drata 셋업 (1~2주)

#### 5.1 계정·연동

- [ ] Drata Starter 가입
- [ ] 다음 통합 연결:
  - [ ] Vercel
  - [ ] Supabase
  - [ ] GitHub
  - [ ] Google Workspace 또는 Microsoft 365
  - [ ] 1Password Business
  - [ ] AWS/GCP (사용 시)
  - [ ] Sentry/Datadog (사용 시)
  - [ ] Slack/Linear/Jira
- [ ] MDM 도입 (Kandji $5/seat/월, Jamf, Intune 중 선택)

#### 5.2 자동 스캔

- [ ] Drata 자동 통제 매핑 → 약 70~80개 통제 자동 충족 확인
- [ ] 미충족 목록 export

#### 5.3 직원/사용자 등록

- [ ] 모든 직원·계약자 등록
- [ ] 보안 교육 자동 배포 시작

### C.6 2단계: 정책 문서 작성 (1~2개월, Drata 템플릿 활용)

25종 정책 문서 — Drata 템플릿에 회사 변수만 채우고 경영진 승인:

- [ ] Information Security Policy (메인, 20~40페이지)
- [ ] Acceptable Use Policy
- [ ] Access Control Policy
- [ ] Asset Management Policy
- [ ] Backup Policy
- [ ] Business Continuity & Disaster Recovery Plan
- [ ] Change Management Policy
- [ ] Code of Conduct
- [ ] Cryptography Policy
- [ ] Data Classification Policy
- [ ] Data Retention & Disposal Policy
- [ ] Encryption Policy
- [ ] Endpoint Security Policy
- [ ] HR Security Policy
- [ ] Incident Response Plan
- [ ] Information Security Roles & Responsibilities
- [ ] Logging & Monitoring Policy
- [ ] Network Security Policy
- [ ] Password Policy
- [ ] Physical Security Policy (홈오피스 기준)
- [ ] Risk Assessment Policy
- [ ] Risk Management Policy
- [ ] Software Development Lifecycle Policy
- [ ] Vendor Management Policy
- [ ] Vulnerability Management Policy

### C.7 3단계: 기술적 통제 구현 (1~3개월, 일부 이미 충족)

#### 신원·접근 관리
- [ ] 모든 SaaS MFA 강제 (Vercel, GitHub, Supabase, Google, 1Password)
- [ ] SSO 도입 (Google Workspace)
- [ ] 최소권한 검증
- [ ] 분기별 access review

#### 코드 보안
- [ ] GitHub branch protection on `main` (PR 필수, CI 통과, force push 금지)
- [ ] Dependabot + Snyk
- [ ] Secret scanning
- [ ] CodeQL

#### 인프라 보안
- [ ] Vercel 환경변수 암호화
- [ ] Supabase RLS 정책 검토
- [ ] PITR 활성화
- [ ] TLS 1.2+ 강제
- [ ] 감사로그 분리 저장 (append-only)
- [ ] 로그 보관 1년 이상

#### 모니터링·알림
- [ ] Sentry 또는 Vercel Observability
- [ ] 다운 알림 (BetterUptime)
- [ ] 이상 트래픽 알림
- [ ] 권한 변경 알림

#### 백업·복구
- [ ] Supabase PITR 또는 일별 백업 + S3
- [ ] 연 1회 복구 훈련
- [ ] BCP/DR 시나리오 문서화

#### 기기 보안
- [ ] 디스크 암호화 강제
- [ ] 화면 잠금 5분 이내
- [ ] OS 자동 업데이트
- [ ] 분실 시 원격 wipe

#### 침투테스트
- [ ] 연 1회 외부 펜테스트 (700만~2,000만원)

### C.8 4단계: 운영 증거 축적 (Type II 6~12개월)

Drata 자동 수집:
- 일별 시스템 상태 스냅샷
- 신규 직원 온보딩
- 권한 변경 이벤트
- 보안 교육 완료 기록
- 사고 이력

수동 작업:
- [ ] 분기별 access review
- [ ] 연 1회 위험 평가
- [ ] 연 1회 보안 교육
- [ ] 연 1회 BCP/DR 모의훈련
- [ ] 연 1회 정책 검토
- [ ] 벤더 평가 (신규 SaaS 도입 시)

추천: 매월 1회 **30분 보안 리뷰 미팅**.

### C.9 5단계: 감사

#### Type I (4~6주)
- [ ] 킥오프
- [ ] 감사인 Drata read-only 액세스 부여
- [ ] 통제 설계 검증 (1~3주)
- [ ] 인터뷰 (대표 + 보안 책임자)
- [ ] 보고서 초안 → 최종 보고서

#### Type II (6~12개월 관찰 + 4~8주 fieldwork)
- [ ] 관찰 기간 종료
- [ ] Fieldwork 진행
- [ ] 표본 검사
- [ ] 발견사항 시정조치
- [ ] 최종 보고서

### C.10 비용 요약 (1~10명, 첫해)

| 항목 | 비용 |
|---|---|
| Drata 구독 | 1,000만~2,000만원 |
| 1Password Business | 약 70만원 |
| MDM (Kandji) | 약 40만원 |
| 침투테스트 | 700만~2,000만원 |
| **Type I 감사** | 1,000만~2,000만원 |
| **Type II 감사** (Type I 후 6~12개월) | 1,500만~3,300만원 |
| 보안 교육 | 0~200만원 |
| **첫해 합계 (Type II)** | **약 4,500만~9,500만원** |
| **Type I만** | 약 2,500만~5,000만원 |

**2년차 이후 매년**: 약 3,500만~6,600만원.

### C.11 진행 시점 추천

| 상황 | 권장 |
|---|---|
| MVP 단계 (현재) | 하지 마세요 — 핵심 제품 개선이 ROI ↑ |
| 첫 엔터프라이즈 영업에서 SOC 2 요구 받을 때 | 즉시 시작 |
| 시리즈 A 펀딩 직후 | 6개월 내 Type I |
| 연 매출 5억 이상 + 미국 고객 | Type II 필수 |

### C.12 즉시 가능한 무료 사전 작업

SOC 2 도입 전에도 무료로 해두면 좋은 것:

- [ ] 모든 SaaS MFA 활성화 (3시간)
- [ ] GitHub branch protection on `main` (10분)
- [ ] Dependabot + secret scanning (10분, 무료)
- [ ] 1Password 무료 평가판 + 비밀번호 이전 (1일)
- [ ] Vercel 환경변수 회전 가능 항목 회전 (필요 시)
- [ ] 백업 정책 1줄 메모 (Supabase PITR vs 자체 스크립트)

이 6개로 SOC 2 통제의 25% 사전 충족.

---

## 다음 단계 옵션

지금 (A)/(B)/(C) 모든 초안이 완성됨. 진행 방향은:

| 옵션 | 설명 | 권장 |
|---|---|---|
| **1** | (A) C2PA 통합 — `c2pa-node-v2` README 검토 후 실제 PR 작업 | ⭐ 비용·시간 ↓, 글로벌 시그널 효과 즉시 |
| **2** | (B) 모노레포 — Phase 1(디렉토리 이동)만 먼저 작은 PR | 모바일 앱 결심 시 |
| **3** | (C) — 즉시 가능한 무료 사전 작업 6개부터 시작 | 보안 기초 무료로 다지기 |
| **4** | 모두 잠시 보류, 다른 우선 작업 | 현재 제품 개선이 우선이라면 |

**제 추천 시퀀스**:
1. (C.12) 무료 사전 작업 6개 — **이번 주 내 끝낼 수 있음**
2. (A) C2PA 통합 — **다음 2주**, 비용 ~0
3. (B) 모노레포 Phase 1~7 — **모바일 앱 결심 시점에**
4. (C) Drata + SOC 2 — **첫 B2B 고객 요구 시점에**

---

## 부록 — 인증 4축 우선순위 정리

OriPics 사업 단계별 인증 매트릭스:

| 인증 | 단계 | 비용 | 기간 | 메모 |
|---|---|---|---|---|
| **C2PA / JPEG Trust** | 즉시 | ~0원 | 2주 | 트랙 A |
| **GS인증 1등급** | 1~3개월 후 | 800만~2,500만원 (정부지원 50~70% 환급 가능) | 4~6개월 | 공공조달 진입 |
| **ISO 27001/27701** | 시리즈 A 후 | 4,500만~1억 5,000만원 | 8~12개월 | 글로벌 B2B |
| **SOC 2 Type II** | 미국 시장 진입 | 4,500만~9,500만원 | 12~14개월 | 트랙 C |
| **ISMS-P** | 한국 매출 100억+ | (한국 인프라 보강 별도) | 6~12개월 | 데이터 거주지 검토 필요 |
| **CSAP** | 한국 공공 클라우드 | 한국 인프라 필수 | 6~12개월 | Vercel 단독은 부적합 |
| **HIPAA** | 미국 의료 진입 | Vercel Enterprise BAA + 응용 통제 | 6개월 | |
| **디지털 포렌식 법적 증거** | 사업 라인 결정 시 | 법무 협력비 | — | 스택 무관 |
| **공인전자문서중계자** | 사업 라인 결정 시 | 라이선스 신청 | — | 스택 무관 |

---

## 참고 자료

- C2PA: https://c2pa.org , https://contentauthenticity.org
- c2pa-node-v2: https://github.com/contentauth/c2pa-node-v2
- Drata: https://drata.com
- SOC 2 Trust Service Criteria: https://www.aicpa-cima.com/topic/audit-assurance/audit-and-assurance-greater-than-soc-2
- Vercel Security: https://vercel.com/security
- Supabase Security: https://supabase.com/security
- ISO 21617 (JPEG Trust): https://www.iso.org/standard/85601.html
- ISMS-P: https://isms.kisa.or.kr
- GS인증: https://www.tta.or.kr
