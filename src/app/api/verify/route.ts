import { NextRequest, NextResponse } from "next/server";
import {
  getSalt,
  parseMetaBytes,
  parseMetaBytesV3,
  verifyFinalHash,
  hexToBytes,
} from "@/lib/oripics-stamp/server";
import {
  META_LENGTH,
  META_LENGTH_V3,
  OFFSET_VERSION,
} from "@/lib/oripics-stamp/common";

const HEX64 = /^[0-9a-fA-F]{64}$/;

export async function POST(req: NextRequest) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ detail: "invalid_json" }, { status: 400 });
  }

  const { meta_hex, inner_hash, border_hash, extracted_final_hash } = body || {};
  if (typeof meta_hex !== "string") {
    return NextResponse.json({ detail: "invalid_meta_hex" }, { status: 400 });
  }
  const allowed = [META_LENGTH * 2, META_LENGTH_V3 * 2];
  if (!allowed.includes(meta_hex.length)) {
    return NextResponse.json({ detail: "meta_hex_length" }, { status: 400 });
  }
  if (typeof inner_hash !== "string" || !HEX64.test(inner_hash)) {
    return NextResponse.json({ detail: "invalid_inner_hash" }, { status: 400 });
  }
  if (typeof border_hash !== "string" || !HEX64.test(border_hash)) {
    return NextResponse.json({ detail: "invalid_border_hash" }, { status: 400 });
  }
  if (typeof extracted_final_hash !== "string" || !HEX64.test(extracted_final_hash)) {
    return NextResponse.json({ detail: "invalid_extracted_final_hash" }, { status: 400 });
  }

  let metaBytes: Uint8Array;
  try {
    metaBytes = hexToBytes(meta_hex);
  } catch {
    return NextResponse.json({ detail: "meta_hex_decode" }, { status: 400 });
  }

  const version = (metaBytes[OFFSET_VERSION] << 8) | metaBytes[OFFSET_VERSION + 1];
  const innerHashBytes = hexToBytes(inner_hash);
  const borderHashBytes = hexToBytes(border_hash);
  const extractedBytes = hexToBytes(extracted_final_hash);

  if (version === 3) {
    let parsed;
    try {
      parsed = parseMetaBytesV3(metaBytes);
    } catch (e: any) {
      return NextResponse.json({ match: false, reason: e.message });
    }
    let salt: Uint8Array;
    try {
      salt = getSalt(parsed.salt_id);
    } catch (e: any) {
      return NextResponse.json({ match: false, reason: e.message });
    }
    const match = verifyFinalHash(salt, metaBytes, innerHashBytes, borderHashBytes, extractedBytes);
    return NextResponse.json({
      match,
      version: parsed.version,
      metadata: {
        timestamp: parsed.timestamp,
        width: parsed.width,
        height: parsed.height,
        lat: (parsed.lat_e6 ?? 0) / 1_000_000,
        lng: (parsed.lng_e6 ?? 0) / 1_000_000,
      },
    });
  }

  let parsed;
  try {
    parsed = parseMetaBytes(metaBytes);
  } catch (e: any) {
    return NextResponse.json({ match: false, reason: e.message });
  }
  let salt: Uint8Array;
  try {
    salt = getSalt(parsed.salt_id);
  } catch (e: any) {
    return NextResponse.json({ match: false, reason: e.message });
  }
  const match = verifyFinalHash(salt, metaBytes, innerHashBytes, borderHashBytes, extractedBytes);
  return NextResponse.json({
    match,
    version: parsed.version,
    metadata: {
      timestamp: parsed.timestamp,
      width: parsed.width,
      height: parsed.height,
    },
  });
}
