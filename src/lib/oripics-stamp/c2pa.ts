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
  const { Builder, LocalSigner, Reader, createTrustSettings, createVerifySettings, mergeSettings } = c2pa;

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

  // === Prior manifest 감지 (actions 결정보다 먼저) ===
  // 기존 C2PA가 있으면 c2pa.opened, 없으면 c2pa.created
  let priorManifest: { label: string; data: any } | null = null;
  try {
    const existingReader = await Reader.fromAsset({ buffer: input.pngBuffer, mimeType: 'image/png' }, settings);
    if (existingReader) {
      const store: any = existingReader.json();
      const activeLabel: string | undefined = store?.active_manifest;
      const activeManifest: any = activeLabel ? store?.manifests?.[activeLabel] : undefined;
      if (activeManifest) {
        priorManifest = { label: activeLabel, data: activeManifest };
      }
    }
  } catch {
    // 기존 매니페스트 없음 또는 읽기 오류 — 계속 진행
  }

  // === Manifest ===
  // Action selection (TOE boundary 기반):
  //   prior manifest 있음  → c2pa.opened  (기존 C2PA 인제스트, C2PA §9.3.2)
  //   verified tier (모바일, App Attest/Play Integrity 확인)
  //                        → c2pa.created + digitalCapture (카메라 직접 캡처, TOE 내)
  //   standard tier (web browser 업로드) → c2pa.published
  //     * Web 브라우저는 TOE 경계 밖: 캡처 사실 검증 불가.
  //       digitalCapture/c2pa.created 사용 불가 (C2PA GPSA §O.4).
  let primaryAction: string;
  const primaryActionBase: any = { when: input.timestamp, softwareAgent: { name: 'oripics' } };

  if (priorManifest) {
    // 기존 C2PA manifest 있음 → c2pa.opened + parentOf ingredient (C2PA spec §9.3.2)
    primaryAction = 'c2pa.opened';
  } else if (input.tier === 'verified') {
    // Verified tier (모바일 직접 촬영, App Attest/Play Integrity 확인):
    // 하드웨어 카메라 캡처가 증명되므로 c2pa.created + digitalCapture 사용
    primaryAction = 'c2pa.created';
    primaryActionBase.digitalSourceType =
      'http://cv.iptc.org/newscodes/digitalsourcetype/digitalCapture';
  } else {
    // Standard tier (web/file-pick, prior manifest 없음):
    // c2pa.created — DST 없음. OriPics가 이 C2PA manifest를 생성했다는 사실만 주장.
    // digitalCapture 미사용: 캡처 검증 불가 (TOE 외부, C2PA GPSA §O.4).
    // c2pa.opened는 ingredient 필수(spec)이므로 사용 불가.
    primaryAction = 'c2pa.created';
  }

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
  const builder = settings
    ? Builder.withJson(manifestSpec as any, settings)
    : Builder.withJson(manifestSpec as any);

  // c2pa.opened 케이스: setIntent("edit") 사용
  //   c2pa-rs가 c2pa.opened + ingredient 참조(hash 포함)를 자동 생성.
  //   addAction으로 c2pa.opened + parameters.ingredient.hash를 수동 설정하면
  //   signing 전 hash를 알 수 없어 에러 발생.
  // c2pa.created 케이스: addAction() 으로 created_assertions에 배치
  if (primaryAction === 'c2pa.opened') {
    builder.setIntent('edit');
  } else {
    builder.addAction(JSON.stringify({ action: primaryAction, ...primaryActionBase }));
  }
  builder.addAction(JSON.stringify({
    action: input.tier === 'verified' ? 'com.oripics.captured' : 'com.oripics.stamped',
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

  // === Ingredient: 기존 C2PA 매니페스트가 있으면 parentOf로 체인 ===
  // c2pa.opened 액션 + prior manifest를 ingredient로 추가 (C2PA spec §9.3.2)
  if (priorManifest) {
    try {
      const ingredientJson = JSON.stringify({
        title: priorManifest.data.title || 'Prior Content',
        format: 'image/png',
        instance_id: priorManifest.data.instance_id || '',
        relationship: 'parentOf',
      });
      await builder.addIngredient(ingredientJson, { buffer: input.pngBuffer, mimeType: 'image/png' });
      console.log(`[c2pa] ingredient added: ${priorManifest.label}`);
    } catch (e: any) {
      console.warn(`[c2pa] ingredient add failed: ${e?.message}`);
    }
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
