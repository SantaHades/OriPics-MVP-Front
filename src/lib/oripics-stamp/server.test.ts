import { describe, it, expect, beforeAll } from "vitest";

// 테스트용 salt 환경변수 — server 모듈 import 전 설정
// salt_id 1, 32 bytes hex (HMAC-SHA256 권장 길이)
const TEST_SALT_HEX = "a".repeat(64);

beforeAll(() => {
  process.env.ORIPICS_SALT_V2_001 = TEST_SALT_HEX;
});

const importServer = () => import("./server");

const VALID_TIMESTAMP_15 = "F250510120000"; // F + yymmddHHMMSS — len 13... 일단 15자 필요
// makeTimestamp 형식: prefix + yy + mm + dd + HH + MM + SS + cs (2-digit centiseconds) = 15
const TS_15 = "F25051012000099"; // 15자 정확히

describe("server/buildMetaBytes (v2)", () => {
  it("encodes magic + version=2 + salt_id + length + timestamp + dimensions", async () => {
    const { buildMetaBytes, parseMetaBytes } = await importServer();
    const meta = buildMetaBytes(1, TS_15, 1280, 720);

    const parsed = parseMetaBytes(meta);
    expect(parsed.version).toBe(2);
    expect(parsed.salt_id).toBe(1);
    expect(parsed.timestamp).toBe(TS_15);
    expect(parsed.width).toBe(1280);
    expect(parsed.height).toBe(720);
  });

  it("rejects wrong-length timestamp", async () => {
    const { buildMetaBytes } = await importServer();
    expect(() => buildMetaBytes(1, "TOO_SHORT", 1280, 720)).toThrow();
  });

  it("rejects out-of-range salt_id", async () => {
    const { buildMetaBytes } = await importServer();
    expect(() => buildMetaBytes(0, TS_15, 1280, 720)).toThrow();
    expect(() => buildMetaBytes(2 ** 16, TS_15, 1280, 720)).toThrow();
  });
});

describe("server/buildMetaBytesV3 (with GPS)", () => {
  it("round-trips lat/lng_e6 (signed int32)", async () => {
    const { buildMetaBytesV3, parseMetaBytesV3 } = await importServer();
    // 서울 시청 근처
    const latE6 = 37_566_535;
    const lngE6 = 126_977_969;
    const meta = buildMetaBytesV3(1, TS_15, 1920, 1080, latE6, lngE6);

    const parsed = parseMetaBytesV3(meta);
    expect(parsed.version).toBe(3);
    expect(parsed.lat_e6).toBe(latE6);
    expect(parsed.lng_e6).toBe(lngE6);
    expect(parsed.width).toBe(1920);
    expect(parsed.height).toBe(1080);
  });

  it("handles negative lat/lng (southern/western hemisphere)", async () => {
    const { buildMetaBytesV3, parseMetaBytesV3 } = await importServer();
    // 시드니
    const latE6 = -33_868_820;
    const lngE6 = 151_209_290;
    const meta = buildMetaBytesV3(1, TS_15, 800, 600, latE6, lngE6);
    const parsed = parseMetaBytesV3(meta);
    expect(parsed.lat_e6).toBe(latE6);
    expect(parsed.lng_e6).toBe(lngE6);
  });

  it("rejects out-of-range lat (|lat| > 90)", async () => {
    const { buildMetaBytesV3 } = await importServer();
    expect(() => buildMetaBytesV3(1, TS_15, 800, 600, 90_000_001, 0)).toThrow();
    expect(() => buildMetaBytesV3(1, TS_15, 800, 600, -90_000_001, 0)).toThrow();
  });

  it("rejects out-of-range lng (|lng| > 180)", async () => {
    const { buildMetaBytesV3 } = await importServer();
    expect(() => buildMetaBytesV3(1, TS_15, 800, 600, 0, 180_000_001)).toThrow();
  });
});

describe("server/parseMetaBytes — magic byte mismatch", () => {
  it("rejects meta with wrong magic", async () => {
    const { buildMetaBytes, parseMetaBytes } = await importServer();
    const meta = buildMetaBytes(1, TS_15, 1280, 720);
    meta[0] = 0x00; // 첫 magic byte 변조
    expect(() => parseMetaBytes(meta)).toThrow(/magic_mismatch/);
  });
});

describe("server/computeFinalHash + verifyFinalHash", () => {
  it("verify returns true for valid (salt, meta, hashes, expected) tuple", async () => {
    const { buildMetaBytes, computeFinalHash, verifyFinalHash, getSalt } =
      await importServer();
    const meta = buildMetaBytes(1, TS_15, 1280, 720);
    const inner = new Uint8Array(32).fill(0xa1);
    const border = new Uint8Array(32).fill(0xb2);
    const salt = getSalt(1);
    const finalHash = computeFinalHash(salt, meta, inner, border);
    expect(verifyFinalHash(salt, meta, inner, border, finalHash)).toBe(true);
  });

  it("verify returns false when one byte of meta is changed", async () => {
    const { buildMetaBytes, computeFinalHash, verifyFinalHash, getSalt } =
      await importServer();
    const meta = buildMetaBytes(1, TS_15, 1280, 720);
    const inner = new Uint8Array(32).fill(0xa1);
    const border = new Uint8Array(32).fill(0xb2);
    const salt = getSalt(1);
    const finalHash = computeFinalHash(salt, meta, inner, border);
    // 메타 한 바이트 변조
    const tampered = new Uint8Array(meta);
    tampered[20] = (tampered[20] + 1) & 0xff;
    expect(verifyFinalHash(salt, tampered, inner, border, finalHash)).toBe(false);
  });

  it("verify returns false when innerHash differs", async () => {
    const { buildMetaBytes, computeFinalHash, verifyFinalHash, getSalt } =
      await importServer();
    const meta = buildMetaBytes(1, TS_15, 1280, 720);
    const inner = new Uint8Array(32).fill(0xa1);
    const border = new Uint8Array(32).fill(0xb2);
    const salt = getSalt(1);
    const finalHash = computeFinalHash(salt, meta, inner, border);
    const wrongInner = new Uint8Array(32).fill(0xa2);
    expect(verifyFinalHash(salt, meta, wrongInner, border, finalHash)).toBe(false);
  });

  it("verify returns false when wrong salt is used", async () => {
    const { buildMetaBytes, computeFinalHash, verifyFinalHash } = await importServer();
    const meta = buildMetaBytes(1, TS_15, 1280, 720);
    const inner = new Uint8Array(32).fill(0xa1);
    const border = new Uint8Array(32).fill(0xb2);
    const correctSalt = new Uint8Array(32).fill(0x11);
    const wrongSalt = new Uint8Array(32).fill(0x22);
    const finalHash = computeFinalHash(correctSalt, meta, inner, border);
    expect(verifyFinalHash(wrongSalt, meta, inner, border, finalHash)).toBe(false);
  });
});

describe("server/getSalt", () => {
  it("decodes hex env var into bytes", async () => {
    const { getSalt } = await importServer();
    const salt = getSalt(1);
    expect(salt.length).toBe(TEST_SALT_HEX.length / 2);
    expect(salt[0]).toBe(0xaa);
  });

  it("throws on unknown salt_id", async () => {
    const { getSalt } = await importServer();
    expect(() => getSalt(999)).toThrow(/unknown_salt_id/);
  });
});
