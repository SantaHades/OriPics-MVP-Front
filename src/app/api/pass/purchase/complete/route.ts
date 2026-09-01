import { NextRequest, NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/auth/getSessionUserId";
import { checkRateLimit, tooManyRequests, RATE_LIMITS } from "@/lib/security/rateLimit";
import { verifyAndIssueDayPass } from "@/lib/pass/passPurchase";

export const runtime = "nodejs";

const PORTONE_API_SECRET = process.env.PORTONE_API_SECRET ?? "";

/**
 * POST /api/pass/purchase/complete — 원데이 패스 결제 완료 검증 + 코드 발급 (A-60 Phase 3).
 *
 * /pass/success 페이지가 PortOne SDK로부터 받은 paymentId를 전송.
 * Body: { paymentId }
 *
 * 검증·발급 로직은 webhook 경로와 공유: lib/pass/passPurchase.ts —
 * 클라이언트가 보낸 금액은 신뢰하지 않고 PortOne 기록을 source of truth로 사용.
 * 멱등: 같은 paymentId 재호출 시 동일 코드 반환 (성공 페이지 새로고침 안전).
 */
export async function POST(req: NextRequest) {
  if (!PORTONE_API_SECRET) {
    return NextResponse.json({ detail: "portone_not_configured" }, { status: 500 });
  }

  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json({ detail: "unauthenticated" }, { status: 401 });
  }

  // 타인 paymentId 대입 시도 억제 (검증 자체는 소유권 검사가 차단)
  const rl = await checkRateLimit(RATE_LIMITS.passPurchase, userId);
  if (!rl.allowed) {
    return tooManyRequests(rl, "요청이 너무 잦습니다. 잠시 후 다시 시도해 주세요.");
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ detail: "invalid_json" }, { status: 400 });
  }
  const paymentId = typeof body?.paymentId === "string" ? body.paymentId.trim() : "";
  if (!paymentId || paymentId.length > 200) {
    return NextResponse.json({ detail: "missing_fields" }, { status: 400 });
  }

  const result = await verifyAndIssueDayPass({
    paymentId,
    userId,
    secret: PORTONE_API_SECRET,
  });

  if (!result.ok) {
    return NextResponse.json(
      { detail: result.code, ...(result.detail !== undefined ? { info: result.detail } : {}) },
      { status: result.httpStatus },
    );
  }

  console.log(`[pass] purchase complete payment=${paymentId} user=${userId} already=${result.alreadyProcessed}`);
  return NextResponse.json({
    ok: true,
    code: result.code,
    code_expires_at: result.codeExpiresAt.toISOString(),
    ...(result.alreadyProcessed ? { already_processed: true } : {}),
  });
}
