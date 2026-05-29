import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createHmac, timingSafeEqual } from "crypto";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { CREDIT_COSTS } from "@/lib/payment";
import { consumeCredits, refundCredits } from "@/lib/credits/consumeCredits";
import { prisma } from "@/lib/prisma";
import { attachC2paManifest, oripicsTimestampToISO8601, type Tier } from "@/lib/oripics-stamp/c2pa";
import { extractFinalHashFromPngBuffer, computeInnerHashFromPngBuffer, hexToBytes } from "@/lib/oripics-stamp/server";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY!;
const JWT_SECRET = process.env.ORIPICS_JWT_SECRET!;
const BUCKET_NAME = "oripics-proofs";
const C2PA_ENABLED = process.env.ORIPICS_C2PA_ENABLED === "true";

export const runtime = "nodejs";
export const maxDuration = 60;

function verifyReceiptJwt(token: string): Record<string, any> {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("invalid_jwt");
  const [header, payload, sig] = parts;
  const expected = createHmac("sha256", JWT_SECRET)
    .update(`${header}.${payload}`)
    .digest("base64url");
  if (expected !== sig) throw new Error("invalid_signature");
  const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf-8"));
  if (decoded.exp < Date.now() / 1000) throw new Error("jwt_expired");
  if (decoded.aud !== "links/publish") throw new Error("invalid_audience");
  return decoded;
}

/**
 * /api/links/publish — 2026-05-17 B-2'' (최종)
 *
 * 입력: JSON { receipt, thumbnail? }
 *   - receipt: /api/links/confirm에서 발급된 JWT (publish용)
 *   - thumbnail: 선택 — base64 dataURL (ProofHistory 표시용)
 *
 * 전제: 클라이언트가 stamped PNG를 sign 응답의 signed_upload_url을 통해
 * Supabase Storage에 이미 업로드 완료한 상태.
 *
 * 처리:
 *   1. receipt JWT 검증 (만료, 본인 매칭)
 *   2. LINK_CREATE(-2) 차감
 *   3. Storage에서 LSB-stamped PNG 다운로드
 *   4. C2PA 매니페스트 적용
 *   5. C2PA-적용된 PNG를 Storage에 재업로드 (덮어쓰기)
 *   6. links DB row insert
 *   7. ProofHistory insert
 *
 * 응답: JSON { link_id, timestamp, public_url, already_published? }
 */
export async function POST(req: NextRequest) {
  if (!JWT_SECRET || !SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return NextResponse.json({ detail: "server_misconfigured" }, { status: 500 });
  }

  const session = await getServerSession(authOptions);
  const sessionUserId = (session?.user as any)?.id;
  if (!sessionUserId) {
    return NextResponse.json({ detail: "unauthenticated" }, { status: 401 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ detail: "invalid_json" }, { status: 400 });
  }
  const { receipt, thumbnail } = body || {};
  if (typeof receipt !== "string" || !receipt) {
    return NextResponse.json({ detail: "missing_receipt" }, { status: 400 });
  }

  let claims: Record<string, any>;
  try {
    claims = verifyReceiptJwt(receipt);
  } catch (e: any) {
    return NextResponse.json({ detail: `receipt_${e.message}` }, { status: 401 });
  }

  if (claims.user_id !== sessionUserId) {
    return NextResponse.json({ detail: "receipt_user_mismatch" }, { status: 403 });
  }

  const {
    user_id, link_id, storage_path, timestamp, width, height, lat_e6, lng_e6,
    tier, verified_info,
  } = claims;

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  // 0. 이미 publish된 동일 link_id가 있으면 idempotent
  {
    const { data: existing } = await supabase
      .from("links")
      .select("link_id")
      .eq("link_id", link_id)
      .maybeSingle();
    if (existing) {
      const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET_NAME}/${storage_path}`;
      return NextResponse.json({
        link_id,
        timestamp,
        public_url: publicUrl,
        already_published: true,
      });
    }
  }

  // 1. LINK_CREATE(-2) 차감
  const consume = await consumeCredits({
    userId: user_id,
    amount: CREDIT_COSTS.LINK_CREATE,
    action: "link_create",
    metadata: { link_id, storage_path },
  });
  if (!consume.ok) {
    return NextResponse.json(
      {
        detail: "insufficient_credits",
        balance: consume.balance,
        required: CREDIT_COSTS.LINK_CREATE,
      },
      { status: 402 },
    );
  }

  const refund = async (reason: string) => {
    try {
      await refundCredits({
        userId: user_id,
        amount: CREDIT_COSTS.LINK_CREATE,
        action: "link_create",
        metadata: { link_id, reason },
      });
    } catch (e: any) {
      console.error("[publish] refund failed:", e?.message || e);
    }
  };

  // 2. Storage에서 LSB-stamped PNG 다운로드 (클라가 sign signed_upload_url로 업로드한 결과)
  let pngBuffer: Buffer;
  try {
    const { data: blob, error: dlErr } = await supabase.storage
      .from(BUCKET_NAME)
      .download(storage_path);
    if (dlErr || !blob) throw new Error(`download_failed:${dlErr?.message || "no_blob"}`);
    pngBuffer = Buffer.from(await blob.arrayBuffer());
  } catch (e: any) {
    console.error(`[publish] storage download failed link_id=${link_id}:`, e?.message || e);
    await refund(`storage_download_error:${e?.message || "unknown"}`);
    return NextResponse.json({ detail: `storage_download_error:${e?.message || "unknown"}` }, { status: 500 });
  }

  // 2b. Edge-to-Backend 인증 (Level 1)
  // PNG 다운로드 후 두 가지 hash를 검증:
  //   (A) final_hash: border LSB 추출값 ↔ JWT final_hash_hex  — PNG 교체 공격 차단
  //   (B) inner_hash: inner 픽셀 SHA-256 재계산 ↔ JWT inner_hash_hex  — inner 픽셀 교체 공격 차단
  // hash 필드가 없으면 구 receipt (배포 전 발급) — 검증 생략 (하위호환)
  if (claims.final_hash_hex || claims.inner_hash_hex) {
    try {
      // (A) border LSB → final_hash 검증
      if (claims.final_hash_hex) {
        const extractedFinalHash = await extractFinalHashFromPngBuffer(pngBuffer, width, height);
        const expectedFinalHash = hexToBytes(claims.final_hash_hex as string);
        if (
          extractedFinalHash.length !== expectedFinalHash.length ||
          !timingSafeEqual(Buffer.from(extractedFinalHash), Buffer.from(expectedFinalHash))
        ) {
          await refund("final_hash_mismatch");
          return NextResponse.json({ detail: "final_hash_mismatch" }, { status: 422 });
        }
      }

      // (B) inner 픽셀 재계산 → inner_hash 검증
      if (claims.inner_hash_hex) {
        const recomputedInnerHash = await computeInnerHashFromPngBuffer(pngBuffer, width, height);
        const expectedInnerHash = hexToBytes(claims.inner_hash_hex as string);
        if (
          recomputedInnerHash.length !== expectedInnerHash.length ||
          !timingSafeEqual(Buffer.from(recomputedInnerHash), Buffer.from(expectedInnerHash))
        ) {
          await refund("inner_hash_mismatch");
          return NextResponse.json({ detail: "inner_hash_mismatch" }, { status: 422 });
        }
      }
    } catch (e: any) {
      console.error(`[publish] hash verify error link_id=${link_id}:`, e?.message || e);
      await refund(`hash_verify_error:${e?.message || "unknown"}`);
      return NextResponse.json({ detail: `hash_verify_error:${e?.message || "unknown"}` }, { status: 422 });
    }
  }

  // 3. C2PA 매니페스트 적용 + Storage 재업로드
  if (C2PA_ENABLED) {
    try {
      const c2paStart = Date.now();
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
        `[publish] c2pa attached link_id=${link_id} bytes=${signResult.buffer.length} added=${signResult.bytesAdded} ms=${Date.now() - c2paStart}`,
      );
    } catch (e: any) {
      console.error(`[publish] c2pa attach failed link_id=${link_id}:`, e?.message || e);
      // C2PA 실패해도 LSB stamped 원본은 Storage에 있음 — publish 계속 진행 (LSB만으로도 가치 있음).
    }
  }

  // 4. links DB row insert
  const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET_NAME}/${storage_path}`;
  const row: Record<string, any> = {
    link_id,
    timestamp,
    width,
    height,
    storage_path,
    signed_url: publicUrl,
    user_id,
  };
  if (lat_e6 != null && lng_e6 != null) {
    row.lat = lat_e6 / 1_000_000;
    row.lng = lng_e6 / 1_000_000;
  }

  const { error: dbErr } = await supabase.from("links").upsert(row, { onConflict: "link_id" });
  if (dbErr) {
    console.error(`[publish] db upsert failed link_id=${link_id}:`, dbErr.message);
    await refund(`db_error:${dbErr.message}`);
    return NextResponse.json({ detail: `db_error:${dbErr.message}` }, { status: 500 });
  }

  // 5. ProofHistory 생성 (best-effort — publish 자체는 성공으로 응답)
  try {
    let thumbnailStr: string | null = null;
    if (typeof thumbnail === "string" && thumbnail.length > 0 && thumbnail.length < 200_000) {
      thumbnailStr = thumbnail;
    }
    await prisma.proofHistory.create({
      data: {
        userId: user_id,
        linkId: link_id,
        thumbnail: thumbnailStr,
        width,
        height,
        timestamp,
      },
    });
  } catch (e: any) {
    if (!String(e?.message || "").includes("Unique constraint")) {
      console.warn("[publish] ProofHistory create failed:", e?.message || e);
    }
  }

  console.log(`[publish] ok link_id=${link_id}`);
  return NextResponse.json({
    link_id,
    timestamp,
    public_url: publicUrl,
  });
}
