"use client";

import { Link } from "@/navigation";
import { useParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";

const LAST_UPDATED = "2026-05-11";
const EFFECTIVE_DATE = "2026-05-11";
const COMPANY_NAME_KO = "주식회사 산타하데스";
const COMPANY_NAME_EN = "SantaHades Co., Ltd.";
const SUPPORT_EMAIL = "hi@ori.pics";

function TermsKo() {
  return (
    <article className="prose prose-slate max-w-none">
      <h1 className="text-3xl font-bold mb-2">이용약관</h1>
      <p className="text-sm text-slate-500 mb-10">
        최종 갱신: {LAST_UPDATED} · 시행일: {EFFECTIVE_DATE}
      </p>

      <h2>제1조 (목적)</h2>
      <p>
        본 약관은 {COMPANY_NAME_KO}(이하 &quot;회사&quot;)가 운영하는 OriPics
        서비스(<a href="https://www.ori.pics">www.ori.pics</a> 및 관련 모바일
        애플리케이션, 이하 &quot;서비스&quot;)의 이용과 관련하여 회사와
        이용자의 권리·의무 및 책임 사항을 규정함을 목적으로 합니다.
      </p>

      <h2>제2조 (정의)</h2>
      <ul>
        <li>&quot;이용자&quot;: 본 약관에 동의하고 서비스를 이용하는 개인 또는 법인.</li>
        <li>&quot;회원&quot;: 회사에 개인정보를 제공하여 가입한 자.</li>
        <li>&quot;증명&quot;: 이용자가 업로드 또는 촬영한 이미지에 OriPics가 스테가노그래피 시일과 C2PA 표준 매니페스트를 첨부하여 원본 무결성을 보장하는 처리.</li>
        <li>&quot;Standard 티어&quot;: 웹·모바일의 파일 업로드·붙여넣기 경로로 처리되는 무결성 보장.</li>
        <li>&quot;Verified 티어&quot;: 모바일 앱의 카메라 직접 촬영 경로로 기기 무결성 검증까지 포함하는 보장.</li>
        <li>&quot;크레딧&quot;: 서비스 이용을 위한 내부 단위. 자세한 사용량은 회사 정책에 따릅니다.</li>
      </ul>

      <h2>제3조 (약관의 효력 및 변경)</h2>
      <ol>
        <li>본 약관은 회사가 서비스 화면에 게시함으로써 효력이 발생합니다.</li>
        <li>회사는 관련 법령을 위반하지 않는 범위에서 약관을 변경할 수 있으며, 변경 시 시행일 7일 전(이용자에게 불리한 변경은 30일 전)부터 서비스 내 공지합니다.</li>
        <li>이용자가 변경된 약관에 동의하지 않는 경우 회원 탈퇴를 요청할 수 있으며, 시행일 이후에도 서비스를 계속 이용하면 변경된 약관에 동의한 것으로 간주합니다.</li>
      </ol>

      <h2>제4조 (회원가입 및 자격)</h2>
      <ol>
        <li>회원가입은 이용자가 본 약관 및 개인정보 처리방침에 동의하고 회사가 정한 절차에 따라 가입신청을 한 후, 회사가 이를 승낙함으로써 체결됩니다.</li>
        <li>회사는 다음의 경우 가입을 거부하거나 사후 해지할 수 있습니다.
          <ul>
            <li>타인의 명의를 도용한 경우</li>
            <li>허위 정보를 기재한 경우</li>
            <li>관련 법령 또는 본 약관을 위반한 경우</li>
            <li>본 약관에 따른 의무를 이행하지 않은 경우</li>
          </ul>
        </li>
        <li>만 14세 미만은 회원가입할 수 없습니다.</li>
      </ol>

      <h2>제5조 (회원 정보의 변경 및 관리)</h2>
      <ol>
        <li>회원은 프로필 페이지에서 개인정보를 수정할 수 있으며, 회원의 부주의로 인한 불이익에 대해 회사는 책임을 지지 않습니다.</li>
        <li>회원은 계정·비밀번호의 관리 책임이 있으며, 타인에게 양도·공유할 수 없습니다.</li>
        <li>회원은 계정이 무단 사용된 사실을 인지한 즉시 회사에 통보하고 회사의 안내에 따라야 합니다.</li>
      </ol>

      <h2>제6조 (이용자의 의무)</h2>
      <p>이용자는 다음 행위를 하여서는 안 됩니다.</p>
      <ul>
        <li>타인의 사진·저작물을 무단으로 업로드하여 본인의 원본인 양 증명을 받는 행위</li>
        <li>음란물·폭력물·불법 콘텐츠를 업로드하는 행위</li>
        <li>서비스의 정상 운영을 방해하거나 시스템에 무단 접근하는 행위</li>
        <li>크레딧·인증 결과를 매매·양도하는 행위</li>
        <li>관련 법령 또는 공서양속에 위반하는 행위</li>
      </ul>

      <h2>제7조 (회사의 의무)</h2>
      <ol>
        <li>회사는 안정적인 서비스 제공을 위하여 최선을 다합니다.</li>
        <li>회사는 이용자의 개인정보를 본인의 동의 또는 법령에 근거한 경우 외에는 제3자에게 제공하지 않으며, 개인정보 처리방침에 따라 보호합니다.</li>
        <li>서비스 점검·장애 발생 시 사전 또는 사후 안내합니다.</li>
      </ol>

      <h2>제8조 (서비스의 제공 및 이용)</h2>
      <ol>
        <li>회사는 회원의 요청에 따라 이미지에 스테가노그래피 시일과 C2PA 매니페스트를 첨부합니다.</li>
        <li>증명 결과 및 간편링크의 보관 기간은 회원의 요금제에 따릅니다.
          <ul>
            <li>Free 플랜: 최초 증명 후 7일</li>
            <li>유료 플랜(Pro·Business): 구독 유지 기간 동안 영구 보관. 다운그레이드 시 30일 grace 후 Free 정책으로 회귀.</li>
          </ul>
        </li>
        <li>회사는 다음의 경우 서비스 제공을 일시 중단할 수 있습니다.
          <ul>
            <li>정기 점검·시스템 업그레이드</li>
            <li>천재지변, 정전, 통신 장애</li>
            <li>회사의 합리적인 사유로 서비스 중단이 불가피한 경우</li>
          </ul>
        </li>
      </ol>

      <h2>제9조 (이미지·콘텐츠의 권리 및 책임)</h2>
      <ol>
        <li>이용자가 업로드한 이미지·콘텐츠의 저작권은 이용자 또는 적법한 권리자에게 귀속됩니다.</li>
        <li>회사는 서비스 제공·검증·고객 지원·법적 분쟁 대응을 위해 필요한 범위 내에서 해당 이미지를 처리할 수 있으며, 마케팅 목적으로 사용하지 않습니다.</li>
        <li>이용자가 업로드한 콘텐츠로 인하여 발생한 분쟁(저작권·초상권 등)에 대한 책임은 이용자에게 있습니다.</li>
        <li>C2PA 매니페스트와 스테가노그래피 시일은 원본 무결성·출처 정보를 기록할 뿐이며, 콘텐츠의 합법성 또는 진위 자체를 회사가 보증하는 것은 아닙니다.</li>
      </ol>

      <h2>제10조 (유료 서비스)</h2>
      <p className="text-sm text-slate-500 italic">
        ※ 본 조항은 유료 결제 시스템(포트원 통합) 출시 시점에 갱신됩니다. 시행
        전까지는 모든 회원이 Free 플랜으로 운영됩니다.
      </p>
      <ol>
        <li>회사는 Pro·Business 등 유료 플랜을 제공할 수 있습니다.</li>
        <li>요금·과금 주기·결제 방법·환불 조건은 결제 화면 및 회사 홈페이지의 요금제 안내에 따릅니다.</li>
        <li>유료 회원은 결제일을 기준으로 매월 자동 결제됩니다. 회원은 언제든지 구독을 해지할 수 있으며, 해지 후에도 결제된 기간이 만료될 때까지 서비스를 이용할 수 있습니다.</li>
      </ol>

      <h2>제11조 (환불 및 청약철회)</h2>
      <p className="text-sm text-slate-500 italic">
        ※ 본 조항은 유료 결제 시스템 출시 시점에 갱신됩니다.
      </p>
      <ol>
        <li>회원은 「전자상거래 등에서의 소비자보호에 관한 법률」 제17조에 따라 결제일로부터 7일 이내에 청약철회를 요청할 수 있습니다. 단, 일부 또는 전부를 이용한 경우 해당 분의 환불은 제한될 수 있습니다.</li>
        <li>회사의 귀책사유로 서비스를 정상 제공하지 못한 경우 일할 계산하여 환불합니다.</li>
        <li>환불 요청은 <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>로 접수합니다.</li>
      </ol>

      <h2>제12조 (서비스의 변경 및 종료)</h2>
      <ol>
        <li>회사는 운영상·기술상의 필요에 따라 서비스의 전부 또는 일부를 변경할 수 있으며, 변경 사항은 사전 공지합니다.</li>
        <li>회사가 서비스를 종료하는 경우 30일 전 공지하며, 회원이 보유한 데이터를 다운로드할 수 있도록 합리적인 절차를 제공합니다.</li>
      </ol>

      <h2>제13조 (회원 탈퇴 및 자격 상실)</h2>
      <ol>
        <li>회원은 프로필 페이지에서 언제든지 탈퇴할 수 있으며, 탈퇴 즉시 계정 정보가 삭제됩니다.</li>
        <li>회사는 회원이 제6조의 의무를 위반하는 경우 사전 통보 후 회원 자격을 정지·해지할 수 있습니다.</li>
      </ol>

      <h2>제14조 (면책)</h2>
      <ol>
        <li>회사는 천재지변·전쟁·테러·정전·통신 장애 등 불가항력으로 인한 서비스 중단에 대해 책임지지 않습니다.</li>
        <li>회사는 이용자의 귀책사유로 인한 서비스 이용 장애에 대해 책임지지 않습니다.</li>
        <li>회사는 이용자가 서비스를 통하여 기대하는 효용을 얻지 못한 것에 대해 책임지지 않습니다.</li>
      </ol>

      <h2>제15조 (준거법 및 관할)</h2>
      <p>
        본 약관은 대한민국 법률에 따라 해석되며, 서비스 이용으로 발생한
        분쟁은 회사의 본점 소재지 관할 법원을 제1심 관할 법원으로 합니다.
      </p>

      <h2>제16조 (문의)</h2>
      <p>
        본 약관에 관한 문의는 <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>로 연락해 주십시오.
      </p>

      <h2>변경 이력</h2>
      <ul>
        <li>2026-05-11: 최초 제정</li>
      </ul>
    </article>
  );
}

function TermsEn() {
  return (
    <article className="prose prose-slate max-w-none">
      <h1 className="text-3xl font-bold mb-2">Terms of Service</h1>
      <p className="text-sm text-slate-500 mb-10">
        Last updated: {LAST_UPDATED} · Effective: {EFFECTIVE_DATE}
      </p>

      <p>
        These Terms of Service (&quot;Terms&quot;) govern your use of OriPics
        (<a href="https://www.ori.pics">www.ori.pics</a> and associated mobile
        applications, the &quot;Service&quot;) operated by {COMPANY_NAME_EN}
        (&quot;the Company&quot;, &quot;we&quot;).
      </p>

      <h2>1. Acceptance</h2>
      <p>
        By creating an account or using the Service, you agree to be bound by
        these Terms and the Privacy Policy. If you do not agree, you must not
        use the Service.
      </p>

      <h2>2. Definitions</h2>
      <ul>
        <li><strong>User</strong>: any individual or entity using the Service.</li>
        <li><strong>Member</strong>: a User who has created an account.</li>
        <li><strong>Proof</strong>: the process of embedding a steganographic seal and C2PA standard manifest into an uploaded or captured image.</li>
        <li><strong>Standard tier</strong>: integrity assurance for files uploaded or pasted via web/mobile.</li>
        <li><strong>Verified tier</strong>: integrity + capture-source assurance for photos taken directly with the mobile app using device-integrity attestation.</li>
        <li><strong>Credits</strong>: internal units used to meter Service usage.</li>
      </ul>

      <h2>3. Account</h2>
      <ol>
        <li>You must be at least 14 (Korea) or 16 (EU) years old to register.</li>
        <li>You are responsible for keeping your credentials confidential and for all activity under your account.</li>
        <li>We may refuse or terminate an account for impersonation, false information, or violation of these Terms or applicable law.</li>
      </ol>

      <h2>4. User Conduct</h2>
      <p>You agree not to:</p>
      <ul>
        <li>upload images for which you do not hold the rights and seek to claim authorship via Proof;</li>
        <li>upload content that is illegal, obscene, violent, or infringes third-party rights;</li>
        <li>interfere with or attempt unauthorized access to the Service;</li>
        <li>trade or transfer credits or proof results;</li>
        <li>otherwise violate applicable law or public morals.</li>
      </ul>

      <h2>5. Content Ownership and Service Use</h2>
      <ol>
        <li>You retain ownership of content you upload. The Company is granted a limited license to process such content solely to operate, verify, support, and defend the Service.</li>
        <li>The Service does not warrant the legality or factual truth of uploaded content; it only records pixel integrity and provenance metadata.</li>
        <li>Retention periods: Free plan — 7 days; paid plans — for the subscription period (with a 30-day grace period upon downgrade).</li>
      </ol>

      <h2>6. Paid Services</h2>
      <p className="text-sm text-slate-500 italic">
        ※ This section will be updated when paid services launch via PortOne integration. Until then, all members operate on the Free plan.
      </p>
      <ol>
        <li>Pro and Business plans are billed automatically each billing cycle starting from the subscription date.</li>
        <li>You may cancel at any time; access remains until the end of the paid period.</li>
        <li>Pricing, billing frequency, and refund terms are stated on the checkout page and the pricing section of our website.</li>
      </ol>

      <h2>7. Refunds and Withdrawal</h2>
      <p className="text-sm text-slate-500 italic">
        ※ This section will be updated when paid services launch.
      </p>
      <ol>
        <li>Under Korean Act on Consumer Protection in E-Commerce Art. 17, members may withdraw a subscription within 7 days of payment. Refund of partially used periods may be prorated.</li>
        <li>If the Service fails through our fault, refunds are pro-rated.</li>
        <li>Refund requests: <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.</li>
      </ol>

      <h2>8. Service Changes and Discontinuation</h2>
      <ol>
        <li>We may modify the Service for operational or technical reasons, with prior notice for material changes.</li>
        <li>If we discontinue the Service, we will provide at least 30 days' notice and reasonable means to export your data.</li>
      </ol>

      <h2>9. Account Termination</h2>
      <ol>
        <li>You may delete your account at any time from the profile page; account data will be erased upon deletion.</li>
        <li>We may suspend or terminate your account, with notice, for violation of these Terms.</li>
      </ol>

      <h2>10. Disclaimer and Limitation of Liability</h2>
      <ol>
        <li>The Service is provided &quot;as is&quot;. We do not warrant fitness for a particular purpose beyond the specific provenance and integrity features described.</li>
        <li>We are not liable for service interruptions caused by force majeure (natural disasters, war, blackouts, network outages).</li>
        <li>We are not liable for losses caused by your own acts, omissions, or misuse of the Service.</li>
        <li>To the extent permitted by applicable law, our aggregate liability is limited to the amount you paid to the Company in the 12 months preceding the claim.</li>
      </ol>

      <h2>11. Governing Law and Jurisdiction</h2>
      <p>
        These Terms are governed by the laws of the Republic of Korea. Disputes
        arising from the Service shall be brought before the court of competent
        jurisdiction at the Company&apos;s registered office. Mandatory consumer
        protection provisions of your country of residence remain unaffected.
      </p>

      <h2>12. Contact</h2>
      <p>
        Questions about these Terms: <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.
      </p>

      <h2>13. Changes</h2>
      <ul>
        <li>2026-05-11: Initial publication.</li>
      </ul>
      <p>
        Material changes will be announced on the Service at least 7 days before
        taking effect (30 days for changes adverse to user rights).
      </p>
    </article>
  );
}

export default function TermsPage() {
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
        {locale === "en" ? <TermsEn /> : <TermsKo />}
      </div>
    </div>
  );
}
