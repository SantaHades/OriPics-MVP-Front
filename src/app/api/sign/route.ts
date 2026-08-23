import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createHmac, createHash } from "crypto";
import { getSessionUserId } from "@/lib/auth/getSessionUserId";
import { prisma } from "@/lib/prisma";
import { checkRateLimit, tooManyRequests, RATE_LIMITS } from "@/lib/security/rateLimit";
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
  buildMetaBytesV5,
  formatCapturedAtUtc,
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
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json({ detail: "unauthenticated" }, { status: 401 });
  }

  // H-3: 사용자별 레이트리밋. sign은 크레딧을 소비하지 않고(차감은 confirm) 전역
  // 일일 카운터를 증가 + signed-upload-url을 발급하므로, 무제한 호출 시 카운터
  // 소진(전 사용자 서명 차단)·고아 스토리지 비용을 유발한다.
  const rl = await checkRateLimit(RATE_LIMITS.sign, userId);
  if (!rl.allowed) {
    return tooManyRequests(rl, "인증 요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.");
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
    // V5 (2026-08-21): 클라이언트가 stamp_version=5를 명시할 때만 V5 발급 —
    // 배포된 구 클라이언트(V4 border hash로 커밋)는 V4 유지 (하위호환).
    stamp_version,
    captured_at_ms,
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

  // V5 옵트인 + 촬영시각 검증. 촬영시각은 기기 자기주장 값(GPS와 동일 신뢰 수준)이지만
  // 상식 범위는 서버가 강제: 2020-01-01 이후, 현재+2분(clock skew) 이전.
  const useV5 = stamp_version === 5;
  if (stamp_version !== undefined && stamp_version !== 4 && stamp_version !== 5) {
    return NextResponse.json({ detail: "invalid_stamp_version" }, { status: 400 });
  }
  let capturedAtStr: string | null = null;
  if (captured_at_ms !== undefined) {
    if (!useV5) {
      return NextResponse.json({ detail: "captured_at_requires_v5" }, { status: 400 });
    }
    if (
      !Number.isInteger(captured_at_ms) ||
      captured_at_ms < Date.UTC(2020, 0, 1) ||
      captured_at_ms > Date.now() + 120_000
    ) {
      return NextResponse.json({ detail: "invalid_captured_at" }, { status: 400 });
    }
    capturedAtStr = formatCapturedAtUtc(captured_at_ms);
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
      // 403 (401 아님): 세션은 유효하나 attest 거부 — 모바일 클라이언트는 401을
      // 세션 만료로 간주해 로그아웃하므로(client.ts) 여기서 401을 쓰면 안 된다.
      return NextResponse.json({ detail: `nonce_${challenge.reason}` }, { status: 403 });
    }
    try {
      const tokenResult = await verifyAttestToken({ platform, token: attest_token, nonce });
      if (!tokenResult.ok) {
        return NextResponse.json({ detail: `attest_${tokenResult.reason}` }, { status: 403 });
      }
      verifiedInfo = {
        platform,
        attest_token_hash: tokenResult.attestTokenHash,
        ...(typeof zoom_factor === "number" ? { zoom_factor } : {}),
        ...(typeof lens_position === "string" ? { lens_position } : {}),
      };
    } catch (e) {
      if (e instanceof AttestVerifierNotImplementedError) {
        // M-1: 검증기 미설정 시 예외를 성공으로 처리하면 임의 토큰으로 "verified"
        // 등급이 부여돼 제품 신뢰의 핵심이 무력화된다. 개발용 폴백은 명시적 옵트인
        // (ALLOW_UNVERIFIED_ATTEST=true)일 때만 허용하고, 운영에서는 503으로 거부.
        if (process.env.ALLOW_UNVERIFIED_ATTEST === "true") {
          console.warn("[sign] attest verifier stub — token hash only (ALLOW_UNVERIFIED_ATTEST)");
          const hash = createHash("sha256").update(attest_token).digest("hex").slice(0, 32);
          verifiedInfo = {
            platform,
            attest_token_hash: hash,
            ...(typeof zoom_factor === "number" ? { zoom_factor } : {}),
            ...(typeof lens_position === "string" ? { lens_position } : {}),
          };
        } else {
          console.error("[sign] verified requested but attest verifier not configured — refusing");
          return NextResponse.json({ detail: "verified_not_available" }, { status: 503 });
        }
      } else {
        throw e;
      }
    }
  }

  // 잔액 확인 — 인증 단계 비용만 (LINK_CREATE는 publish 시점 별도 차감).
  // Standard: IMAGE_PROOF(3) × sizeMultiplier
  // Verified: VERIFIED_PROOF(4) × sizeMultiplier
  // sizeMultiplier: 긴 변 ≤ 1800 = 1×, > 1800 ≤ 100MP = 2×, > 100MP = 3×
  const sizeMultiplier = getProofMultiplier(width, height);
  const baseProofCost = isVerifiedRequest ? CREDIT_COSTS.VERIFIED_PROOF : CREDIT_COSTS.IMAGE_PROOF;
  const proofCost = baseProofCost * sizeMultiplier;
  if (user.credits < proofCost) {
    return NextResponse.json(
      {
        detail: "insufficient_credits",
        balance: user.credits,
        required: proofCost,
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

  const metaBytes = useV5
    ? buildMetaBytesV5(
        CURRENT_SALT_ID,
        timestamp,
        width,
        height,
        hasGps ? lat_e6 : 0,
        hasGps ? lng_e6 : 0,
        counter,
        capturedAtStr,
      )
    : buildMetaBytesV4(
        CURRENT_SALT_ID,
        timestamp,
        width,
        height,
        hasGps ? lat_e6 : 0,
        hasGps ? lng_e6 : 0,
        counter,
      );
  const versionNum = useV5 ? 5 : 4;

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
    inner_hash_hex: inner_hash,   // 클라이언트가 계산한 inner 픽셀 SHA-256 (hex)
    final_hash_hex: bytesToHex(finalHash),
    stamp_version: versionNum,
  };
  if (capturedAtStr) {
    jwtPayload.captured_at = capturedAtStr;
  }
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
    ...(capturedAtStr ? { captured_at: capturedAtStr } : {}),
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
