import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import {
  isPlanId,
  verifyAndGrantSubscription,
} from "@/lib/payment/subscriptionGrant";

export const runtime = "nodejs";

const PORTONE_API_SECRET = process.env.PORTONE_API_SECRET ?? "";

/**
 * POST /api/billing/portone/complete
 *
 * PortOne V2 결제 완료 검증 + 구독·크레딧 부여 (동기 경로).
 * /billing/success 페이지가 PortOne SDK로부터 받은 paymentId를 전송.
 *
 * Body: { paymentId, plan }
 *
 * 검증·부여 로직은 webhook 경로와 공유: lib/payment/subscriptionGrant.ts.
 * 클라이언트가 보낸 금액은 신뢰하지 않고, paymentId로 PortOne에 재질의해
 * "실제로 PG에 PAID 상태로 기록된 금액"을 source of truth로 사용.
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

  const { paymentId, plan } = body || {};
  if (!paymentId || typeof paymentId !== "string" || !isPlanId(plan)) {
    return NextResponse.json({ detail: "missing_fields" }, { status: 400 });
  }

  const result = await verifyAndGrantSubscription({
    paymentId,
    userId,
    plan,
    secret: PORTONE_API_SECRET,
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
