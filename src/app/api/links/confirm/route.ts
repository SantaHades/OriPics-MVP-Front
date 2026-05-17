import { NextRequest, NextResponse } from "next/server";
import { createHmac } from "crypto";
import { attachC2paManifest, oripicsTimestampToISO8601, type Tier } from "@/lib/oripics-stamp/c2pa";
import { CREDIT_COSTS } from "@/lib/payment";
import { consumeCredits, refundCredits } from "@/lib/credits/consumeCredits";
import { getProofMultiplier } from "@/lib/credits/sizeMultiplier";

const JWT_SECRET = process.env.ORIPICS_JWT_SECRET!;
const C2PA_ENABLED = process.env.ORIPICS_C2PA_ENABLED === "true";
const RECEIPT_TTL_SECONDS = 30 * 24 * 60 * 60; // 30일

export const runtime = "nodejs";
// Vercel Functions에서 큰 PNG 처리를 위해 default body size limit 확장
export const maxDuration = 60;

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
 * /api/links/confirm — B-2 흐름 (2026-05-17 재설계)
 *
 * 입력: multipart/form-data
 *   - jwt_token: /api/sign에서 발급한 JWT (claims에 user_id, link_id, storage_path, timestamp, width, height, tier 등)
 *   - image: stamped PNG (LSB 스테가노그래피 적용된 클라이언트 산출물)
 *
 * 처리:
 *   - JWT 검증
 *   - proof cost(IMAGE_PROOF or VERIFIED_PROOF × sizeMultiplier) 차감
 *   - 클라이언트가 보낸 PNG에 C2PA 매니페스트 첨부
 *   - **Supabase Storage 업로드 X, DB row 생성 X** — 미공개 상태는 서버에 흔적을 남기지 않음
 *
 * 응답: image/png 바이너리
 *   - X-Oripics-Receipt: receipt JWT (publish 시 재제출용, TTL 30일)
 *   - X-Oripics-Proof-Cost: 차감된 크레딧 수 (UI 표시용)
 */
export async function POST(req: NextRequest) {
  if (!JWT_SECRET) {
    return NextResponse.json({ detail: "missing_jwt_secret" }, { status: 500 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ detail: "invalid_form_data" }, { status: 400 });
  }

  const jwtToken = form.get("jwt_token");
  const imageEntry = form.get("image");
  if (typeof jwtToken !== "string" || !jwtToken) {
    return NextResponse.json({ detail: "missing_jwt" }, { status: 400 });
  }
  if (!(imageEntry instanceof Blob)) {
    return NextResponse.json({ detail: "missing_image" }, { status: 400 });
  }

  let claims: Record<string, any>;
  try {
    claims = verifySignJwt(jwtToken);
  } catch (e: any) {
    console.error("[confirm] jwt verify failed:", e.message);
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

  // 1. 크레딧 차감 (race-safe atomic)
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

  // 2. C2PA 매니페스트 첨부
  let finalBuffer: Buffer;
  try {
    const inputBuffer = Buffer.from(await imageEntry.arrayBuffer());
    if (!C2PA_ENABLED) {
      finalBuffer = inputBuffer;
    } else {
      const stampVersion = lat_e6 != null && lng_e6 != null ? 3 : 2;
      const c2paTier: Tier = tier === "verified" ? "verified" : "standard";

      const signResult = await attachC2paManifest({
        pngBuffer: inputBuffer,
        tier: c2paTier,
        linkId: link_id,
        timestamp: oripicsTimestampToISO8601(timestamp),
        width,
        height,
        lat: lat_e6 != null ? lat_e6 / 1_000_000 : null,
        lng: lng_e6 != null ? lng_e6 / 1_000_000 : null,
        stampVersion,
        ...(c2paTier === "verified" && verified_info
          ? { verifiedInfo: verified_info }
          : {}),
      });
      finalBuffer = signResult.buffer;
      console.log(
        `[confirm] c2pa attached link_id=${link_id} bytes=${signResult.buffer.length} added=${signResult.bytesAdded}`,
      );
    }
  } catch (e: any) {
    console.error(`[confirm] c2pa attach failed link_id=${link_id}:`, e?.message || e);
    // C2PA 첨부 실패 시 환불 (사용자는 stamped 이미지 못 받았으므로 사용 0)
    try {
      await refundCredits({
        userId: user_id,
        amount: proofCost,
        action: creditAction,
        metadata: { link_id, reason: `c2pa_error:${e?.message || e}` },
      });
    } catch (rfErr: any) {
      console.error("[confirm] refund failed:", rfErr?.message || rfErr);
    }
    return NextResponse.json({ detail: `c2pa_error:${e?.message || "unknown"}` }, { status: 500 });
  }

  // 3. receipt JWT 발급 (publish 시점에 사용)
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
  const receiptJwt = issueReceiptJwt(receiptPayload);

  console.log(`[confirm] ok link_id=${link_id} bytes=${finalBuffer.length} cost=${proofCost}`);

  return new NextResponse(new Uint8Array(finalBuffer), {
    status: 200,
    headers: {
      "Content-Type": "image/png",
      "X-Oripics-Receipt": receiptJwt,
      "X-Oripics-Proof-Cost": String(proofCost),
      "X-Oripics-Link-Id": link_id,
      "X-Oripics-Timestamp": timestamp,
    },
  });
}
