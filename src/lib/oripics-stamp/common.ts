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

// ────────────────────────────────────────────────────────────────────
// 간편링크 ID: counter obfuscation + CRC16 체크섬
// 형식: {prefix}{yymmdd}-{HHMMSS}-{ms 3}{obfCounter ≥1}{cs 2}
// ────────────────────────────────────────────────────────────────────

// 자리수별 곱셈 obfuscation (각 mult는 9·10^(d-1)과 서로소)
const COUNTER_MULTIPLIERS: Record<number, number> = {
  1: 7,
  2: 17,
  3: 167,
  4: 1667,
  5: 16567,
  6: 165557,
  7: 1655557,
  8: 16555573,
  9: 165555571,
};

export function obfuscateCounter(c: number): string {
  if (!Number.isInteger(c) || c < 1) throw new Error('counter must be positive integer');
  const d = String(c).length;
  if (d > 9) throw new Error('counter overflow (>1B per day)');
  const lo = d === 1 ? 1 : 10 ** (d - 1);
  const range = 9 * (d === 1 ? 1 : 10 ** (d - 1));
  const mult = COUNTER_MULTIPLIERS[d];
  // d ≥ 8에서 (c-lo)*mult가 Number.MAX_SAFE_INTEGER를 넘을 수 있어 BigInt로 안전하게 계산
  const obfOffset = Number(((BigInt(c) - BigInt(lo)) * BigInt(mult)) % BigInt(range));
  return String(lo + obfOffset);
}

// CRC-16-CCITT (poly 0x1021, init 0xFFFF, no reflect, no xor-out)
export function crc16(s: string): number {
  let crc = 0xffff;
  for (let i = 0; i < s.length; i++) {
    crc ^= s.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc;
}

export function checksum2(body: string): string {
  return String(crc16(body) % 100).padStart(2, '0');
}

// 신규 형식 link_id를 검증. 구 형식(끝 segment에 hex letter 포함)은 검증 스킵하여 통과.
export function verifyLinkId(linkId: string): boolean {
  if (typeof linkId !== 'string' || linkId.length < 3) return false;
  const lastDash = linkId.lastIndexOf('-');
  if (lastDash < 0) return false;
  const tail = linkId.slice(lastDash + 1);
  // 신규 형식: 마지막 segment 전체가 숫자 + 길이 ≥ 6 (ms 3 + counter ≥1 + cs 2)
  if (!/^\d{6,}$/.test(tail)) return true; // 구 형식으로 간주, 통과
  const body = linkId.slice(0, -2);
  const cs = linkId.slice(-2);
  return checksum2(body) === cs;
}
