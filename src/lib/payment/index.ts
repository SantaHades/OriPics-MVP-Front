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
 * todo.md 매트릭스: 이미지인증 2 / 인증조회 1 / 간편링크 1 / 사진인증 3
 */
export const CREDIT_COSTS = {
  IMAGE_PROOF: 2,        // /api/sign 등 Standard 인증
  VERIFY_QUERY: 1,       // /api/verify 조회
  LINK_CREATE: 1,        // /api/links/confirm 간편링크 생성
  VERIFIED_PROOF: 3,     // 모바일 P 경로 Verified 인증 (Pro 한정)
} as const;

export type CreditAction = keyof typeof CREDIT_COSTS;

/**
 * 플랜별 크레딧 부여량 (가입·갱신 시).
 * pricing-policy.md §1 참조. 이월 불가 (cap = monthly_grant).
 */
export const PLAN_GRANTS = {
  free_signup: 10,            // 가입 즉시 첫 달치
  free_monthly: 10,           // 매월 갱신 (= Standard 인증 5건)
  pro_monthly: 1000,          // 실질 무제한 (Standard 500건 / Verified 333건)
  pro_yearly_monthly: 1000,   // 연결제도 매월 1000으로 갱신, 한 번에 받지 않음
  business_monthly: 10000,    // 5명 팀 공유
} as const;

/**
 * 크레딧 거래 액션 종류 (CreditTransaction.action 컬럼 값).
 */
export type CreditTransactionAction =
  | "signup_grant"           // 가입 보너스
  | "monthly_renewal"        // 매월 갱신
  | "image_proof"            // -2
  | "verify_query"           // -1
  | "link_create"            // -1
  | "verified_proof"         // -3
  | "subscription_grant"     // 구독 결제 시 추가 부여
  | "manual_adjust";         // 어드민 수동 조정
