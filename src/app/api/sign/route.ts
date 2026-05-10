import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createHmac } from "crypto";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { prisma } from "@/lib/prisma";
import { CREDIT_COSTS } from "@/lib/payment";
import {
  getSalt,
  makeTimestamp,
  makeLinkId,
  storagePathFor,
  buildMetaBytes,
  buildMetaBytesV3,
  computeFinalHash,
  bytesToHex,
  hexToBytes,
} from "@/lib/oripics-stamp/server";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY!;
const JWT_SECRET = process.env.ORIPICS_JWT_SECRET!;
const CURRENT_SALT_ID = parseInt(process.env.ORIPICS_CURRENT_SALT_ID || "1", 10);
const BUCKET_NAME = "oripics-proofs";
const JWT_TTL_SECONDS = 300;

const HEX64 = /^[0-9a-fA-F]{64}$/;

function b64urlEncodeJson(obj: unknown): string {
  return Buffer.from(JSON.stringify(obj)).toString("base64url");
}

function issueJwt(payload: Record<string, any>): string {
  const header = { alg: "HS256", typ: "JWT" };
  const headerB64 = b64urlEncodeJson(header);
  const payloadB64 = b64urlEncodeJson(payload);
  const sig = createHmac("sha256", JWT_SECRET)
    .update(`${headerB64}.${payloadB64}`)
    .digest("base64url");
  return `${headerB64}.${payloadB64}.${sig}`;
}

export async function POST(req: NextRequest) {
  if (!JWT_SECRET || !SUPABASE_SERVICE_KEY || !SUPABASE_URL) {
    return NextResponse.json({ detail: "server_misconfigured" }, { status: 500 });
  }

  // J-3: 인증 + 잔액 사전확인
  const session = await getServerSession(authOptions);
  const userId = (session?.user as any)?.id;
  if (!userId) {
    return NextResponse.json({ detail: "unauthenticated" }, { status: 401 });
  }
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { credits: true },
  });
  if (!user) {
    return NextResponse.json({ detail: "user_not_found" }, { status: 401 });
  }
  // 인증 1회 비용은 IMAGE_PROOF (=2). 차감은 /api/links/confirm에서 수행.
  const requiredCredits = CREDIT_COSTS.IMAGE_PROOF;
  if (user.credits < requiredCredits) {
    return NextResponse.json(
      { detail: "insufficient_credits", balance: user.credits, required: requiredCredits },
      { status: 402 },
    );
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ detail: "invalid_json" }, { status: 400 });
  }

  const { inner_hash, border_hash, width, height, upload_type, lat_e6, lng_e6 } = body || {};
  if (typeof inner_hash !== "string" || !HEX64.test(inner_hash)) {
    return NextResponse.json({ detail: "invalid_inner_hash" }, { status: 400 });
  }
  if (typeof border_hash !== "string" || !HEX64.test(border_hash)) {
    return NextResponse.json({ detail: "invalid_border_hash" }, { status: 400 });
  }
  if (!Number.isInteger(width) || width <= 0 || width >= 2 ** 32) {
    return NextResponse.json({ detail: "invalid_width" }, { status: 400 });
  }
  if (!Number.isInteger(height) || height <= 0 || height >= 2 ** 32) {
    return NextResponse.json({ detail: "invalid_height" }, { status: 400 });
  }

  const uploadType = ["F", "P", "C"].includes(upload_type) ? upload_type : "F";
  const useV3 =
    uploadType === "P" &&
    Number.isInteger(lat_e6) &&
    Number.isInteger(lng_e6) &&
    width >= 300 &&
    height >= 300;

  let salt: Uint8Array;
  try {
    salt = getSalt(CURRENT_SALT_ID);
  } catch (e: any) {
    return NextResponse.json({ detail: e.message || "salt_error" }, { status: 500 });
  }

  const timestamp = makeTimestamp(uploadType);
  let metaBytes: Uint8Array;
  let versionNum: number;
  if (useV3) {
    metaBytes = buildMetaBytesV3(CURRENT_SALT_ID, timestamp, width, height, lat_e6, lng_e6);
    versionNum = 3;
  } else {
    metaBytes = buildMetaBytes(CURRENT_SALT_ID, timestamp, width, height);
    versionNum = 2;
  }

  const finalHash = computeFinalHash(
    salt,
    metaBytes,
    hexToBytes(inner_hash),
    hexToBytes(border_hash),
  );

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  // 1. 일별 카운터를 먼저 받아야 link_id가 결정되고, 그 후에야 signed upload URL을 만들 수 있음.
  // counter RPC만 await 후, signed URL은 storage 호출이 그 결과에 의존.
  const dateUtc = new Date();
  const dateStr = `${dateUtc.getUTCFullYear()}-${String(dateUtc.getUTCMonth() + 1).padStart(2, "0")}-${String(dateUtc.getUTCDate()).padStart(2, "0")}`;
  let counter: number;
  try {
    const { data, error } = await supabase.rpc("next_link_counter", { p_date: dateStr });
    if (error || data == null) throw error || new Error("no_counter");
    counter = Number(data);
    if (!Number.isInteger(counter) || counter < 1) throw new Error(`invalid_counter:${data}`);
  } catch (e: any) {
    return NextResponse.json({ detail: `counter_rpc_error:${e?.message || e}` }, { status: 500 });
  }

  const { linkId, dt } = makeLinkId(uploadType, counter);
  const storagePath = storagePathFor(linkId, dt);

  let signedUploadUrl: string | null = null;
  let uploadToken: string | null = null;
  try {
    const { data, error } = await supabase.storage
      .from(BUCKET_NAME)
      .createSignedUploadUrl(storagePath);
    if (error || !data) throw error || new Error("no_data");
    signedUploadUrl = (data as any).signedUrl || (data as any).signedURL || null;
    uploadToken = (data as any).token || null;
    if (!signedUploadUrl) throw new Error("no_signed_url");
  } catch (e: any) {
    return NextResponse.json({ detail: `signed_url_error:${e?.message || e}` }, { status: 500 });
  }

  const now = Math.floor(Date.now() / 1000);
  const jwtPayload: Record<string, any> = {
    iat: now,
    exp: now + JWT_TTL_SECONDS,
    aud: "links/confirm",
    user_id: userId,
    link_id: linkId,
    storage_path: storagePath,
    timestamp,
    width,
    height,
  };
  if (useV3) {
    jwtPayload.lat_e6 = lat_e6;
    jwtPayload.lng_e6 = lng_e6;
  }
  const jwt = issueJwt(jwtPayload);

  return NextResponse.json({
    version: versionNum,
    salt_id: CURRENT_SALT_ID,
    timestamp,
    meta_hex: bytesToHex(metaBytes),
    final_hash: bytesToHex(finalHash),
    link_id: linkId,
    storage_path: storagePath,
    signed_upload_url: signedUploadUrl,
    upload_token: uploadToken,
    jwt,
    jwt_ttl: JWT_TTL_SECONDS,
  });
}
