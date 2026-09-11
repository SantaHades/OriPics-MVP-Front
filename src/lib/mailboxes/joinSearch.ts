// 사서함 이름+비밀번호 참여 — 검색어 처리 (2026-09-11 A-83)
//   route.ts는 Next.js가 export 이름을 제한하므로 순수 헬퍼는 여기에 두고 단위 테스트한다.

/** 사서함 번호(MB-1001…) — 번호는 정확일치로만 찾는다 */
export const MAILBOX_ID_RE = /^MB-\d{1,12}$/i;

/** ambiguous 후보 상한 — 활성 사서함 전체가 나열되지 않게 */
export const MAX_JOIN_CANDIDATES = 10;

/**
 * ilike 접두어 패턴용 이스케이프. LIKE 와일드카드 `%`·`_`와 이스케이프 문자 `\`는 `\`로 이스케이프하고,
 * `*`는 PostgREST가 `%`로 치환하므로 제거한다. 이전 구현은 `"`·`\`만 제거해 `%` 한 글자로
 * 활성 사서함 전체가 409 ambiguous 후보(id·이름·개설자 이름)로 노출됐다.
 */
export function likePrefixPattern(term: string): string {
  const escaped = term.replace(/\*/g, "").replace(/[\\%_]/g, (c) => `\\${c}`);
  return `${escaped}%`;
}
