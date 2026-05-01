import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createHmac } from "crypto";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY!;
const JWT_SECRET = process.env.ORIPICS_JWT_SECRET!;
const BUCKET_NAME = "oripics-proofs";

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

    const { link_id, storage_path, timestamp, width, height, lat_e6, lng_e6 } = claims;

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
    const { error } = await supabase.from("links").upsert(row, { onConflict: "link_id" });
    if (error) {
      console.error("[confirm] db upsert failed:", error);
      return NextResponse.json({ detail: `db_error:${error.message}` }, { status: 500 });
    }

    console.log(`[confirm] ok link_id=${link_id}`);
    return NextResponse.json({ link_id, timestamp, storage_path });
  } catch (e: any) {
    console.error("[confirm] unexpected error:", e);
    return NextResponse.json({ detail: e.message || "unknown_error" }, { status: 500 });
  }
}
