// App Store Server Notifications V2 웹훅 (M6) — 갱신/만료/환불을 서버 권위로 동기화.
// App Store Connect → App Information → App Store Server Notifications에 이 URL 등록 (U-35):
//   https://www.ori.pics/api/mobile/iap/apple/notifications
// 서명 검증: signedPayload(JWS) 자체가 인증 수단 — x5c 체인이 Apple Root CA G3로 연결되어야 통과.
import { NextRequest, NextResponse } from "next/server";
import {
  verifyAppleJws,
  checkTransactionPayload,
  grantAppleSubscription,
  downgradeAppleSubscription,
  attestHashForLog,
} from "@/lib/payment/appleIap";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

// tier를 즉시 회수하는 알림 유형 (환불·만료). DID_CHANGE_RENEWAL_STATUS(해지 예약)는 기간 만료까지 유지.
const DOWNGRADE_TYPES = new Set(["EXPIRED", "REFUND", "GRACE_PERIOD_EXPIRED", "REVOKE"]);
const RENEW_TYPES = new Set(["DID_RENEW", "SUBSCRIBED", "DID_RECOVER"]);

export async function POST(req: NextRequest) {
  const bundleId = process.env.APPLE_IAP_BUNDLE_ID;
  if (!bundleId) {
    return NextResponse.json({ detail: "iap_not_configured" }, { status: 503 });
  }

  let body: { signedPayload?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ detail: "invalid_json" }, { status: 400 });
  }
  if (typeof body.signedPayload !== "string") {
    return NextResponse.json({ detail: "signed_payload_missing" }, { status: 400 });
  }

  const outer = verifyAppleJws(body.signedPayload);
  if (!outer.ok) {
    console.warn("[apple-notify] invalid signedPayload:", outer.reason, attestHashForLog(body.signedPayload));
    return NextResponse.json({ detail: "signature_invalid" }, { status: 401 });
  }

  const notification = outer.payload as any;
  const type: string = notification.notificationType ?? "";
  const subtype: string | undefined = notification.subtype;
  const signedTransactionInfo: string | undefined = notification.data?.signedTransactionInfo;

  console.log(`[apple-notify] ${type}${subtype ? `/${subtype}` : ""}`);

  if (!signedTransactionInfo) {
    // TEST 알림 등 트랜잭션 없는 유형은 ack
    return NextResponse.json({ ok: true });
  }

  const txn = verifyAppleJws(signedTransactionInfo);
  if (!txn.ok) {
    return NextResponse.json({ detail: "transaction_signature_invalid" }, { status: 401 });
  }
  const payload = txn.payload;

  if (RENEW_TYPES.has(type)) {
    const check = checkTransactionPayload(payload, {
      bundleId,
      allowSandbox: process.env.APPLE_IAP_ALLOW_SANDBOX === "true",
    });
    if (!check.ok) {
      console.warn("[apple-notify] renew check failed:", check.reason);
      return NextResponse.json({ ok: true, skipped: check.reason });
    }
    // originalTransactionId → 기존 구독으로 사용자 식별
    const sub = await prisma.subscription.findFirst({
      where: { gateway: "apple_iap", gatewayCustomerId: payload.originalTransactionId! },
      select: { userId: true },
    });
    if (!sub) {
      // 최초 SUBSCRIBED는 클라이언트 verify 경로가 부여 — 여기선 기록만
      console.warn("[apple-notify] no subscription for", payload.originalTransactionId);
      return NextResponse.json({ ok: true, skipped: "unknown_subscription" });
    }
    const result = await grantAppleSubscription(sub.userId, payload, check);
    return NextResponse.json({ ok: result.ok });
  }

  if (DOWNGRADE_TYPES.has(type)) {
    const done = await downgradeAppleSubscription(payload.originalTransactionId ?? "", type);
    return NextResponse.json({ ok: true, downgraded: done });
  }

  if (type === "DID_CHANGE_RENEWAL_STATUS") {
    await prisma.subscription.updateMany({
      where: { gateway: "apple_iap", gatewayCustomerId: payload.originalTransactionId ?? "" },
      data: { cancelAtPeriodEnd: subtype === "AUTO_RENEW_DISABLED", canceledAt: subtype === "AUTO_RENEW_DISABLED" ? new Date() : null },
    });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ ok: true, ignored: type });
}
