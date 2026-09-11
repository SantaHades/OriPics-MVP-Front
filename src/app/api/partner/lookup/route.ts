import { NextRequest, NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/auth/getSessionUserId";
import { lookupPartnerCode } from "@/lib/partner/server";
import { checkRateLimit, clientIp, tooManyRequests, RATE_LIMITS } from "@/lib/security/rateLimit";

export const runtime = "nodejs";

/**
 * GET /api/partner/lookup?code=1235  (비로그인 허용 — 가입 폼에서 사용)
 * → { ok:true, code, ownerNameMasked } | { ok:false, error }
 * 순번 코드 열람으로 회원 이름을 수집하지 못하도록 마스킹 + IP 레이트리밋(분 5·일 20).
 * (2026-09-11 A-93 §3.1) error 구분: invalid_code(400) · code_not_found(404) · owner_gone(404, 탈퇴한 주인의 코드)
 *   · self_code(409, 로그인 상태에서 본인 코드). 문구는 클라이언트(messages)에서 error 키로 매핑.
 */
export async function GET(req: NextRequest) {
  const ip = clientIp(req);
  const rl = await checkRateLimit(RATE_LIMITS.partnerLookup, ip);
  if (!rl.allowed) return tooManyRequests(rl, "조회가 너무 잦습니다. 잠시 후 다시 시도해 주세요.");
  const rld = await checkRateLimit(RATE_LIMITS.partnerLookupDaily, ip);
  if (!rld.allowed) return tooManyRequests(rld, "오늘 조회 한도를 넘었습니다. 내일 다시 시도해 주세요.");

  const code = req.nextUrl.searchParams.get("code");
  try {
    // 비로그인 조회(가입 폼)는 세션이 없으므로 self_code 판정 없이 진행 — 세션 오류도 조회를 막지 않음
    const viewerId = await getSessionUserId().catch(() => null);
    const r = await lookupPartnerCode(code, { viewerId });
    if (!r.ok) {
      const status = r.error === "invalid_code" ? 400 : r.error === "self_code" ? 409 : 404;
      return NextResponse.json(r, { status });
    }
    return NextResponse.json({ ok: true, code: r.code, ownerNameMasked: r.ownerNameMasked });
  } catch (e: any) {
    console.error("[partner/lookup] failed", e?.message ?? e);
    return NextResponse.json({ ok: false, error: "unavailable" }, { status: 503 });
  }
}
