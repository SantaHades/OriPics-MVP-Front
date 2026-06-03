// C2PA Content Credentials 매니페스트 첨부 모듈
//
// 환경변수:
//   ORIPICS_C2PA_CERT_PEM  — leaf cert + intermediate chain (PEM, multi-cert OK)
//   ORIPICS_C2PA_KEY_PEM   — leaf private key (PKCS#8 PEM, ECDSA P-256)
//   ORIPICS_C2PA_CA_PEM    — (선택) self-signed dev CA. 없으면 production cert (Trust List 기반) 모드
//   ORIPICS_C2PA_TSA_URL   — (선택) RFC 3161 TimeStamp Authority URL
//
// 주의: c2pa-node v0.5.x 기준. builder.sign()은 동기 함수이고 반환값이 Buffer.

import {
  C2PA_TRUST_ANCHORS,
  C2PA_TRUST_CONFIG,
} from './c2pa-trust-list';

export type Tier = 'standard' | 'verified';

export interface C2paAttachInput {
  pngBuffer: Buffer;
  tier: Tier;
  linkId: string;
  timestamp: string;       // ISO 8601 (예: '2026-05-07T12:34:56Z')
  width: number;
  height: number;
  lat?: number | null;
  lng?: number | null;
  stampVersion: number;
  verifiedInfo?: {
    platform: 'ios' | 'android';
    attestTokenHash: string;
    zoomFactor?: number;
    lensPosition?: string;
  };
}

export interface C2paAttachResult {
  buffer: Buffer;
  bytesAdded: number;
}

const CERT_PEM = process.env.ORIPICS_C2PA_CERT_PEM;
const KEY_PEM = process.env.ORIPICS_C2PA_KEY_PEM;
const CA_PEM = process.env.ORIPICS_C2PA_CA_PEM;
const TSA_URL = process.env.ORIPICS_C2PA_TSA_URL;

// C2PA Claim v2: created_assertions vs gathered_assertions.
// c2pa-rs 기본값은 hard binding(c2pa.hash.data)만 created, 나머지(actions/ingredient/
// thumbnail 포함)는 전부 gathered로 보냄 — 이는 nonconformant (c2pa.actions는 signer가
// 생성/귀속하는 created assertion 이어야 함, Scott S. Perry 2026-05-31).
// builder.created_assertion_labels(base label, snake_case)로 명시 설정해야 created에 배치됨.
// com.oripics.* (vendor 데이터)는 의도적으로 gathered에 둠.
const CREATED_ASSERTION_LABELS = [
  'c2pa.actions',
  'c2pa.ingredient',
  'c2pa.thumbnail.claim',
  'c2pa.thumbnail.ingredient',
];

/**
 * Trust 검증 settings 생성 (GPSA Issue ① 대응 — 검증 로직이 C2PA Trust List를 소비).
 *
 *   - dev/self-signed 모드 (ORIPICS_C2PA_CA_PEM 설정): dev CA를 trust anchor로.
 *   - production 모드 (CA_PEM 미설정): 공식 C2PA Trust List(anchors + allowedList +
 *     trustConfig) 로드. 공식 list에 체인이 연결된 인증서(예: SSL.com)는 'trusted' 판정.
 *
 * 과거에는 production 모드에서 settings=undefined 였고, 그 결과 Trust List를 전혀
 * 참조하지 않아 정상 인증서도 untrusted로 판정되었음. 이를 바로잡음.
 */
function buildTrustSettings(
  c2pa: any,
  opts: { verifyAfterSign?: boolean } = {},
): any {
  const { createTrustSettings, createVerifySettings, mergeSettings } = c2pa;
  const trust = CA_PEM
    ? createTrustSettings({ verifyTrustList: true, trustAnchors: CA_PEM })
    : createTrustSettings({
        verifyTrustList: true,
        // 서명 CA + TSA CA 결합 번들 (C2PA-TRUST-LIST.pem + C2PA-TSA-TRUST-LIST.pem)
        trustAnchors: C2PA_TRUST_ANCHORS,
        trustConfig: C2PA_TRUST_CONFIG,
      });
  const verify = createVerifySettings({
    verifyTrust: true,
    verifyTimestampTrust: true,
    ...(opts.verifyAfterSign ? { verifyAfterSign: true } : {}),
  });
  // 서명 시 c2pa.actions/ingredient/thumbnail을 created_assertions에 배치 (위 주석 참조).
  // snake_case 키 필수 — BuilderSettings는 camelCase 변환을 하지 않음.
  // Reader 경로에서는 무시되는 builder 설정이므로 서명 경로(verifyAfterSign)에만 추가.
  const builder = opts.verifyAfterSign
    ? [{ builder: { created_assertion_labels: CREATED_ASSERTION_LABELS } }]
    : [];
  return mergeSettings(trust, verify, ...builder);
}

/** OriPics timestamp(yymmddHHMMSS+ms2) → ISO 8601 (UTC). */
export function oripicsTimestampToISO8601(ts: string): string {
  // 첫 글자가 prefix(F/P/C 등)이면 제거
  const cleaned = isNaN(parseInt(ts[0])) ? ts.substring(1) : ts;
  if (cleaned.length < 12) return new Date().toISOString();

  const year = 2000 + parseInt(cleaned.substring(0, 2), 10);
  const month = parseInt(cleaned.substring(2, 4), 10) - 1;
  const day = parseInt(cleaned.substring(4, 6), 10);
  const hour = parseInt(cleaned.substring(6, 8), 10);
  const minute = parseInt(cleaned.substring(8, 10), 10);
  const second = parseInt(cleaned.substring(10, 12), 10);
  const ms2 = cleaned.length >= 14 ? parseInt(cleaned.substring(12, 14), 10) : 0;

  const d = new Date(Date.UTC(year, month, day, hour, minute, second, ms2 * 10));
  return d.toISOString();
}

export async function attachC2paManifest(input: C2paAttachInput): Promise<C2paAttachResult> {
  if (!CERT_PEM || !KEY_PEM) {
    throw new Error('c2pa_signing_keys_missing');
  }

  const c2pa = await import('@contentauth/c2pa-node');
  const { Builder, LocalSigner, Reader } = c2pa;

  // === Signer ===
  const signer = LocalSigner.newSigner(
    Buffer.from(CERT_PEM),
    Buffer.from(KEY_PEM),
    'es256',
    TSA_URL || undefined,
  );

  // === Settings ===
  // dev 모드(CA_PEM): dev CA를 trust anchor로. production: 공식 C2PA Trust List.
  // (서명 후 verifyAfterSign으로 즉시 검증)
  const settings: any = buildTrustSettings(c2pa, { verifyAfterSign: true });

  // === Prior manifest 감지 (actions 결정보다 먼저) ===
  // 기존 C2PA가 있으면 c2pa.opened, 없으면 c2pa.created
  let priorManifest: { label: string; data: any } | null = null;
  try {
    const existingReader = await Reader.fromAsset({ buffer: input.pngBuffer, mimeType: 'image/png' }, settings);
    if (existingReader) {
      const store: any = existingReader.json();
      const activeLabel: string | undefined = store?.active_manifest;
      const activeManifest: any = activeLabel ? store?.manifests?.[activeLabel] : undefined;
      if (activeManifest && activeLabel) {
        priorManifest = { label: activeLabel, data: activeManifest };
      }
    }
  } catch {
    // 기존 매니페스트 없음 또는 읽기 오류 — 계속 진행
  }

  // === Manifest ===
  // Action selection (C2PA conformance — Scott S. Perry 2026-05-30 지침 반영):
  //
  //   Verified tier (모바일 네이티브 카메라, App Attest/Play Integrity 확인), prior 없음
  //     → c2pa.created + digitalCapture
  //       하드웨어 캡처가 증명되어 OriPics가 그 자산을 "생성"했다고 주장 가능 (TOE 내).
  //
  //   그 외 모든 경우 (Standard: web upload / file-pick, 또는 기존 C2PA 인제스트)
  //     → c2pa.opened + parentOf ingredient
  //       * OriPics는 사용자가 업로드한 자산을 "생성"하지 않았으므로 c2pa.created를
  //         주장할 권리가 없음. inception 액션은 c2pa.opened 만 적법.
  //       * 업로드된 원본을 parentOf ingredient로 포함:
  //           - prior C2PA manifest 있음 → 그 provenance가 ingredient로 보존됨.
  //           - 없음 → ingredient는 unknown provenance (우리가 만들지도, 검증하지도 못함).
  //       * 창작 귀속이 필요하면 CAWG 어서션(gathered_assertions)을 쓰라는 게 spec 권고지만,
  //         OriPics는 "봉인/스탬프"만 주장하므로(com.oripics.proof) CAWG는 사용하지 않음.
  const useCreated = input.tier === 'verified' && !priorManifest;

  const proofData: any = {
    tier: input.tier,
    link_id: input.linkId,
    verify_url: `https://www.ori.pics/${input.linkId}`,
    stamp_version: input.stampVersion,
    dimensions: { width: input.width, height: input.height },
    ...(input.lat != null && input.lng != null
      ? { gps: { lat: input.lat, lng: input.lng } }
      : {}),
  };

  const manifestSpec = {
    claim_generator:
      input.tier === 'verified' ? 'oripics/0.1.0 (mobile-native)' : 'oripics/0.1.0',
    title: `OriPics Original Proof (${input.tier === 'verified' ? 'Verified' : 'Standard'})`,
    format: 'image/png',
    instance_id: `xmp:iid:${input.linkId}`,
  };

  // === Sign ===
  const builder = Builder.withJson(manifestSpec as any, settings);

  // 액션 배치:
  //   c2pa.created (verified): addAction()으로 created_assertions에 직접 배치.
  //     digitalCapture DST 포함 — 하드웨어 캡처 증명.
  //   c2pa.opened (그 외): 먼저 parentOf ingredient를 추가하고 setIntent("edit").
  //     c2pa-rs가 c2pa.opened + ingredient 참조(hash 포함)를 자동 생성.
  //     (addAction으로 c2pa.opened + parameters.ingredient.hash를 수동 설정하면
  //      signing 전 hash를 알 수 없어 에러 발생.)
  if (useCreated) {
    builder.addAction(JSON.stringify({
      action: 'c2pa.created',
      when: input.timestamp,
      softwareAgent: { name: 'oripics' },
      digitalSourceType:
        'http://cv.iptc.org/newscodes/digitalsourcetype/digitalCapture',
    }));
  } else {
    // 업로드 원본을 parentOf ingredient로. prior manifest 있으면 그 메타를 승계,
    // 없으면 unknown provenance ingredient.
    try {
      const ingredientJson = JSON.stringify({
        title: priorManifest?.data?.title || 'Uploaded image (user-submitted)',
        format: 'image/png',
        ...(priorManifest?.data?.instance_id
          ? { instance_id: priorManifest.data.instance_id }
          : {}),
        relationship: 'parentOf',
      });
      await builder.addIngredient(ingredientJson, { buffer: input.pngBuffer, mimeType: 'image/png' });
      console.log(
        `[c2pa] ingredient added (${priorManifest ? `prior=${priorManifest.label}` : 'unknown provenance'})`,
      );
    } catch (e: any) {
      console.warn(`[c2pa] ingredient add failed: ${e?.message}`);
    }
    builder.setIntent('edit'); // → c2pa.opened 자동
  }

  builder.addAction(JSON.stringify({
    action: useCreated ? 'com.oripics.captured' : 'com.oripics.stamped',
    parameters: { tier: input.tier, version: input.stampVersion },
  }));

  builder.addAssertion('com.oripics.proof', proofData);
  if (input.tier === 'verified' && input.verifiedInfo) {
    builder.addAssertion('com.oripics.verified', {
      platform: input.verifiedInfo.platform,
      attest_token_hash: input.verifiedInfo.attestTokenHash,
      device_integrity: 'passed',
      ...(input.verifiedInfo.zoomFactor != null
        ? { zoom_factor: input.verifiedInfo.zoomFactor }
        : {}),
      ...(input.verifiedInfo.lensPosition
        ? { lens_position: input.verifiedInfo.lensPosition }
        : {}),
    });
  }

  // (parentOf ingredient는 위 c2pa.opened 분기에서 이미 추가됨)

  const inputAsset = { buffer: input.pngBuffer, mimeType: 'image/png' };
  const outputAsset: { buffer: Buffer | null } = { buffer: null };

  // builder.sign:
  //   - 반환값(Buffer) = 매니페스트 box (JUMBF) 바이트 — 보통 디버그/검증용
  //   - outputAsset.buffer ← 서명된 자산(signed PNG) 으로 mutate됨
  // (c2pa-node v0.5.x — DestinationBufferAsset 타입 주석 참조)
  builder.sign(signer, inputAsset, outputAsset);

  const signedBuffer = outputAsset.buffer;
  if (!signedBuffer || signedBuffer.length === 0) {
    throw new Error('c2pa_sign_returned_empty');
  }

  return {
    buffer: signedBuffer,
    bytesAdded: signedBuffer.length - input.pngBuffer.length,
  };
}

export interface C2paReadResult {
  present: boolean;
  /**
   * Active manifest 무결성 — 서명·해시·assertion이 변조되지 않았는지.
   * 신뢰(trust)와 ingredient 상태는 별개. ingredient(예: 만료된 Pixel 인증서)는
   * active manifest 무결성을 무효화하지 않는다.
   */
  valid: boolean;
  /** Active manifest 서명자가 trust list에 있고 만료/폐기되지 않았는지 (valid를 전제). */
  trusted: boolean;
  /** Active manifest의 검증 이슈 (무결성+신뢰). */
  validation_status: Array<{ code: string; url?: string; explanation?: string }>;
  /**
   * Ingredient(부모 자산)의 검증 이슈. 별도 노출 — 전체 verdict를 무효화하지 않되
   * 은폐하지도 않는다. 주의: c2pa-node 0.5.x는 만료된 ingredient 인증서를
   * timestamp 기반 유효성으로 해소하지 못함(c2patool과 차이). 권위 기준은 c2patool.
   */
  ingredient_validation_status?: Array<{ code: string; url?: string; explanation?: string }>;
  active_manifest_label?: string;
  claim_generator?: string;
  title?: string;
  format?: string;
  instance_id?: string;
  signature?: {
    issuer?: string;
    cert_serial_number?: string;
    time?: string;
    alg?: string;
  };
  assertions?: Array<{ label: string; data?: any }>;
}

export async function readC2paManifest(
  pngBuffer: Buffer,
  mimeType: string = 'image/png',
): Promise<C2paReadResult> {
  const c2pa = await import('@contentauth/c2pa-node');
  const { Reader } = c2pa;

  // 검증 시 Trust List를 반드시 소비 (GPSA Issue ①):
  //   dev 모드는 dev CA, production은 공식 C2PA Trust List(anchors+allowedList+config).
  const settings: any = buildTrustSettings(c2pa);

  const reader = await Reader.fromAsset({ buffer: pngBuffer, mimeType }, settings);

  if (!reader) {
    return { present: false, valid: false, trusted: false, validation_status: [] };
  }

  const store: any = reader.json();
  const activeLabel: string | undefined = store?.active_manifest;
  const manifest: any = activeLabel ? store?.manifests?.[activeLabel] : undefined;

  // active manifest 이슈와 ingredient 이슈를 분리한다.
  // 구조화된 validation_results(c2pa-node가 노출)를 우선 사용하고, 없으면
  // legacy 평면 validation_status로 폴백(분리 불가 → 전부 active로 간주).
  const norm = (arr: any[]): Array<{ code: string; url?: string; explanation?: string }> =>
    (Array.isArray(arr) ? arr : []).map((v: any) => ({
      code: v.code,
      ...(v.url ? { url: v.url } : {}),
      ...(v.explanation ? { explanation: v.explanation } : {}),
    }));

  const vr: any = store?.validation_results;
  let activeFailures: any[] = [];
  const ingredientFailures: any[] = [];
  if (vr && typeof vr === 'object') {
    activeFailures = Array.isArray(vr.activeManifest?.failure) ? vr.activeManifest.failure : [];
    for (const d of Array.isArray(vr.ingredientDeltas) ? vr.ingredientDeltas : []) {
      const vd = d?.validationDeltas ?? d ?? {};
      if (Array.isArray(vd.failure)) ingredientFailures.push(...vd.failure);
    }
  } else {
    activeFailures = Array.isArray(store?.validation_status) ? store.validation_status : [];
  }

  const activeStatus = norm(activeFailures);
  const ingredientStatus = norm(ingredientFailures);

  // trust 관련 코드(서명자/타임스탬프 신뢰)는 무결성과 구분한다.
  const isTrustCode = (c?: string) =>
    !!c && (c.startsWith('signingCredential') || c.startsWith('timeStamp'));
  const integrityFailures = activeStatus.filter((s) => !isTrustCode(s.code));

  // valid = active manifest가 존재하고 무결성 실패가 없음 (변조 아님).
  const valid = !!manifest && integrityFailures.length === 0;
  // trusted = active 서명자가 신뢰됨 (signingCredential 실패 없음). valid 전제.
  const trusted = valid && !activeStatus.some((s) => s.code?.startsWith('signingCredential'));

  const sig = manifest?.signature_info;

  return {
    present: true,
    valid,
    trusted,
    validation_status: activeStatus,
    ...(ingredientStatus.length > 0 ? { ingredient_validation_status: ingredientStatus } : {}),
    active_manifest_label: activeLabel,
    claim_generator: manifest?.claim_generator,
    title: manifest?.title,
    format: manifest?.format,
    instance_id: manifest?.instance_id,
    signature: sig
      ? {
          issuer: sig.issuer,
          cert_serial_number: sig.cert_serial_number,
          time: sig.time,
          alg: sig.alg,
        }
      : undefined,
    assertions: Array.isArray(manifest?.assertions)
      ? manifest.assertions.map((a: any) => ({ label: a.label, data: a.data }))
      : undefined,
  };
}
