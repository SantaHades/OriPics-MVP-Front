// POST /api/photobox/purchase/complete { paymentId } — 사진함 패스 결제 완료 검증 + 코드 발급 (A-108 4단계)
// 검증·발급은 webhook과 공유(lib/photobox/purchase.ts). 같은 paymentId 재호출 시 같은 코드(성공 페이지 새로고침 안전).
import { NextRequest, NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/auth/getSessionUserId";
import { checkRateLimit, tooManyRequests, RATE_LIMITS } from "@/lib/security/rateLimit";
import { verifyAndIssuePhotoboxPass } from "@/lib/photobox/purchase";

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
  const paymentId = typeof body?.paymentId === "string" ? body.paymentId.trim() : "";
  if (!paymentId || paymentId.length > 200) return NextResponse.json({ detail: "missing_fields" }, { status: 400 });
  const r = await verifyAndIssuePhotoboxPass({ paymentId, userId, secret: PORTONE_API_SECRET });
  if (!r.ok) return NextResponse.json({ detail: r.code, ...(r.detail !== undefined ? { info: r.detail } : {}) }, { status: r.httpStatus });
  if (r.testChannel) return NextResponse.json({ ok: true, test_channel: true });
  console.log(`[photobox] purchase complete payment=${paymentId} user=${userId} already=${r.alreadyProcessed}`);
  return NextResponse.json({
    ok: true, code: r.code, code_expires_at: r.codeExpiresAt.toISOString(), ...(r.alreadyProcessed ? { already_processed: true } : {}),
  });
}
