// C2PA Content Credentials 매니페스트 첨부 모듈
//
// 환경변수:
//   ORIPICS_C2PA_CERT_PEM  — leaf cert + intermediate chain (PEM, multi-cert OK)
//   ORIPICS_C2PA_KEY_PEM   — leaf private key (PKCS#8 PEM, ECDSA P-256)
//   ORIPICS_C2PA_CA_PEM    — (선택) self-signed dev CA. 없으면 production cert (Trust List 기반) 모드
//   ORIPICS_C2PA_TSA_URL   — (선택) RFC 3161 TimeStamp Authority URL
//
// 주의: c2pa-node v0.5.x 기준. builder.sign()은 동기 함수이고 반환값이 Buffer.

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
  const { Builder, LocalSigner, createTrustSettings, createVerifySettings, mergeSettings } = c2pa;

  // === Signer ===
  const signer = LocalSigner.newSigner(
    Buffer.from(CERT_PEM),
    Buffer.from(KEY_PEM),
    'es256',
    TSA_URL || undefined,
  );

  // === Settings ===
  // CA_PEM 있으면 self-signed dev 모드 (CA를 trust anchor로 등록).
  // 없으면 production 모드 (cert가 C2PA Trust List CA에서 발급된 것으로 간주).
  let settings: any = undefined;
  if (CA_PEM) {
    settings = mergeSettings(
      createTrustSettings({ verifyTrustList: true, trustAnchors: CA_PEM }),
      createVerifySettings({ verifyAfterSign: true }),
    );
  }

  // === Manifest ===
  // c2pa.actions.v2: c2pa.created 액션. 두 tier 모두 digitalCapture (algorithmicMedia는 AI 생성 콘텐츠 전용)
  const actions: any[] = [
    {
      action: 'c2pa.created',
      when: input.timestamp,
      digitalSourceType: 'http://cv.iptc.org/newscodes/digitalsourcetype/digitalCapture',
      softwareAgent: { name: 'oripics' },
    },
    {
      action: input.tier === 'verified' ? 'com.oripics.captured' : 'com.oripics.stamped',
      parameters: { tier: input.tier, version: input.stampVersion },
    },
  ];

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

  // assertions 배열을 manifestSpec에서 제외하고 addAssertion()으로 추가:
  // → withJson spec의 assertions[]는 gathered_assertions로 분류되나,
  //   addAssertion() API로 추가하면 created_assertions에 들어감 (c2pa-node v0.5.x)
  const manifestSpec = {
    claim_generator:
      input.tier === 'verified' ? 'oripics/0.1.0 (mobile-native)' : 'oripics/0.1.0',
    title: `OriPics Original Proof (${input.tier === 'verified' ? 'Verified' : 'Standard'})`,
    format: 'image/png',
    instance_id: `xmp:iid:${input.linkId}`,
  };

  // === Sign ===
  const builder = settings
    ? Builder.withJson(manifestSpec as any, settings)
    : Builder.withJson(manifestSpec as any);

  // created_assertions에 들어가도록 addAssertion() API 사용
  builder.addAssertion('c2pa.actions.v2', { actions });
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
  valid: boolean;
  validation_status: Array<{ code: string; url?: string; explanation?: string }>;
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
  const { Reader, createTrustSettings, mergeSettings } = c2pa;

  let settings: any = undefined;
  if (CA_PEM) {
    settings = mergeSettings(
      createTrustSettings({ verifyTrustList: true, trustAnchors: CA_PEM }),
    );
  }

  const reader = await Reader.fromAsset({ buffer: pngBuffer, mimeType }, settings);

  if (!reader) {
    return { present: false, valid: false, validation_status: [] };
  }

  const store: any = reader.json();
  const activeLabel: string | undefined = store?.active_manifest;
  const manifest: any = activeLabel ? store?.manifests?.[activeLabel] : undefined;
  const validationIssues: any[] = Array.isArray(store?.validation_status)
    ? store.validation_status
    : [];
  const valid = validationIssues.length === 0 && !!manifest;

  const sig = manifest?.signature_info;

  return {
    present: true,
    valid,
    validation_status: validationIssues,
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
