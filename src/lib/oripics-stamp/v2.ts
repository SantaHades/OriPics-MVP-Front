import {
  MAGIC_BYTES,
  OFFSET_FINAL_HASH,
  META_LENGTH,
  HASH_LENGTH,
  PAYLOAD_LENGTH,
  PAYLOAD_BITS,
  EmbedMode,
  selectEmbedMode,
  getBorderCoordinates,
  uint32BE,
  bytesEqual,
} from './common';

const RGB_CHANNELS = [0, 1, 2] as const;

export async function decodeImageToCanvas(file: Blob): Promise<{ data: Uint8ClampedArray; width: number; height: number }> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image', premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true, colorSpace: 'srgb' });
  if (!ctx) throw new Error('canvas_context_unavailable');
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height, { colorSpace: 'srgb' });
  return { data: imageData.data, width: canvas.width, height: canvas.height };
}

async function sha256(buf: Uint8Array): Promise<Uint8Array> {
  const hash = await crypto.subtle.digest('SHA-256', buf as unknown as BufferSource);
  return new Uint8Array(hash);
}

export async function computeInnerHash(pixels: Uint8ClampedArray, width: number, height: number): Promise<Uint8Array> {
  const innerW = width - 2;
  const innerH = height - 2;
  if (innerW <= 0 || innerH <= 0) throw new Error('image_too_small');

  const innerLen = innerW * innerH * 4;
  const buf = new Uint8Array(8 + innerLen);
  buf.set(uint32BE(width), 0);
  buf.set(uint32BE(height), 4);

  let off = 8;
  for (let y = 1; y < height - 1; y++) {
    const rowStart = (y * width + 1) * 4;
    const rowLen = innerW * 4;
    buf.set(pixels.subarray(rowStart, rowStart + rowLen), off);
    off += rowLen;
  }
  return sha256(buf);
}

function pixelOffset(width: number, y: number, x: number): number {
  return (y * width + x) * 4;
}

export async function computeBorderHash(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  mode: EmbedMode,
): Promise<Uint8Array> {
  const coords = getBorderCoordinates(width, height);
  const borderPixelCount = coords.length;
  const borderLen = borderPixelCount * 4;
  const buf = new Uint8Array(8 + borderLen);
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
    for (let i = 0; i < PAYLOAD_BITS; i++) {
      buf[8 + i * 4 + 2] &= 0xfe;
    }
  } else {
    const usedPixels = Math.ceil(PAYLOAD_BITS / 3);
    for (let i = 0; i < usedPixels; i++) {
      const base = 8 + i * 4;
      buf[base]     &= 0xfe;
      buf[base + 1] &= 0xfe;
      buf[base + 2] &= 0xfe;
    }
  }

  return sha256(buf);
}

export function embedPayload(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  payload: Uint8Array,
  mode: EmbedMode,
): void {
  if (payload.length !== PAYLOAD_LENGTH) {
    throw new Error(`payload must be ${PAYLOAD_LENGTH} bytes, got ${payload.length}`);
  }
  const coords = getBorderCoordinates(width, height);
  const totalBits = PAYLOAD_BITS;

  for (let bitIdx = 0; bitIdx < totalBits; bitIdx++) {
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

export function extractPayload(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  mode: EmbedMode,
): Uint8Array {
  const coords = getBorderCoordinates(width, height);
  const totalBits = PAYLOAD_BITS;
  const out = new Uint8Array(PAYLOAD_LENGTH);

  for (let bitIdx = 0; bitIdx < totalBits; bitIdx++) {
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

export function payloadHasMagic(payload: Uint8Array): boolean {
  if (payload.length < MAGIC_BYTES.length) return false;
  return bytesEqual(payload.subarray(0, MAGIC_BYTES.length), MAGIC_BYTES);
}

export function splitPayload(payload: Uint8Array): { meta: Uint8Array; finalHash: Uint8Array } {
  if (payload.length !== PAYLOAD_LENGTH) {
    throw new Error(`payload length: ${payload.length}`);
  }
  return {
    meta: payload.subarray(0, META_LENGTH),
    finalHash: payload.subarray(OFFSET_FINAL_HASH, OFFSET_FINAL_HASH + HASH_LENGTH),
  };
}

export function buildPayload(meta: Uint8Array, finalHash: Uint8Array): Uint8Array {
  if (meta.length !== META_LENGTH) throw new Error('meta length');
  if (finalHash.length !== HASH_LENGTH) throw new Error('final_hash length');
  const out = new Uint8Array(PAYLOAD_LENGTH);
  out.set(meta, 0);
  out.set(finalHash, OFFSET_FINAL_HASH);
  return out;
}

export async function encodeCanvasToPng(pixels: Uint8ClampedArray, width: number, height: number): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { colorSpace: 'srgb' });
  if (!ctx) throw new Error('canvas_context_unavailable');
  const imageData = new ImageData(pixels as unknown as ImageDataArray, width, height, { colorSpace: 'srgb' });
  ctx.putImageData(imageData, 0, 0);
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('png_encode_failed'));
    }, 'image/png');
  });
}

export { selectEmbedMode };
