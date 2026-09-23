// POST /api/photobox/refund { code } — 미등록 사진함 패스 7일 내 전액 환불 (A-108 4단계, 전자상거래법 청약철회)
import { NextRequest, NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/auth/getSessionUserId";
import { checkRateLimit, tooManyRequests, RATE_LIMITS } from "@/lib/security/rateLimit";
import { normalizePhotoboxCode } from "@/lib/photobox/pass";
import { refundPhotoboxPass } from "@/lib/photobox/purchase";

export const runtime = "nodejs";
const PORTONE_API_SECRET = process.env.PORTONE_API_SECRET ?? "";

export async function POST(req: NextRequest) {
  if (!PORTONE_API_SECRET) return NextResponse.json({ detail: "portone_not_configured" }, { status: 500 });
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ detail: "unauthenticated" }, { status: 401 });
  const rl = await checkRateLimit(RATE_LIMITS.passPurchase, userId);
  if (!rl.allowed) return tooManyRequests(rl, "요청이 너무 잦습니다. 잠시 후 다시 시도해 주세요.");
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ detail: "invalid_json" }, { status: 400 });
  }
  const code = normalizePhotoboxCode(typeof body?.code === "string" ? body.code : "");
  if (!code) return NextResponse.json({ detail: "invalid_code" }, { status: 400 });
  const r = await refundPhotoboxPass({ code, userId, secret: PORTONE_API_SECRET });
  if (!r.ok) {
    const status = r.reason === "not_found" ? 404 : r.reason === "not_owner" ? 403 : r.reason === "pg_cancel_failed" ? 502 : 409;
    return NextResponse.json({ detail: r.reason, ...(r.detail !== undefined ? { info: r.detail } : {}) }, { status });
  }
  console.log(`[photobox] refund code=${code} user=${userId} amount=${r.amount}`);
  return NextResponse.json({ ok: true, amount: r.amount });
}
