import {
  OFFSET_FINAL_HASH_V5,
  META_LENGTH_V5,
  HASH_LENGTH,
  PAYLOAD_LENGTH_V5,
  PAYLOAD_BITS_V5,
  OFFSET_CAPTURED_AT_V5,
  CAPTURED_AT_LENGTH,
  EmbedMode,
  getBorderCoordinates,
  uint32BE,
  readInt32BE,
  readUint16BE,
  OFFSET_LAT,
  OFFSET_LNG,
  OFFSET_COUNTER_V4,
} from './common';
import type { Sha256Fn } from './codec';

const RGB_CHANNELS = [0, 1, 2] as const;

function pixelOffset(width: number, y: number, x: number): number {
  return (y * width + x) * 4;
}

export async function computeBorderHashV5(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  mode: EmbedMode,
  sha256: Sha256Fn,
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
    for (let i = 0; i < PAYLOAD_BITS_V5; i++) {
      buf[8 + i * 4 + 2] &= 0xfe;
    }
  } else {
    const usedPixels = Math.ceil(PAYLOAD_BITS_V5 / 3);
    for (let i = 0; i < usedPixels; i++) {
      const base = 8 + i * 4;
      buf[base]     &= 0xfe;
      buf[base + 1] &= 0xfe;
      buf[base + 2] &= 0xfe;
    }
  }

  return sha256(buf);
}

export function embedPayloadV5(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  payload: Uint8Array,
  mode: EmbedMode,
): void {
  if (payload.length !== PAYLOAD_LENGTH_V5) {
    throw new Error(`payload must be ${PAYLOAD_LENGTH_V5} bytes, got ${payload.length}`);
  }
  const coords = getBorderCoordinates(width, height);

  for (let bitIdx = 0; bitIdx < PAYLOAD_BITS_V5; bitIdx++) {
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

export function extractPayloadV5(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  mode: EmbedMode,
): Uint8Array {
  const coords = getBorderCoordinates(width, height);
  const out = new Uint8Array(PAYLOAD_LENGTH_V5);

  for (let bitIdx = 0; bitIdx < PAYLOAD_BITS_V5; bitIdx++) {
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

export function splitPayloadV5(payload: Uint8Array): { meta: Uint8Array; finalHash: Uint8Array } {
  if (payload.length !== PAYLOAD_LENGTH_V5) {
    throw new Error(`payload length: ${payload.length}`);
  }
  return {
    meta: payload.subarray(0, META_LENGTH_V5),
    finalHash: payload.subarray(OFFSET_FINAL_HASH_V5, OFFSET_FINAL_HASH_V5 + HASH_LENGTH),
  };
}

export function buildPayloadV5(meta: Uint8Array, finalHash: Uint8Array): Uint8Array {
  if (meta.length !== META_LENGTH_V5) throw new Error('meta length');
  if (finalHash.length !== HASH_LENGTH) throw new Error('final_hash length');
  const out = new Uint8Array(PAYLOAD_LENGTH_V5);
  out.set(meta, 0);
  out.set(finalHash, OFFSET_FINAL_HASH_V5);
  return out;
}

export function readGpsFromMetaV5(meta: Uint8Array): { lat: number; lng: number } {
  const lat_e6 = readInt32BE(meta, OFFSET_LAT);
  const lng_e6 = readInt32BE(meta, OFFSET_LNG);
  return { lat: lat_e6 / 1_000_000, lng: lng_e6 / 1_000_000 };
}

export function readCounterFromMetaV5(meta: Uint8Array): number {
  return readUint16BE(meta, OFFSET_COUNTER_V4);
}

/** 촬영시각 필드 — 15바이트 전부 0x00이면 기록 없음(null). */
export function readCapturedAtFromMetaV5(meta: Uint8Array): string | null {
  let allZero = true;
  let s = '';
  for (let i = 0; i < CAPTURED_AT_LENGTH; i++) {
    const b = meta[OFFSET_CAPTURED_AT_V5 + i];
    if (b !== 0) allZero = false;
    s += String.fromCharCode(b);
  }
  return allZero ? null : s;
}
