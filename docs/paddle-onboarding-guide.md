# Paddle 계정 신청·검증 가이드 (A-59 선행 심사용)

> 2026-09-01 작성. 목적: 글로벌 USD 오픈 결정 전에 Paddle 계정 검증만 미리 통과시켜
> 2주 리드타임을 제거 (Paddle 공식 권장: "start verification in live before integrating sandbox").
> 검증 통과 ≠ Paddle 채택 확정 — A-59 결론(Paddle vs Polar, PoC 후 결정)과 무충돌.

## 0. 사전 준비물

| 항목 | 값 / 위치 |
|---|---|
| 회사 영문명 | SantaHades Co., Ltd. |
| 사업자등록번호 | 444-88-02865 |
| 대표자 영문명 | **Yongseog Son** (⚠️ Yongseok 오기 주의) |
| 사업자 증빙 | 한/영 병기 사업자등록증명 PDF — `.secrets/ssl-com/` 재사용 (홈택스 즉시 재발급 가능) |
| 신원 서류 | 대표 여권 (영문명 일치) |
| 웹사이트 | https://www.ori.pics (HTTPS·약관·환불·개인정보 완비 — 도메인 심사 요건 충족) |
| 계정 이메일 | hi@ori.pics 권장 |

## 1. 계정 생성

paddle.com → Sign up → **Live 계정** (검증은 Live에서만). 국가 South Korea,
Company/Registered business, 제품 유형 SaaS/Software subscription.

## 2. 비즈니스 정보

Business name·주소는 영문 사업자등록증명 표기와 완전 일치. 제품 설명(영문):

> OriPics is a SaaS that certifies photo authenticity at the moment of capture, using
> pixel-level steganographic fingerprinting and server-side signing (C2PA Conformant
> product). We plan to sell a monthly Pro subscription (USD) to global users via our
> website. Payments are web-only; the mobile app is a client.

## 3. 검증 3단계 (예상 기간은 수동 심사 기준)

1. **Domain Review** (5~7영업일, 자동이면 즉시): `ori.pics` approved domains 추가.
   심사관은 영어 사용자 — 추가 요청 시 `https://www.ori.pics/en` 경로 안내.
2. **Business Verification** (2~4영업일): 한/영 병기 사업자등록증명 업로드.
3. **Identity Verification** (1~3영업일): 대표 여권+셀피 (Veriff류).

## 4. 운영 규칙

- 추가 서류/질문 메일 = **당일 회신** (미회신 시 심사 정지).
- 제품 성격 질문 답변 요지: photo authenticity certification SaaS, subscription-based,
  no marketplace/reselling — AUP 고위험 카테고리 아님.
- 통과 후 할 일 없음 (판매 의무·비용 없음). USD 요금 확정 시 상품 등록→연동→개시.
- 페이아웃 계좌(USD 수취·한국 계좌 방식)는 첫 정산 전 설정 화면에서 확인.
- 개발 실험은 별도 Sandbox 계정 (Live 검증과 무관).

참고: [Account Verification](https://www.paddle.com/help/start/account-verification) ·
[Domain Review](https://www.paddle.com/help/start/account-verification/what-is-domain-verification) ·
[Setup checklist](https://developer.paddle.com/build/onboarding/set-up-checklist)
