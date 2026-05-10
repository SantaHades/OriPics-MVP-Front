import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifyLinkId } from "@/lib/oripics-stamp/common";
import { readC2paManifest } from "@/lib/oripics-stamp/c2pa";

export const runtime = "nodejs";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const BUCKET_NAME = "oripics-proofs";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const linkId = params.id;
  if (!linkId || !verifyLinkId(linkId)) {
    return NextResponse.json({ detail: "invalid_link_id" }, { status: 400 });
  }
  if (!SUPABASE_SERVICE_KEY || !SUPABASE_URL) {
    return NextResponse.json({ detail: "supabase_not_configured" }, { status: 500 });
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const { data: row, error } = await supabase
      .from("links")
      .select("storage_path")
      .eq("link_id", linkId)
      .single();
    if (error || !row?.storage_path) {
      return NextResponse.json({ detail: "link_not_found" }, { status: 404 });
    }
    const { data: blob, error: dlErr } = await supabase.storage
      .from(BUCKET_NAME)
      .download(row.storage_path);
    if (dlErr || !blob) {
      return NextResponse.json(
        { detail: `download_failed:${dlErr?.message ?? "no_blob"}` },
        { status: 500 },
      );
    }
    const buf = Buffer.from(await blob.arrayBuffer());
    const result = await readC2paManifest(buf);
    const headers = new Headers({
      "Cache-Control": "public, max-age=300, s-maxage=300",
    });
    return NextResponse.json(result, { headers });
  } catch (e: any) {
    return NextResponse.json(
      { detail: `c2pa_read_error:${e?.message ?? "unknown"}` },
      { status: 500 },
    );
  }
}
