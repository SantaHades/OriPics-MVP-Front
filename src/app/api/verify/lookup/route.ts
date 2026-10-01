import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit, clientIp, RATE_LIMITS, tooManyRequests } from "@/lib/security/rateLimit";
import { findCopies, sanitizeFingerprints } from "@/lib/ledger/server";

export const runtime = "nodejs";

/**
 * /api/verify/lookup — 스탬프가 손상된 사본(재압축·크기 변경)에서 인증 원본 찾기 (2026-10-01 원장 1단계).
 *
 * 입력: JSON { file_sha256?, phash256?, dhash64?, low_info? } — 브라우저·앱이 계산. **사진은 받지 않는다.**
 * 응답: { matches: [{ kind: "exact_file" | "perceptual", phash_distance?, dhash_distance?, record }], low_info }
 *   - exact_file : 인증본 파일 그대로 (기기 저장본 또는 공개본 다운로드)
 *   - perceptual : 시각적으로 유사한 인증 원본 "후보" — 증명이 아니라 찾기 결과 (문구는 단정하지 않을 것)
 * 로그인 불필요·무료. 계정 정보는 내보내지 않는다.
 */
export async function POST(req: NextRequest) {
  const ip = clientIp(req);
  const [perMin, perDay] = await Promise.all([
    checkRateLimit(RATE_LIMITS.verify, ip),
    checkRateLimit(RATE_LIMITS.verifyDaily, ip),
  ]);
  if (!perMin.allowed) return tooManyRequests(perMin, "verify_rate_limited");
  if (!perDay.allowed) return tooManyRequests(perDay, "verify_rate_limited");

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ detail: "invalid_json" }, { status: 400 });
  }
  const fp = sanitizeFingerprints(body);
  if (!fp.fileSha256 && !(fp.phash256 && fp.dhash64)) {
    return NextResponse.json({ detail: "missing_fingerprint" }, { status: 400 });
  }
  const lowInfo = body?.low_info === true;

  try {
    const matches = await findCopies(fp);
    return NextResponse.json({ matches, low_info: lowInfo });
  } catch (e: any) {
    console.error("[verify/lookup] failed:", e?.message || e);
    return NextResponse.json({ detail: "lookup_failed" }, { status: 500 });
  }
}
