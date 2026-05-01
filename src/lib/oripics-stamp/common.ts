export const MAGIC_BYTES = new Uint8Array([0x4f, 0x52, 0x49, 0x50, 0x49, 0x43, 0x53, 0x21]);

export const OFFSET_MAGIC = 0;
export const OFFSET_VERSION = 8;
export const OFFSET_SALT_ID = 10;
export const OFFSET_LENGTH = 12;
export const OFFSET_TIMESTAMP = 16;
export const OFFSET_WIDTH = 31;
export const OFFSET_HEIGHT = 35;
// v2
export const OFFSET_FINAL_HASH = 39;
export const META_LENGTH = 39;
export const PAYLOAD_LENGTH = 71;  // 39 + 32
export const PAYLOAD_BITS = PAYLOAD_LENGTH * 8;  // 568

// v3 (GPS 8 bytes 추가)
export const OFFSET_LAT = 39;
export const OFFSET_LNG = 43;
export const OFFSET_FINAL_HASH_V3 = 47;
export const META_LENGTH_V3 = 47;
export const PAYLOAD_LENGTH_V3 = 79;  // 47 + 32
export const PAYLOAD_BITS_V3 = PAYLOAD_LENGTH_V3 * 8;  // 632

export const HASH_LENGTH = 32;

export const TIMESTAMP_LENGTH = 15;

export type EmbedMode = 'b_only' | 'rgb_lsb';

export function selectEmbedMode(width: number, height: number): EmbedMode {
  const borderCapacity = 2 * (width + height) - 4;
  if (borderCapacity >= PAYLOAD_BITS) return 'b_only';
  if (borderCapacity * 3 >= PAYLOAD_BITS) return 'rgb_lsb';
  throw new Error('image_too_small');
}

export function getBorderCoordinates(width: number, height: number): Array<[number, number]> {
  const coords: Array<[number, number]> = [];
  for (let x = 0; x < width; x++) coords.push([0, x]);
  for (let x = 0; x < width; x++) coords.push([height - 1, x]);
  for (let y = 1; y < height - 1; y++) coords.push([y, 0]);
  for (let y = 1; y < height - 1; y++) coords.push([y, width - 1]);
  return coords;
}

export function uint16BE(n: number): Uint8Array {
  return new Uint8Array([(n >>> 8) & 0xff, n & 0xff]);
}

export function uint32BE(n: number): Uint8Array {
  return new Uint8Array([(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff]);
}

export function readUint16BE(buf: Uint8Array, offset: number): number {
  return (buf[offset] << 8) | buf[offset + 1];
}

export function readUint32BE(buf: Uint8Array, offset: number): number {
  return ((buf[offset] << 24) | (buf[offset + 1] << 16) | (buf[offset + 2] << 8) | buf[offset + 3]) >>> 0;
}

export function bytesToHex(bytes: Uint8Array): string {
  let hex = '';
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, '0');
  }
  return hex;
}

export function hexToBytes(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) throw new Error('invalid hex length');
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

export function int32BE(n: number): Uint8Array {
  const buf = new Uint8Array(4);
  new DataView(buf.buffer).setInt32(0, n, false);
  return buf;
}

export function readInt32BE(buf: Uint8Array, offset: number): number {
  return new DataView(buf.buffer, buf.byteOffset).getInt32(offset, false);
}

export function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}
