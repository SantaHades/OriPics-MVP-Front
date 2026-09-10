import { NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/auth/getSessionUserId";
import { getPartnerOverview } from "@/lib/partner/server";
import { notifyMilestoneIfReached } from "@/lib/partner/notify";
import { PLAN_PRICES } from "@/lib/payment/subscriptionGrant";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/partner/me  (웹 세션 · 앱 Bearer 공용)
 * 내 코드·파트너 순번·참여 여부·초대 현황(마스킹)·혜택·사용 내역·다음 결제 예상.
 * 조회 시 12명 도달을 지연 확인(피추천인 첫 인증은 나중에 발생).
 */
export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ detail: "unauthenticated" }, { status: 401 });
  try {
    const overview = await getPartnerOverview(userId, { listAmount: PLAN_PRICES.pro_monthly });
    if (!overview) return NextResponse.json({ detail: "not_found" }, { status: 404 });
    if (overview.milestone && !overview.milestone.approvedAt) {
      notifyMilestoneIfReached(userId).catch(() => {});
    }
    return NextResponse.json({ ok: true, listAmount: PLAN_PRICES.pro_monthly, ...overview });
  } catch (e: any) {
    console.error("[partner/me] failed", e?.message ?? e);
    return NextResponse.json({ detail: "unavailable" }, { status: 503 });
  }
}
