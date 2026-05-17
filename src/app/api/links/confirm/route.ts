import { NextRequest, NextResponse } from "next/server";
import { createHmac } from "crypto";
import { CREDIT_COSTS } from "@/lib/payment";
import { consumeCredits } from "@/lib/credits/consumeCredits";
import { getProofMultiplier } from "@/lib/credits/sizeMultiplier";

const JWT_SECRET = process.env.ORIPICS_JWT_SECRET!;
const RECEIPT_TTL_SECONDS = 30 * 24 * 60 * 60; // 30일

export const runtime = "nodejs";

function b64urlEncodeJson(obj: unknown): string {
  return Buffer.from(JSON.stringify(obj)).toString("base64url");
}

function issueReceiptJwt(payload: Record<string, any>): string {
  const header = { alg: "HS256", typ: "JWT" };
  const headerB64 = b64urlEncodeJson(header);
  const payloadB64 = b64urlEncodeJson(payload);
  const sig = createHmac("sha256", JWT_SECRET)
    .update(`${headerB64}.${payloadB64}`)
    .digest("base64url");
  return `${headerB64}.${payloadB64}.${sig}`;
}

function verifySignJwt(token: string): Record<string, any> {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("invalid_jwt");
  const [header, payload, sig] = parts;
  const expected = createHmac("sha256", JWT_SECRET)
    .update(`${header}.${payload}`)
    .digest("base64url");
  if (expected !== sig) throw new Error("invalid_signature");
  const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf-8"));
  if (decoded.exp < Date.now() / 1000) throw new Error("jwt_expired");
  if (decoded.aud !== "links/confirm") throw new Error("invalid_audience");
  return decoded;
}

/**
 * /api/links/confirm — B-2'' (2026-05-17 재정렬): 인증 단계는 메타데이터만 처리.
 *
 * 입력: JSON { jwt_token } (sign에서 발급한 JWT)
 * 처리:
 *   - JWT 검증
 *   - proof cost 차감 (IMAGE_PROOF or VERIFIED_PROOF × sizeMultiplier)
 *   - receipt JWT 발급 (publish 단계에서 재제출)
 * 응답: JSON { receipt, link_id, timestamp, proof_cost, size_multiplier, tier }
 *
 * **PNG 미전송, Storage 미접근, DB row 미생성** — 인증 완료된 stamped PNG는 클라이언트 메모리에만 존재.
 * 사용자가 "간편링크 생성" 버튼 클릭 시 /api/links/publish가 Storage 업로드 + C2PA + DB row 생성을 모두 처리.
 */
export async function POST(req: NextRequest) {
  if (!JWT_SECRET) {
    return NextResponse.json({ detail: "server_misconfigured" }, { status: 500 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ detail: "invalid_json" }, { status: 400 });
  }
  const { jwt_token } = body || {};
  if (!jwt_token) {
    return NextResponse.json({ detail: "missing_jwt" }, { status: 400 });
  }

  let claims: Record<string, any>;
  try {
    claims = verifySignJwt(jwt_token);
  } catch (e: any) {
    return NextResponse.json({ detail: e.message }, { status: 401 });
  }

  const {
    user_id, link_id, storage_path, timestamp, width, height, lat_e6, lng_e6,
    tier: claimedTier,
    verified_info,
  } = claims;

  if (!user_id) {
    return NextResponse.json({ detail: "jwt_missing_user_id" }, { status: 400 });
  }

  const tier: "standard" | "verified" = claimedTier === "verified" ? "verified" : "standard";
  const sizeMultiplier = getProofMultiplier(width, height);
  const baseProofCost = tier === "verified" ? CREDIT_COSTS.VERIFIED_PROOF : CREDIT_COSTS.IMAGE_PROOF;
  const proofCost = baseProofCost * sizeMultiplier;
  const creditAction = tier === "verified" ? "verified_proof" : "image_proof";

  // proof 비용 차감 (race-safe atomic)
  const consume = await consumeCredits({
    userId: user_id,
    amount: proofCost,
    action: creditAction,
    metadata: { link_id, tier, width, height, size_multiplier: sizeMultiplier },
  });
  if (!consume.ok) {
    return NextResponse.json(
      {
        detail: "insufficient_credits",
        balance: consume.balance,
        required: proofCost,
        tier,
        size_multiplier: sizeMultiplier,
      },
      { status: 402 },
    );
  }

  // receipt JWT 발급 (publish 시 재제출)
  const now = Math.floor(Date.now() / 1000);
  const receiptPayload: Record<string, any> = {
    iat: now,
    exp: now + RECEIPT_TTL_SECONDS,
    aud: "links/publish",
    user_id,
    link_id,
    storage_path,
    timestamp,
    width,
    height,
    tier,
  };
  if (lat_e6 != null && lng_e6 != null) {
    receiptPayload.lat_e6 = lat_e6;
    receiptPayload.lng_e6 = lng_e6;
  }
  if (verified_info) {
    receiptPayload.verified_info = verified_info;
  }
  const receipt = issueReceiptJwt(receiptPayload);

  console.log(`[confirm] proof charged link_id=${link_id} cost=${proofCost}`);

  return NextResponse.json({
    receipt,
    link_id,
    timestamp,
    proof_cost: proofCost,
    size_multiplier: sizeMultiplier,
    tier,
  });
}
