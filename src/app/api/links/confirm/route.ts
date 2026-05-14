import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createHmac } from "crypto";
import { attachC2paManifest, oripicsTimestampToISO8601, type Tier } from "@/lib/oripics-stamp/c2pa";
import { CREDIT_COSTS } from "@/lib/payment";
import { consumeCredits, refundCredits } from "@/lib/credits/consumeCredits";
import { getProofMultiplier } from "@/lib/credits/sizeMultiplier";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY!;
const JWT_SECRET = process.env.ORIPICS_JWT_SECRET!;
const BUCKET_NAME = "oripics-proofs";
const C2PA_ENABLED = process.env.ORIPICS_C2PA_ENABLED === "true";

export const runtime = "nodejs";

function verifyJwt(token: string): Record<string, any> {
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

export async function POST(req: NextRequest) {
  if (!JWT_SECRET) {
    console.error("[confirm] missing ORIPICS_JWT_SECRET");
    return NextResponse.json({ detail: "missing_jwt_secret" }, { status: 500 });
  }
  if (!SUPABASE_SERVICE_KEY) {
    console.error("[confirm] missing SUPABASE_SERVICE_KEY");
    return NextResponse.json({ detail: "missing_service_key" }, { status: 500 });
  }

  try {
    const { jwt_token } = await req.json();
    if (!jwt_token) {
      return NextResponse.json({ detail: "missing_jwt" }, { status: 400 });
    }

    let claims: Record<string, any>;
    try {
      claims = verifyJwt(jwt_token);
    } catch (e: any) {
      console.error("[confirm] jwt verify failed:", e.message);
      return NextResponse.json({ detail: e.message }, { status: 401 });
    }

    const {
      user_id, link_id, storage_path, timestamp, width, height, lat_e6, lng_e6,
      tier: claimedTier,
      verified_info,
    } = claims;

    const tier: "standard" | "verified" = claimedTier === "verified" ? "verified" : "standard";
    // 인증 1회 = proof × sizeMultiplier + LINK_CREATE(1, 사이즈 무관)
    // 1× : 긴 변 ≤ 1800px
    // 2× : 긴 변 > 1800 AND 픽셀 수 ≤ 100M
    // 3× : 픽셀 수 > 100M
    const sizeMultiplier = getProofMultiplier(width, height);
    const baseProofCost = tier === "verified" ? CREDIT_COSTS.VERIFIED_PROOF : CREDIT_COSTS.IMAGE_PROOF;
    const proofCost = baseProofCost * sizeMultiplier;
    const creditCost = proofCost + CREDIT_COSTS.LINK_CREATE;
    const creditAction = tier === "verified" ? "verified_proof" : "image_proof";

    // J-3 + D-pre-3: tier별 크레딧 차감 (race-safe atomic).
    if (!user_id) {
      // sign 라우트가 J-3 이전에 발급한 JWT (user_id 없음) — 차감 스킵.
      console.warn(`[confirm] legacy JWT without user_id, skipping credit charge: link_id=${link_id}`);
    } else {
      const consume = await consumeCredits({
        userId: user_id,
        amount: creditCost,
        action: creditAction,
        metadata: { link_id, storage_path, tier, width, height, size_multiplier: sizeMultiplier },
      });
      if (!consume.ok) {
        return NextResponse.json(
          {
            detail: "insufficient_credits",
            balance: consume.balance,
            required: creditCost,
            tier,
            size_multiplier: sizeMultiplier,
          },
          { status: 402 },
        );
      }
    }

    const row: Record<string, any> = {
      link_id,
      timestamp,
      width,
      height,
      storage_path,
      signed_url: `${SUPABASE_URL}/storage/v1/object/public/${BUCKET_NAME}/${storage_path}`,
    };
    if (user_id) {
      row.user_id = user_id; // 옵션 A: 검증 시 면책 판정용
    }
    if (lat_e6 != null && lng_e6 != null) {
      row.lat = lat_e6 / 1_000_000;
      row.lng = lng_e6 / 1_000_000;
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // C2PA 매니페스트 첨부 (기능 플래그 OFF 시 건너뜀).
    // 실패해도 전체 흐름은 차단하지 않음 — 원본 PNG는 그대로 Storage에 존재.
    if (C2PA_ENABLED) {
      try {
        const c2paStart = Date.now();
        const { data: blob, error: dlErr } = await supabase.storage
          .from(BUCKET_NAME)
          .download(storage_path);
        if (dlErr || !blob) throw new Error(`download_failed:${dlErr?.message || "no_blob"}`);
        const pngBuffer = Buffer.from(await blob.arrayBuffer());

        const stampVersion = lat_e6 != null && lng_e6 != null ? 3 : 2;
        const c2paTier: Tier = tier === "verified" ? "verified" : "standard";

        const signResult = await attachC2paManifest({
          pngBuffer,
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

        const { error: upErr } = await supabase.storage
          .from(BUCKET_NAME)
          .upload(storage_path, signResult.buffer, {
            contentType: "image/png",
            upsert: true,
          });
        if (upErr) throw new Error(`reupload_failed:${upErr.message}`);

        console.log(
          `[confirm] c2pa attached link_id=${link_id} bytes=${signResult.buffer.length} added=${signResult.bytesAdded} ms=${Date.now() - c2paStart}`,
        );
      } catch (e: any) {
        console.error(`[confirm] c2pa attach failed link_id=${link_id}:`, e?.message || e);
      }
    }

    const { error } = await supabase.from("links").upsert(row, { onConflict: "link_id" });
    if (error) {
      console.error("[confirm] db upsert failed:", error);
      // 차감했으면 환불 — 작업 미완료 상태에서 크레딧만 소진되면 안 됨
      if (user_id) {
        try {
          await refundCredits({
            userId: user_id,
            amount: creditCost,
            action: creditAction,
            metadata: { link_id, reason: `db_error:${error.message}` },
          });
        } catch (rfErr: any) {
          console.error("[confirm] refund failed:", rfErr?.message || rfErr);
        }
      }
      return NextResponse.json({ detail: `db_error:${error.message}` }, { status: 500 });
    }

    console.log(`[confirm] ok link_id=${link_id}`);
    return NextResponse.json({ link_id, timestamp, storage_path });
  } catch (e: any) {
    console.error("[confirm] unexpected error:", e);
    return NextResponse.json({ detail: e.message || "unknown_error" }, { status: 500 });
  }
}
