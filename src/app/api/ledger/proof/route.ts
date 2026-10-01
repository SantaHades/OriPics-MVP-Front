import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit, clientIp, RATE_LIMITS, tooManyRequests } from "@/lib/security/rateLimit";
import { buildInclusionProof } from "@/lib/ledger/server";

export const runtime = "nodejs";

/**
 * GET /api/ledger/proof?final_hash=<hex64> — 원장 포함 증명(머클 경로 + TSA 토큰) JSON (2026-10-01).
 * final_hash는 인증본 스탬프에서 추출되는 값 → 사진을 가진 사람만 조회 가능(링크 ID 열거 방지).
 * 배치 전(인증 당일)이면 404 pending — 다음 날 00:10 KST 이후 확정.
 */
export async function GET(req: NextRequest) {
  const ip = clientIp(req);
  const rl = await checkRateLimit(RATE_LIMITS.verify, ip);
  if (!rl.allowed) return tooManyRequests(rl, "verify_rate_limited");

  const finalHash = (req.nextUrl.searchParams.get("final_hash") || "").toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(finalHash)) {
    return NextResponse.json({ detail: "invalid_final_hash" }, { status: 400 });
  }
  try {
    const proof = await buildInclusionProof(finalHash);
    if (!proof) return NextResponse.json({ detail: "pending_or_not_found" }, { status: 404 });
    return NextResponse.json(proof, {
      headers: { "Content-Disposition": `attachment; filename="oripics-proof-${proof.link_id}.json"` },
    });
  } catch (e: any) {
    console.error("[ledger/proof] failed:", e?.message || e);
    return NextResponse.json({ detail: "proof_failed" }, { status: 500 });
  }
}
