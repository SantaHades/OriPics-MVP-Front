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
  PAYLOAD_LENGTH,
  META_LENGTH,
  HASH_LENGTH,
  OFFSET_WIDTH,
  OFFSET_HEIGHT,
  bytesToHex,
  hexToBytes,
  readUint32BE,
} from './common';

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
  metadata?: { timestamp: string; width: number; height: number };
}

export interface StampedDraft {
  blob: Blob;
  width: number;
  height: number;
  sign: SignResponse;
}

export type UploadType = 'F' | 'P' | 'C';

export interface SignAndStampOptions {
  apiBase: string;
  uploadType?: UploadType;
}

export async function signAndStamp(file: Blob, opts: SignAndStampOptions): Promise<StampedDraft> {
  const apiBase = opts.apiBase.replace(/\/$/, '');
  const { data: pixels, width, height } = await decodeImageToCanvas(file);
  const mode = selectEmbedMode(width, height);

  const innerHash = await computeInnerHash(pixels, width, height);
  const borderHash = await computeBorderHash(pixels, width, height, mode);

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

  return { blob, width, height, sign };
}

export async function uploadStamped(draft: StampedDraft): Promise<void> {
  const res = await fetch(draft.sign.signed_upload_url, {
    method: 'PUT',
    headers: { 'Content-Type': 'image/png' },
    body: draft.blob,
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`upload_failed:${res.status}:${detail}`);
  }
}

export async function confirmLink(draft: StampedDraft, opts: { apiBase: string }): Promise<ConfirmResponse> {
  const apiBase = opts.apiBase.replace(/\/$/, '');
  const res = await fetch(`${apiBase}/api/links/confirm`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jwt_token: draft.sign.jwt }),
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`confirm_failed:${res.status}:${detail}`);
  }
  return res.json();
}

export async function publishStamped(draft: StampedDraft, opts: { apiBase: string }): Promise<ConfirmResponse> {
  await uploadStamped(draft);
  return confirmLink(draft, opts);
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

  const payload = extractPayload(pixels, width, height, mode);
  if (!payloadHasMagic(payload)) {
    return { match: false, reason: 'no_stamp' };
  }

  const { meta, finalHash } = splitPayload(payload);

  const claimedW = readUint32BE(meta, OFFSET_WIDTH);
  const claimedH = readUint32BE(meta, OFFSET_HEIGHT);
  if (claimedW !== width || claimedH !== height) {
    return { match: false, reason: 'dimension_mismatch' };
  }

  const innerHash = await computeInnerHash(pixels, width, height);
  const borderHash = await computeBorderHash(pixels, width, height, mode);

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
