// 결제 게이트웨이 추상화 — 타입 정의
//
// 설계 원칙:
//  1. 도메인 모델(Prisma Subscription)은 게이트웨이 무관 형태로 유지.
//  2. PaymentGateway 구현체는 외부 SDK·API 호출만 담당, DB 접근 X.
//  3. webhook 처리: 게이트웨이별 서명 검증 + 표준 WebhookEvent 변환은 어댑터,
//     이후 비즈니스 로직(크레딧 부여, Subscription 레코드 갱신 등)은 호출 측에서.
//  4. Phase 1 (포트원 단독): 한국 사용자 → portone 어댑터.
//     Phase 2 (Stripe 추가): 사용자 region 기반 라우팅.
// 참조: apps/web/docs/payment-gateway-comparison.md, apps/web/docs/pricing-policy.md

export type GatewayProvider = "portone" | "stripe";

export type PlanId = "pro_monthly" | "pro_yearly" | "business_monthly";

export type SubscriptionStatus = "active" | "past_due" | "canceled" | "incomplete";

export interface PaymentCustomer {
  customerId: string;
  email: string;
  name?: string;
}

export interface PaymentSubscription {
  subscriptionId: string;
  customerId: string;
  plan: PlanId;
  status: SubscriptionStatus;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  cancelAtPeriodEnd: boolean;
}

// 게이트웨이별 raw 이벤트를 표준 형태로 정규화한 webhook 이벤트
export type WebhookEvent =
  | { type: "subscription.created"; subscription: PaymentSubscription }
  | { type: "subscription.updated"; subscription: PaymentSubscription }
  | { type: "subscription.canceled"; subscriptionId: string; canceledAt: Date }
  | {
      type: "payment.succeeded";
      subscriptionId: string;
      amount: number;
      currency: string;
      paymentId: string;
    }
  | { type: "payment.failed"; subscriptionId: string; reason: string }
  | { type: "unknown"; raw: unknown };

export interface PaymentGateway {
  readonly provider: GatewayProvider;

  /** 게이트웨이 측에 customer 레코드 생성 (idempotent 권장) */
  createCustomer(opts: {
    user: { id: string; email: string; name?: string | null };
  }): Promise<PaymentCustomer>;

  /**
   * 구독 생성. 게이트웨이에 따라:
   *  - 즉시 생성 후 PaymentSubscription 반환 (서버 직결 결제)
   *  - 또는 checkoutUrl 반환 (사용자 브라우저 리다이렉트 후 webhook으로 완료)
   */
  createSubscription(opts: {
    customerId: string;
    plan: PlanId;
    successUrl?: string;
    cancelUrl?: string;
  }): Promise<{ subscription?: PaymentSubscription; checkoutUrl?: string }>;

  /** 즉시 취소 또는 기간 종료 시 취소 */
  cancelSubscription(opts: {
    subscriptionId: string;
    immediately?: boolean;
  }): Promise<void>;

  getSubscription(subscriptionId: string): Promise<PaymentSubscription | null>;

  refund(opts: {
    paymentId: string;
    amount?: number;
    reason?: string;
  }): Promise<void>;

  /**
   * webhook 검증 + 표준 이벤트 변환.
   * 서명 검증 실패 시 throw. 알 수 없는 이벤트는 { type: "unknown" } 반환.
   */
  parseWebhook(opts: {
    rawBody: string;
    signature: string | null;
  }): Promise<WebhookEvent>;
}
