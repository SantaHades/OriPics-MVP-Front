import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import {
  isPlanId,
  chargeWithBillingKeyAndGrant,
} from "@/lib/payment/subscriptionGrant";

export const runtime = "nodejs";

const PORTONE_API_SECRET = process.env.PORTONE_API_SECRET ?? "";

/**
 * POST /api/billing/portone/billing-key
 *
 * 정기결제(빌링키) 최초 구독: checkout에서 PortOne `requestIssueBillingKey`로 발급한
 * billingKey를 받아 ① 빌링키를 Subscription에 저장하고 ② 첫 달을 즉시 청구한 뒤
 * ③ 구독·크레딧을 멱등 부여한다. 매월 갱신은 cron이 동일 billingKey로 청구.
 *
 * Body: { billingKey, plan }
 * 금액은 클라이언트를 신뢰하지 않고 서버의 PLAN_PRICES로 청구.
 */
export async function POST(req: NextRequest) {
  if (!PORTONE_API_SECRET) {
    return NextResponse.json({ detail: "portone_not_configured" }, { status: 500 });
  }

  const session = await getServerSession(authOptions);
  const userId = (session?.user as any)?.id as string | undefined;
  if (!userId) {
    return NextResponse.json({ detail: "unauthenticated" }, { status: 401 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ detail: "invalid_json" }, { status: 400 });
  }

  const { billingKey, plan } = body || {};
  if (!billingKey || typeof billingKey !== "string" || !isPlanId(plan)) {
    return NextResponse.json({ detail: "missing_fields" }, { status: 400 });
  }

  const result = await chargeWithBillingKeyAndGrant({
    billingKey,
    userId,
    plan,
    secret: PORTONE_API_SECRET,
    customer: {
      fullName: session?.user?.name ?? undefined,
      email: session?.user?.email ?? undefined,
    },
  });

  if (!result.ok) {
    return NextResponse.json(
      { detail: result.code, ...(result.detail !== undefined ? { info: result.detail } : {}) },
      { status: result.httpStatus },
    );
  }

  return NextResponse.json({
    ok: true,
    plan: result.plan,
    granted: result.granted,
    pgProvider: result.pgProvider,
    ...(result.alreadyProcessed ? { already_processed: true } : {}),
  });
}
