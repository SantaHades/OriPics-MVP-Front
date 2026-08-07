// Apple IAP (StoreKit 2) — M6, §8-A 확정안의 iOS 구독 경로.
// - JWS(서명된 트랜잭션/알림) 검증: x5c 체인 → Apple Root CA G3, ES256 서명, 페이로드 필드 검증
// - 구독 부여: PortOne subscriptionGrant와 동일 패턴(advisory lock 멱등, 크레딧 정액 SET,
//   previous_credits 기록, Subscription upsert gateway='apple_iap')
// - 이중 구독 가드: 다른 게이트웨이의 active 구독이 있으면 거부
//
// 환경변수: APPLE_IAP_BUNDLE_ID(=com.santahades.oripics), APPLE_IAP_ALLOW_SANDBOX=true(테스트 기간)
import { createHash, createVerify, X509Certificate } from "crypto";
import { prisma } from "@/lib/prisma";
import { PLAN_GRANTS } from "@/lib/payment";
import { APPLE_ROOT_CA_G3_PEM } from "./appleRootCaG3";

// App Store Connect에 등록할 제품 ID (§8-A 확정 가격: 월 12,900 / 연 129,000)
export const APPLE_PRODUCT_PLANS: Record<string, { plan: "pro_monthly_ios" | "pro_yearly_ios"; periodDays: number }> = {
  "oripics.pro.monthly": { plan: "pro_monthly_ios", periodDays: 30 },
  "oripics.pro.yearly": { plan: "pro_yearly_ios", periodDays: 365 },
};

// 크레딧은 웹 Pro와 동일 정액 (연결제도 매월 갱신은 renewCredits가 처리)
const IAP_GRANT = PLAN_GRANTS.pro_monthly;

export interface AppleTransactionPayload {
  bundleId?: string;
  productId?: string;
  transactionId?: string;
  originalTransactionId?: string;
  expiresDate?: number; // ms
  purchaseDate?: number;
  type?: string;
  environment?: "Sandbox" | "Production";
  revocationDate?: number;
}

export type JwsVerifyResult =
  | { ok: true; payload: AppleTransactionPayload }
  | { ok: false; reason: string };

function b64urlToBuf(s: string): Buffer {
  return Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

/** ES256 JWS raw(r‖s) 서명 → DER 변환 (node verify는 DER 기대) */
export function rawEs256ToDer(sig: Buffer): Buffer {
  if (sig.length !== 64) return sig; // 이미 DER일 가능성
  const trim = (b: Buffer) => {
    let i = 0;
    while (i < b.length - 1 && b[i] === 0) i++;
    let v = b.subarray(i);
    if (v[0] & 0x80) v = Buffer.concat([Buffer.from([0]), v]);
    return v;
  };
  const r = trim(sig.subarray(0, 32));
  const s = trim(sig.subarray(32));
  const seqLen = 2 + r.length + 2 + s.length;
  return Buffer.concat([
    Buffer.from([0x30, seqLen, 0x02, r.length]),
    r,
    Buffer.from([0x02, s.length]),
    s,
  ]);
}

/**
 * StoreKit 2 서명 페이로드(JWS) 검증 — 트랜잭션·알림 공용.
 * x5c 체인을 Apple Root CA G3까지 검증하고 leaf 공개키로 ES256 서명 확인.
 */
export function verifyAppleJws(jws: string): JwsVerifyResult {
  const parts = jws.split(".");
  if (parts.length !== 3) return { ok: false, reason: "jws_malformed" };
  const [headB64, bodyB64, sigB64] = parts;

  let header: { alg?: string; x5c?: string[] };
  try {
    header = JSON.parse(b64urlToBuf(headB64).toString("utf8"));
  } catch {
    return { ok: false, reason: "jws_header_invalid" };
  }
  if (header.alg !== "ES256" || !Array.isArray(header.x5c) || header.x5c.length < 2) {
    return { ok: false, reason: "jws_header_unsupported" };
  }

  let certs: X509Certificate[];
  let root: X509Certificate;
  try {
    certs = header.x5c.map((b64) => new X509Certificate(Buffer.from(b64, "base64")));
    root = new X509Certificate(APPLE_ROOT_CA_G3_PEM);
  } catch {
    return { ok: false, reason: "certificate_parse_failed" };
  }
  const now = Date.now();
  for (const cert of certs) {
    if (now < new Date(cert.validFrom).getTime() || now > new Date(cert.validTo).getTime()) {
      return { ok: false, reason: "certificate_expired" };
    }
  }
  for (let i = 0; i < certs.length; i++) {
    const issuer = i + 1 < certs.length ? certs[i + 1] : root;
    if (!certs[i].verify(issuer.publicKey)) {
      return { ok: false, reason: "certificate_chain_invalid" };
    }
  }

  const verifier = createVerify("SHA256");
  verifier.update(`${headB64}.${bodyB64}`);
  const der = rawEs256ToDer(b64urlToBuf(sigB64));
  if (!verifier.verify(certs[0].publicKey, der)) {
    return { ok: false, reason: "signature_invalid" };
  }

  try {
    return { ok: true, payload: JSON.parse(b64urlToBuf(bodyB64).toString("utf8")) };
  } catch {
    return { ok: false, reason: "payload_invalid" };
  }
}

export interface TransactionCheckConfig {
  bundleId: string;
  allowSandbox: boolean;
  now?: number;
}

export type TransactionCheck =
  | { ok: true; plan: "pro_monthly_ios" | "pro_yearly_ios"; periodDays: number }
  | { ok: false; reason: string };

/** 검증된 트랜잭션 페이로드의 비즈니스 필드 검증 (순수 함수 — 테스트 대상) */
export function checkTransactionPayload(
  p: AppleTransactionPayload,
  config: TransactionCheckConfig,
): TransactionCheck {
  const now = config.now ?? Date.now();
  if (p.bundleId !== config.bundleId) return { ok: false, reason: "bundle_id_mismatch" };
  if (p.environment === "Sandbox" && !config.allowSandbox) return { ok: false, reason: "sandbox_not_allowed" };
  if (p.revocationDate) return { ok: false, reason: "transaction_revoked" };
  const mapping = p.productId ? APPLE_PRODUCT_PLANS[p.productId] : undefined;
  if (!mapping) return { ok: false, reason: "unknown_product" };
  if (typeof p.expiresDate !== "number" || p.expiresDate <= now) return { ok: false, reason: "subscription_expired" };
  if (!p.originalTransactionId || !p.transactionId) return { ok: false, reason: "transaction_id_missing" };
  return { ok: true, plan: mapping.plan, periodDays: mapping.periodDays };
}

export type AppleGrantResult =
  | { ok: true; alreadyProcessed: boolean; granted: number; plan: string }
  | { ok: false; code: "already_subscribed_other_gateway" | "db_update_failed"; httpStatus: number };

/**
 * 검증 통과한 Apple 트랜잭션에 대해 구독·크레딧 부여 (멱등: transactionId 기준).
 * subscriptionGrant.ts의 PortOne 패턴을 미러링.
 */
export async function grantAppleSubscription(
  userId: string,
  payload: AppleTransactionPayload,
  check: Extract<TransactionCheck, { ok: true }>,
): Promise<AppleGrantResult> {
  try {
    return await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`apple_iap:grant:${payload.transactionId}`}))`;

      const existing = await tx.creditTransaction.findFirst({
        where: {
          action: "subscription_grant",
          metadata: { path: ["apple_transaction_id"], equals: payload.transactionId! },
        },
        select: { id: true },
      });
      if (existing) {
        return { ok: true as const, alreadyProcessed: true, granted: 0, plan: check.plan };
      }

      // 이중 구독 가드: 타 게이트웨이 active 구독 존재 시 거부
      const sub = await tx.subscription.findUnique({ where: { userId } });
      if (sub && sub.gateway !== "apple_iap" && sub.status === "active") {
        return { ok: false as const, code: "already_subscribed_other_gateway" as const, httpStatus: 409 };
      }

      const prev = await tx.user.findUnique({ where: { id: userId }, select: { credits: true } });
      const previousCredits = prev?.credits ?? 0;
      const periodStart = new Date(payload.purchaseDate ?? Date.now());
      const periodEnd = new Date(payload.expiresDate!);
      // 크레딧 갱신 anchor: 연결제도 매월 갱신되도록 30일 뒤와 만료일 중 이른 쪽
      const renewAt = new Date(Math.min(periodStart.getTime() + 30 * 86400_000, periodEnd.getTime()));

      await tx.user.update({
        where: { id: userId },
        data: { tier: "pro", credits: IAP_GRANT, creditsRenewAt: renewAt },
      });
      await tx.creditTransaction.create({
        data: {
          userId,
          delta: IAP_GRANT - previousCredits,
          action: "subscription_grant",
          balanceAfter: IAP_GRANT,
          metadata: {
            source: "apple_iap",
            plan: check.plan,
            apple_transaction_id: payload.transactionId!,
            apple_original_transaction_id: payload.originalTransactionId!,
            previous_credits: previousCredits,
            environment: payload.environment ?? "Production",
          },
        },
      });
      await tx.subscription.upsert({
        where: { userId },
        update: {
          gateway: "apple_iap",
          gatewayCustomerId: payload.originalTransactionId!,
          gatewaySubscriptionId: payload.originalTransactionId!,
          plan: check.plan,
          status: "active",
          currentPeriodStart: periodStart,
          currentPeriodEnd: periodEnd,
          cancelAtPeriodEnd: false,
          canceledAt: null,
        },
        create: {
          userId,
          gateway: "apple_iap",
          gatewayCustomerId: payload.originalTransactionId!,
          gatewaySubscriptionId: payload.originalTransactionId!,
          plan: check.plan,
          status: "active",
          currentPeriodStart: periodStart,
          currentPeriodEnd: periodEnd,
        },
      });

      return { ok: true as const, alreadyProcessed: false, granted: IAP_GRANT, plan: check.plan };
    });
  } catch (e) {
    console.error("[appleIap] grant failed:", e);
    return { ok: false, code: "db_update_failed", httpStatus: 500 };
  }
}

/** 환불/만료 시 다운그레이드 — charge-subscriptions cron의 다운그레이드 패스와 동일 정책 (링크 grace 37일) */
export async function downgradeAppleSubscription(originalTransactionId: string, reason: string): Promise<boolean> {
  const sub = await prisma.subscription.findFirst({
    where: { gateway: "apple_iap", gatewayCustomerId: originalTransactionId },
    select: { userId: true, status: true },
  });
  if (!sub) return false;
  await prisma.$transaction(async (tx) => {
    await tx.subscription.updateMany({
      where: { gateway: "apple_iap", gatewayCustomerId: originalTransactionId },
      data: { status: "canceled", canceledAt: new Date() },
    });
    const user = await tx.user.update({
      where: { id: sub.userId },
      data: { tier: "free" },
      select: { credits: true },
    });
    await tx.$executeRaw`UPDATE public.links SET expires_at = now() + interval '37 days' WHERE user_id = ${sub.userId} AND expires_at IS NULL`;
    await tx.creditTransaction.create({
      data: {
        userId: sub.userId,
        delta: 0,
        action: "subscription_downgrade",
        balanceAfter: user.credits,
        metadata: { source: "apple_iap", reason, apple_original_transaction_id: originalTransactionId },
      },
    });
  });
  return true;
}

export function attestHashForLog(jws: string): string {
  return createHash("sha256").update(jws).digest("hex").slice(0, 16);
}
