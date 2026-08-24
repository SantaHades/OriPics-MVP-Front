// 모바일 refresh 토큰 서버측 상태 관리 (A-38②, 2026-08-24)
//
// 정책:
//  - 발급(로그인/oauth/회전) 시 jti를 DB에 기록
//  - 회전 시 구 jti 폐기(revokedAt) — 유출된 구 토큰은 즉시 무효
//  - 폐기된 jti 재사용 = 탈취 신호 → 해당 사용자의 모든 refresh 토큰 일괄 폐기
//  - DB에 없는 jti(구버전 클라이언트의 A-38 이전 발급분 포함)는 거부 → 재로그인 1회 유도
import { prisma } from "@/lib/prisma";
import type { MobileTokenPayload } from "./mobileTokens";

export async function persistRefreshToken(userId: string, jti: string, expEpochSec: number): Promise<void> {
  await prisma.mobileRefreshToken.create({
    data: { jti, userId, expiresAt: new Date(expEpochSec * 1000) },
  });
}

export type RotateResult = "ok" | "reused" | "unknown";

/**
 * 회전 전 검증: jti가 유효(존재·미폐기)하면 폐기 처리 후 "ok".
 * 이미 폐기된 jti면 사용자 전체 토큰을 무효화하고 "reused".
 * 모르는 jti면 "unknown" (A-38 이전 발급분·위조 — 재로그인 유도).
 */
export async function consumeRefreshToken(payload: MobileTokenPayload): Promise<RotateResult> {
  const row = await prisma.mobileRefreshToken.findUnique({ where: { jti: payload.jti } });
  if (!row || row.userId !== payload.sub) return "unknown";
  if (row.revokedAt) {
    // 재사용 감지 — 탈취 가능성. 이 사용자의 활성 refresh 전부 폐기 (전 기기 재로그인)
    await prisma.mobileRefreshToken.updateMany({
      where: { userId: payload.sub, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return "reused";
  }
  // 정상 회전 — 원자적 폐기 (동시 회전 경합 시 한쪽만 성공)
  const updated = await prisma.mobileRefreshToken.updateMany({
    where: { jti: payload.jti, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  return updated.count === 1 ? "ok" : "reused";
}

/** 로그아웃 — 제시된 refresh 토큰만 폐기 (다른 기기 세션은 유지) */
export async function revokeRefreshToken(jti: string, userId: string): Promise<void> {
  await prisma.mobileRefreshToken.updateMany({
    where: { jti, userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

/** 만료·폐기 토큰 정리 (cleanup cron) — 폐기분은 재사용 감지 위해 만료 시까지 보존 */
export async function purgeExpiredRefreshTokens(): Promise<number> {
  const r = await prisma.mobileRefreshToken.deleteMany({
    where: { expiresAt: { lt: new Date() } },
  });
  return r.count;
}
