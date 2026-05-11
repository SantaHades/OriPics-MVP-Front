"use client";

import { Link } from "@/navigation";
import { useParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";

const LAST_UPDATED = "2026-05-10";
const COMPANY_NAME_KO = "주식회사 산타하데스";
const COMPANY_NAME_EN = "SantaHades Co., Ltd.";
const COMPANY_ADDRESS_EN =
  "#B01-H306, Terrace Garden, 150-29 Gongse-ro, Giheung-gu, Yongin-si, Gyeonggi-do, 17084, Republic of Korea";
const COMPANY_ADDRESS_KO =
  "경기도 용인시 기흥구 공세로 150-29, 테라스가든 #B01-H306, 17084, 대한민국";
const DPO_NAME = "손용석";
const DPO_EMAIL = "hi@ori.pics";

function PrivacyKo() {
  return (
    <article className="prose prose-slate max-w-none">
      <h1 className="text-3xl font-bold mb-2">개인정보 처리방침</h1>
      <p className="text-sm text-slate-500 mb-10">최종 갱신: {LAST_UPDATED}</p>

      <p>
        {COMPANY_NAME_KO}(이하 &quot;회사&quot;)는 OriPics 서비스(<a href="https://www.ori.pics">www.ori.pics</a>,
        이하 &quot;서비스&quot;)를 제공함에 있어 이용자의 개인정보를 중요시하며,
        「개인정보 보호법」을 비롯한 관련 법령을 준수하기 위하여 다음과 같이
        개인정보 처리방침을 수립·공개합니다.
      </p>

      <h2>1. 개인정보의 처리 목적</h2>
      <ul>
        <li>회원 가입 및 본인 확인, 계정 관리, 부정 이용 방지</li>
        <li>이미지 원본 증명 처리·검증·보관 및 결과 링크 제공</li>
        <li>모바일 사진 인증(Verified) 시 기기 무결성 검증</li>
        <li>유료 구독(Pro·Business) 결제 처리 및 환불 (J-7 도입 후)</li>
        <li>고객 문의 응대, 공지 및 약관 변경 사항 안내</li>
        <li>서비스 개선 및 통계 분석(개별 식별 불가능한 형태)</li>
      </ul>

      <h2>2. 처리하는 개인정보 항목</h2>
      <table>
        <thead>
          <tr>
            <th>구분</th>
            <th>수집 항목</th>
            <th>수집 방법</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>필수</td>
            <td>이메일 주소, 비밀번호(일방향 암호화)</td>
            <td>회원 가입 시 직접 입력</td>
          </tr>
          <tr>
            <td>선택</td>
            <td>이름(닉네임), 프로필 이미지</td>
            <td>회원 가입·정보 수정 시 직접 입력</td>
          </tr>
          <tr>
            <td>소셜 로그인</td>
            <td>이메일, 이름, 프로필 이미지(공급자가 제공하는 범위)</td>
            <td>Google·Naver·Kakao OAuth 동의</td>
          </tr>
          <tr>
            <td>증명 데이터</td>
            <td>업로드한 이미지, 이미지 메타데이터(타임스탬프·해상도), GPS 좌표(이용자 동의 시)</td>
            <td>이미지 인증 처리 시 자동 수집</td>
          </tr>
          <tr>
            <td>기기 무결성 토큰(Verified)</td>
            <td>App Attest / Play Integrity 토큰의 해시값</td>
            <td>모바일 앱에서 자동 수집(트랙 D 출시 후)</td>
          </tr>
          <tr>
            <td>결제 정보</td>
            <td>결제 식별자(빌링키 ID 등). 카드 번호·CVC는 회사가 직접 보관하지 않음</td>
            <td>유료 구독 결제 시(J-7 도입 후)</td>
          </tr>
          <tr>
            <td>자동 수집</td>
            <td>접속 IP, 브라우저·OS 정보, 쿠키(세션 인증), 서비스 이용 기록</td>
            <td>서비스 이용 과정에서 자동 생성</td>
          </tr>
        </tbody>
      </table>

      <h2>3. 개인정보의 보유 및 이용 기간</h2>
      <ul>
        <li>회원 정보: 회원 탈퇴 시까지. 탈퇴 즉시 파기.</li>
        <li>인증 이미지(Standard 플랜): 인증 처리 시점부터 7일 후 자동 삭제.</li>
        <li>인증 이미지(Pro·Business 플랜): 구독 유지 기간 동안 보관. 다운그레이드 시 30일 grace 후 7일 보관 정책으로 회귀.</li>
        <li>크레딧 거래 이력: 회원 탈퇴 시까지 보관(부정 이용 방지·정산 목적).</li>
        <li>결제 기록: 「전자상거래 등에서의 소비자 보호에 관한 법률」에 따라 5년 보관.</li>
        <li>접속 로그: 「통신비밀보호법」에 따라 3개월 보관.</li>
      </ul>

      <h2>4. 개인정보의 제3자 제공</h2>
      <p>
        회사는 이용자의 개인정보를 제1항(개인정보의 처리 목적)에서 명시한 범위
        내에서만 처리하며, 이용자의 사전 동의 또는 법령에 근거한 경우 외에는
        제3자에게 제공하지 않습니다.
      </p>

      <h2>5. 개인정보 처리의 위탁</h2>
      <p>회사는 서비스 제공을 위하여 다음과 같이 개인정보 처리를 위탁하고 있습니다.</p>
      <table>
        <thead>
          <tr>
            <th>수탁자</th>
            <th>위탁 업무</th>
            <th>처리 지역</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Vercel Inc.</td>
            <td>웹 호스팅·CDN·서버리스 함수 실행</td>
            <td>미국(글로벌 엣지)</td>
          </tr>
          <tr>
            <td>Supabase Inc.</td>
            <td>데이터베이스(회원 정보·증명 메타데이터)·이미지 스토리지</td>
            <td>미국 또는 회사가 지정한 region</td>
          </tr>
          <tr>
            <td>Google LLC</td>
            <td>OAuth 로그인(이용자 동의 시)</td>
            <td>미국</td>
          </tr>
          <tr>
            <td>NAVER Corp.</td>
            <td>OAuth 로그인(이용자 동의 시)</td>
            <td>대한민국</td>
          </tr>
          <tr>
            <td>Kakao Corp.</td>
            <td>OAuth 로그인(이용자 동의 시)</td>
            <td>대한민국</td>
          </tr>
          <tr>
            <td>SSL.com</td>
            <td>C2PA 콘텐츠 자격증명 서명 키 보관·서명 서비스(eSigner Cloud HSM)</td>
            <td>미국</td>
          </tr>
          <tr>
            <td>PortOne(아임포트)</td>
            <td>유료 구독 결제 처리(J-7 도입 후)</td>
            <td>대한민국</td>
          </tr>
        </tbody>
      </table>

      <h2>6. 국외 이전 안내</h2>
      <p>
        Vercel·Supabase·Google·SSL.com 등 일부 수탁자는 미국 등 국외에서
        개인정보를 처리합니다. 이는 글로벌 클라우드 인프라를 통한 서비스 제공
        목적이며, 이전되는 항목과 처리 목적은 위 제5항 위탁 처리 표에 명시된
        바와 같습니다. 이용자는 회원 가입 시 본 처리방침에 동의함으로써 위
        국외 이전에 동의한 것으로 봅니다.
      </p>

      <h2>7. 정보주체의 권리·의무 및 행사 방법</h2>
      <p>이용자는 회사에 대해 언제든지 다음과 같은 권리를 행사할 수 있습니다.</p>
      <ul>
        <li>개인정보 열람·정정·삭제·처리 정지 요구</li>
        <li>회원 탈퇴(프로필 페이지에서 직접 수행)</li>
        <li>개인정보 동의 철회 및 위탁·국외 이전에 대한 거부(서비스 이용 제한 발생 가능)</li>
      </ul>
      <p>
        권리 행사는 회사의 개인정보 보호 책임자에게 서면·이메일로 요청하실 수 있으며,
        회사는 지체 없이 조치하겠습니다.
      </p>

      <h2>8. 개인정보의 파기 절차 및 방법</h2>
      <ul>
        <li>회원 탈퇴, 보유 기간 만료, 처리 목적 달성 시 지체 없이 파기합니다.</li>
        <li>전자적 파일: 복원 불가능한 방법으로 영구 삭제</li>
        <li>기록물·서면: 분쇄 또는 소각</li>
        <li>이미지 파일: Supabase Storage에서 삭제 후 7일 이내 백업본까지 모두 삭제</li>
      </ul>

      <h2>9. 개인정보의 안전성 확보 조치</h2>
      <ul>
        <li>비밀번호는 단방향 해시(bcrypt)로 저장하며 평문으로 보관하지 않습니다.</li>
        <li>모든 통신 구간은 HTTPS(TLS)로 암호화합니다.</li>
        <li>관리자 접근 권한은 최소 인원에게만 부여하며 다중 인증(MFA)을 적용합니다.</li>
        <li>외부 침입에 대비하여 GitHub Dependabot·CodeQL·Secret Scanning을 운영합니다.</li>
        <li>접속 로그는 보관 기간 내에만 저장하며 정기적으로 점검합니다.</li>
      </ul>

      <h2>10. 쿠키 사용에 관한 사항</h2>
      <p>
        회사는 로그인 세션 유지를 위해 NextAuth 세션 쿠키(필수)를 사용합니다.
        회사는 광고 식별·트래킹 목적의 제3자 쿠키를 사용하지 않습니다.
        이용자는 브라우저 설정에서 쿠키 저장을 거부할 수 있으나, 이 경우 로그인이 불가능합니다.
      </p>

      <h2>11. 개인정보 보호 책임자</h2>
      <ul>
        <li>회사: {COMPANY_NAME_KO}</li>
        <li>주소: {COMPANY_ADDRESS_KO}</li>
        <li>개인정보 보호 책임자: 대표이사 {DPO_NAME}</li>
        <li>이메일: <a href={`mailto:${DPO_EMAIL}`}>{DPO_EMAIL}</a></li>
      </ul>

      <h2>12. 권익 침해 구제 방법</h2>
      <ul>
        <li>개인정보분쟁조정위원회: <a href="https://www.kopico.go.kr" target="_blank" rel="noopener noreferrer">www.kopico.go.kr</a> / 1833-6972</li>
        <li>개인정보침해 신고센터: <a href="https://privacy.kisa.or.kr" target="_blank" rel="noopener noreferrer">privacy.kisa.or.kr</a> / 118</li>
        <li>대검찰청 사이버수사과: <a href="https://www.spo.go.kr" target="_blank" rel="noopener noreferrer">www.spo.go.kr</a> / 1301</li>
        <li>경찰청 사이버수사국: <a href="https://ecrm.cyber.go.kr" target="_blank" rel="noopener noreferrer">ecrm.cyber.go.kr</a> / 182</li>
      </ul>

      <h2>13. 변경 이력</h2>
      <ul>
        <li>2026-05-10: 최초 제정</li>
      </ul>
    </article>
  );
}

function PrivacyEn() {
  return (
    <article className="prose prose-slate max-w-none">
      <h1 className="text-3xl font-bold mb-2">Privacy Policy</h1>
      <p className="text-sm text-slate-500 mb-10">Last updated: {LAST_UPDATED}</p>

      <p>
        {COMPANY_NAME_EN} (&quot;the Company&quot;) operates the OriPics service
        (<a href="https://www.ori.pics">www.ori.pics</a>, &quot;the Service&quot;).
        This Privacy Policy explains how we collect, use, and protect your
        personal information in compliance with the Korean Personal Information
        Protection Act (PIPA) and the EU General Data Protection Regulation (GDPR).
      </p>

      <h2>1. Data Controller</h2>
      <ul>
        <li>Company: {COMPANY_NAME_EN}</li>
        <li>Address: {COMPANY_ADDRESS_EN}</li>
        <li>Data Protection Contact: <a href={`mailto:${DPO_EMAIL}`}>{DPO_EMAIL}</a></li>
      </ul>

      <h2>2. Purposes of Processing</h2>
      <ul>
        <li>Account creation, authentication, and abuse prevention</li>
        <li>Image proof creation, verification, storage, and shareable link generation</li>
        <li>Device-integrity verification for mobile photo (Verified) tier</li>
        <li>Paid subscription processing and refunds (Pro / Business, after J-7)</li>
        <li>Customer support, service notices, and policy updates</li>
        <li>Service improvement and aggregate analytics (non-identifying)</li>
      </ul>

      <h2>3. Categories of Personal Data</h2>
      <table>
        <thead>
          <tr>
            <th>Type</th>
            <th>Items</th>
            <th>Source</th>
          </tr>
        </thead>
        <tbody>
          <tr><td>Required</td><td>Email address, password (one-way hashed)</td><td>Sign-up form</td></tr>
          <tr><td>Optional</td><td>Name, profile picture</td><td>Sign-up / profile edit</td></tr>
          <tr><td>OAuth</td><td>Email, name, profile picture (per provider scope)</td><td>Google / Naver / Kakao consent</td></tr>
          <tr><td>Proof data</td><td>Uploaded images, image metadata (timestamp, dimensions), GPS coordinates (with explicit user consent)</td><td>Auto-collected during proof processing</td></tr>
          <tr><td>Device-integrity (Verified)</td><td>Hash of App Attest / Play Integrity token</td><td>Mobile app (after Track D launch)</td></tr>
          <tr><td>Payment</td><td>Billing key identifier. Card numbers and CVCs are not stored by the Company</td><td>Subscription checkout (after J-7)</td></tr>
          <tr><td>Auto-collected</td><td>IP address, browser / OS info, session cookies, service usage logs</td><td>Generated during service use</td></tr>
        </tbody>
      </table>

      <h2>4. Legal Basis (GDPR Art. 6)</h2>
      <ul>
        <li>Performance of contract (Art. 6(1)(b)): account, proof, subscription</li>
        <li>Consent (Art. 6(1)(a)): GPS coordinates, optional profile fields, OAuth providers</li>
        <li>Legal obligation (Art. 6(1)(c)): payment records under Korean e-commerce law</li>
        <li>Legitimate interest (Art. 6(1)(f)): abuse prevention, service security</li>
      </ul>

      <h2>5. Retention Periods</h2>
      <ul>
        <li>Account info: until account deletion. Erased upon deletion request.</li>
        <li>Proof images (Standard): 7 days from creation, then auto-deleted.</li>
        <li>Proof images (Pro / Business): retained for the subscription period. After downgrade, 30-day grace period followed by reversion to 7-day policy.</li>
        <li>Credit transaction history: until account deletion (abuse prevention, billing reconciliation).</li>
        <li>Payment records: 5 years (Korean Act on Consumer Protection in E-Commerce).</li>
        <li>Access logs: 3 months (Korean Communications Privacy Act).</li>
      </ul>

      <h2>6. Recipients and International Transfers</h2>
      <p>
        We share data with the following processors solely to operate the Service.
        Some processors are located outside the Republic of Korea or the EEA;
        you consent to the relevant international transfers when you sign up.
      </p>
      <table>
        <thead>
          <tr>
            <th>Processor</th>
            <th>Purpose</th>
            <th>Region</th>
          </tr>
        </thead>
        <tbody>
          <tr><td>Vercel Inc.</td><td>Web hosting, CDN, serverless functions</td><td>United States (global edge)</td></tr>
          <tr><td>Supabase Inc.</td><td>Database (account, proof metadata) and image storage</td><td>United States or company-selected region</td></tr>
          <tr><td>Google LLC</td><td>OAuth login (with user consent)</td><td>United States</td></tr>
          <tr><td>NAVER Corp.</td><td>OAuth login (with user consent)</td><td>Republic of Korea</td></tr>
          <tr><td>Kakao Corp.</td><td>OAuth login (with user consent)</td><td>Republic of Korea</td></tr>
          <tr><td>SSL.com</td><td>C2PA content credentials signing key custody (eSigner Cloud HSM)</td><td>United States</td></tr>
          <tr><td>PortOne</td><td>Subscription payment processing (after J-7)</td><td>Republic of Korea</td></tr>
        </tbody>
      </table>

      <h2>7. Your Rights</h2>
      <p>You have the following rights regarding your personal data:</p>
      <ul>
        <li>Access, rectification, erasure</li>
        <li>Restriction of processing, data portability</li>
        <li>Objection to processing</li>
        <li>Withdrawal of consent at any time (without affecting prior lawful processing)</li>
        <li>Right to lodge a complaint with the Korea Personal Information Protection Commission or your local EU supervisory authority</li>
      </ul>
      <p>
        To exercise these rights, contact <a href={`mailto:${DPO_EMAIL}`}>{DPO_EMAIL}</a>.
        We will respond without undue delay.
      </p>

      <h2>8. Data Erasure Procedure</h2>
      <ul>
        <li>Upon account deletion or expiration of retention period, we erase data without undue delay.</li>
        <li>Electronic files: irreversibly deleted, including from backups within 7 days.</li>
        <li>Paper records: shredded or incinerated.</li>
      </ul>

      <h2>9. Security Measures</h2>
      <ul>
        <li>Passwords are stored using one-way hashing (bcrypt). We never store plaintext passwords.</li>
        <li>All transport is encrypted with HTTPS (TLS).</li>
        <li>Administrator access is granted on a least-privilege basis with mandatory multi-factor authentication.</li>
        <li>Continuous monitoring via GitHub Dependabot, CodeQL, and Secret Scanning.</li>
        <li>Access logs are retained only for the legally required period and reviewed periodically.</li>
      </ul>

      <h2>10. Cookies</h2>
      <p>
        We use NextAuth session cookies (strictly necessary) to maintain login state.
        We do not use third-party cookies for advertising or cross-site tracking.
        You may disable cookies in your browser, but this will prevent login.
      </p>

      <h2>11. Automated Decision-Making</h2>
      <p>
        We do not perform automated decision-making, including profiling, that
        produces legal or similarly significant effects on you.
      </p>

      <h2>12. Children&apos;s Privacy</h2>
      <p>
        The Service is not directed to children under 14 (Korea) or under 16 (EU).
        We do not knowingly collect personal data from children. If you believe a
        child has provided personal data, please contact us at <a href={`mailto:${DPO_EMAIL}`}>{DPO_EMAIL}</a>.
      </p>

      <h2>13. Changes to This Policy</h2>
      <ul>
        <li>2026-05-10: Initial publication.</li>
      </ul>
      <p>
        Material changes will be announced on the Service at least 7 days before
        taking effect (30 days for changes adverse to user rights).
      </p>
    </article>
  );
}

export default function PrivacyPage() {
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
        {locale === "en" ? <PrivacyEn /> : <PrivacyKo />}
      </div>
    </div>
  );
}
