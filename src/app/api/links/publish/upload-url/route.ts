import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createHmac } from "crypto";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY!;
const JWT_SECRET = process.env.ORIPICS_JWT_SECRET!;
const BUCKET_NAME = "oripics-proofs";

export const runtime = "nodejs";

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
 * POST /api/links/publish/upload-url
 *
 * 신규 (2026-05-17 B-2'' 후속): /api/sign에서 발급한 signed_upload_url의 TTL(약 2시간)이
 * 만료되었거나, 클라이언트가 다른 세션에서 receipt만 가지고 publish를 시도할 때
 * fresh signed_upload_url을 발급.
 *
 * 입력: JSON { receipt }
 * 응답: JSON { signed_upload_url, storage_path }
 *
 * 보안: receipt JWT의 user_id가 세션 user_id와 일치해야 발급.
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
  const { receipt } = body || {};
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

  const storagePath = claims.storage_path;
  if (typeof storagePath !== "string" || !storagePath) {
    return NextResponse.json({ detail: "receipt_missing_storage_path" }, { status: 400 });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  try {
    const { data, error } = await supabase.storage
      .from(BUCKET_NAME)
      .createSignedUploadUrl(storagePath);
    if (error || !data) throw error || new Error("no_data");
    const signedUploadUrl = (data as any).signedUrl || (data as any).signedURL;
    if (!signedUploadUrl) throw new Error("no_signed_url");
    return NextResponse.json({
      signed_upload_url: signedUploadUrl,
      storage_path: storagePath,
    });
  } catch (e: any) {
    console.error("[publish/upload-url] failed:", e?.message || e);
    return NextResponse.json({ detail: `signed_url_error:${e?.message || "unknown"}` }, { status: 500 });
  }
}
