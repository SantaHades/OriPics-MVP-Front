import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createHmac, createHash } from "crypto";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { prisma } from "@/lib/prisma";
import { CREDIT_COSTS } from "@/lib/payment";
import { getProofMultiplier } from "@/lib/credits/sizeMultiplier";
import { verifyChallenge } from "@/lib/attest/challenge";
import {
  verifyAttestToken,
  AttestVerifierNotImplementedError,
} from "@/lib/attest/verifyToken";
import {
  getSalt,
  makeTimestamp,
  makeLinkId,
  storagePathFor,
  buildMetaBytesV4,
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

  // J-3: 인증 + 잔액 사전확인 (tier에 따라 비용 결정)
  const session = await getServerSession(authOptions);
  const userId = (session?.user as any)?.id;
  if (!userId) {
    return NextResponse.json({ detail: "unauthenticated" }, { status: 401 });
  }
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { credits: true, tier: true },
  });
  if (!user) {
    return NextResponse.json({ detail: "user_not_found" }, { status: 401 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ detail: "invalid_json" }, { status: 400 });
  }

  const {
    inner_hash, border_hash, width, height, upload_type, lat_e6, lng_e6,
    // D-pre-3: verified 티어 (모바일 P 경로) 입력
    tier: requestedTier,
    nonce,
    attest_token,
    platform,
    zoom_factor,
    lens_position,
  } = body || {};
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

  // D-pre-3: tier 결정 + verified attestation 검증
  // verified는 모바일 P 경로 + Pro 이상 티어에서만 허용
  const isVerifiedRequest = requestedTier === "verified";
  const tier: "standard" | "verified" = isVerifiedRequest ? "verified" : "standard";
  let verifiedInfo:
    | { platform: "ios" | "android"; attest_token_hash: string; zoom_factor?: number; lens_position?: string }
    | undefined;

  if (isVerifiedRequest) {
    // Verified 티어 = Pro 이상만 (pricing-policy §2)
    if (user.tier === "free") {
      return NextResponse.json(
        { detail: "verified_requires_pro", tier: user.tier },
        { status: 403 },
      );
    }
    if (typeof nonce !== "string" || typeof attest_token !== "string") {
      return NextResponse.json({ detail: "missing_attest_fields" }, { status: 400 });
    }
    if (platform !== "ios" && platform !== "android") {
      return NextResponse.json({ detail: "invalid_platform" }, { status: 400 });
    }
    const challenge = verifyChallenge(nonce);
    if (!challenge.ok) {
      return NextResponse.json({ detail: `nonce_${challenge.reason}` }, { status: 401 });
    }
    try {
      const tokenResult = await verifyAttestToken({ platform, token: attest_token, nonce });
      if (!tokenResult.ok) {
        return NextResponse.json({ detail: `attest_${tokenResult.reason}` }, { status: 401 });
      }
      verifiedInfo = {
        platform,
        attest_token_hash: tokenResult.attestTokenHash,
        ...(typeof zoom_factor === "number" ? { zoom_factor } : {}),
        ...(typeof lens_position === "string" ? { lens_position } : {}),
      };
    } catch (e) {
      if (e instanceof AttestVerifierNotImplementedError) {
        // D-pre-5 본 구현 전: token 자체는 SHA-256 해시만 기록하고 진행 (개발용)
        console.warn("[sign] attest verifier stub — token hash only");
        const hash = createHash("sha256").update(attest_token).digest("hex").slice(0, 32);
        verifiedInfo = {
          platform,
          attest_token_hash: hash,
          ...(typeof zoom_factor === "number" ? { zoom_factor } : {}),
          ...(typeof lens_position === "string" ? { lens_position } : {}),
        };
      } else {
        throw e;
      }
    }
  }

  // 잔액 확인 (tier + 사이즈 multiplier 반영). 실제 차감은 /api/links/confirm.
  // Standard: IMAGE_PROOF(2) × sizeMultiplier + LINK_CREATE(1)
  // Verified: VERIFIED_PROOF(3) × sizeMultiplier + LINK_CREATE(1)
  // sizeMultiplier: 긴 변 ≤ 1800 = 1×, > 1800 ≤ 100MP = 2×, > 100MP = 3×
  const sizeMultiplier = getProofMultiplier(width, height);
  const baseProofCost = isVerifiedRequest ? CREDIT_COSTS.VERIFIED_PROOF : CREDIT_COSTS.IMAGE_PROOF;
  const proofCost = baseProofCost * sizeMultiplier;
  const requiredCredits = proofCost + CREDIT_COSTS.LINK_CREATE;
  if (user.credits < requiredCredits) {
    return NextResponse.json(
      {
        detail: "insufficient_credits",
        balance: user.credits,
        required: requiredCredits,
        tier,
        size_multiplier: sizeMultiplier,
      },
      { status: 402 },
    );
  }

  const uploadType = ["F", "P", "C"].includes(upload_type) ? upload_type : "F";
  // V4: GPS는 optional (없으면 0 sentinel). 모든 신규 인증 V4.
  const hasGps = Number.isInteger(lat_e6) && Number.isInteger(lng_e6);

  let salt: Uint8Array;
  try {
    salt = getSalt(CURRENT_SALT_ID);
  } catch (e: any) {
    return NextResponse.json({ detail: e.message || "salt_error" }, { status: 500 });
  }

  const timestamp = makeTimestamp(uploadType);

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  // counter를 먼저 받아야 V4 메타에 인코딩 가능 (옵션 A: 자기 이미지 면책 식별자)
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

  if (counter >= 2 ** 16) {
    // V4 메타의 counter 필드(uint16) 한계 초과. 일일 65k건 초과 시 정책 재검토 필요.
    return NextResponse.json({ detail: "counter_overflow_uint16" }, { status: 500 });
  }

  const metaBytes = buildMetaBytesV4(
    CURRENT_SALT_ID,
    timestamp,
    width,
    height,
    hasGps ? lat_e6 : 0,
    hasGps ? lng_e6 : 0,
    counter,
  );
  const versionNum = 4;

  const finalHash = computeFinalHash(
    salt,
    metaBytes,
    hexToBytes(inner_hash),
    hexToBytes(border_hash),
  );

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
    tier,
    link_id: linkId,
    storage_path: storagePath,
    timestamp,
    width,
    height,
  };
  if (hasGps) {
    jwtPayload.lat_e6 = lat_e6;
    jwtPayload.lng_e6 = lng_e6;
  }
  if (verifiedInfo) {
    jwtPayload.verified_info = verifiedInfo;
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
