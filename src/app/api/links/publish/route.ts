import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createHmac } from "crypto";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { CREDIT_COSTS } from "@/lib/payment";
import { consumeCredits, refundCredits } from "@/lib/credits/consumeCredits";
import { prisma } from "@/lib/prisma";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY!;
const JWT_SECRET = process.env.ORIPICS_JWT_SECRET!;
const BUCKET_NAME = "oripics-proofs";

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
 * /api/links/publish — 2026-05-17 신설 (B-2 흐름)
 *
 * 입력: multipart/form-data
 *   - receipt: confirm 응답 헤더 X-Oripics-Receipt 값 (publish용 JWT)
 *   - image: stamped+C2PA PNG (confirm 응답 body)
 *   - thumbnail (선택): 작은 webp/png base64 또는 dataURL (히스토리 표시용)
 *
 * 처리:
 *   - receipt JWT 검증 (만료, 본인 매칭)
 *   - LINK_CREATE(2) 차감
 *   - Supabase Storage 업로드 (receipt의 storage_path)
 *   - links DB row insert (link_id, user_id, storage_path, timestamp, ...)
 *   - ProofHistory 생성
 *
 * 응답: JSON { link_id, public_url, timestamp }
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

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ detail: "invalid_form_data" }, { status: 400 });
  }

  const receipt = form.get("receipt");
  const imageEntry = form.get("image");
  const thumbnail = form.get("thumbnail");

  if (typeof receipt !== "string" || !receipt) {
    return NextResponse.json({ detail: "missing_receipt" }, { status: 400 });
  }
  if (!(imageEntry instanceof Blob)) {
    return NextResponse.json({ detail: "missing_image" }, { status: 400 });
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
  } = claims;

  // 0. 이미 publish된 동일 link_id가 있으면 idempotent — 중복 차감 방지
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
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

  // 1. LINK_CREATE 차감
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

  // 2. Supabase Storage 업로드
  try {
    const buffer = Buffer.from(await imageEntry.arrayBuffer());
    const { error: upErr } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(storage_path, buffer, {
        contentType: "image/png",
        upsert: true,
      });
    if (upErr) throw new Error(`upload_failed:${upErr.message}`);
  } catch (e: any) {
    console.error(`[publish] storage upload failed link_id=${link_id}:`, e?.message || e);
    await refund(`storage_error:${e?.message || "unknown"}`);
    return NextResponse.json({ detail: `storage_error:${e?.message || "unknown"}` }, { status: 500 });
  }

  // 3. links DB row insert
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
    console.error("[publish] db upsert failed:", dbErr);
    // 업로드된 Storage 파일 정리
    await supabase.storage.from(BUCKET_NAME).remove([storage_path]).catch(() => {});
    await refund(`db_error:${dbErr.message}`);
    return NextResponse.json({ detail: `db_error:${dbErr.message}` }, { status: 500 });
  }

  // 4. ProofHistory 생성 (best-effort, 실패해도 publish는 성공으로 응답)
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
