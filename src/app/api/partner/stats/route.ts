import { NextResponse } from "next/server";
import { partnerStats } from "@/lib/partner/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/partner/stats — 공개. 랜딩 '파트너 잔여 N명' 카운터 */
export async function GET() {
  try {
    const s = await partnerStats();
    return NextResponse.json(s, { headers: { "Cache-Control": "public, max-age=60" } });
  } catch (e: any) {
    console.error("[partner/stats] failed", e?.message ?? e);
    return NextResponse.json({ detail: "unavailable" }, { status: 503 });
  }
}
