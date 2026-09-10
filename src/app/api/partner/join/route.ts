import { NextRequest, NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/auth/getSessionUserId";
import { joinWithPartnerCode } from "@/lib/partner/server";
import { notifyReferralJoined } from "@/lib/partner/notify";
import { checkRateLimit, clientIp, tooManyRequests, RATE_LIMITS } from "@/lib/security/rateLimit";

export const runtime = "nodejs";

/**
 * POST /api/partner/join { code }  (웹 세션 · 앱 Bearer 공용)
 * 코드 입력 → 참여 확정(계정당 1회). 성공 시 양쪽 할인권 발급, 코드 주인에게 메일.
 * 오류: invalid_code | code_not_found | self_code | already_joined | circular | window_expired | campaign_ended
 */
export async function POST(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ detail: "unauthenticated" }, { status: 401 });
  const rl = await checkRateLimit(RATE_LIMITS.partnerJoin, userId);
  if (!rl.allowed) return tooManyRequests(rl, "시도가 너무 많습니다. 잠시 후 다시 시도해 주세요.");

  let body: any = null;
  try {
    body = await req.json();
  } catch {
    /* below */
  }
  try {
    const r = await joinWithPartnerCode({ userId, code: body?.code, ip: clientIp(req) });
    if (!r.ok) {
      const status = r.error === "invalid_code" ? 400 : r.error === "code_not_found" ? 404 : 409;
      return NextResponse.json({ detail: r.error }, { status });
    }
    notifyReferralJoined(userId).catch(() => {});
    return NextResponse.json(r);
  } catch (e: any) {
    if (String(e?.message) === "already_joined") return NextResponse.json({ detail: "already_joined" }, { status: 409 });
    console.error("[partner/join] failed", e?.message ?? e);
    return NextResponse.json({ detail: "unavailable" }, { status: 503 });
  }
}
