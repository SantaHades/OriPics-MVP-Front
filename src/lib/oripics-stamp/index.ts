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
  /** stamped + C2PA 적용된 PNG (브라우저 메모리에서 보관, publish 시 재전송) */
  stampedBlob: Blob;
  link_id: string;
  timestamp: string;
  /** publish 시 재제출할 receipt JWT (localStorage 보관 권장) */
  receipt: string;
  /** 차감된 proof 크레딧 (UI 표시용) */
  proofCost: number;
}

export interface PublishResponse {
  link_id: string;
  timestamp: string;
  public_url: string;
  already_published?: boolean;
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
  /** V4 메타에서 owner가 호출자와 일치하면 true — 차감 면제됨 */
  owner_exempt?: boolean;
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

/**
 * confirmStamped — B-2 흐름 (2026-05-17):
 *   - 클라가 stamped PNG + JWT를 multipart로 confirm 라우트에 전송
 *   - 서버는 C2PA 적용 후 image bytes + receipt JWT 응답 (Storage/DB 변경 없음)
 *   - 응답으로 받은 stamped+C2PA Blob과 receipt를 반환 — publish 시 재전송
 *
 * onUploadProgress: 요청 바이트 업로드 진행률 (XHR 채택)
 */
export function confirmStamped(
  draft: StampedDraft,
  opts: {
    apiBase: string;
    onUploadProgress?: (loaded: number, total: number) => void;
  },
): Promise<ConfirmResponse> {
  const apiBase = opts.apiBase.replace(/\/$/, '');
  return new Promise<ConfirmResponse>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${apiBase}/api/links/confirm`);
    xhr.responseType = 'blob';
    if (opts.onUploadProgress) {
      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) opts.onUploadProgress!(e.loaded, e.total);
        else opts.onUploadProgress!(e.loaded, draft.blob.size || 0);
      });
    }
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        if (opts.onUploadProgress) opts.onUploadProgress(draft.blob.size, draft.blob.size);
        const receipt = xhr.getResponseHeader('X-Oripics-Receipt') || '';
        const linkId = xhr.getResponseHeader('X-Oripics-Link-Id') || draft.sign.link_id;
        const timestamp = xhr.getResponseHeader('X-Oripics-Timestamp') || draft.sign.timestamp;
        const proofCost = parseInt(xhr.getResponseHeader('X-Oripics-Proof-Cost') || '0', 10);
        if (!receipt) {
          reject(new Error('confirm_failed:200:missing_receipt_header'));
          return;
        }
        resolve({
          stampedBlob: xhr.response as Blob,
          link_id: linkId,
          timestamp,
          receipt,
          proofCost,
        });
      } else {
        // 에러 응답은 JSON일 가능성 → blob을 텍스트로 변환
        const blob = xhr.response as Blob | null;
        if (blob && blob.type.includes('json')) {
          blob.text().then((t) => {
            reject(new Error(`confirm_failed:${xhr.status}:${t}`));
          }).catch(() => {
            reject(new Error(`confirm_failed:${xhr.status}:`));
          });
        } else {
          reject(new Error(`confirm_failed:${xhr.status}:`));
        }
      }
    };
    xhr.onerror = () => reject(new Error(`confirm_failed:0:network_error`));
    xhr.onabort = () => reject(new Error('confirm_failed:0:aborted'));

    const form = new FormData();
    form.append('jwt_token', draft.sign.jwt);
    form.append('image', draft.blob, 'stamped.png');
    xhr.send(form);
  });
}

/**
 * publishStamped — B-2 흐름:
 *   - stamped+C2PA Blob과 receipt JWT를 publish 라우트에 전송
 *   - 서버: Storage 업로드 + links DB row 생성 + LINK_CREATE 차감
 */
export async function publishStamped(
  args: {
    apiBase: string;
    stampedBlob: Blob;
    receipt: string;
    thumbnailDataUrl?: string | null;
    onUploadProgress?: (loaded: number, total: number) => void;
  },
): Promise<PublishResponse> {
  const apiBase = args.apiBase.replace(/\/$/, '');
  return new Promise<PublishResponse>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${apiBase}/api/links/publish`);
    xhr.responseType = 'json';
    if (args.onUploadProgress) {
      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) args.onUploadProgress!(e.loaded, e.total);
      });
    }
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(xhr.response as PublishResponse);
      } else {
        const detail = xhr.response ? JSON.stringify(xhr.response) : '';
        reject(new Error(`publish_failed:${xhr.status}:${detail}`));
      }
    };
    xhr.onerror = () => reject(new Error('publish_failed:0:network_error'));
    xhr.onabort = () => reject(new Error('publish_failed:0:aborted'));

    const form = new FormData();
    form.append('receipt', args.receipt);
    form.append('image', args.stampedBlob, 'stamped.png');
    if (args.thumbnailDataUrl) {
      form.append('thumbnail', args.thumbnailDataUrl);
    }
    xhr.send(form);
  });
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
