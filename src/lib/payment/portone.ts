// 포트원 (PortOne) 게이트웨이 어댑터 — 골격
//
// 본 구현은 J-7에서. 현재 stub은 PaymentGateway 인터페이스만 충족하며
// 호출 시 NotImplementedError throw.
//
// J-7 본 구현 시 참조:
//  - 포트원 V2 REST API: https://developers.portone.io/docs/ko/api/api?v=v2
//  - 빌링키 발급 + 정기결제: https://developers.portone.io/docs/ko/auth/guide/issue-billing-key/readme?v=v2
//  - webhook: https://developers.portone.io/docs/ko/console/webhook?v=v2
//
// 환경변수 (J-7 시점에 추가):
//  - PORTONE_STORE_ID
//  - PORTONE_API_SECRET (server-side, sensitive)
//  - PORTONE_CHANNEL_KEY_CARD (PG: 토스페이먼츠 등)
//  - PORTONE_CHANNEL_KEY_KAKAO (간편결제: 카카오페이)
//  - PORTONE_CHANNEL_KEY_TOSS (간편결제: 토스페이)
//  - PORTONE_WEBHOOK_SECRET

import type { PaymentGateway } from "./types";

class PortOneNotImplementedError extends Error {
  constructor(method: string) {
    super(`PortOne.${method}() not implemented yet — J-7 본 구현 대기`);
    this.name = "PortOneNotImplementedError";
  }
}

export const portoneGateway: PaymentGateway = {
  provider: "portone",

  async createCustomer() {
    throw new PortOneNotImplementedError("createCustomer");
  },

  async createSubscription() {
    throw new PortOneNotImplementedError("createSubscription");
  },

  async cancelSubscription() {
    throw new PortOneNotImplementedError("cancelSubscription");
  },

  async getSubscription() {
    throw new PortOneNotImplementedError("getSubscription");
  },

  async refund() {
    throw new PortOneNotImplementedError("refund");
  },

  async parseWebhook() {
    throw new PortOneNotImplementedError("parseWebhook");
  },
};
