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
  PAYLOAD_LENGTH,
  META_LENGTH,
  HASH_LENGTH,
  OFFSET_WIDTH,
  OFFSET_HEIGHT,
  OFFSET_VERSION,
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

  const useV3 = (
    opts.uploadType === 'P' &&
    opts.gps != null &&
    width >= 300 &&
    height >= 300
  );

  if (useV3) {
    const gps = opts.gps!;
    const mode = selectEmbedModeV3(width, height);
    const [innerHash, borderHash] = await Promise.all([
      computeInnerHash(pixels, width, height),
      computeBorderHashV3(pixels, width, height, mode),
    ]);

    const signRes = await fetch(`${apiBase}/api/sign`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        inner_hash: bytesToHex(innerHash),
        border_hash: bytesToHex(borderHash),
        width,
        height,
        upload_type: 'P',
        lat_e6: Math.round(gps.lat * 1_000_000),
        lng_e6: Math.round(gps.lng * 1_000_000),
      }),
    });
    if (!signRes.ok) {
      const detail = await signRes.text();
      throw new Error(`sign_failed:${signRes.status}:${detail}`);
    }
    const sign: SignResponse = await signRes.json();

    const meta = hexToBytes(sign.meta_hex);
    const finalHash = hexToBytes(sign.final_hash);
    const payload = buildPayloadV3(meta, finalHash);

    const stamped = new Uint8ClampedArray(pixels);
    embedPayloadV3(stamped, width, height, payload, mode);
    const blob = await encodeCanvasToPng(stamped, width, height);

    return { blob, width, height, sign, gps };
  }

  // v2
  const mode = selectEmbedMode(width, height);
  const [innerHash, borderHash] = await Promise.all([
    computeInnerHash(pixels, width, height),
    computeBorderHash(pixels, width, height, mode),
  ]);

  const signRes = await fetch(`${apiBase}/api/sign`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      inner_hash: bytesToHex(innerHash),
      border_hash: bytesToHex(borderHash),
      width,
      height,
      upload_type: opts.uploadType ?? 'F',
    }),
  });
  if (!signRes.ok) {
    const detail = await signRes.text();
    throw new Error(`sign_failed:${signRes.status}:${detail}`);
  }
  const sign: SignResponse = await signRes.json();

  const meta = hexToBytes(sign.meta_hex);
  const finalHash = hexToBytes(sign.final_hash);
  const payload = buildPayload(meta, finalHash);

  const stamped = new Uint8ClampedArray(pixels);
  embedPayload(stamped, width, height, payload, mode);
  const blob = await encodeCanvasToPng(stamped, width, height);

  return { blob, width, height, sign, gps: null };
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
