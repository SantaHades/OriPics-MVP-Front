"use client";

import { Link } from "@/navigation";
import { useParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";

const LAST_UPDATED = "2026-07-24";
const COMPANY_NAME_KO = "주식회사 산타하데스";
const COMPANY_NAME_EN = "SantaHades Co., Ltd.";
const SUPPORT_EMAIL = "hi@ori.pics";

function RefundKo() {
  return (
    <article className="prose prose-slate max-w-none">
      <h1 className="text-3xl font-bold mb-2">환불 정책</h1>
      <p className="text-sm text-slate-500 mb-10">최종 갱신: {LAST_UPDATED}</p>

      <p>
        본 페이지는 {COMPANY_NAME_KO}(이하 &quot;회사&quot;)가 운영하는 OriPics
        서비스의 유료 결제·환불 정책을 요약합니다. 상세 조항은{" "}
        <Link href="/terms#refund">이용약관 제11조 (환불 및 청약철회)</Link>
        를 따릅니다.
      </p>

      <h2>서비스 제공기간</h2>
      <ul>
        <li>월간 구독: 결제일로부터 <strong>1개월</strong></li>
      </ul>
      <p>구독 기간 종료 후 갱신하지 않으면 Free 플랜으로 자동 전환됩니다.</p>

      <h2>1. 청약철회 기간 (전자상거래법 §17)</h2>
      <ul>
        <li>
          결제일로부터 <strong>7일 이내</strong>, 인증 횟수를 전혀 사용하지 않은
          경우 <strong>전액 환불</strong>됩니다.
        </li>
        <li>
          7일 이내에 일부 사용한 경우, 사용된 부분은 청약철회가 제한되며
          <strong> 환불액 = 결제 금액 − (사용 횟수 × 회당 정가)</strong>로
          잔여분을 환불합니다 (위약금 없음). 회당 정가는 요금제 페이지에 고지된
          1회 이용 기준 금액(별도 고지가 없으면 1회 1,000원, VAT 포함)입니다.
        </li>
      </ul>

      <h2>2. 월간 구독 해지 (두 방식 중 선택)</h2>
      <ul>
        <li><strong>일반해지:</strong> 다음 결제 시점부터 효력이 발생하며, 당월분은 환불되지 않는 대신 해당 결제 주기 종료일까지 서비스를 계속 이용할 수 있습니다.</li>
        <li><strong>중도해지:</strong> 신청 즉시 이용이 종료되고, <strong>환불액 = 결제 금액 − [사용분 정가 환산액 또는 경과 일할액 중 큰 금액] − 잔여 금액의 10%</strong>로 환불합니다.</li>
        <li>무상 제공분(가입 혜택·이벤트·Free 플랜)은 환불 대상이 아니며, 환불 확정 시 유료 플랜 권한은 즉시 종료됩니다.</li>
      </ul>

      <h2>2-1. 원데이 패스(1일 이용권) 환불</h2>
      <ul>
        <li><strong>미등록 코드:</strong> 결제일로부터 7일 이내 전액 환불됩니다 (청약철회).</li>
        <li>
          <strong>등록(사용 개시) 후:</strong> 코드 등록 시점부터 24시간 서비스 제공이
          즉시 개시되므로, 등록 이후에는 전자상거래법 제17조 제2항에 따라 청약철회가
          제한되어 환불이 불가합니다. 이 내용은 구매·등록 화면에서 사전 고지됩니다.
        </li>
        <li>선물 등으로 양도된 코드의 환불은 구매자 본인만 신청할 수 있으며, 미등록 상태에서만 가능합니다.</li>
      </ul>

      <h2>3. 회사 귀책사유로 인한 환불</h2>
      <p>
        시스템 장애, 서비스 결함, 약관·법령 위반 등 회사의 귀책사유로 서비스를
        정상적으로 이용하지 못한 경우, 회사는 영향을 받은 기간을 일할 계산하여
        즉시 환불하거나 동일 가치의 이용 횟수·이용 기간을 보상합니다.
      </p>

      <h2>4. 환불 신청 방법</h2>
      <ul>
        <li>서비스 내 결제 관리 페이지 또는 <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>로 접수</li>
        <li>회사는 접수일로부터 <strong>3영업일 이내</strong>에 처리 결과를 안내합니다.</li>
        <li>환불 승인 시 결제대행사(PG)에 승인 취소 또는 매입 취소를 요청하며, 실제 환급은 카드사·간편결제사의 정책에 따라 결제일과 동일 사이클 또는 다음 사이클에 처리됩니다.</li>
      </ul>

      <h2>5. 미성년자 결제 환불</h2>
      <p>
        미성년자가 법정대리인의 동의 없이 결제한 경우, 미성년자 본인 또는
        법정대리인은 결제일로부터 <strong>6개월 이내</strong>에 환불을 요청할 수
        있습니다. 증빙 서류 확인 후 처리됩니다.
      </p>

      <h2>6. 분쟁 해결</h2>
      <p>
        환불 관련 분쟁은 회사와 회원 간 우선 협의로 해결합니다. 협의가
        이루어지지 않을 경우, 회원은 한국소비자원 또는 관할 분쟁조정위원회에
        조정을 신청할 수 있습니다.
      </p>

      <h2>7. 문의</h2>
      <p>
        결제·환불 관련 문의: <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>
      </p>
    </article>
  );
}

function RefundEn() {
  return (
    <article className="prose prose-slate max-w-none">
      <h1 className="text-3xl font-bold mb-2">Refund Policy</h1>
      <p className="text-sm text-slate-500 mb-10">Last updated: {LAST_UPDATED}</p>

      <p>
        This page summarizes the paid-subscription and refund policy of OriPics,
        operated by {COMPANY_NAME_EN} (&quot;the Company&quot;). The full terms
        are set out in <Link href="/terms#refund">Terms of Service §7 (Refunds and Withdrawal)</Link>.
      </p>

      <h2>Service Provision Period</h2>
      <ul>
        <li>Monthly subscription: <strong>1 month</strong> from the payment date</li>
      </ul>
      <p>If not renewed, your account is automatically downgraded to the Free plan at the end of the period.</p>

      <h2>1. Withdrawal Period (Korean E-Commerce Act §17)</h2>
      <ul>
        <li>Within <strong>7 days</strong> of payment with no usage, you receive a <strong>full refund</strong>.</li>
        <li>Within 7 days with partial usage, withdrawal is restricted as to the used portion only: <strong>refund = amount paid − (uses × list price per use)</strong>, with no penalty. The list price per use is the per-use amount posted on the pricing page (KRW 1,000 incl. VAT per proof if not separately posted).</li>
      </ul>

      <h2>2. Monthly Subscription Cancellation (choose one)</h2>
      <ul>
        <li><strong>Standard cancellation:</strong> takes effect at the <strong>next billing date</strong>; the current month is non-refundable, but you retain access until the end of the paid period.</li>
        <li><strong>Mid-term cancellation:</strong> access ends immediately; <strong>refund = amount paid − [the greater of used-portion list value or elapsed-days pro-rata] − 10% of the remainder</strong>.</li>
        <li>Complimentary usage (signup bonuses, events, Free plan) is not refundable; paid entitlements end immediately once a refund is confirmed.</li>
      </ul>

      <h2>3. Refunds Due to Our Fault</h2>
      <p>
        If you cannot use the Service normally due to system failure, defects,
        or our breach of these Terms or law, we will refund the affected period
        pro-rated, or compensate with equivalent usage or service days.
      </p>

      <h2>4. How to Request a Refund</h2>
      <ul>
        <li>Submit refund requests via the in-Service billing page or by email to <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.</li>
        <li>We respond with a decision within <strong>3 business days</strong> of receipt.</li>
        <li>Once approved, we submit the cancellation/void to the payment processor; the actual return follows the card issuer&apos;s or easy-pay provider&apos;s cycle.</li>
      </ul>

      <h2>5. Minor Cancellations</h2>
      <p>
        A minor or their legal guardian may request a refund within{" "}
        <strong>6 months</strong> of payment where the minor paid without
        guardian consent. Refunds follow verification of supporting documents.
      </p>

      <h2>6. Dispute Resolution</h2>
      <p>
        Refund disputes are first resolved between the Company and the member.
        If unresolved, members may apply to mediation through the Korea Consumer
        Agency or another competent body.
      </p>

      <h2>7. Contact</h2>
      <p>
        Billing and refund inquiries: <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>
      </p>
    </article>
  );
}

export default function RefundPage() {
  const params = useParams();
  const locale = (params?.locale as string) || "ko";

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 py-12 px-6">
      <div className="max-w-3xl mx-auto">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900 mb-8"
        >
          <ArrowLeft size={16} /> {locale === "en" ? "Back" : "돌아가기"}
        </Link>
        {locale === "en" ? <RefundEn /> : <RefundKo />}
      </div>
    </div>
  );
}
