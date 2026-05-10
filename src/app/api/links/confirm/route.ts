import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createHmac } from "crypto";
import { attachC2paManifest, oripicsTimestampToISO8601, type Tier } from "@/lib/oripics-stamp/c2pa";
import { CREDIT_COSTS } from "@/lib/payment";
import { consumeCredits, refundCredits } from "@/lib/credits/consumeCredits";

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

    const { user_id, link_id, storage_path, timestamp, width, height, lat_e6, lng_e6 } = claims;

    // J-3: 인증 1회당 IMAGE_PROOF(=2) 크레딧 차감 (race-safe atomic).
    // 차감 후 작업 실패 시 명시적 환불.
    if (!user_id) {
      // sign 라우트가 J-3 이전에 발급한 JWT (user_id 없음) — 차감 스킵.
      // J-3 배포 후 5분(JWT TTL) 지나면 모든 신규 JWT는 user_id 보장.
      console.warn(`[confirm] legacy JWT without user_id, skipping credit charge: link_id=${link_id}`);
    } else {
      const consume = await consumeCredits({
        userId: user_id,
        amount: CREDIT_COSTS.IMAGE_PROOF,
        action: "image_proof",
        metadata: { link_id, storage_path },
      });
      if (!consume.ok) {
        return NextResponse.json(
          { detail: "insufficient_credits", balance: consume.balance, required: CREDIT_COSTS.IMAGE_PROOF },
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

        // 현재는 Standard 티어만. 모바일 Verified 티어는 트랙 D 후 추가.
        const tier: Tier = "standard";
        const stampVersion = lat_e6 != null && lng_e6 != null ? 3 : 2;

        const signResult = await attachC2paManifest({
          pngBuffer,
          tier,
          linkId: link_id,
          timestamp: oripicsTimestampToISO8601(timestamp),
          width,
          height,
          lat: lat_e6 != null ? lat_e6 / 1_000_000 : null,
          lng: lng_e6 != null ? lng_e6 / 1_000_000 : null,
          stampVersion,
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
            amount: CREDIT_COSTS.IMAGE_PROOF,
            action: "image_proof",
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
