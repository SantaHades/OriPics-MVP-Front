import { NextRequest, NextResponse } from "next/server";
import { createHmac } from "crypto";
import { getSessionUserId } from "@/lib/auth/getSessionUserId";
import { CREDIT_COSTS } from "@/lib/payment";
import { consumeCredits } from "@/lib/credits/consumeCredits";
import { getProofMultiplier } from "@/lib/credits/sizeMultiplier";
import { consumePassProof } from "@/lib/pass/dayPass";
import { prisma } from "@/lib/prisma";
import { StepTimer } from "@/lib/timing";

const JWT_SECRET = process.env.ORIPICS_JWT_SECRET!;
const RECEIPT_TTL_SECONDS = 30 * 24 * 60 * 60; // 30일

export const runtime = "nodejs";

function b64urlEncodeJson(obj: unknown): string {
  return Buffer.from(JSON.stringify(obj)).toString("base64url");
}

function issueReceiptJwt(payload: Record<string, any>): string {
  const header = { alg: "HS256", typ: "JWT" };
  const headerB64 = b64urlEncodeJson(header);
  const payloadB64 = b64urlEncodeJson(payload);
  const sig = createHmac("sha256", JWT_SECRET)
    .update(`${headerB64}.${payloadB64}`)
    .digest("base64url");
  return `${headerB64}.${payloadB64}.${sig}`;
}

function verifySignJwt(token: string): Record<string, any> {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("invalid_jwt");
  const [header, payload, sig] = parts;
  const expected = createHmac("sha256", JWT_SECRET)
    .update(`${header}.${payload}`)
    .digest("base64url");
  if (expected !== sig) throw new Error("invalid_signature");
  const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf-8"));
  if (decoded.exp < Date.now() / 1000) throw new Error("jwt_expired");
  if (decoded.aud !== "links/confirm") throw new Error("invalid_audience");
  return decoded;
}

/**
 * /api/links/confirm — B-2'' (2026-05-17 재정렬): 인증 단계는 메타데이터만 처리.
 *
 * 입력: JSON { jwt_token } (sign에서 발급한 JWT)
 * 처리:
 *   - JWT 검증
 *   - proof cost 차감 (IMAGE_PROOF or VERIFIED_PROOF × sizeMultiplier)
 *   - receipt JWT 발급 (publish 단계에서 재제출)
 * 응답: JSON { receipt, link_id, timestamp, proof_cost, size_multiplier, tier }
 *
 * **PNG 미전송, Storage 미접근, DB row 미생성** — 인증 완료된 stamped PNG는 클라이언트 메모리에만 존재.
 * 사용자가 "공개링크 생성" 버튼 클릭 시 /api/links/publish가 Storage 업로드 + C2PA + DB row 생성을 모두 처리.
 */
export async function POST(req: NextRequest) {
  if (!JWT_SECRET) {
    return NextResponse.json({ detail: "server_misconfigured" }, { status: 500 });
  }

  const t = new StepTimer();

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ detail: "invalid_json" }, { status: 400 });
  }
  const { jwt_token } = body || {};
  if (!jwt_token) {
    return NextResponse.json({ detail: "missing_jwt" }, { status: 400 });
  }

  let claims: Record<string, any>;
  try {
    claims = verifySignJwt(jwt_token);
  } catch (e: any) {
    // 403 (401 아님): 세션은 유효하나 sign JWT 거부 — 모바일 클라이언트는 401을 세션 만료로 간주해 로그아웃한다
    return NextResponse.json({ detail: e.message }, { status: 403 });
  }

  const {
    user_id, link_id, storage_path, timestamp, width, height, lat_e6, lng_e6,
    tier: claimedTier,
    verified_info,
    final_hash_hex,
    inner_hash_hex,
    stamp_version,
    captured_at,
    pass_id, // A-60: sign이 활성 패스를 확인한 경우에만 존재
  } = claims;

  if (!user_id) {
    return NextResponse.json({ detail: "jwt_missing_user_id" }, { status: 400 });
  }

  // L-1: 세션 검증 — sign JWT만으로 통과시키지 않고, 로그인 세션(웹 쿠키 또는
  // 모바일 Bearer)의 사용자가 JWT의 user_id와 일치해야 크레딧을 차감한다.
  // (탈취된 JWT를 다른 계정 세션에서 사용하는 것을 차단)
  const sessionUserId = await t.span("auth", () => getSessionUserId());
  if (!sessionUserId) {
    return NextResponse.json({ detail: "unauthenticated" }, { status: 401 });
  }
  if (sessionUserId !== user_id) {
    return NextResponse.json({ detail: "user_mismatch" }, { status: 403 });
  }

  const tier: "standard" | "verified" = claimedTier === "verified" ? "verified" : "standard";
  const sizeMultiplier = getProofMultiplier(width, height);
  const baseProofCost = tier === "verified" ? CREDIT_COSTS.VERIFIED_PROOF : CREDIT_COSTS.IMAGE_PROOF;
  const proofCost = baseProofCost * sizeMultiplier;
  const creditAction = tier === "verified" ? "verified_proof" : "image_proof";

  let passRemaining: number | null = null;
  if (typeof pass_id === "string" && pass_id) {
    // A-60: 패스 1회 차감 (사이즈 무관, 크레딧 미차감). 소유자 검증 포함 원자 UPDATE.
    const passResult = await t.span("consume_pass", () => consumePassProof(pass_id, user_id));
    if (!passResult.ok) {
      // sign~confirm 사이 만료/소진 (드묾) — 클라이언트는 sign부터 재시도(크레딧 폴백)
      return NextResponse.json({ detail: "pass_not_active", tier }, { status: 402 });
    }
    passRemaining = passResult.remaining;
    // 웹 프로필 최근 내역 표시용 기록 (delta 0 — 크레딧 무변동, best-effort)
    try {
      const balance = await prisma.user.findUnique({
        where: { id: user_id },
        select: { credits: true },
      });
      await prisma.creditTransaction.create({
        data: {
          userId: user_id,
          delta: 0,
          action: "day_pass_proof",
          balanceAfter: balance?.credits ?? 0,
          metadata: {
            link_id, tier, pass_id,
            pass_used: passResult.usedProofs,
            pass_total: passResult.totalProofs,
          } as any,
        },
      });
    } catch (e: any) {
      console.warn("[confirm] day_pass_proof tx record failed:", e?.message || e);
    }
  } else {
    // proof 비용 차감 (race-safe atomic)
    const consume = await t.span("consume_credits", () =>
      consumeCredits({
        userId: user_id,
        amount: proofCost,
        action: creditAction,
        metadata: { link_id, tier, width, height, size_multiplier: sizeMultiplier },
      }),
    );
    if (!consume.ok) {
      return NextResponse.json(
        {
          detail: "insufficient_credits",
          balance: consume.balance,
          required: proofCost,
          tier,
          size_multiplier: sizeMultiplier,
        },
        { status: 402 },
      );
    }
  }

  // receipt JWT 발급 (publish 시 재제출)
  const now = Math.floor(Date.now() / 1000);
  const receiptPayload: Record<string, any> = {
    iat: now,
    exp: now + RECEIPT_TTL_SECONDS,
    aud: "links/publish",
    user_id,
    link_id,
    storage_path,
    timestamp,
    width,
    height,
    tier,
  };
  if (lat_e6 != null && lng_e6 != null) {
    receiptPayload.lat_e6 = lat_e6;
    receiptPayload.lng_e6 = lng_e6;
  }
  if (verified_info) {
    receiptPayload.verified_info = verified_info;
  }
  if (final_hash_hex) {
    receiptPayload.final_hash_hex = final_hash_hex;
  }
  if (inner_hash_hex) {
    receiptPayload.inner_hash_hex = inner_hash_hex;
  }
  if (stamp_version) {
    receiptPayload.stamp_version = stamp_version;
  }
  if (captured_at) {
    receiptPayload.captured_at = captured_at;
  }
  if (typeof pass_id === "string" && pass_id) {
    // A-60: publish가 LINK_CREATE 차감 생략 + links.pass_id 기록에 사용
    receiptPayload.pass_id = pass_id;
  }
  const receipt = issueReceiptJwt(receiptPayload);

  console.log(
    passRemaining !== null
      ? `[confirm] pass proof link_id=${link_id} pass_id=${pass_id} remaining=${passRemaining}`
      : `[confirm] proof charged link_id=${link_id} cost=${proofCost}`,
  );
  t.log("links/confirm", { link_id, tier, ...(passRemaining !== null ? { pass: true } : {}) });

  return t.withServerTiming(
    NextResponse.json({
      receipt,
      link_id,
      timestamp,
      proof_cost: passRemaining !== null ? 0 : proofCost,
      size_multiplier: sizeMultiplier,
      tier,
      ...(passRemaining !== null ? { pass_remaining: passRemaining } : {}),
    }),
  );
}
