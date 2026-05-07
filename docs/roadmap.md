# OriPics 차세대 로드맵

> **최초 작성**: 2026-05-06
> **최종 갱신**: 2026-05-06 — 동시 론칭 전제 반영 (웹+모바일 단일 출시)
> **상태**: 실행 단계 (트랙별 작업 시작 가능)

---

## 0. 론칭 전제

ori.pics는 **아직 정식 론칭 전**이다. 따라서 점진적 인증 추가가 아닌 **단일 신규 출시 이벤트**로 신뢰 모델을 처음부터 완성된 형태로 시장에 내놓는다.

### 0.1 핵심 결정사항

| 항목 | 결정 |
|---|---|
| 출시 형태 | **웹 + 네이티브 모바일 앱(iOS·Android) 동시 출시** |
| 티어 구조 | **Verified** (모바일 사진) + **Standard** (웹·모바일의 파일·붙여넣기) |
| 경로 분리 | 웹 = F + C only / 모바일 앱 = P + F + C 모두 |
| 웹의 사진 아이콘 | 유지 — 클릭 시 **앱 설치 안내 모달** 노출 |
| 목표 출시 시점 | **2026-09 ~ 10월** (현 시점 + 약 4~5개월) |

### 0.2 신뢰 티어 모델

```
┌────────────────────────────────────────────────────────────┐
│  Verified 티어 (출처+무결성 보장)                              │
│  • 진입점: 모바일 앱 P 경로 only                                │
│  • 보장: 픽셀 무결성 + 캡처 출처 + 기기 무결성                     │
│  • 기술: 네이티브 카메라 + App Attest/Play Integrity + HW 서명     │
│  • 배지: "기기 인증 촬영" (파란색)                                │
├────────────────────────────────────────────────────────────┤
│  Standard 티어 (무결성만 보장)                                 │
│  • 진입점: 웹 F·C, 모바일 앱 F·C                                │
│  • 보장: 픽셀 무결성 only                                       │
│  • 기술: 스테가노그래피 스탬프 + HMAC                              │
│  • 배지: "OriPics 처리됨" (회색)                                │
└────────────────────────────────────────────────────────────┘
```

링크 페이지에서 두 배지가 시각적으로 구분되어 사용자가 신뢰 수준을 한눈에 인지할 수 있어야 한다.

### 0.3 트랙 의존성 그래프

```
              ┌──────────────────────────┐
              │  보안 사전작업 (즉시)     │
              └─────────────┬────────────┘
                            │
          ┌─────────────────┼─────────────────┐
          ▼                 ▼                 ▼
  ┌───────────┐    ┌────────────────┐  ┌────────────┐
  │ 트랙 B   │    │ 트랙 A          │  │ 트랙 E     │
  │ 모노레포 │    │ C2PA 통합       │  │ 웹 UX 조정 │
  │ Phase1~7│    │ (Standard 티어) │  │            │
  └─────┬─────┘    └────────┬───────┘  └─────┬──────┘
        │                   │                 │
        ▼                   │                 │
  ┌───────────┐             │                 │
  │ 트랙 D   │ ◄───────────┘                  │
  │ 모바일 앱 │                                │
  │ D.1~D.6  │ ─────────────────────────────►│
  └─────┬─────┘                                │
        │                                      │
        ▼                                      │
  ┌──────────────────────────────────────────┐│
  │ 트랙 F — 동시 론칭 체크리스트              │◄┘
  └──────────────────────┬───────────────────┘
                         │
                         ▼  ✨ 동시 론칭
                         │
              ┌──────────┴──────────┐
              ▼                     ▼
       ┌───────────┐         ┌─────────────┐
       │ 트랙 C   │         │ 후속 인증   │
       │ SOC 2    │         │ GS·ISO 27001│
       └───────────┘         └─────────────┘
```

### 0.4 트랙 요약표

| 트랙 | 명칭 | 시점 | 비용 | 기간 | 우선순위 |
|---|---|---|---|---|---|
| **(즉시)** | 보안 사전작업 6개 | 즉시 | 0원 | 1일 | 🔴 필수 |
| **A** | C2PA 통합 | 론칭 전 | 인건비 + 인증서 50만원 | 2주 | 🔴 필수 |
| **B** | 모노레포 전환 (Phase 1~8) | 론칭 전 | 인건비만 | 1.5주 | 🔴 필수 |
| **D** | 모바일 네이티브 앱 | 론칭 전 | Apple $99/년 + Google $25 + 인건비 | 8~10주 | 🔴 필수 |
| **E** | 웹 UX 조정 | 론칭 전 | 인건비만 | 1주 | 🔴 필수 |
| **F** | 동시 론칭 체크리스트 | 론칭 직전 | 도메인·디자인 자산 | 1~2주 | 🔴 필수 |
| **C** | SOC 2 진입 | 론칭 후 | 5,500만~1억 2,000만원 | 12~14개월 | 🟡 첫 B2B 시 |

🔴 필수 = 론칭 전제. 🟡 = 비즈니스 단계에 따라.

---

## 트랙 A — C2PA Content Credentials 통합

### A.1 목표

스테가노그래피 스탬프가 적용된 PNG에 **C2PA 매니페스트**를 추가 첨부해 Adobe Verify·Content Credentials 검증 도구·뉴스 미디어 워크플로우와 자동 상호운용. 매니페스트는 **티어를 구분하여 발급** (Standard와 Verified가 다른 어서션 포함).

### A.2 아키텍처 결정

**첨부 시점**: `/api/links/confirm` 단계 (업로드 후, 서버에서 PNG 다운로드 → 매니페스트 첨부 → 재업로드).

**라이브러리**: `c2pa-node-v2` (구 `c2pa-node`는 deprecated). API는 v2 README에서 검증 후 사용. SDK 통합 어려울 시 폴백: `c2patool` CLI를 `child_process`로 호출.

**인증서 전략**:
- Phase 1 (자체서명): 개발/테스트용
- Phase 2 (정식 발급): 론칭 직전 DigiCert/SSL.com 코드사이닝 인증서로 교체

키 저장: `ORIPICS_C2PA_CERT_PEM`, `ORIPICS_C2PA_KEY_PEM` (Vercel env vars, prod/preview 분리).

**기능 플래그**: `ORIPICS_C2PA_ENABLED=true|false` — 즉시 롤백 가능.

### A.3 매니페스트 콘텐츠 — 티어별 분기

```jsonc
// Standard 티어 (웹 F·C, 모바일 F·C)
{
  "claim_generator": "OriPics/1.0",
  "title": "OriPics Original Proof (Standard)",
  "format": "image/png",
  "instance_id": "xmp:iid:{link_id}",
  "assertions": [
    { "label": "c2pa.actions", "data": {
        "actions": [
          { "action": "c2pa.created", "when": "{ISO8601}" },
          { "action": "com.oripics.stamped",
            "parameters": { "version": 2, "tier": "standard" }
          }
        ]
      }
    },
    { "label": "com.oripics.proof", "data": {
        "tier": "standard",
        "link_id": "{link_id}",
        "verify_url": "https://www.ori.pics/{link_id}",
        "stamp_version": 2
      }
    }
  ]
}

// Verified 티어 (모바일 P 경로 + attestation 통과)
{
  "claim_generator": "OriPics/1.0 (mobile-native)",
  "title": "OriPics Original Proof (Verified)",
  "assertions": [
    { "label": "c2pa.actions", "data": {
        "actions": [
          { "action": "c2pa.created", "when": "{capture_ts}" },
          { "action": "com.oripics.captured",
            "parameters": { "tier": "verified", "version": 3 }
          }
        ]
      }
    },
    { "label": "com.oripics.verified", "data": {
        "platform": "ios" | "android",
        "attest_token_hash": "{sha256 of verified token}",
        "device_integrity": "passed",
        "zoom_factor": 2.5,
        "lens_position": "back-tele"
      }
    },
    { "label": "stds.exif", "data": {
        "GPS:GPSLatitude": "...",
        "GPS:GPSLongitude": "..."
      }
    },
    { "label": "com.oripics.proof", "data": {
        "tier": "verified",
        "link_id": "{link_id}",
        "verify_url": "https://www.ori.pics/{link_id}",
        "stamp_version": 3
      }
    }
  ]
}
```

핵심 차이: Verified는 `com.oripics.verified` 어서션에 **attestation 결과**가 포함됨. 검증자는 이 어서션 유무로 티어 즉시 판별 가능.

### A.4 변경 파일 목록

```
packages/stamp/                 # (모노레포 전환 후)
└── src/c2pa.ts                 # 매니페스트 빌더 — 양 티어 모두 지원

apps/web/src/app/api/links/confirm/route.ts   # 매니페스트 첨부 단계
apps/web/src/app/[locale]/[id]/
   ├── ContentCredentialsBadge.tsx              # 신규
   └── page.tsx                                 # 배지 + 티어 표시

apps/mobile/                     # (모노레포 전환 후)
└── 백엔드 호출 시 attestation 토큰 동봉

scripts/generate-dev-c2pa-cert.sh
.env.example
```

### A.5 코드 골격 — `packages/stamp/src/c2pa.ts`

```ts
import { createC2pa } from 'c2pa-node-v2'; // ⚠️ 정확한 API는 v2 README에서 확인

export type Tier = 'standard' | 'verified';

export interface C2paAttachInput {
  pngBuffer: Buffer;
  tier: Tier;
  linkId: string;
  timestamp: string;
  width: number;
  height: number;
  lat?: number | null;
  lng?: number | null;
  stampVersion: number;
  // Verified 티어 전용
  verifiedInfo?: {
    platform: 'ios' | 'android';
    attestTokenHash: string;
    zoomFactor?: number;
    lensPosition?: string;
  };
}

const CERT_PEM = process.env.ORIPICS_C2PA_CERT_PEM!;
const KEY_PEM = process.env.ORIPICS_C2PA_KEY_PEM!;

export async function attachC2paManifest(input: C2paAttachInput): Promise<{ buffer: Buffer }> {
  if (!CERT_PEM || !KEY_PEM) throw new Error('c2pa_signing_keys_missing');

  const assertions: any[] = [
    {
      label: 'c2pa.actions',
      data: {
        actions: [
          { action: 'c2pa.created', when: input.timestamp },
          {
            action: input.tier === 'verified' ? 'com.oripics.captured' : 'com.oripics.stamped',
            parameters: { tier: input.tier, version: input.stampVersion },
          },
        ],
      },
    },
    {
      label: 'com.oripics.proof',
      data: {
        tier: input.tier,
        link_id: input.linkId,
        verify_url: `https://www.ori.pics/${input.linkId}`,
        stamp_version: input.stampVersion,
        dimensions: { width: input.width, height: input.height },
        ...(input.lat != null && input.lng != null
          ? { gps: { lat: input.lat, lng: input.lng } }
          : {}),
      },
    },
  ];

  if (input.tier === 'verified' && input.verifiedInfo) {
    assertions.push({
      label: 'com.oripics.verified',
      data: {
        platform: input.verifiedInfo.platform,
        attest_token_hash: input.verifiedInfo.attestTokenHash,
        device_integrity: 'passed',
        ...(input.verifiedInfo.zoomFactor != null
          ? { zoom_factor: input.verifiedInfo.zoomFactor }
          : {}),
        ...(input.verifiedInfo.lensPosition
          ? { lens_position: input.verifiedInfo.lensPosition }
          : {}),
      },
    });
  }

  const manifest = {
    claim_generator: input.tier === 'verified' ? 'OriPics/1.0 (mobile-native)' : 'OriPics/1.0',
    title: `OriPics Original Proof (${input.tier === 'verified' ? 'Verified' : 'Standard'})`,
    format: 'image/png',
    instance_id: `xmp:iid:${input.linkId}`,
    assertions,
  };

  const c2pa = createC2pa({
    signer: {
      type: 'local',
      certificate: Buffer.from(CERT_PEM),
      privateKey: Buffer.from(KEY_PEM),
      algorithm: 'es256',
      tsaUrl: 'https://timestamp.digicert.com',
    },
  });

  const result = await c2pa.sign({
    asset: { mimeType: 'image/png', buffer: input.pngBuffer },
    manifest,
  });

  return { buffer: result.signedAsset.buffer };
}
```

### A.6 자체서명 인증서 생성 스크립트

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

### A.7 테스트 계획

| # | 테스트 | 도구 | 기대 결과 |
|---|---|---|---|
| 1 | 단위: Standard 매니페스트 생성 | Jest + 픽스처 | C2PA 청크 + standard 티어 어서션 |
| 2 | 단위: Verified 매니페스트 생성 | Jest + mock attest | `com.oripics.verified` 어서션 포함 |
| 3 | 통합: confirm 흐름 후 PNG에 매니페스트 | curl + `c2patool extract` | JSON 파싱 가능 |
| 4 | Adobe Verify | contentcredentials.org/verify | 양 티어 매니페스트 인식 |
| 5 | 픽셀 무결성 회귀 | `/api/verify` | C2PA 첨부 후에도 통과 |
| 6 | 기능 플래그 OFF | env 변경 | 기존 흐름 100% 동일 |
| 7 | 매니페스트 첨부 실패 시 | 키 제거 | 에러 로그만, link 생성 성공 |

### A.8 단계적 롤아웃

1. Preview + 자체서명 + 플래그 OFF 배포
2. 플래그 ON, 내부 테스트 (1주)
3. Production OFF 배포
4. **론칭 직전**: 정식 인증서로 교체 + 플래그 ON
5. 론칭 후 매니페스트 첨부율 / 실패율 모니터링

### A.9 후속 작업

| # | 작업 |
|---|---|
| F1 | `waitUntil`로 매니페스트 첨부 비동기화 |
| F2 | `/api/verify` 응답에 C2PA 검증 결과 포함 |
| F3 | 정식 코드사이닝 인증서 발급 (DigiCert) — 론칭 2주 전 |
| F4 | CAI 멤버 등록 (contentauthenticity.org/join) — 무료 |

### A.10 예상 시간

| 영역 | 시간 |
|---|---|
| `c2pa-node-v2` 학습 + Vercel 호환성 검증 | 5~7일 |
| 코드 작성 (티어 분기 포함) | 4~5일 |
| 테스트 + Preview 검증 | 2~3일 |
| **합계** | **약 2~2.5주** |

(론칭 직전 정식 인증서 교체 작업은 별도 1일.)

---

## 트랙 B — 모노레포 전환 (Phase 1~8 모두 필수)

### B.1 결론

론칭 전 **모든 8개 단계 진행 필수**. Phase 8(모바일 부트스트랩)이 트랙 D의 시작점이므로 더 이상 선택이 아님.

총 **5~10일** (실제 작업 ~3일 + 검증 ~2일).

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
│   └── mobile/                  # Phase 8에서 부트스트랩 → 트랙 D
├── packages/
│   ├── stamp/                   # frontend/src/lib/oripics-stamp 추출
│   ├── attest/                  # 신규 — 플랫폼별 attestation 헬퍼
│   ├── api-client/
│   └── tsconfig/
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

### B.4 단계별 진행 (요약)

| Phase | 내용 | 시간 |
|---|---|---|
| 0 | 사전 준비 (백업, 브랜치, env export) | 30분 |
| 1 | `frontend/` → `apps/web/` 이동 + Vercel `rootDirectory` 변경 + `backend/` 삭제 | 1.5시간 |
| 2 | pnpm workspaces 도입 + `vercel.json` 갱신 | 1시간 |
| 3 | Turborepo 도입 | 30분 |
| 4 | `@oripics/stamp` 패키지 추출 | 1~2일 |
| 5 | 공유 tsconfig (`packages/tsconfig`) | 30분 |
| 6 | GitHub sync 흐름 갱신 (subtree prefix 변경) | 30분 |
| 7 | 통합 회귀 검증 | 1~2일 |
| **8** | **`apps/mobile` 부트스트랩 (Expo)** — 트랙 D의 진입점 | 4시간 |

상세 명령어와 코드 골격은 이전 문서 버전 참조 (Phase 1의 Vercel API 호출, Phase 2의 vercel.json, Phase 4의 import 일괄 치환 등). 변경 없음.

### B.5 위험 시나리오와 대응

| 위험 | 대응 |
|---|---|
| Vercel 빌드 실패 (rootDirectory 직후) | Phase 1만 단독 진행 → Preview 확인 → Production. 실패 시 즉시 롤백 |
| `pnpm install` 실패 | `rm -rf node_modules apps/*/node_modules pnpm-lock.yaml` 재시도 |
| Import 누락 | `pnpm tsc --noEmit`로 사전 검출 |
| Turborepo 캐시 오염 | `pnpm turbo run build --force` |
| 메모리 노트 outdated | Phase 1 직후 `project_vercel_config.md` 갱신 |

### B.6 시간 추정

| 영역 | 누적 |
|---|---|
| Phase 0~7 | 2~3일 |
| Phase 8 | +4시간 |
| **합계** | **약 1~1.5주** |

---

## 트랙 D — 모바일 네이티브 앱 본 개발 (신규)

### D.1 목표

iOS · Android 두 플랫폼에서 **하드웨어 attestation 기반 Verified 티어**를 제공하는 자체 모바일 앱 개발.

### D.2 기술 스택 (확정)

| 영역 | 선택 |
|---|---|
| 프레임워크 | React Native + Expo SDK |
| 언어 | TypeScript |
| 네비게이션 | Expo Router |
| 카메라 | `expo-camera` (커스텀 UI + pinch-zoom) |
| 키 저장 | `expo-secure-store` (Keychain/Keystore) |
| 해시 | `expo-crypto` |
| 스타일 | NativeWind |
| 상태 | Zustand + TanStack Query |
| 빌드/배포 | EAS Build + EAS Submit + EAS Update |
| stamp 라이브러리 | `@oripics/stamp` (모노레포 공유) |

### D.3 하위 단계

#### D.3.1 카메라 + 줌 UI (2~3주)

- [ ] `expo-camera` 셋업 + 권한 처리 (iOS Info.plist, Android manifest)
- [ ] 커스텀 카메라 화면 (라이브 프리뷰)
- [ ] **Pinch-to-zoom** 제스처 구현 (`react-native-gesture-handler`)
- [ ] 줌 슬라이더 (1.0x ~ 최대 줌)
- [ ] 줌 값을 JS state로 보존 → 캡처 시 메타데이터에 포함
- [ ] 렌즈 선택 (광각·표준·망원, 기기 지원 시)
- [ ] 갤러리에서 선택 (F 경로) — `expo-image-picker`
- [ ] 클립보드 붙여넣기 (C 경로) — `expo-clipboard`
- [ ] 캡처 결과 미리보기 + 재촬영
- [ ] GPS 권한 처리 (`expo-location`)

#### D.3.2 iOS App Attest 모듈 (1~2주)

- [ ] Expo 커스텀 모듈 스캐폴드 (`expo-modules-core` 템플릿)
- [ ] Swift 코드:
  ```swift
  import DeviceCheck
  // DCAppAttestService.shared.generateKey() → keyId
  // DCAppAttestService.shared.attestKey(keyId, clientDataHash:) → attestation 객체
  // DCAppAttestService.shared.generateAssertion(keyId, clientDataHash:) → 어서션
  ```
- [ ] JS 인터페이스: `attestApp()`, `signRequest(payload)`, `getKeyId()`
- [ ] 키쌍 저장: Secure Enclave (iOS 자동), `expo-secure-store`로 keyId만 보관
- [ ] 첫 실행 시 attestation 객체 생성 + 백엔드로 전송 → 정품 앱 확인
- [ ] 이후 매 capture 시 assertion 생성 → 백엔드로 전송

#### D.3.3 Android Play Integrity 모듈 (1~2주)

- [ ] Expo 커스텀 모듈 스캐폴드
- [ ] Kotlin 코드:
  ```kotlin
  import com.google.android.play.core.integrity.IntegrityManagerFactory
  // val integrityTokenResponse = IntegrityManager.requestIntegrityToken(
  //   IntegrityTokenRequest.builder().setNonce(nonce).build()
  // )
  ```
- [ ] JS 인터페이스: `requestIntegrityToken(nonce)` → 토큰 반환
- [ ] Play Console에서 앱 등록 후 cloud project number 발급 → `google-services.json`
- [ ] 매 capture 시 nonce(서버 발급) → integrity token 받기 → 백엔드 전송

#### D.3.4 백엔드 attestation 검증 엔드포인트 (1주)

웹과 동일한 Vercel Functions에 추가:

```
POST /api/attest/challenge          # nonce 발급 (Redis or in-memory)
POST /api/attest/verify-ios         # Apple App Attest 토큰 검증
POST /api/attest/verify-android     # Google Play Integrity 토큰 검증
POST /api/sign                      # 기존 — Verified 모드는 attest 검증 통과 필수
```

핵심 검증 로직:
- iOS: `cbor` 디코드 + Apple 공개 인증서 체인 검증 + statement attestation 검증
- Android: Play Integrity 응답 디코드 + verdict 확인 (`MEETS_DEVICE_INTEGRITY`, `MEETS_BASIC_INTEGRITY`)
- 검증 통과 시 → `/api/sign` 정상 응답
- 실패 시 → Standard 티어로 fallback 또는 거부 (정책 결정)

라이브러리:
- iOS attest 검증: `@peculiar/asn1-schema` + 자체 구현 또는 `appattest` npm 패키지
- Android Play Integrity: 구글 공식 `googleapis` JS 라이브러리

#### D.3.5 베타 (TestFlight + Play Internal) (2주)

- [ ] EAS Build로 iOS · Android 첫 빌드
- [ ] TestFlight 업로드 (Apple) → 내부 테스터 모집 (대표 + 지인 5~10명)
- [ ] Play Internal Testing 업로드 (Google) → 동일 그룹
- [ ] 1주 베타 → 버그 수집 → 수정 → 2차 빌드
- [ ] 베타 종료 시 안정성 지표 (크래시율 < 0.5%, attestation 통과율 > 95%)

#### D.3.6 App Store + Play Store 심사 제출 (1~3주, 외부 의존)

- [ ] **앱스토어 메타데이터 준비**:
  - 스크린샷 5장 (iPhone 6.7"/6.5"/5.5", iPad 12.9"/11" — Apple 요구)
  - 앱 아이콘 (1024x1024)
  - 설명문 (한/영)
  - 개인정보 처리방침 URL (필수)
  - 키워드 (한국·영어)
  - 카테고리 (Photo & Video)
  - 연령 등급
- [ ] **개인정보 라벨** (App Privacy):
  - 수집 데이터: 사진(미수집·디바이스만), GPS(선택), 이메일(계정 시)
  - 사용 목적
  - 추적 여부 (No)
- [ ] Apple 심사 제출 → 통상 24~48시간, 거절 시 재제출 +3~7일
- [ ] Google 심사 제출 → 통상 1~3일

### D.4 변경 파일 목록 (apps/mobile/ 신규)

```
apps/mobile/
├── app/                         # Expo Router
│   ├── _layout.tsx
│   ├── index.tsx                # 홈
│   ├── camera.tsx               # 커스텀 카메라
│   └── (settings)/
├── components/
├── modules/
│   ├── ios-app-attest/          # 커스텀 네이티브 모듈
│   │   ├── ios/AppAttest.swift
│   │   └── src/index.ts
│   └── android-play-integrity/
│       ├── android/PlayIntegrity.kt
│       └── src/index.ts
├── lib/
│   ├── api.ts                   # 백엔드 호출
│   └── stamp.ts                 # @oripics/stamp 래퍼
├── app.json                     # Expo config
├── eas.json                     # EAS Build config
└── package.json
```

### D.5 위험 요인

| 위험 | 가능성 | 대응 |
|---|---|---|
| App Store 1차 거절 | 보통 | 개인정보 라벨·설명·UI 가이드라인 사전 검토 |
| App Attest 토큰 검증 실패 | 중 | Apple sample code + 공개 인증서 핀 |
| Play Integrity 무료 한도 초과 (10,000 req/일) | 낮음 (베타 단계) | 유료 전환 결정 시점 모니터링 |
| Expo 네이티브 모듈 빌드 환경 | 중 | EAS Build 사용 시 거의 자동, 로컬 빌드는 Xcode 16 + Android Studio 필요 |
| 두 플랫폼 attestation API 차이로 코드 분기 복잡 | 중 | `packages/attest`로 추상화 |

### D.6 예상 시간 (병렬 가능 영역 표시)

| 단계 | 시간 | 병렬 |
|---|---|---|
| D.3.1 카메라 UX | 3주 | 단독 |
| D.3.2 iOS Attest | 1.5주 | D.3.3과 병렬 |
| D.3.3 Android Integrity | 1.5주 | D.3.2와 병렬 |
| D.3.4 백엔드 검증 | 1주 | D.3.2~3 끝난 후 |
| D.3.5 베타 | 2주 | 단독 |
| D.3.6 스토어 심사 | 1~3주 | 외부 |
| **합계** | **약 8~10주** | |

---

## 트랙 E — 웹 UX 조정 (신규)

### E.1 목표

웹의 P 경로를 Verified 티어 진입(앱 설치 안내)으로 전환하면서 사용자 혼선 없이 신뢰 모델을 명확히 노출.

### E.2 변경 항목

#### E.2.1 사진 아이콘 클릭 시 앱 설치 안내 모달

- [ ] 사진 아이콘은 그대로 유지 (UI 일관성)
- [ ] 클릭 시 모달 노출:
  ```
  ┌──────────────────────────────────────┐
  │ 사진 인증은 OriPics 앱에서             │
  │                                       │
  │ 사진 경로는 기기 인증(Verified)이      │
  │ 가능한 모바일 앱에서만 제공됩니다.       │
  │                                       │
  │ [📱 iOS 앱 받기]  [🤖 Android 앱 받기] │
  │ [QR 코드]                              │
  │                                       │
  │ 또는, 기존 사진을 업로드해서 일반        │
  │ 인증(Standard)을 받을 수 있어요:         │
  │ [📁 파일 선택]  [📋 클립보드]           │
  └──────────────────────────────────────┘
  ```
- [ ] 모달은 사용자가 "다시 보지 않기" 선택 가능 (`localStorage`)
- [ ] 데스크톱에서는 QR 코드 위주, 모바일에서는 직접 스토어 링크

#### E.2.2 GPS 토글 제거 (웹 한정)

- [ ] 현재 GPS 토글은 P 경로 활성 시 노출. 분리 후 P가 모달로 빠지므로 자연스럽게 비노출.
- [ ] 코드에서 `gpsIncludeEnabled` state는 유지하되 UI에서 제거 (모바일 앱이 같은 stamp 라이브러리 사용해 동일 state 활용)
- [ ] i18n에서 GPS 관련 키들은 모바일 앱용으로 이동

#### E.2.3 결과 페이지 티어 배지

[/[id]/page.tsx](apps/web/src/app/[locale]/[id]/page.tsx) 갱신:

```tsx
{tier === 'verified' ? (
  <span className="bg-blue-100 text-blue-700 px-3 py-1 rounded-full text-sm font-bold flex items-center gap-1">
    🛡️ 기기 인증 촬영 (Verified)
  </span>
) : (
  <span className="bg-slate-100 text-slate-600 px-3 py-1 rounded-full text-sm font-medium">
    ✓ OriPics 처리됨 (Standard)
  </span>
)}
```

티어 정보는 C2PA 매니페스트 또는 Supabase `links` 테이블에 컬럼 추가로 저장.

#### E.2.4 i18n 갱신

| 키 | 변경 |
|---|---|
| `Home.upload.idle_mobile` | "사진 찍기" 문구를 "갤러리에서 선택"으로 변경 (또는 P 모달 안내 추가) |
| `LinkViewer.tier_verified` | 신규 — "기기 인증 촬영" |
| `LinkViewer.tier_standard` | 신규 — "OriPics 처리됨" |
| `Home.app_install.title` | 신규 — 앱 설치 안내 모달 제목 |
| `Home.app_install.body` | 신규 — 모달 본문 |
| `Home.app_install.ios_button` | 신규 |
| `Home.app_install.android_button` | 신규 |
| `Home.gps.*` (전체) | 모바일 앱 i18n으로 이동 (웹에서는 제거 가능) |

### E.3 변경 파일 목록

```
apps/web/src/app/[locale]/page.tsx                          # 사진 클릭 → 모달
apps/web/src/components/AppInstallModal.tsx                  # 신규
apps/web/src/app/[locale]/[id]/page.tsx                      # 티어 배지
apps/web/messages/{ko,en}.json                                # i18n 갱신
apps/web/public/qr-{ios,android}.png                          # QR 이미지
apps/web/src/app/api/sign/route.ts                            # 웹 요청은 P 거부
```

`/api/sign`에서 웹 요청이 `upload_type === 'P'`로 들어오면 거부:
```ts
const isMobileApp = req.headers.get('x-oripics-platform') === 'mobile';
if (uploadType === 'P' && !isMobileApp) {
  return NextResponse.json({ detail: 'photo_path_requires_mobile_app' }, { status: 403 });
}
```

(모바일 앱은 캡처 요청 시 `X-OriPics-Platform: mobile` 헤더 + attestation 토큰 동봉.)

### E.4 예상 시간

| 영역 | 시간 |
|---|---|
| AppInstallModal 컴포넌트 | 0.5일 |
| QR 코드·아이콘 디자인 자산 | 0.5일 |
| 티어 배지 + 백엔드 티어 저장 | 1일 |
| i18n 갱신 + 흐름 회귀 | 1일 |
| `/api/sign` P 경로 차단 | 0.5일 |
| **합계** | **약 1주** |

---

## 트랙 F — 동시 론칭 체크리스트 (신규)

론칭 직전 1~2주 집중. 트랙 A·B·D·E 거의 완료된 시점부터 진행.

### F.1 인프라 / 도메인

- [ ] ori.pics → www.ori.pics 리다이렉트 정상 (현재 동작 중)
- [ ] SSL 인증서 자동 갱신 확인 (Vercel)
- [ ] DNS TTL 적정 설정
- [ ] CDN 캐시 정책 검토 (정적 자산 1년, HTML no-cache)
- [ ] Vercel Production 환경변수 최종 점검 (정식 C2PA 인증서 등)
- [ ] 백엔드 cron (`/api/cron/cleanup`) 정상 작동 확인
- [ ] Supabase 백업 정책 (PITR 활성화 권장 — 유료)

### F.2 모바일 앱 스토어

- [ ] Apple Developer Program 가입 ($99/년)
- [ ] Google Play Console 가입 ($25 1회)
- [ ] App Store Connect 앱 생성
- [ ] 스크린샷 5장 × 4가지 디바이스 사이즈
- [ ] 앱 아이콘 1024x1024
- [ ] 설명문 한/영 (4,000자 이내)
- [ ] 키워드 (한국 100자, 영어 100자)
- [ ] 카테고리: Photo & Video (Primary), Utilities (Secondary)
- [ ] 연령 등급 4+
- [ ] 개인정보 라벨 작성
- [ ] 앱 미리보기 영상 (선택, 권장)

### F.3 법무 / 약관

- [ ] **개인정보 처리방침** (한·영) — Supabase 데이터 처리, GPS, 사진 처리 명시
- [ ] **이용약관** — 책임 한도, 분쟁 해결
- [ ] **EULA** (앱) — Apple 표준 EULA + 추가 조항
- [ ] **서비스 별 데이터 보존 기간** 명시 (현재: 7일)
- [ ] 한국 GDPR/PIPA 적합성 자체 점검
- [ ] EU GDPR DPA 검토 (사용자 EU 거주 가능성 시)

### F.4 마케팅 / 자산

- [ ] 랜딩 페이지 카피 최종본 (현 ori.pics 기준)
- [ ] OG 이미지 최종 버전 (현재 `/og-image.png` OK)
- [ ] 앱 다운로드 QR 코드 (iOS·Android)
- [ ] 소개 영상 (선택, 30초 이내)
- [ ] 보도자료 초안 (한국 IT 매체용)
- [ ] 트위터/X 스레드 초안
- [ ] 프로덕트 헌트 / 해커뉴스 게시 계획

### F.5 모니터링 / 운영

- [ ] **Sentry** 또는 Vercel Observability 셋업 (에러 트래킹)
- [ ] **Vercel Analytics** 활성화
- [ ] **앱 분석**: Mixpanel / Amplitude / Plausible 중 선택
- [ ] **다운 알림**: BetterUptime 또는 Vercel native
- [ ] 24시간 응답 가능한 지원 채널 (이메일·디스코드·트위터 DM)
- [ ] 사고 대응 runbook (간단 1페이지)

### F.6 베타 / 테스트

- [ ] 모바일 앱 베타 테스터 5~10명 (TestFlight, Play Internal)
- [ ] 웹 베타 사용자 (지인) 10~20명
- [ ] 베타 피드백 양식 (Google Forms, Tally 등)
- [ ] 1주 베타 → 크리티컬 버그 fix → 정식 빌드

### F.7 론칭 D-Day 체크리스트

- [ ] 09:00 — Vercel Production 최종 배포
- [ ] 09:30 — App Store / Play Store 자동 출시 확인
- [ ] 10:00 — 소셜 미디어 게시
- [ ] 10:30 — 보도자료 발송 (해당 시)
- [ ] 11:00 — Product Hunt 게시 (UTC 00:00 기준이 미국 시간)
- [ ] 12:00 — 첫 4시간 모니터링 집중
- [ ] 18:00 — 24시간 사용 지표 점검
- [ ] D+1 ~ D+7 — 일일 안정성 리뷰

### F.8 롤백 시나리오

| 사고 유형 | 대응 |
|---|---|
| 웹 빌드 실패 | Vercel Rollback (1분 이내) |
| 모바일 앱 크리티컬 버그 (검증 실패 등) | EAS Update OTA 패치 (즉시) — JS-only 수정 시 |
| 모바일 앱 네이티브 버그 | 핫픽스 빌드 → 비상 심사 신청 (Apple) |
| 백엔드 장애 | Vercel Functions 자동 복구 또는 즉시 롤백 |
| Supabase 장애 | 외부 의존 — status.supabase.com 모니터 + 사용자 안내 |
| C2PA 첨부 실패 폭증 | `ORIPICS_C2PA_ENABLED=false` 즉시 설정 → 기존 흐름으로 회귀 |

---

## 트랙 C — Drata 도입 + SOC 2 진입 (론칭 후)

### C.1 시점 결정

**론칭 후, 첫 B2B 영업 미팅에서 SOC 2 요구를 받기 시작하는 시점에 시작**.

이유: SOC 2는 12~14개월 + 5,500만~9,500만원 투자. MVP 검증 전 투자는 ROI 낮음. 론칭 후 사용자/매출 성장 패턴 보고 결정.

### C.2 사전 무료 작업 (론칭 전 끝내두기)

- [ ] 모든 SaaS 계정 MFA 활성화 (3시간)
- [ ] GitHub branch protection on `main` (10분)
- [ ] Dependabot + secret scanning + CodeQL (10분, 무료)
- [ ] 1Password 무료 평가판 + 비밀번호 이전 (1일)
- [ ] Vercel 환경변수 점검 + 회전 (1시간)
- [ ] 백업 정책 1줄 메모 (Supabase PITR 결정)

이 6개로 SOC 2 통제의 25% 사전 충족 → 추후 Drata 도입 시 가속.

### C.3 SOC 2 기초 (요약)

| 개념 | 설명 |
|---|---|
| **SOC 2** | AICPA 신뢰 서비스 기준 기반 CPA 감사 보고서 |
| **Type I** | 통제 설계 적합성 — 4~6주 |
| **Type II** | 6~12개월 운영 평가 — 엔터프라이즈 표준 |
| **TSC** | Security(필수), Availability, Confidentiality, Processing Integrity, Privacy |

OriPics 추천 시작 TSC: Security + Availability + Confidentiality. 차후 Privacy + Processing Integrity 확장.

### C.4 GRC 도구

| 도구 | 가격 (1~10명) | 추천 시점 |
|---|---|---|
| **Drata** | $7,500~15,000/년 | 자동화 우선 |
| **Sprinto** | $5,000~9,000/년 | 예산 우선 |
| **Vanta** | $8,000~15,000/년 | 미국 엔터프라이즈 |

### C.5 단계 (론칭 후)

| 단계 | 기간 | 작업 |
|---|---|---|
| 0 | 1주 | TSC·Type·감사인·GRC 도구 결정 |
| 1 | 1~2주 | Drata 가입 + 통합 연결 + MDM 도입 |
| 2 | 1~2개월 | 정책 25종 작성 (Drata 템플릿) |
| 3 | 1~3개월 | 기술적 통제 구현 |
| 4 | 6~12개월 | Type II 관찰 기간 (수동 작업: 분기별 access review, 연 1회 위험평가/교육/BCP 훈련/정책 검토) |
| 5 | 4~8주 | 감사 fieldwork + 보고서 |

상세 25종 정책 목록·기술 통제 항목은 직전 버전 문서 참조 (변경 없음).

### C.6 비용 요약 (1~10명, 첫해)

| 항목 | 비용 |
|---|---|
| Drata 구독 | 1,000만~2,000만원 |
| 1Password Business + MDM | 약 110만원 |
| 침투테스트 (필수, 연 1회) | 700만~2,000만원 |
| Type I 감사 | 1,000만~2,000만원 |
| Type II 감사 (Type I 후 6~12개월) | 1,500만~3,300만원 |
| **첫해 합계 (Type II)** | **4,500만~9,500만원** |
| **Type I만** | 2,500만~5,000만원 |

**2년차 이후 매년**: 약 3,500만~6,600만원.

---

## 통합 일정 (현재 2026-05-06 기준)

```
2026-05 (현재) ┐
                ├─ 보안 사전작업 6개 (1일)
                ├─ 트랙 B Phase 1~7 (1주)
                ├─ 트랙 A C2PA 통합 (2주)              [병렬]
                ├─ 트랙 E 웹 UX 조정 (1주)             [병렬]
                ▼
2026-06         ┐
                ├─ 트랙 B Phase 8 (4시간)
                ├─ 트랙 D.1 카메라 UX (2~3주)
                ▼
2026-07         ┐
                ├─ 트랙 D.2 iOS App Attest (1.5주)    [병렬]
                ├─ 트랙 D.3 Android Play Integrity   [병렬]
                ├─ 트랙 D.4 백엔드 검증 (1주)
                ▼
2026-08         ┐
                ├─ 트랙 D.5 베타 (2주)
                ├─ 트랙 F 론칭 체크리스트 (1~2주)      [병렬 시작]
                ▼
2026-09         ┐
                ├─ 트랙 D.6 스토어 심사 (1~3주)
                ├─ 트랙 A 정식 인증서 교체
                ├─ 트랙 F 마무리
                ▼
2026-09 ~ 10    ✨ 동시 론칭

2026-10 ~       ├─ 보안 사전작업 (이미 끝남)
                ├─ 첫 B2B 영업 시점 평가
                ├─ (필요 시) 트랙 C SOC 2 시작
                └─ GS·ISO 27001 등 후속 인증
```

**최종 출시 예상: 2026년 9~10월 (약 4~5개월 후)**

위험 요인:
- App Store 1차 거절 시 +2~4주
- 네이티브 attestation 모듈 디버깅 예상 초과 시 +2~4주
- 베타에서 크리티컬 버그 발견 시 +1~2주

여유 버퍼 포함 시 보수적으로 **2026-11월 출시**도 시나리오에 포함.

---

## 다음 단계 옵션

지금 즉시 진행 가능한 작업 우선순위:

| 옵션 | 설명 | 권장도 | 시간 |
|---|---|---|---|
| **1** | 보안 사전작업 6개 (MFA, branch protection 등) | ⭐⭐⭐ 즉시 | 1일 |
| **2** | 트랙 B Phase 1 (디렉토리 이동) — 가장 위험 단계 단독 진행 | ⭐⭐⭐ | 1.5시간 |
| **3** | 트랙 A C2PA `c2pa-node-v2` README 학습 + Vercel 호환성 PoC | ⭐⭐ | 1주 |
| **4** | Apple Developer Program + Google Play Console 가입 | ⭐⭐ | 0.5일 |
| **5** | 트랙 D 모바일 앱 기술 PoC (Expo + 카메라 + Hello World) | ⭐ | 2일 |

**추천 시퀀스**:
1. (이번 주) 옵션 1 + 옵션 4 — 보안 + 개발자 계정 준비
2. (다음 주) 옵션 2 — 트랙 B Phase 1 단독 머지 → 안정화 확인
3. (그 다음) 옵션 3 — C2PA PoC + 트랙 B Phase 2~7 병렬
4. (1개월차 종료) 트랙 D 본 작업 시작

---

## 부록 A — 인증 매트릭스 (pre/post-launch 구분)

| 인증 | 시점 | 비용 | 기간 | 메모 |
|---|---|---|---|---|
| **C2PA / JPEG Trust** | 🟢 pre-launch | ~50만원 (인증서) | 2주 | 트랙 A. 론칭 전 정식 인증서 교체 |
| **CAI 멤버십** | 🟢 pre-launch | 무료 | 즉시 | A.9 후속작업 F4 |
| **Apple App Attest 등록** | 🟢 pre-launch | $99/년 | 즉시 | Apple Developer Program 일부 |
| **Google Play Integrity 등록** | 🟢 pre-launch | $25 1회 | 즉시 | Play Console 일부 |
| **개인정보 처리방침 / 이용약관** | 🟢 pre-launch | 50만~300만원 (법무 검토) | 1주 | 트랙 F.3 |
| **GS인증 1등급** | 🟡 post-launch (1~3개월) | 800만~2,500만원 (정부지원 환급 시 절반) | 4~6개월 | 공공조달 진입 |
| **ISO 27001 + 27701** | 🟡 post-launch (시리즈 A 후) | 4,500만~1억 5,000만원 | 8~12개월 | 글로벌 B2B |
| **SOC 2 Type II** | 🟡 post-launch (첫 미국 B2B) | 4,500만~9,500만원 | 12~14개월 | 트랙 C |
| **ISMS-P** | 🟠 post-launch (한국 매출 100억+) | 별도 인프라 보강 필요 | 6~12개월 | Vercel 단독 부족, 한국 인프라 검토 |
| **CSAP** | 🟠 post-launch (한국 공공 클라우드 진입) | 한국 인프라 필수 | 6~12개월 | Vercel 부적합 |
| **HIPAA** | 🟠 post-launch (미국 의료 진입) | Vercel Enterprise BAA | 6개월 | 응용 통제 추가 |
| **디지털 포렌식 법적 증거** | 🟠 post-launch (사업라인 결정) | 법무 협력비 | — | 스택 무관 |
| **공인전자문서중계자** | 🟠 post-launch (사업라인 결정) | 라이선스 신청 | — | 스택 무관 |

🟢 론칭 전 필수 / 🟡 론칭 후 1년 내 / 🟠 사업 단계 도달 시

---

## 부록 B — 보안 사전작업 6개 (즉시 가능, 무료)

론칭 전 끝내두면 트랙 C(SOC 2) 시점에 통제의 25% 자동 충족:

- [ ] 모든 SaaS 계정 **MFA 활성화** (3시간)
  - Vercel, GitHub, Supabase, Google Workspace, 도메인 레지스트라
- [ ] **GitHub branch protection** on `main` (10분)
  - PR 필수 (1인 회사라도 셀프 PR로 변경 이력 추적)
  - CI 통과 필수
  - Force push 금지 (단, subtree push는 별도 리포로 가니 영향 없음)
- [ ] **Dependabot + secret scanning + CodeQL** (10분, 무료)
- [ ] **1Password 무료 평가판** + 모든 비밀번호 이전 (1일)
- [ ] **Vercel 환경변수 회전** — 평문 노출 위험 항목 점검 (1시간)
- [ ] **백업 정책 메모** — Supabase PITR 활성화 vs 자체 스크립트 결정 (10분)

---

## 참고 자료

- C2PA: https://c2pa.org , https://contentauthenticity.org
- c2pa-node-v2: https://github.com/contentauth/c2pa-node-v2
- Apple App Attest: https://developer.apple.com/documentation/devicecheck/establishing_your_app_s_integrity
- Google Play Integrity: https://developer.android.com/google/play/integrity
- Expo Custom Native Modules: https://docs.expo.dev/modules/overview/
- EAS Build: https://docs.expo.dev/build/introduction/
- Drata: https://drata.com
- SOC 2 TSC: https://www.aicpa-cima.com/topic/audit-assurance/audit-and-assurance-greater-than-soc-2
- Vercel Security: https://vercel.com/security
- Supabase Security: https://supabase.com/security
- ISO 21617 (JPEG Trust): https://www.iso.org/standard/85601.html
- ISMS-P: https://isms.kisa.or.kr
- GS인증: https://www.tta.or.kr
- 한국 PIPA: https://www.pipc.go.kr

---

## 변경 이력

| 일자 | 변경 |
|---|---|
| 2026-05-06 | 최초 작성 — 트랙 A·B·C 기반 |
| 2026-05-06 | 동시 론칭 전제 반영 — 트랙 D·E·F 추가, B Phase 8 필수 승격, C 시점 명확화, 부록 매트릭스에 pre/post-launch 컬럼 추가, 통합 일정 추가 |
