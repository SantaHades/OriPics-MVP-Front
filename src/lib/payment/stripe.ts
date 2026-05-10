// Stripe 게이트웨이 어댑터 — 골격
//
// Phase 2 (글로벌 사용자 5%+ 도달 시) 도입 예정.
// 추상화 레이어 정합성 확인용 stub.
//
// Phase 2 본 구현 시 참조:
//  - Stripe Subscriptions: https://docs.stripe.com/billing/subscriptions/overview
//  - Stripe webhook 서명 검증: https://docs.stripe.com/webhooks/signatures
//  - Next.js + Stripe: https://stripe.com/docs/payments/quickstart
//
// 환경변수 (Phase 2 시점에 추가):
//  - STRIPE_SECRET_KEY (sensitive)
//  - STRIPE_PUBLISHABLE_KEY
//  - STRIPE_WEBHOOK_SECRET (sensitive)
//  - STRIPE_PRICE_PRO_MONTHLY, STRIPE_PRICE_PRO_YEARLY, STRIPE_PRICE_BUSINESS_MONTHLY

import type { PaymentGateway } from "./types";

class StripeNotImplementedError extends Error {
  constructor(method: string) {
    super(`Stripe.${method}() not implemented yet — Phase 2 도입 대기`);
    this.name = "StripeNotImplementedError";
  }
}

export const stripeGateway: PaymentGateway = {
  provider: "stripe",

  async createCustomer() {
    throw new StripeNotImplementedError("createCustomer");
  },

  async createSubscription() {
    throw new StripeNotImplementedError("createSubscription");
  },

  async cancelSubscription() {
    throw new StripeNotImplementedError("cancelSubscription");
  },

  async getSubscription() {
    throw new StripeNotImplementedError("getSubscription");
  },

  async refund() {
    throw new StripeNotImplementedError("refund");
  },

  async parseWebhook() {
    throw new StripeNotImplementedError("parseWebhook");
  },
};
