/**
 * 이미지 사이즈 기반 크레딧 multiplier.
 *
 * 정책 (pricing-policy.md §3 참조):
 *  - 1× : 긴 변 ≤ 1800px (기준 사이즈)
 *  - 2× : 긴 변 > 1800px AND 픽셀 수 ≤ 100,000,000 (1억)
 *  - 3× : 픽셀 수 > 100,000,000
 *
 * 적용 대상: IMAGE_PROOF, VERIFY_QUERY, VERIFIED_PROOF
 * 미적용:    LINK_CREATE (메타데이터 작업, 사이즈 무관)
 *
 * 호출 위치:
 *  - /api/sign : 요청 width/height 기준
 *  - /api/verify : 디코드한 메타의 width/height 기준
 *  - 클라이언트 미리보기 : decoded ImageBitmap 기준
 */

export const STANDARD_MAX_DIMENSION = 1800;
export const LARGE_MAX_PIXELS = 100_000_000; // 1억 픽셀

export type ProofMultiplier = 1 | 2 | 3;

export function getProofMultiplier(width: number, height: number): ProofMultiplier {
  const longest = Math.max(width, height);
  const pixels = width * height;
  if (longest <= STANDARD_MAX_DIMENSION) return 1;
  if (pixels > LARGE_MAX_PIXELS) return 3;
  return 2;
}
