// 결제 게이트웨이 라우터 + 도메인 상수
//
// 사용처:
//  ```
//  import { getGateway, selectGatewayForUser, CREDIT_COSTS } from "@/lib/payment";
//
//  const gateway = getGateway(selectGatewayForUser({ locale }));
//  const customer = await gateway.createCustomer({ user });
//  ```

import { portoneGateway } from "./portone";
import { stripeGateway } from "./stripe";
import type { GatewayProvider, PaymentGateway } from "./types";

export type {
  GatewayProvider,
  PaymentGateway,
  PaymentCustomer,
  PaymentSubscription,
  PlanId,
  SubscriptionStatus,
  WebhookEvent,
} from "./types";

const REGISTRY: Record<GatewayProvider, PaymentGateway> = {
  portone: portoneGateway,
  stripe: stripeGateway,
};

export function getGateway(provider: GatewayProvider): PaymentGateway {
  const g = REGISTRY[provider];
  if (!g) throw new Error(`Unknown payment gateway: ${provider}`);
  return g;
}

/**
 * 사용자 region/locale 기반 게이트웨이 선택.
 *
 * Phase 1 (현재): 한국 우선 시장 → 항상 portone.
 * Phase 2 (글로벌 사용자 5%+ 시): userCountry === "KR" ? portone : stripe.
 *
 * 참조: apps/web/docs/payment-gateway-comparison.md §4
 */
export function selectGatewayForUser(_opts: {
  locale?: string;
  userCountry?: string;
}): GatewayProvider {
  // Phase 1 정책: 글로벌 사용자도 한국 PG로 처리 (포트원이 해외 카드 일부 지원).
  // Phase 2 도입 시 이 함수만 수정하면 라우팅 변경됨.
  return "portone";
}

// ─────────────────────────────────────────────────────────────────────
// 크레딧 도메인 상수 — pricing-policy.md §2 참조
// ─────────────────────────────────────────────────────────────────────

/**
 * 액션별 크레딧 비용 (백엔드 회계용, 사용자 비노출).
 * 2026-05-15 갱신: IMAGE_PROOF/VERIFIED_PROOF는 link 비용 통합. CERTIFICATE_PDF 신설.
 *  - 검증 조회: 1
 *  - 간편링크 생성(standalone): 2
 *  - 이미지 인증(Standard, F/C) 1회 총비용: 3
 *  - 사진 인증(Verified, P) 1회 총비용: 4
 *  - 증명서 PDF 발급 1회: 10
 */
export const CREDIT_COSTS = {
  VERIFY_QUERY: 1,       // /api/verify 조회
  LINK_CREATE: 2,        // 간편링크 단독 생성 (현재 통합 차감 흐름에는 미사용)
  IMAGE_PROOF: 3,        // /api/links/confirm Standard 인증 (link 포함 통합 비용)
  VERIFIED_PROOF: 4,     // 모바일 P 경로 Verified 인증 (link 포함 통합 비용, Pro 한정)
  CERTIFICATE_PDF: 10,   // 증명서 PDF 발급
} as const;

export type CreditAction = keyof typeof CREDIT_COSTS;

/**
 * 플랜별 크레딧 부여량 (가입·갱신 시).
 * pricing-policy.md §1 참조. 이월 불가 (cap = monthly_grant).
 * 2026-05-15 갱신: free 10 → 20 (사진인증 5건 ≒ 4×5=20).
 */
export const PLAN_GRANTS = {
  free_signup: 20,            // 가입 즉시 첫 달치
  free_monthly: 20,           // 매월 갱신
  pro_monthly: 1000,          // 실질 무제한 (사진인증 250건)
  pro_yearly_monthly: 1000,   // 연결제도 매월 1000으로 갱신, 한 번에 받지 않음
  business_monthly: 10000,    // 5명 팀 공유 (사진인증 2,500건)
} as const;

/**
 * 크레딧 거래 액션 종류 (CreditTransaction.action 컬럼 값).
 */
export type CreditTransactionAction =
  | "signup_grant"           // 가입 보너스
  | "monthly_renewal"        // 매월 갱신
  | "image_proof"            // -3 (link 포함)
  | "verify_query"           // -1
  | "link_create"            // -2 (standalone)
  | "verified_proof"         // -4 (link 포함)
  | "pdf_issue"              // -10 증명서 PDF 발급
  | "subscription_grant"     // 구독 결제 시 추가 부여
  | "manual_adjust";         // 어드민 수동 조정
