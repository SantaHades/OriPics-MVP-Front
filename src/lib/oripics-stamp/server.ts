import { createHmac, timingSafeEqual, randomBytes } from "crypto";
import {
  MAGIC_BYTES,
  OFFSET_MAGIC,
  OFFSET_VERSION,
  OFFSET_SALT_ID,
  OFFSET_LENGTH,
  OFFSET_TIMESTAMP,
  OFFSET_WIDTH,
  OFFSET_HEIGHT,
  OFFSET_LAT,
  OFFSET_LNG,
  META_LENGTH,
  META_LENGTH_V3,
  PAYLOAD_LENGTH,
  PAYLOAD_LENGTH_V3,
  HASH_LENGTH,
  TIMESTAMP_LENGTH,
} from "./common";

const UPLOAD_TYPE_PREFIXES = ["F", "P", "C"] as const;

export function getSalt(saltId: number): Uint8Array {
  const envKey = `ORIPICS_SALT_V2_${String(saltId).padStart(3, "0")}`;
  const hex = process.env[envKey];
  if (!hex) throw new Error(`unknown_salt_id:${saltId}`);
  if (hex.length % 2 !== 0) throw new Error("malformed_salt");
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

export function makeTimestamp(prefix: string): string {
  const p = (UPLOAD_TYPE_PREFIXES as readonly string[]).includes(prefix) ? prefix : "F";
  const now = new Date();
  const yy = String(now.getUTCFullYear() % 100).padStart(2, "0");
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(now.getUTCDate()).padStart(2, "0");
  const HH = String(now.getUTCHours()).padStart(2, "0");
  const MM = String(now.getUTCMinutes()).padStart(2, "0");
  const SS = String(now.getUTCSeconds()).padStart(2, "0");
  const cs = String(Math.floor(now.getUTCMilliseconds() / 10)).padStart(2, "0");
  return `${p}${yy}${mm}${dd}${HH}${MM}${SS}${cs}`;
}

export function makeLinkId(prefix: string): { linkId: string; dt: Date } {
  const p = (UPLOAD_TYPE_PREFIXES as readonly string[]).includes(prefix) ? prefix : "F";
  const dt = new Date();
  const yy = String(dt.getUTCFullYear() % 100).padStart(2, "0");
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  const HH = String(dt.getUTCHours()).padStart(2, "0");
  const MM = String(dt.getUTCMinutes()).padStart(2, "0");
  const SS = String(dt.getUTCSeconds()).padStart(2, "0");
  const ms = String(dt.getUTCMilliseconds()).padStart(3, "0");
  const rand = randomBytes(2).toString("hex");
  return {
    linkId: `${p}${yy}${mm}${dd}-${HH}${MM}${SS}-${ms}${rand}`,
    dt,
  };
}

export function storagePathFor(linkId: string, dt: Date): string {
  const yy = String(dt.getUTCFullYear() % 100).padStart(2, "0");
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return `${yy}${mm}${dd}/${linkId}.png`;
}

function writeUint16BE(buf: Uint8Array, offset: number, v: number) {
  buf[offset] = (v >>> 8) & 0xff;
  buf[offset + 1] = v & 0xff;
}

function writeUint32BE(buf: Uint8Array, offset: number, v: number) {
  buf[offset] = (v >>> 24) & 0xff;
  buf[offset + 1] = (v >>> 16) & 0xff;
  buf[offset + 2] = (v >>> 8) & 0xff;
  buf[offset + 3] = v & 0xff;
}

function writeInt32BE(buf: Uint8Array, offset: number, v: number) {
  new DataView(buf.buffer, buf.byteOffset, buf.byteLength).setInt32(offset, v, false);
}

function readUint16BE(buf: Uint8Array, offset: number): number {
  return (buf[offset] << 8) | buf[offset + 1];
}

function readUint32BE(buf: Uint8Array, offset: number): number {
  return ((buf[offset] << 24) | (buf[offset + 1] << 16) | (buf[offset + 2] << 8) | buf[offset + 3]) >>> 0;
}

function readInt32BE(buf: Uint8Array, offset: number): number {
  return new DataView(buf.buffer, buf.byteOffset, buf.byteLength).getInt32(offset, false);
}

export function buildMetaBytes(saltId: number, timestamp: string, width: number, height: number): Uint8Array {
  if (timestamp.length !== TIMESTAMP_LENGTH) {
    throw new Error(`Timestamp must be ${TIMESTAMP_LENGTH} chars, got ${timestamp.length}`);
  }
  if (saltId <= 0 || saltId >= 2 ** 16) throw new Error(`salt_id out of range: ${saltId}`);
  if (width <= 0 || width >= 2 ** 32) throw new Error(`width out of range`);
  if (height <= 0 || height >= 2 ** 32) throw new Error(`height out of range`);

  const meta = new Uint8Array(META_LENGTH);
  meta.set(MAGIC_BYTES, OFFSET_MAGIC);
  writeUint16BE(meta, OFFSET_VERSION, 2);
  writeUint16BE(meta, OFFSET_SALT_ID, saltId);
  writeUint32BE(meta, OFFSET_LENGTH, PAYLOAD_LENGTH);
  for (let i = 0; i < TIMESTAMP_LENGTH; i++) {
    meta[OFFSET_TIMESTAMP + i] = timestamp.charCodeAt(i);
  }
  writeUint32BE(meta, OFFSET_WIDTH, width);
  writeUint32BE(meta, OFFSET_HEIGHT, height);
  return meta;
}

export function buildMetaBytesV3(
  saltId: number,
  timestamp: string,
  width: number,
  height: number,
  latE6: number,
  lngE6: number,
): Uint8Array {
  if (timestamp.length !== TIMESTAMP_LENGTH) {
    throw new Error(`Timestamp must be ${TIMESTAMP_LENGTH} chars, got ${timestamp.length}`);
  }
  if (saltId <= 0 || saltId >= 2 ** 16) throw new Error(`salt_id out of range`);
  if (width <= 0 || width >= 2 ** 32) throw new Error(`width out of range`);
  if (height <= 0 || height >= 2 ** 32) throw new Error(`height out of range`);
  if (latE6 < -90_000_000 || latE6 > 90_000_000) throw new Error(`lat_e6 out of range`);
  if (lngE6 < -180_000_000 || lngE6 > 180_000_000) throw new Error(`lng_e6 out of range`);

  const meta = new Uint8Array(META_LENGTH_V3);
  meta.set(MAGIC_BYTES, OFFSET_MAGIC);
  writeUint16BE(meta, OFFSET_VERSION, 3);
  writeUint16BE(meta, OFFSET_SALT_ID, saltId);
  writeUint32BE(meta, OFFSET_LENGTH, PAYLOAD_LENGTH_V3);
  for (let i = 0; i < TIMESTAMP_LENGTH; i++) {
    meta[OFFSET_TIMESTAMP + i] = timestamp.charCodeAt(i);
  }
  writeUint32BE(meta, OFFSET_WIDTH, width);
  writeUint32BE(meta, OFFSET_HEIGHT, height);
  writeInt32BE(meta, OFFSET_LAT, latE6);
  writeInt32BE(meta, OFFSET_LNG, lngE6);
  return meta;
}

export interface ParsedMeta {
  version: number;
  salt_id: number;
  length: number;
  timestamp: string;
  width: number;
  height: number;
  lat_e6?: number;
  lng_e6?: number;
}

function magicMatches(meta: Uint8Array): boolean {
  for (let i = 0; i < MAGIC_BYTES.length; i++) {
    if (meta[OFFSET_MAGIC + i] !== MAGIC_BYTES[i]) return false;
  }
  return true;
}

function readTimestampAscii(meta: Uint8Array): string {
  let s = "";
  for (let i = 0; i < TIMESTAMP_LENGTH; i++) {
    s += String.fromCharCode(meta[OFFSET_TIMESTAMP + i]);
  }
  return s;
}

export function parseMetaBytes(meta: Uint8Array): ParsedMeta {
  if (meta.length !== META_LENGTH) throw new Error(`meta must be ${META_LENGTH} bytes`);
  if (!magicMatches(meta)) throw new Error("magic_mismatch");
  const version = readUint16BE(meta, OFFSET_VERSION);
  if (version !== 2) throw new Error(`unsupported_version:${version}`);
  const salt_id = readUint16BE(meta, OFFSET_SALT_ID);
  const length = readUint32BE(meta, OFFSET_LENGTH);
  if (length !== PAYLOAD_LENGTH) throw new Error(`length_mismatch:${length}`);
  return {
    version,
    salt_id,
    length,
    timestamp: readTimestampAscii(meta),
    width: readUint32BE(meta, OFFSET_WIDTH),
    height: readUint32BE(meta, OFFSET_HEIGHT),
  };
}

export function parseMetaBytesV3(meta: Uint8Array): ParsedMeta {
  if (meta.length !== META_LENGTH_V3) throw new Error(`meta must be ${META_LENGTH_V3} bytes`);
  if (!magicMatches(meta)) throw new Error("magic_mismatch");
  const version = readUint16BE(meta, OFFSET_VERSION);
  if (version !== 3) throw new Error(`unsupported_version:${version}`);
  const salt_id = readUint16BE(meta, OFFSET_SALT_ID);
  const length = readUint32BE(meta, OFFSET_LENGTH);
  if (length !== PAYLOAD_LENGTH_V3) throw new Error(`length_mismatch:${length}`);
  return {
    version,
    salt_id,
    length,
    timestamp: readTimestampAscii(meta),
    width: readUint32BE(meta, OFFSET_WIDTH),
    height: readUint32BE(meta, OFFSET_HEIGHT),
    lat_e6: readInt32BE(meta, OFFSET_LAT),
    lng_e6: readInt32BE(meta, OFFSET_LNG),
  };
}

export function computeFinalHash(
  salt: Uint8Array,
  metaBytes: Uint8Array,
  innerHash: Uint8Array,
  borderHash: Uint8Array,
): Uint8Array {
  if (innerHash.length !== HASH_LENGTH || borderHash.length !== HASH_LENGTH) {
    throw new Error(`hashes must be ${HASH_LENGTH} bytes`);
  }
  const msg = new Uint8Array(metaBytes.length + innerHash.length + borderHash.length);
  msg.set(metaBytes, 0);
  msg.set(innerHash, metaBytes.length);
  msg.set(borderHash, metaBytes.length + innerHash.length);
  const h = createHmac("sha256", Buffer.from(salt));
  h.update(Buffer.from(msg));
  return new Uint8Array(h.digest());
}

export function verifyFinalHash(
  salt: Uint8Array,
  metaBytes: Uint8Array,
  innerHash: Uint8Array,
  borderHash: Uint8Array,
  extracted: Uint8Array,
): boolean {
  const expected = computeFinalHash(salt, metaBytes, innerHash, borderHash);
  if (expected.length !== extracted.length) return false;
  return timingSafeEqual(Buffer.from(expected), Buffer.from(extracted));
}

export function bytesToHex(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("hex");
}

export function hexToBytes(hex: string): Uint8Array {
  return new Uint8Array(Buffer.from(hex, "hex"));
}
