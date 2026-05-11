import {
  OFFSET_FINAL_HASH_V4,
  META_LENGTH_V4,
  HASH_LENGTH,
  PAYLOAD_LENGTH_V4,
  PAYLOAD_BITS_V4,
  EmbedMode,
  selectEmbedModeV4,
  getBorderCoordinates,
  uint32BE,
  bytesEqual,
  int32BE,
  readInt32BE,
  readUint16BE,
  OFFSET_LAT,
  OFFSET_LNG,
  OFFSET_COUNTER_V4,
} from './common';

// v2/v3에서 재사용 (픽셀 크기 무관 함수들)
export { decodeImageToCanvas, computeInnerHash, encodeCanvasToPng, payloadHasMagic } from './v2';

const RGB_CHANNELS = [0, 1, 2] as const;

function pixelOffset(width: number, y: number, x: number): number {
  return (y * width + x) * 4;
}

async function sha256(buf: Uint8Array): Promise<Uint8Array> {
  const hash = await crypto.subtle.digest('SHA-256', buf as unknown as BufferSource);
  return new Uint8Array(hash);
}

export async function computeBorderHashV4(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  mode: EmbedMode,
): Promise<Uint8Array> {
  const coords = getBorderCoordinates(width, height);
  const borderPixelCount = coords.length;
  const buf = new Uint8Array(8 + borderPixelCount * 4);
  buf.set(uint32BE(width), 0);
  buf.set(uint32BE(height), 4);

  for (let i = 0; i < borderPixelCount; i++) {
    const [y, x] = coords[i];
    const src = pixelOffset(width, y, x);
    const dst = 8 + i * 4;
    buf[dst]     = pixels[src];
    buf[dst + 1] = pixels[src + 1];
    buf[dst + 2] = pixels[src + 2];
    buf[dst + 3] = pixels[src + 3];
  }

  if (mode === 'b_only') {
    for (let i = 0; i < PAYLOAD_BITS_V4; i++) {
      buf[8 + i * 4 + 2] &= 0xfe;
    }
  } else {
    const usedPixels = Math.ceil(PAYLOAD_BITS_V4 / 3);
    for (let i = 0; i < usedPixels; i++) {
      const base = 8 + i * 4;
      buf[base]     &= 0xfe;
      buf[base + 1] &= 0xfe;
      buf[base + 2] &= 0xfe;
    }
  }

  return sha256(buf);
}

export function embedPayloadV4(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  payload: Uint8Array,
  mode: EmbedMode,
): void {
  if (payload.length !== PAYLOAD_LENGTH_V4) {
    throw new Error(`payload must be ${PAYLOAD_LENGTH_V4} bytes, got ${payload.length}`);
  }
  const coords = getBorderCoordinates(width, height);

  for (let bitIdx = 0; bitIdx < PAYLOAD_BITS_V4; bitIdx++) {
    const byte = payload[bitIdx >> 3];
    const bit = (byte >> (7 - (bitIdx & 7))) & 1;

    let coordIdx: number;
    let channel: number;
    if (mode === 'b_only') {
      coordIdx = bitIdx;
      channel = 2;
    } else {
      coordIdx = Math.floor(bitIdx / 3);
      channel = RGB_CHANNELS[bitIdx % 3];
    }
    const [y, x] = coords[coordIdx];
    const off = pixelOffset(width, y, x) + channel;
    pixels[off] = (pixels[off] & 0xfe) | bit;
  }
}

export function extractPayloadV4(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  mode: EmbedMode,
): Uint8Array {
  const coords = getBorderCoordinates(width, height);
  const out = new Uint8Array(PAYLOAD_LENGTH_V4);

  for (let bitIdx = 0; bitIdx < PAYLOAD_BITS_V4; bitIdx++) {
    let coordIdx: number;
    let channel: number;
    if (mode === 'b_only') {
      coordIdx = bitIdx;
      channel = 2;
    } else {
      coordIdx = Math.floor(bitIdx / 3);
      channel = RGB_CHANNELS[bitIdx % 3];
    }
    const [y, x] = coords[coordIdx];
    const off = pixelOffset(width, y, x) + channel;
    const bit = pixels[off] & 1;
    out[bitIdx >> 3] |= bit << (7 - (bitIdx & 7));
  }
  return out;
}

export function splitPayloadV4(payload: Uint8Array): { meta: Uint8Array; finalHash: Uint8Array } {
  if (payload.length !== PAYLOAD_LENGTH_V4) {
    throw new Error(`payload length: ${payload.length}`);
  }
  return {
    meta: payload.subarray(0, META_LENGTH_V4),
    finalHash: payload.subarray(OFFSET_FINAL_HASH_V4, OFFSET_FINAL_HASH_V4 + HASH_LENGTH),
  };
}

export function buildPayloadV4(meta: Uint8Array, finalHash: Uint8Array): Uint8Array {
  if (meta.length !== META_LENGTH_V4) throw new Error('meta length');
  if (finalHash.length !== HASH_LENGTH) throw new Error('final_hash length');
  const out = new Uint8Array(PAYLOAD_LENGTH_V4);
  out.set(meta, 0);
  out.set(finalHash, OFFSET_FINAL_HASH_V4);
  return out;
}

export function readGpsFromMetaV4(meta: Uint8Array): { lat: number; lng: number } {
  const lat_e6 = readInt32BE(meta, OFFSET_LAT);
  const lng_e6 = readInt32BE(meta, OFFSET_LNG);
  return { lat: lat_e6 / 1_000_000, lng: lng_e6 / 1_000_000 };
}

export function readCounterFromMetaV4(meta: Uint8Array): number {
  return readUint16BE(meta, OFFSET_COUNTER_V4);
}

export { selectEmbedModeV4, bytesEqual, int32BE };
