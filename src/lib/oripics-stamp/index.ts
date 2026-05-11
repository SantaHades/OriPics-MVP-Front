import {
  decodeImageToCanvas,
  computeInnerHash,
  computeBorderHash,
  embedPayload,
  extractPayload,
  payloadHasMagic,
  splitPayload,
  buildPayload,
  encodeCanvasToPng,
  selectEmbedMode,
} from './v2';
import {
  selectEmbedModeV3,
  computeBorderHashV3,
  embedPayloadV3,
  extractPayloadV3,
  splitPayloadV3,
  buildPayloadV3,
  readGpsFromMeta,
} from './v3';
import {
  selectEmbedModeV4,
  computeBorderHashV4,
  embedPayloadV4,
  extractPayloadV4,
  splitPayloadV4,
  buildPayloadV4,
  readGpsFromMetaV4,
} from './v4';
import {
  PAYLOAD_LENGTH,
  META_LENGTH,
  HASH_LENGTH,
  OFFSET_WIDTH,
  OFFSET_HEIGHT,
  OFFSET_VERSION,
  OFFSET_TIMESTAMP,
  bytesToHex,
  hexToBytes,
  readUint16BE,
  readUint32BE,
} from './common';
import { applyWatermark } from './watermark';

export interface SignResponse {
  version: number;
  salt_id: number;
  timestamp: string;
  meta_hex: string;
  final_hash: string;
  link_id: string;
  storage_path: string;
  signed_upload_url: string;
  upload_token: string;
  jwt: string;
  jwt_ttl: number;
}

export interface ConfirmResponse {
  link_id: string;
  timestamp: string;
  storage_path: string;
}

export interface VerifyResponse {
  match: boolean;
  version?: number;
  reason?: string;
  metadata?: {
    timestamp: string;
    width: number;
    height: number;
    lat?: number;
    lng?: number;
  };
}

export interface StampedDraft {
  blob: Blob;
  width: number;
  height: number;
  sign: SignResponse;
  gps?: { lat: number; lng: number } | null;
}

export type UploadType = 'F' | 'P' | 'C';

export interface SignAndStampOptions {
  apiBase: string;
  uploadType?: UploadType;
  gps?: { lat: number; lng: number } | null;
  watermark?: boolean;
}

export async function signAndStampFromPixels(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  opts: SignAndStampOptions,
): Promise<StampedDraft> {
  const apiBase = opts.apiBase.replace(/\/$/, '');

  if (opts.watermark) {
    pixels = await applyWatermark(pixels, width, height);
  }

  // V4 단일 흐름 (옵션 A: 자기 이미지 검증 면책 위한 counter 포함).
  // GPS 미사용 시 lat_e6=lng_e6=0 sentinel. 모든 신규 인증은 V4.
  // 구 V2/V3는 backward compat verify 흐름에만 유지.
  const hasGps = opts.gps != null;
  const mode = selectEmbedModeV4(width, height);
  const [innerHash, borderHash] = await Promise.all([
    computeInnerHash(pixels, width, height),
    computeBorderHashV4(pixels, width, height, mode),
  ]);

  const body: Record<string, any> = {
    inner_hash: bytesToHex(innerHash),
    border_hash: bytesToHex(borderHash),
    width,
    height,
    upload_type: opts.uploadType ?? 'F',
  };
  if (hasGps) {
    body.lat_e6 = Math.round(opts.gps!.lat * 1_000_000);
    body.lng_e6 = Math.round(opts.gps!.lng * 1_000_000);
  }

  const signRes = await fetch(`${apiBase}/api/sign`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!signRes.ok) {
    const detail = await signRes.text();
    throw new Error(`sign_failed:${signRes.status}:${detail}`);
  }
  const sign: SignResponse = await signRes.json();

  const meta = hexToBytes(sign.meta_hex);
  const finalHash = hexToBytes(sign.final_hash);
  const payload = buildPayloadV4(meta, finalHash);

  const stamped = new Uint8ClampedArray(pixels);
  embedPayloadV4(stamped, width, height, payload, mode);
  const blob = await encodeCanvasToPng(stamped, width, height);

  return { blob, width, height, sign, gps: hasGps ? opts.gps! : null };
}

export async function signAndStamp(file: Blob, opts: SignAndStampOptions): Promise<StampedDraft> {
  const { data: pixels, width, height } = await decodeImageToCanvas(file);
  return signAndStampFromPixels(pixels, width, height, opts);
}

export async function uploadStamped(draft: StampedDraft): Promise<void> {
  let res: Response;
  try {
    res = await fetch(draft.sign.signed_upload_url, {
      method: 'PUT',
      headers: { 'Content-Type': 'image/png' },
      body: draft.blob,
    });
  } catch (e: any) {
    throw new Error(`upload_failed:0:${JSON.stringify({ detail: `network_error:${e?.message || e}` })}`);
  }
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`upload_failed:${res.status}:${detail}`);
  }
}

export async function confirmLink(draft: StampedDraft, opts: { apiBase: string }): Promise<ConfirmResponse> {
  const apiBase = opts.apiBase.replace(/\/$/, '');
  let res: Response;
  try {
    res = await fetch(`${apiBase}/api/links/confirm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jwt_token: draft.sign.jwt }),
    });
  } catch (e: any) {
    throw new Error(`confirm_failed:0:${JSON.stringify({ detail: `network_error:${e?.message || e}` })}`);
  }
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`confirm_failed:${res.status}:${detail}`);
  }
  return res.json();
}

export async function publishStamped(draft: StampedDraft, opts: { apiBase: string }): Promise<ConfirmResponse> {
  const [, confirmResult] = await Promise.all([
    uploadStamped(draft),
    confirmLink(draft, opts),
  ]);
  return confirmResult;
}

/**
 * 클라이언트 측 무료 detect — magic byte로 OriPics 인증 여부 판단.
 * 해시 계산·서버 호출 없음. 차감 없음.
 *
 * 풀 검증(/api/verify)은 `verifyImage`에서 별도로 -1 차감 + 서버 검증.
 */
export interface DetectResult {
  hasStamp: boolean;
  version?: number;
  reason?: 'no_stamp' | 'image_too_small' | 'dimension_mismatch';
  /** detect 결과로 즉시 표시 가능한 비신뢰 메타데이터 (서버 검증 전) */
  preview?: {
    timestamp: string;
    width: number;
    height: number;
    lat?: number | null;
    lng?: number | null;
  };
}

export async function detectStamp(file: Blob): Promise<DetectResult> {
  const { data: pixels, width, height } = await decodeImageToCanvas(file);

  let mode;
  try {
    mode = selectEmbedMode(width, height);
  } catch {
    return { hasStamp: false, reason: 'image_too_small' };
  }

  const payloadV2 = extractPayload(pixels, width, height, mode);
  if (!payloadHasMagic(payloadV2)) {
    return { hasStamp: false, reason: 'no_stamp' };
  }

  const version = readUint16BE(payloadV2, OFFSET_VERSION);

  if (version === 4) {
    // V4: V3 메타 + counter 2 bytes
    let modeV4;
    try {
      modeV4 = selectEmbedModeV4(width, height);
    } catch {
      return { hasStamp: false, reason: 'image_too_small' };
    }
    const payloadV4 = extractPayloadV4(pixels, width, height, modeV4);
    const { meta } = splitPayloadV4(payloadV4);
    const gps = readGpsFromMetaV4(meta);
    const hasGps = gps.lat !== 0 || gps.lng !== 0;
    return {
      hasStamp: true,
      version: 4,
      preview: {
        timestamp: extractTimestampFromMeta(meta),
        width: readUint32BE(meta, OFFSET_WIDTH),
        height: readUint32BE(meta, OFFSET_HEIGHT),
        lat: hasGps ? gps.lat : null,
        lng: hasGps ? gps.lng : null,
      },
    };
  }

  if (version === 3) {
    let modeV3;
    try {
      modeV3 = selectEmbedModeV3(width, height);
    } catch {
      return { hasStamp: false, reason: 'image_too_small' };
    }
    const payloadV3 = extractPayloadV3(pixels, width, height, modeV3);
    const { meta } = splitPayloadV3(payloadV3);
    const gps = readGpsFromMeta(meta);
    return {
      hasStamp: true,
      version: 3,
      preview: {
        timestamp: extractTimestampFromMeta(meta),
        width: readUint32BE(meta, OFFSET_WIDTH),
        height: readUint32BE(meta, OFFSET_HEIGHT),
        lat: gps.lat,
        lng: gps.lng,
      },
    };
  }

  // v2
  const { meta } = splitPayload(payloadV2);
  return {
    hasStamp: true,
    version: 2,
    preview: {
      timestamp: extractTimestampFromMeta(meta),
      width: readUint32BE(meta, OFFSET_WIDTH),
      height: readUint32BE(meta, OFFSET_HEIGHT),
    },
  };
}

function extractTimestampFromMeta(meta: Uint8Array): string {
  // common.ts의 OFFSET_TIMESTAMP·TIMESTAMP_LENGTH 사용
  let s = '';
  for (let i = 0; i < 15; i++) {
    s += String.fromCharCode(meta[OFFSET_TIMESTAMP + i]);
  }
  return s;
}

export async function verifyImage(file: Blob, opts: { apiBase: string }): Promise<VerifyResponse> {
  const apiBase = opts.apiBase.replace(/\/$/, '');
  const { data: pixels, width, height } = await decodeImageToCanvas(file);

  let mode;
  try {
    mode = selectEmbedMode(width, height);
  } catch {
    return { match: false, reason: 'image_too_small' };
  }

  // 1차 추출 (v2 크기, 568 bits) — version 필드 읽기 목적
  const payloadV2 = extractPayload(pixels, width, height, mode);
  if (!payloadHasMagic(payloadV2)) {
    return { match: false, reason: 'no_stamp' };
  }

  const version = readUint16BE(payloadV2, OFFSET_VERSION);

  if (version === 4) {
    // V4: 메타에 counter 인코딩됨 → 서버가 owner 매칭 → 면책 가능
    let modeV4;
    try {
      modeV4 = selectEmbedModeV4(width, height);
    } catch {
      return { match: false, reason: 'image_too_small' };
    }
    const payloadV4 = extractPayloadV4(pixels, width, height, modeV4);
    const { meta, finalHash } = splitPayloadV4(payloadV4);

    const claimedW = readUint32BE(meta, OFFSET_WIDTH);
    const claimedH = readUint32BE(meta, OFFSET_HEIGHT);
    if (claimedW !== width || claimedH !== height) {
      return { match: false, reason: 'dimension_mismatch' };
    }

    const [innerHash, borderHash] = await Promise.all([
      computeInnerHash(pixels, width, height),
      computeBorderHashV4(pixels, width, height, modeV4),
    ]);

    const res = await fetch(`${apiBase}/api/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        meta_hex: bytesToHex(meta),
        inner_hash: bytesToHex(innerHash),
        border_hash: bytesToHex(borderHash),
        extracted_final_hash: bytesToHex(finalHash),
      }),
    });
    if (!res.ok) {
      return { match: false, reason: `verify_http_${res.status}` };
    }
    const result: VerifyResponse = await res.json();
    if (result.metadata) {
      // V4는 GPS sentinel(0)일 수도 있음 — 백엔드가 채우지만 0이면 null로
      const gps = readGpsFromMetaV4(meta);
      if (gps.lat !== 0 || gps.lng !== 0) {
        result.metadata.lat = gps.lat;
        result.metadata.lng = gps.lng;
      } else {
        result.metadata.lat = undefined;
        result.metadata.lng = undefined;
      }
    }
    return result;
  }

  if (version === 3) {
    // 2차 추출 (v3 크기, 632 bits)
    let modeV3;
    try {
      modeV3 = selectEmbedModeV3(width, height);
    } catch {
      return { match: false, reason: 'image_too_small' };
    }

    const payloadV3 = extractPayloadV3(pixels, width, height, modeV3);
    const { meta, finalHash } = splitPayloadV3(payloadV3);

    const claimedW = readUint32BE(meta, OFFSET_WIDTH);
    const claimedH = readUint32BE(meta, OFFSET_HEIGHT);
    if (claimedW !== width || claimedH !== height) {
      return { match: false, reason: 'dimension_mismatch' };
    }

    const [innerHash, borderHash] = await Promise.all([
      computeInnerHash(pixels, width, height),
      computeBorderHashV3(pixels, width, height, modeV3),
    ]);

    const res = await fetch(`${apiBase}/api/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        meta_hex: bytesToHex(meta),
        inner_hash: bytesToHex(innerHash),
        border_hash: bytesToHex(borderHash),
        extracted_final_hash: bytesToHex(finalHash),
      }),
    });
    if (!res.ok) {
      return { match: false, reason: `verify_http_${res.status}` };
    }
    const result: VerifyResponse = await res.json();
    if (result.metadata && result.metadata.lat == null) {
      // 백엔드가 lat/lng를 안 줬을 경우 프론트에서 직접 파싱
      const gps = readGpsFromMeta(meta);
      result.metadata.lat = gps.lat;
      result.metadata.lng = gps.lng;
    }
    return result;
  }

  // v2 검증
  const { meta, finalHash } = splitPayload(payloadV2);

  const claimedW = readUint32BE(meta, OFFSET_WIDTH);
  const claimedH = readUint32BE(meta, OFFSET_HEIGHT);
  if (claimedW !== width || claimedH !== height) {
    return { match: false, reason: 'dimension_mismatch' };
  }

  const [innerHash, borderHash] = await Promise.all([
    computeInnerHash(pixels, width, height),
    computeBorderHash(pixels, width, height, mode),
  ]);

  const res = await fetch(`${apiBase}/api/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      meta_hex: bytesToHex(meta),
      inner_hash: bytesToHex(innerHash),
      border_hash: bytesToHex(borderHash),
      extracted_final_hash: bytesToHex(finalHash),
    }),
  });
  if (!res.ok) {
    return { match: false, reason: `verify_http_${res.status}` };
  }
  return res.json();
}

export {
  decodeImageToCanvas,
  computeInnerHash,
  computeBorderHash,
  embedPayload,
  extractPayload,
  payloadHasMagic,
  splitPayload,
  buildPayload,
  encodeCanvasToPng,
  selectEmbedMode,
  bytesToHex,
  hexToBytes,
  PAYLOAD_LENGTH,
  META_LENGTH,
  HASH_LENGTH,
};
