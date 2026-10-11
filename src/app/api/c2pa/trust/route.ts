import { NextRequest, NextResponse } from "next/server";
import { C2PA_TRUST_ANCHORS, C2PA_TRUST_CONFIG } from "@/lib/oripics-stamp/c2pa-trust-list";

/**
 * GET /api/c2pa/trust?kind=anchors|config — 브라우저 C2PA 판독(/verify, 2026-10-01 2단계)용 공식 Trust List.
 * 서버 검증(lib/oripics-stamp/c2pa.ts)과 같은 스냅샷을 내려 웹·서버 판정을 맞춘다.
 */
export async function GET(req: NextRequest) {
  const kind = req.nextUrl.searchParams.get("kind");
  const body = kind === "config" ? C2PA_TRUST_CONFIG : kind === "anchors" ? C2PA_TRUST_ANCHORS : null;
  if (!body) return NextResponse.json({ detail: "invalid_kind" }, { status: 400 });
  return new NextResponse(body, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
