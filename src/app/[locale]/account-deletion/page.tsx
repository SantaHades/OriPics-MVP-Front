"use client";

// 계정 삭제 안내 (2026-09-26) — Google Play 데이터 보안 '계정 삭제 URL' 요건:
// 앱·개발자 이름, 삭제 요청 단계, 삭제·보관되는 데이터와 보관 기간을 로그인 없이 볼 수 있어야 한다.
// 실제 삭제 동작: api/user/delete (사진함에 속하지 않은 사진·공개링크 파기 + 계정 삭제, 사진함 사진은 업로더 가림 후 보존).
import { Link } from "@/navigation";
import { useParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";

const LAST_UPDATED = "2026-09-26";
const SUPPORT_EMAIL = "hi@ori.pics";

function Ko() {
  return (
    <article className="prose prose-slate max-w-none">
      <h1 className="text-3xl font-bold mb-2">OriPics 계정 삭제 안내</h1>
      <p className="text-sm text-slate-500 mb-10">운영: 주식회사 산타하데스 (SantaHades Co., Ltd.) · 최종 갱신: {LAST_UPDATED}</p>

      <h2>계정을 삭제하는 방법</h2>
      <p><strong>앱에서</strong></p>
      <ol>
        <li>OriPics 앱을 열고 <strong>설정</strong> 탭으로 이동합니다.</li>
        <li>화면 맨 아래 <strong>회원탈퇴</strong>를 누릅니다.</li>
        <li>안내에 따라 <strong>탈퇴합니다</strong>를 입력하고 <strong>영구 삭제</strong>를 누릅니다.</li>
      </ol>
      <p><strong>웹에서</strong></p>
      <ol>
        <li><a href="https://www.ori.pics/ko/login">ori.pics</a>에 로그인한 뒤 <strong>프로필</strong>로 이동합니다.</li>
        <li><strong>회원탈퇴</strong>를 누르고 안내에 따라 확인합니다.</li>
      </ol>
      <p>
        앱이나 웹을 사용할 수 없다면 가입한 이메일로 <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>에
        삭제를 요청해 주세요. 본인 확인 후 7일 이내에 처리합니다.
      </p>

      <h2>삭제되는 데이터</h2>
      <ul>
        <li>계정 정보: 이메일, 이름, 로그인 연결(구글·애플·카카오·네이버)</li>
        <li>인증한 사진과 공개링크, 인증서 PDF, 보관함 사진</li>
        <li>잔여 이용 건수, 원데이 패스·사진함 패스, 파트너 할인권, 알림</li>
        <li>이벤트 출품작과 좋아요</li>
      </ul>
      <p>삭제는 즉시 처리되며 되돌릴 수 없습니다. 기기에만 저장된 사진은 앱을 삭제하면 함께 지워집니다.</p>

      <h2>보관되는 데이터와 기간</h2>
      <ul>
        <li>
          <strong>사진함에 올린 사진</strong>: 다른 참여자와 공유한 증빙이므로 사진함에 남습니다. 업로더는
          &quot;탈퇴한 회원&quot;으로 표시되고 계정 식별정보는 삭제됩니다. 부동산사진함 사진은 등록일로부터 5년간
          보관 후 파기됩니다.
        </li>
        <li><strong>결제 기록</strong>: 전자상거래법에 따라 5년간 보관합니다.</li>
        <li><strong>접속 기록</strong>: 통신비밀보호법에 따라 3개월간 보관합니다.</li>
        <li><strong>파트너 참여 기록</strong>(이메일 해시): 부정 참여 방지를 위해 챌린지 종료 후 1년간 보관합니다.</li>
      </ul>
      <p>
        자세한 내용은 <Link href="/privacy">개인정보 처리방침</Link>을 확인해 주세요. 문의:{" "}
        <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>
      </p>
    </article>
  );
}

function En() {
  return (
    <article className="prose prose-slate max-w-none">
      <h1 className="text-3xl font-bold mb-2">Deleting your OriPics account</h1>
      <p className="text-sm text-slate-500 mb-10">Operated by SantaHades Co., Ltd. · Last updated: {LAST_UPDATED}</p>

      <h2>How to delete your account</h2>
      <p><strong>In the app</strong></p>
      <ol>
        <li>Open the OriPics app and go to the <strong>Settings</strong> tab.</li>
        <li>Tap <strong>Delete account</strong> at the bottom.</li>
        <li>Type the confirmation word as instructed and tap <strong>Delete permanently</strong>.</li>
      </ol>
      <p><strong>On the web</strong></p>
      <ol>
        <li>Sign in at <a href="https://www.ori.pics/en/login">ori.pics</a> and open your <strong>Profile</strong>.</li>
        <li>Choose <strong>Delete account</strong> and confirm.</li>
      </ol>
      <p>
        If you cannot use the app or website, email <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a> from your
        account email. We will process the request within 7 days after verifying your identity.
      </p>

      <h2>Data that is deleted</h2>
      <ul>
        <li>Account information: email, name, and linked sign-ins (Google, Apple, Kakao, Naver)</li>
        <li>Certified photos, public links, certificate PDFs, and photos in your storage</li>
        <li>Remaining usage, One-Day Passes, Photo Box Passes, partner coupons, and notifications</li>
        <li>Event entries and likes</li>
      </ul>
      <p>Deletion is immediate and cannot be undone. Photos stored only on your device are removed when you uninstall the app.</p>

      <h2>Data that is retained, and for how long</h2>
      <ul>
        <li>
          <strong>Photos you added to a photo box</strong> stay in that photo box because they were shared with other
          participants as evidence. The uploader is shown as &quot;Deleted member&quot; and account identifiers are erased.
          Photos in real-estate photo boxes are kept for 5 years from registration, then erased.
        </li>
        <li><strong>Payment records</strong>: 5 years (Korean Act on Consumer Protection in E-Commerce).</li>
        <li><strong>Access logs</strong>: 3 months (Korean Communications Privacy Act).</li>
        <li><strong>Partner participation records</strong> (email hash): 1 year after the challenge ends, for fraud prevention.</li>
      </ul>
      <p>
        See our <Link href="/privacy">Privacy Policy</Link> for details. Contact:{" "}
        <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>
      </p>
    </article>
  );
}

export default function AccountDeletionPage() {
  const params = useParams();
  const locale = (params?.locale as string) || "ko";
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 py-12 px-6">
      <div className="max-w-3xl mx-auto">
        <Link href="/" className="inline-flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900 mb-8">
          <ArrowLeft size={16} /> {locale === "en" ? "Back" : "돌아가기"}
        </Link>
        {locale === "en" ? <En /> : <Ko />}
      </div>
    </div>
  );
}
