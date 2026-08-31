"use client";

import { Link } from "@/navigation";
import { useParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";

const LAST_UPDATED = "2026-08-06";
const EFFECTIVE_DATE = "2026-08-06";
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
        <li>&quot;인증&quot;: 이용자가 업로드 또는 촬영한 이미지에 OriPics가 스테가노그래피 시일과 C2PA 표준 매니페스트를 첨부하여 원본 무결성을 보장하는 처리.</li>
        <li>&quot;Standard 티어&quot;: 웹·모바일의 파일 업로드·붙여넣기 경로로 처리되는 무결성 보장.</li>
        <li>&quot;Verified 티어&quot;: 모바일 앱의 카메라 직접 촬영 경로로 기기 무결성 검증까지 포함하는 보장.</li>
        <li>&quot;인증 횟수(건수)&quot;: 회원이 구독 플랜에 포함되어 이용할 수 있는 사진 인증·검증 등의 횟수. 내부적으로는 회계 단위로 관리되나, 이는 별도로 구매·충전하거나 현금으로 환급할 수 있는 선불 포인트(선불 전자지급수단)가 아니라 구독 플랜에 포함되어 제공되는 이용 한도입니다.</li>
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
        <li>타인의 사진·저작물을 무단으로 업로드하여 본인의 원본인 양 인증을 받는 행위</li>
        <li>음란물·폭력물·불법 콘텐츠를 업로드하는 행위</li>
        <li>서비스의 정상 운영을 방해하거나 시스템에 무단 접근하는 행위</li>
        <li>이용 횟수·인증 결과를 매매·양도하는 행위</li>
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
        <li>인증 결과 및 공개링크의 보관 기간은 회원의 요금제에 따릅니다.
          <ul>
            <li>Free 플랜: 최초 인증 후 7일</li>
            <li>유료 플랜(Pro·Business): 플랜에 포함된 보관함(용량 한도 내)에서 구독 유지 기간 동안 계속 보관. 구독 종료·다운그레이드 시 30일의 유예 기간 후 Free 플랜의 보관 정책(7일)으로 회귀합니다. 보관함 용량 초과 시 기존 자료는 삭제되지 않으며 새 공개링크 생성이 제한됩니다.</li>
          </ul>
        </li>
        <li>회사는 다음의 경우 서비스 제공을 일시 중단할 수 있습니다.
          <ul>
            <li>정기 점검·시스템 업그레이드</li>
            <li>천재지변, 정전, 통신 장애</li>
            <li>회사의 합리적인 사유로 서비스 중단이 불가피한 경우</li>
          </ul>
        </li>
        <li><strong>공정 이용:</strong> 회사는 안정적인 서비스 제공을 위하여, 서비스의 통상적인 이용 범위를 현저히 초과하는 트래픽이 발생하는 경우(예: 공개링크에 대한 자동화된 대량 조회·다운로드, 외부 사이트에의 대량 임베드 등) 해당 회원 또는 공개링크에 대하여 전송 속도 제한, 일시적 접근 제한 등의 조치를 취할 수 있습니다. 이러한 상황이 지속되는 경우 회사는 회원과 협의하여 적합한 이용 방안(Business 플랜 등)을 안내합니다. 본 항의 조치는 남용 방지 목적에 한하며, 통상적인 이용에는 적용되지 않습니다.</li>
      </ol>

      <h2>제9조 (이미지·콘텐츠의 권리 및 책임)</h2>
      <ol>
        <li>이용자가 업로드한 이미지·콘텐츠의 저작권은 이용자 또는 적법한 권리자에게 귀속됩니다.</li>
        <li>회사는 서비스 제공·검증·고객 지원·법적 분쟁 대응을 위해 필요한 범위 내에서 해당 이미지를 처리할 수 있으며, 마케팅 목적으로 사용하지 않습니다.</li>
        <li>이용자가 업로드한 콘텐츠로 인하여 발생한 분쟁(저작권·초상권 등)에 대한 책임은 이용자에게 있습니다.</li>
        <li>C2PA 매니페스트와 스테가노그래피 시일은 원본 무결성·출처 정보를 기록할 뿐이며, 콘텐츠의 합법성 또는 진위 자체를 회사가 보증하는 것은 아닙니다.</li>
      </ol>

      <h2 id="paid" className="scroll-mt-20">제10조 (유료 서비스)</h2>
      <ol>
        <li>회사는 다음의 유료 플랜을 제공합니다. 모든 가격은 부가가치세(VAT) 포함 표기이며, 사업자 회원이 세금계산서를 요청하는 경우 별도 처리합니다.
          <ul>
            <li><strong>Free 플랜</strong>: 월 ₩0. 월 인증 5건, 보관 7일.</li>
            <li><strong>Pro 플랜</strong>: 월 ₩9,900 (월간 구독).</li>
            <li><strong>Business 플랜</strong>: 월 ₩79,000부터 (팀 인원·옵션에 따라 영업 협의).</li>
            <li><strong>원데이 패스(1일 이용권)</strong>: 1장 ₩3,300 (단건 결제). 결제 시 등록 코드가 발급되며, 코드 등록 시점부터 24시간 동안 모바일 촬영 인증 10회(사진 크기 무관)와 해당 인증 건의 공개링크·인증서 PDF 발급이 제공됩니다. 패스로 발행된 공개링크는 발행 시점부터 1년간 보관됩니다. 등록 코드는 타인에게 양도하여 사용하게 할 수 있으나, 본 서비스 전용 이용권으로서 재판매·현금 환급·타 서비스 사용이 불가하며 선불전자지급수단에 해당하지 않습니다. 미등록 코드의 유효기간은 발급일로부터 1년이고, 계정당 동시에 1장의 패스만 활성화할 수 있습니다. 패스가 활성인 동안 촬영 인증은 플랜 제공 횟수에 우선하여 패스에서 차감됩니다.</li>
          </ul>
          최신 요금 및 플랜별 포함 사항은 서비스 내 요금제 안내 페이지에 게시된 내용이 우선합니다.
        </li>
        <li>결제 수단은 결제대행사(PG)를 통하여 제공되며, 신용카드·체크카드·간편결제(카카오페이·토스페이 등)를 포함합니다. 회사는 결제 수단의 종류와 제공 범위를 사전 공지 후 변경할 수 있습니다.</li>
        <li>유료 회원은 최초 결제일을 기준으로 매월 동일 일자에 자동으로 결제(정기결제)됩니다. 다음 결제 7일 전까지 해지 또는 플랜 변경 신청이 없는 경우 기존 플랜으로 갱신됩니다.</li>
        <li>회원은 프로필 또는 결제 관리 페이지에서 언제든지 구독을 해지하거나 플랜을 변경할 수 있으며, 해지 후에도 이미 결제된 기간이 만료될 때까지 해당 플랜의 서비스를 이용할 수 있습니다.</li>
        <li>결제 수단의 한도 초과·유효기간 만료·잔액 부족 등의 사유로 자동 결제가 실패한 경우, 회사는 최대 7일간 재시도하며 그 기간 동안 회원에게 이메일로 안내합니다. 7일 이내에 결제가 완료되지 않으면 해당 회원은 Free 플랜으로 자동 다운그레이드되며, 영구 보관 자료는 제8조 제2호의 grace 정책에 따라 처리됩니다.</li>
        <li>플랜에 포함된 월별 인증 한도(건수)는 결제일(가입일) 기준 매월 갱신되며, 사용하지 않은 한도는 다음 달로 이월되지 않습니다.</li>
        <li>회사는 요금·과금 주기·플랜 구성을 변경할 수 있으며, 회원에게 불리한 변경은 시행일 30일 전, 그 외 변경은 7일 전 서비스 내 공지 및 이메일로 안내합니다. 변경 후 회원이 계속하여 서비스를 이용하는 경우 변경된 조건에 동의한 것으로 간주합니다. 변경 전 결제된 구독은 해당 결제 주기 종료 시까지 변경 전 조건이 유지됩니다.</li>
        <li>미성년자(만 19세 미만)가 결제를 진행한 경우 법정대리인은 미성년자 본인 또는 법정대리인이 동의하지 아니한 결제에 대하여 취소를 요청할 수 있습니다.</li>
      </ol>

      <h2 id="refund" className="scroll-mt-20">제11조 (환불 및 청약철회)</h2>
      <ol>
        <li><strong>청약철회 (7일):</strong> 회원은 「전자상거래 등에서의 소비자보호에 관한 법률」 제17조 제1항에 따라 결제일로부터 7일 이내에 별도의 수수료 없이 청약철회를 요청할 수 있습니다.</li>
        <li><strong>청약철회의 제한:</strong> 다음 어느 하나에 해당하는 경우에는 같은 법 제17조 제2항에 따라 해당 부분에 대한 청약철회가 제한될 수 있습니다. 회사는 결제 화면에서 이러한 제한을 사전에 표시하며, Free 플랜의 무상 이용 횟수를 시험 사용 수단으로 제공합니다.
          <ul>
            <li>회원이 유료 플랜에 포함된 인증 횟수를 이미 사용(인증·공개링크 생성·검증 등 제공 개시)한 경우, 그 <strong>사용된 부분</strong>. 다만 사용하지 않은 부분(가분적 디지털콘텐츠)에 대한 청약철회는 가능하며, 환불액은 본 조 제3항의 산정 기준에 따릅니다.</li>
            <li>회원의 귀책사유로 콘텐츠가 훼손·멸실된 경우.</li>
          </ul>
        </li>
        <li><strong>환불액 산정 기준:</strong> 회원의 사정에 의한 청약철회·중도해지 시 환불액은 다음 기준으로 산정합니다. 이때 &quot;회당 정가&quot;란 요금제 안내 페이지에 고지된 1회 이용 기준 금액을 말하며, 별도 고지가 없는 경우 1회 인증(공개링크 생성 포함)당 1,000원(VAT 포함)으로 합니다.
          <ul>
            <li><strong>결제일로부터 7일 이내, 인증 횟수를 전혀 사용하지 않은 경우:</strong> 전액 환불.</li>
            <li><strong>결제일로부터 7일 이내, 일부 사용한 경우:</strong> 환불액 = 결제 금액 − (사용 횟수 × 회당 정가). 위약금은 부과하지 않습니다.</li>
            <li><strong>결제일로부터 7일 경과 후 중도해지를 선택한 경우:</strong> 환불액 = 결제 금액 − [사용 횟수 × 회당 정가 또는 경과 기간의 일할 금액 중 큰 금액] − 잔여 금액의 10%(위약금).</li>
            <li>무상으로 제공된 이용 횟수(가입 혜택, 이벤트, Free 플랜 제공분 등)는 환불 대상이 아니며, 환불·해지 시 소멸됩니다.</li>
            <li>위 기준으로 산정한 환불액이 0원 이하인 경우 환불하지 않습니다.</li>
            <li>환불이 확정되면 해당 유료 플랜의 이용 권한(잔여 인증 횟수, 영구 보관 등)은 즉시 종료되고 Free 플랜으로 전환됩니다.</li>
          </ul>
        </li>
        <li><strong>회사 귀책사유로 인한 환불:</strong> 회사의 시스템 장애, 서비스 결함, 약관·법령 위반 등 회사의 귀책사유로 회원이 서비스를 정상적으로 이용하지 못한 경우, 회사는 영향을 받은 기간을 일할 계산하여 즉시 환불하거나 동일 가치의 이용 횟수·이용 기간을 보상합니다.</li>
        <li><strong>월간 구독의 해지:</strong> 회원은 다음 두 방식 중 선택할 수 있습니다.
          <ul>
            <li><strong>일반해지:</strong> 다음 결제 시점부터 효력이 발생하며, 이미 결제된 당월분은 환불되지 않는 대신 해당 결제 주기 종료일까지 서비스를 계속 이용할 수 있습니다.</li>
            <li><strong>중도해지:</strong> 신청 즉시 이용이 종료되고, 본 조 제3항의 산정 기준에 따라 잔여분을 환불합니다.</li>
          </ul>
        </li>
        <li><strong>부정 이용 방지:</strong> 결제 취소·지급 거절(차지백)이 발생한 경우 회사는 해당 금액에 상당하는 이용 횟수를 회수할 수 있으며, 약관 위반으로 이용이 제한·정지된 계정에는 환불이 제공되지 않습니다.</li>
        <li><strong>환불 처리 기간:</strong> 회사는 환불 사유를 확인한 날로부터 3영업일 이내에 결제대행사에 환불(승인 취소 또는 매입 취소)을 요청합니다. 실제 환급 시점은 회원의 결제 수단(카드사·간편결제사) 정책에 따라 결제일과 동일 사이클 또는 다음 사이클에 처리됩니다.</li>
        <li><strong>환불 신청 방법:</strong> 환불 요청은 서비스 내 결제 관리 페이지 또는 <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>로 접수합니다. 회사는 접수일로부터 3영업일 이내에 처리 결과를 안내합니다.</li>
        <li><strong>미성년자 결제 취소:</strong> 미성년자가 법정대리인의 동의 없이 결제한 경우, 미성년자 본인 또는 법정대리인은 결제일로부터 6개월 이내(민법상 취소권 행사기간) 환불을 요청할 수 있으며, 회사는 관련 입증 자료 확인 후 환불합니다.</li>
        <li><strong>분쟁 해결:</strong> 환불 관련 분쟁은 회사와 회원이 우선 협의하여 해결하며, 협의가 이루어지지 않는 경우 「소비자기본법」에 따라 한국소비자원 등 공식 분쟁조정기관의 조정을 신청할 수 있습니다.</li>
      </ol>

      <h2>제12조 (서비스의 변경 및 종료)</h2>
      <ol>
        <li>회사는 운영상·기술상의 필요에 따라 서비스의 전부 또는 일부를 변경할 수 있으며, 변경 사항은 사전 공지합니다.</li>
        <li>회사가 서비스를 종료하는 경우 30일 전 공지하며, 회원이 보유한 데이터를 다운로드할 수 있도록 합리적인 절차를 제공합니다.</li>
      </ol>

      <h2>제13조 (회원 탈퇴 및 자격 상실)</h2>
      <ol>
        <li>회원은 프로필 페이지에서 언제든지 탈퇴할 수 있으며, 탈퇴 시 모든 계정 정보와 데이터(공개링크, 인증서, 이미지 데이터 등)가 즉시 영구적으로 삭제되고 복구할 수 없습니다.</li>
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
      <p>
        본 약관에서 정하지 아니한 사항 및 약관의 해석에 관하여는
        「전자상거래 등에서의 소비자보호에 관한 법률」, 「약관의 규제에 관한 법률」 등
        관계 법령과 공정거래위원회가 정하는 표준약관 및 상관례에 따릅니다.
      </p>

      <h2>제16조 (문의)</h2>
      <p>
        본 약관에 관한 문의는 <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>로 연락해 주십시오.
      </p>

      <h2>변경 이력</h2>
      <ul>
        <li>2026-05-12: 제10조(유료 서비스) 및 제11조(환불·청약철회) 본문 갱신</li>
        <li>2026-07-24: 제11조 개정 — 환불액 산정 기준 신설(제3항: 회당 정가 공제·잔여 10% 위약금), 일반해지·중도해지 선택권 명시, 부정 이용 방지 조항 추가</li>
        <li>2026-08-06: 제8조에 공정 이용 조항 추가 (통상 범위를 현저히 초과하는 트래픽에 대한 제한 조치)</li>
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
        <li><strong>Proof allowance (count)</strong>: the number of photo proofs, verifications, and similar actions included with a subscription plan. It is metered internally as an accounting unit, but it is not a prepaid point or stored-value instrument that can be separately purchased, topped up, or refunded in cash — it is a usage allowance included in the plan.</li>
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
        <li>trade or transfer usage allowances or proof results;</li>
        <li>otherwise violate applicable law or public morals.</li>
      </ul>

      <h2>5. Content Ownership and Service Use</h2>
      <ol>
        <li>You retain ownership of content you upload. The Company is granted a limited license to process such content solely to operate, verify, support, and defend the Service.</li>
        <li>The Service does not warrant the legality or factual truth of uploaded content; it only records pixel integrity and provenance metadata.</li>
        <li>Retention periods: Free plan — 7 days; paid plans — for the subscription period (with a 30-day grace period upon downgrade).</li>
        <li><strong>Fair use:</strong> To keep the Service stable, where traffic substantially exceeds ordinary use (e.g., automated bulk viewing or downloading of public links, or large-scale embedding of public links on external sites), the Company may throttle transfer speeds or temporarily restrict access to the affected member or links. If such patterns persist, we will contact the member to arrange a suitable plan (e.g., Business). These measures target abuse only and do not apply to ordinary use.</li>
      </ol>

      <h2 id="paid" className="scroll-mt-20">6. Paid Services</h2>
      <ol>
        <li>We offer the following paid plans. All prices include Korean VAT; business customers requesting a tax invoice are billed separately.
          <ul>
            <li><strong>Free</strong>: ₩0/month. 5 proofs/month, 7-day retention.</li>
            <li><strong>Pro</strong>: ₩9,900/month (monthly subscription).</li>
            <li><strong>Business</strong>: from ₩79,000/month (sales-negotiated based on team size and options).</li>
          </ul>
          The pricing page on the Service is authoritative for current rates and plan inclusions.
        </li>
        <li>Payments are processed by a licensed payment gateway (PG) supporting credit/debit cards and Korean easy-pay methods (KakaoPay, TossPay, etc.). We may change accepted payment methods with prior notice.</li>
        <li>Paid plans are billed automatically on the same day each month from the initial subscription date. If no cancellation or plan change is requested at least 7 days before the next billing date, the subscription renews under the existing plan.</li>
        <li>You may cancel or change your plan at any time from the profile or billing page; access to the current plan continues until the end of the paid period.</li>
        <li>If an automatic charge fails (credit limit exceeded, expired card, insufficient balance), we retry for up to 7 days while notifying you by email. If payment is not completed within that period, the account is downgraded to Free, and permanent-retention content is handled under the grace policy in §5.3.</li>
        <li>Monthly proof allowances reset on each billing-anniversary date; unused allowances do not carry over.</li>
        <li>We may change pricing, billing cycles, or plan composition. Changes adverse to members take effect at least 30 days after in-Service and email notice; other changes take effect at least 7 days after notice. Continued use after the effective date constitutes acceptance. Subscriptions paid before the effective date retain prior terms until the end of that billing cycle.</li>
        <li>Where a minor (under 19 in Korea) made a payment without the consent of a legal guardian, the guardian or the minor may request cancellation under the Korean Civil Code.</li>
      </ol>

      <h2 id="refund" className="scroll-mt-20">7. Refunds and Withdrawal</h2>
      <ol>
        <li><strong>7-day withdrawal right:</strong> Under Article 17(1) of the Korean Act on Consumer Protection in E-Commerce, members may withdraw a subscription within 7 days of payment, without fee.</li>
        <li><strong>Limits on withdrawal:</strong> Under Article 17(2), the right of withdrawal may be limited — as disclosed on the checkout screen, with the Free plan&apos;s complimentary usage serving as the trial means — where:
          <ul>
            <li>the member has already used proof counts included in a paid plan (proofs, public-link creation, verifications — i.e., provision has begun), <strong>as to the used portion only</strong>. Withdrawal remains available for the unused (divisible) portion, with the refund computed under §7.3; or</li>
            <li>content was damaged or lost due to the member&apos;s fault.</li>
          </ul>
        </li>
        <li><strong>Refund computation:</strong> For withdrawals or mid-term cancellations at the member&apos;s initiative, refunds are computed as follows. &quot;List price per use&quot; means the per-use price posted on the pricing page; absent a separate posting, it is KRW 1,000 (VAT included) per proof (including public-link creation).
          <ul>
            <li><strong>Within 7 days of payment, no usage:</strong> full refund.</li>
            <li><strong>Within 7 days of payment, partial usage:</strong> refund = amount paid − (uses × list price per use), with no penalty.</li>
            <li><strong>After 7 days, mid-term cancellation:</strong> refund = amount paid − [the greater of (uses × list price per use) or the pro-rated amount for elapsed days] − 10% of the remaining balance (penalty).</li>
            <li>Complimentary usage (signup bonuses, events, Free-plan allowances) is not refundable and lapses upon refund or cancellation.</li>
            <li>No refund is due where the computed amount is zero or less.</li>
            <li>Once a refund is confirmed, paid-plan entitlements (remaining proof counts, permanent retention, etc.) end immediately and the account reverts to the Free plan.</li>
          </ul>
        </li>
        <li><strong>Refunds due to our fault:</strong> If you cannot use the Service normally due to system failure, defects, or our breach of these Terms or law, we will refund the affected period pro-rated, or compensate with equivalent usage or service days.</li>
        <li><strong>Monthly subscription cancellation:</strong> Members may choose either:
          <ul>
            <li><strong>Standard cancellation:</strong> takes effect at the next billing date; the current month is non-refundable, but access continues until the end of that paid period; or</li>
            <li><strong>Mid-term cancellation:</strong> access ends immediately and the remainder is refunded per §7.3.</li>
          </ul>
        </li>
        <li><strong>Abuse prevention:</strong> If a payment is disputed or charged back, we may claw back usage counts equivalent to the disputed amount; no refunds are provided for accounts restricted or suspended for violating these Terms.</li>
        <li><strong>Refund processing:</strong> We submit the refund request (authorization void or settlement reversal) to the payment processor within 3 business days of confirming eligibility. Actual return to your payment method follows the card issuer&apos;s or easy-pay provider&apos;s cycle.</li>
        <li><strong>How to request:</strong> Submit refund requests via the in-Service billing page or by email to <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>. We respond with a decision within 3 business days of receipt.</li>
        <li><strong>Minor cancellations:</strong> A minor or their legal guardian may request a refund within 6 months of the payment (the rescission period under the Korean Civil Code) where the minor paid without guardian consent; refunds follow verification of supporting documents.</li>
        <li><strong>Dispute resolution:</strong> Refund disputes are first resolved between the Company and the member. If unresolved, members may apply to mediation through the Korea Consumer Agency or other competent body under the Framework Act on Consumers.</li>
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
        <li>2026-05-12: Updated §6 (Paid Services) and §7 (Refunds and Withdrawal) with substantive terms.</li>
        <li>2026-07-24: Amended §7 — added refund computation (§7.3: list-price deduction, 10% penalty on remainder), standard vs. mid-term cancellation options, and abuse-prevention clause.</li>
        <li>2026-08-06: Added fair-use clause to §5 (measures against traffic substantially exceeding ordinary use).</li>
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
