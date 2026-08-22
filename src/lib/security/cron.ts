// Cron 엔드포인트 인증 (2026-08-22 보안 점검 후속 — H-2 fail-open 차단).
//
// 이전 구현은 `if (CRON_SECRET) { ...검증 }` 형태라, CRON_SECRET이 미설정/오타/
// 프리뷰환경 누락이면 검증 블록 자체를 건너뛰어 익명 GET으로 노출됐다(대량 삭제·
// 실 카드청구·크레딧 리셋). 여기서는 **fail-closed**로 뒤집는다: 시크릿이 없으면 503.
import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";

const CRON_SECRET = process.env.CRON_SECRET || "";

/** 타이밍 공격 방지 상수시간 비교 (길이 노출 방지 위해 길이 불일치도 안전 처리). */
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

/**
 * cron 요청 인증. 통과 시 null, 실패 시 즉시 반환할 NextResponse.
 * 사용:  const denied = assertCron(req); if (denied) return denied;
 *
 * Vercel Cron은 `Authorization: Bearer <CRON_SECRET>` 헤더를 붙이도록 설정한다
 * (vercel.json cron + 환경변수). 시크릿이 유일 팩터이므로 상수시간 비교 + fail-closed.
 */
export function assertCron(req: NextRequest): NextResponse | null {
  if (!CRON_SECRET) {
    console.error("[cron] CRON_SECRET not configured — refusing (fail-closed)");
    return NextResponse.json({ detail: "cron_secret_not_configured" }, { status: 503 });
  }
  const auth = req.headers.get("authorization") || "";
  if (!safeEqual(auth, `Bearer ${CRON_SECRET}`)) {
    return NextResponse.json({ detail: "unauthorized" }, { status: 401 });
  }
  return null;
}
