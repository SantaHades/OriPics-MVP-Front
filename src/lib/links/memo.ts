// 공개 메모 공통 (A-76, 2026-09-06) — 정규화·길이 제한·컬럼 부재(마이그레이션 전) 판별.
export const MEMO_MAX = 100;

/** 앞뒤 공백 제거, 연속 줄바꿈 1회로, 100자(코드포인트) 초과는 잘라냄. 빈 문자열은 null. */
export function normalizeMemo(input: unknown): string | null | undefined {
  if (input === undefined) return undefined; // 필드 미전달 = 변경 없음
  if (input === null) return null;
  if (typeof input !== "string") return undefined;
  const cleaned = input.replace(/\r\n?/g, "\n").replace(/\n{2,}/g, "\n").trim();
  if (!cleaned) return null;
  return Array.from(cleaned).slice(0, MEMO_MAX).join("");
}

/** PostgREST/PG: 컬럼 없음(42703 undefined_column) 또는 스키마 캐시 미반영 */
export function isMissingColumn(err: { code?: string; message?: string } | null | undefined): boolean {
  if (!err) return false;
  if (err.code === "42703" || err.code === "PGRST204") return true;
  return /column .* does not exist|could not find the .* column/i.test(err.message ?? "");
}
