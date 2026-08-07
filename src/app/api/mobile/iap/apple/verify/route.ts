// iOS IAP 구매/복원 검증 (M6) — 클라이언트가 StoreKit 2 서명 트랜잭션(JWS)을 제출하면
// 서버가 체인·서명·필드를 검증하고 구독·크레딧을 부여한다 (서버 권위).
import { NextRequest, NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/auth/getSessionUserId";
import {
  verifyAppleJws,
  checkTransactionPayload,
  grantAppleSubscription,
} from "@/lib/payment/appleIap";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json({ detail: "unauthenticated" }, { status: 401 });
  }

  const bundleId = process.env.APPLE_IAP_BUNDLE_ID;
  if (!bundleId) {
    return NextResponse.json({ detail: "iap_not_configured" }, { status: 503 });
  }

  let body: { jws?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ detail: "invalid_json" }, { status: 400 });
  }
  if (typeof body.jws !== "string" || body.jws.length < 32 || body.jws.length > 100_000) {
    return NextResponse.json({ detail: "jws_missing" }, { status: 400 });
  }

  const verified = verifyAppleJws(body.jws);
  if (!verified.ok) {
    return NextResponse.json({ detail: `jws_${verified.reason}` }, { status: 401 });
  }

  const check = checkTransactionPayload(verified.payload, {
    bundleId,
    allowSandbox: process.env.APPLE_IAP_ALLOW_SANDBOX === "true",
  });
  if (!check.ok) {
    return NextResponse.json({ detail: check.reason }, { status: 422 });
  }

  const result = await grantAppleSubscription(userId, verified.payload, check);
  if (!result.ok) {
    return NextResponse.json({ detail: result.code }, { status: result.httpStatus });
  }
  return NextResponse.json({
    ok: true,
    plan: result.plan,
    granted: result.granted,
    already_processed: result.alreadyProcessed,
  });
}
