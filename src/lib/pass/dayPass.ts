// 원데이 패스 (A-60, 2026-08-31) — 도메인 로직.
//
// 정책 (docs/oneday-pass-design.md):
//   - 등록 시점부터 24시간, 촬영(P/C) 인증 10회. 사이즈 배수·크레딧과 무관한 별도 카운터.
//   - 계정당 활성(redeemed) 패스 1장 — DB partial unique index(day_pass_one_active)로 강제.
//   - 소진(10회) 시 status=exhausted 로 전이되어 즉시 새 패스 등록 가능.
//   - 24h 경과분은 lazy(등록/조회 시) + cron 에서 expired 로 전이.
import { prisma } from "@/lib/prisma";
import { randomBytes } from "crypto";

export const PASS_TOTAL_PROOFS = 10;
export const PASS_VALID_HOURS = 24;
export const PASS_CODE_VALID_DAYS = 365; // 미등록 코드 유효기간 (심사 리스크 완화 — 1년)

/**
 * 등록 코드 생성: OP-XXXX-XXXX-XXXX.
 * Crockford base32 유사(혼동 문자 I/L/O/U/0/1 제외) 12자 ≈ 60bit — 유효 코드 수 대비
 * 전수 대입이 비현실적이고, redeem 레이트리밋(시간당 10회)이 2차 방어.
 */
const CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTVWXYZ";
export function generatePassCode(): string {
  const bytes = randomBytes(12);
  let s = "";
  for (let i = 0; i < 12; i++) {
    s += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
    if (i === 3 || i === 7) s += "-";
  }
  return `OP-${s}`;
}

/** 입력 코드 정규화 — 대소문자/공백/하이픈 유무 허용 */
export function normalizePassCode(raw: string): string {
  const body = raw.toUpperCase().replace(/[^0-9A-Z]/g, "").replace(/^OP/, "");
  if (body.length !== 12) return "";
  return `OP-${body.slice(0, 4)}-${body.slice(4, 8)}-${body.slice(8, 12)}`;
}

/** 표시용 마스킹: OP-A2C4-****-9XYZ */
export function maskPassCode(code: string): string {
  const parts = code.split("-");
  if (parts.length !== 4) return code;
  return `${parts[0]}-${parts[1]}-****-${parts[3]}`;
}

export interface ActivePass {
  id: string;
  code: string;
  redeemedAt: Date;
  expiresAt: Date;
  totalProofs: number;
  usedProofs: number;
}

/**
 * 활성 패스 조회 (+lazy 만료 전이).
 * 24h가 지난 redeemed 패스를 expired 로 전이해 partial unique index 자리를 비운다
 * (유예 적용은 cron이 grace_applied_at 마커로 처리 — 여기선 상태만).
 */
export async function getActivePass(userId: string): Promise<ActivePass | null> {
  await prisma.dayPass.updateMany({
    where: { redeemerId: userId, status: "redeemed", expiresAt: { lte: new Date() } },
    data: { status: "expired" },
  });
  const pass = await prisma.dayPass.findFirst({
    where: {
      redeemerId: userId,
      status: "redeemed",
      expiresAt: { gt: new Date() },
      // usedProofs < totalProofs 는 consume이 exhausted 전이로 보장하지만 방어적으로 조건 유지
    },
    select: {
      id: true, code: true, redeemedAt: true, expiresAt: true,
      totalProofs: true, usedProofs: true,
    },
  });
  if (!pass || !pass.redeemedAt || !pass.expiresAt) return null;
  if (pass.usedProofs >= pass.totalProofs) return null;
  return {
    id: pass.id,
    code: pass.code,
    redeemedAt: pass.redeemedAt,
    expiresAt: pass.expiresAt,
    totalProofs: pass.totalProofs,
    usedProofs: pass.usedProofs,
  };
}

export type ConsumePassResult =
  | { ok: true; usedProofs: number; totalProofs: number; remaining: number }
  | { ok: false; reason: "pass_not_active" };

/**
 * 촬영 인증 1회 차감 (원자적).
 * 마지막 회 사용 시 exhausted 로 전이 — unique index 자리가 비어 즉시 새 패스 등록 가능.
 * 소유자(redeemer) 검증 포함: 탈취된 pass_id 로 타 계정이 차감하는 것 차단.
 */
export async function consumePassProof(
  passId: string,
  userId: string,
): Promise<ConsumePassResult> {
  const rows = await prisma.$queryRaw<Array<{ used_proofs: number; total_proofs: number }>>`
    UPDATE public.day_passes
    SET used_proofs = used_proofs + 1,
        status = CASE WHEN used_proofs + 1 >= total_proofs THEN 'exhausted' ELSE status END,
        updated_at = now()
    WHERE id = ${passId}
      AND redeemer_id = ${userId}
      AND status = 'redeemed'
      AND used_proofs < total_proofs
      AND expires_at > now()
    RETURNING used_proofs, total_proofs`;
  if (!rows.length) return { ok: false, reason: "pass_not_active" };
  const { used_proofs, total_proofs } = rows[0];
  return {
    ok: true,
    usedProofs: Number(used_proofs),
    totalProofs: Number(total_proofs),
    remaining: Number(total_proofs) - Number(used_proofs),
  };
}

export type RedeemResult =
  | { ok: true; pass: ActivePass }
  | {
      ok: false;
      reason:
        | "invalid_code"        // 존재하지 않는 코드
        | "code_already_used"   // 이미 등록/사용된 코드
        | "code_expired"        // 미등록 유효기간(1년) 경과
        | "code_revoked"        // 환불 등으로 무효화
        | "pass_already_active"; // 본인에게 이미 활성 패스 존재
    };

/**
 * 코드 등록 (원자적). 성공 시 24h 활성.
 * 활성 패스 중복은 partial unique index 위반(23505)으로 잡는다.
 * (패스 발행 링크는 발행 시점부터 1년 고정 보관이라 재등록 시 복원 개념 없음.)
 */
export async function redeemPass(code: string, userId: string): Promise<RedeemResult> {
  // 자기 자신의 만료분 lazy 전이 (unique index 자리 비우기)
  await prisma.dayPass.updateMany({
    where: { redeemerId: userId, status: "redeemed", expiresAt: { lte: new Date() } },
    data: { status: "expired" },
  });

  let rows: Array<{
    id: string; code: string; redeemed_at: Date; expires_at: Date;
    total_proofs: number; used_proofs: number;
  }>;
  try {
    rows = await prisma.$queryRaw`
      UPDATE public.day_passes
      SET status = 'redeemed',
          redeemer_id = ${userId},
          redeemed_at = now(),
          expires_at = now() + interval '24 hours',
          updated_at = now()
      WHERE code = ${code}
        AND status = 'issued'
        AND code_expires_at > now()
      RETURNING id, code, redeemed_at, expires_at, total_proofs, used_proofs`;
  } catch (e: any) {
    // 23505 = day_pass_one_active 위반 → 이미 활성 패스 보유
    const msg = String(e?.message ?? "");
    if (msg.includes("day_pass_one_active") || e?.code === "23505" || msg.includes("23505")) {
      return { ok: false, reason: "pass_already_active" };
    }
    throw e;
  }

  if (!rows.length) {
    // 실패 원인 구분 (등록은 이미 원자적으로 거부됨 — 여기는 안내용 조회)
    const existing = await prisma.dayPass.findUnique({
      where: { code },
      select: { status: true, codeExpiresAt: true },
    });
    if (!existing) return { ok: false, reason: "invalid_code" };
    if (existing.status === "revoked") return { ok: false, reason: "code_revoked" };
    if (existing.status !== "issued") return { ok: false, reason: "code_already_used" };
    return { ok: false, reason: "code_expired" };
  }

  const r = rows[0];
  return {
    ok: true,
    pass: {
      id: r.id,
      code: r.code,
      redeemedAt: new Date(r.redeemed_at),
      expiresAt: new Date(r.expires_at),
      totalProofs: Number(r.total_proofs),
      usedProofs: Number(r.used_proofs),
    },
  };
}
