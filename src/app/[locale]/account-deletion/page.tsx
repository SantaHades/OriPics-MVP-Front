"use client";

// 계정 삭제 안내 (2026-09-24) — Google Play 데이터 보안 '계정 삭제 URL' 요건:
// 앱·개발자 이름, 삭제 요청 단계, 삭제·보관되는 데이터와 보관 기간을 로그인 없이 볼 수 있어야 한다.
// 실제 삭제 동작: api/user/delete (사진함에 속하지 않은 사진·공개링크 파기 + 계정 삭제, 사진함 사진은 업로더 가림 후 보존).
// 2026-09-25: 이메일 요청 버튼(mailto 양식) + '계정 유지·데이터만 삭제' 섹션 + 카드형 디자인.
import type { ReactNode } from "react";
import { Link } from "@/navigation";
import { useParams } from "next/navigation";
import { ArrowLeft, Archive, Globe, Mail, Smartphone, Trash2, UserX } from "lucide-react";

const LAST_UPDATED = "2026-09-25";
const SUPPORT_EMAIL = "hi@ori.pics";

// 요청 메일 미리 채우기 — 본인 확인은 가입 이메일로 보낸 메일로 한다
function mailto(subject: string, body: string) {
  return `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

type Copy = {
  back: string;
  title: string;
  lead: string;
  meta: string;
  howTitle: string;
  methods: { icon: ReactNode; label: string; steps: ReactNode[] }[];
  emailTitle: string;
  emailBody: string;
  accountMail: string;
  accountMailLabel: string;
  dataTitle: string;
  dataLead: string;
  dataItems: { title: string; body: ReactNode }[];
  dataMail: string;
  dataMailLabel: string;
  deletedTitle: string;
  deleted: string[];
  deletedNote: string;
  retainedTitle: string;
  retained: { title: string; period: string; body: string }[];
  footer: ReactNode;
};

const KO: Copy = {
  back: "돌아가기",
  title: "OriPics 계정 삭제 안내",
  lead: "계정과 데이터는 앱·웹에서 직접 삭제하거나 이메일로 요청할 수 있습니다.",
  meta: `운영: 주식회사 산타하데스 (SantaHades Co., Ltd.) · 최종 갱신 ${LAST_UPDATED}`,
  howTitle: "계정을 삭제하는 방법",
  methods: [
    {
      icon: <Smartphone size={18} />,
      label: "앱에서",
      steps: [
        <>OriPics 앱의 <b>설정</b> 탭으로 이동</>,
        <>맨 아래 <b>회원탈퇴</b> 누르기</>,
        <><b>탈퇴합니다</b> 입력 후 <b>영구 삭제</b></>,
      ],
    },
    {
      icon: <Globe size={18} />,
      label: "웹에서",
      steps: [
        <><a href="https://www.ori.pics/ko/login">ori.pics</a>에 로그인</>,
        <><b>프로필</b>로 이동</>,
        <><b>회원 탈퇴</b>를 누르고 확인</>,
      ],
    },
  ],
  emailTitle: "앱이나 웹을 쓸 수 없나요?",
  emailBody: "가입한 이메일로 삭제를 요청해 주세요. 본인 확인 후 7일 이내에 처리하고 결과를 메일로 알려 드립니다.",
  accountMail: mailto(
    "[계정 삭제 요청] OriPics",
    "OriPics 계정과 데이터 삭제를 요청합니다.\n\n가입 이메일:\n로그인 방식(이메일/구글/애플/카카오/네이버):\n\n※ 가입한 이메일 주소로 보내 주세요.",
  ),
  accountMailLabel: "이메일로 계정 삭제 요청하기",
  dataTitle: "계정은 유지하고 데이터만 삭제하기",
  dataLead: "계정을 없애지 않고 사진이나 공개링크만 지울 수도 있습니다.",
  dataItems: [
    {
      title: "인증 사진·공개링크",
      body: (
        <>
          <a href="https://www.ori.pics/ko/profile">웹 프로필</a>의 <b>발행한 공개링크 목록</b>에서 사진별{" "}
          <b>삭제</b>를 누르면 원본 이미지, 인증서, 공개링크가 즉시 영구 삭제됩니다.
        </>
      ),
    },
    {
      title: "앱 목록의 사진",
      body: "앱 목록에서 삭제하면 기기에서만 지워집니다. 서버의 공개링크까지 지우려면 웹 프로필에서 삭제하거나 이메일로 요청해 주세요.",
    },
    { title: "여러 건·전체·기타 데이터", body: "이메일로 요청해 주세요. 7일 이내에 처리합니다." },
    { title: "사진함에 올린 사진", body: "참여자 간 증빙이므로 사진함이 삭제되기 전까지는 삭제할 수 없습니다." },
  ],
  dataMail: mailto(
    "[데이터 삭제 요청] OriPics",
    "계정은 유지하고 아래 데이터 삭제를 요청합니다.\n\n가입 이메일:\n삭제할 데이터(예: 공개링크 주소, 전체 인증 사진):\n\n※ 가입한 이메일 주소로 보내 주세요.",
  ),
  dataMailLabel: "이메일로 데이터 삭제 요청하기",
  deletedTitle: "탈퇴 시 삭제되는 데이터",
  deleted: [
    "계정 정보: 이메일, 이름, 로그인 연결(구글·애플·카카오·네이버)",
    "인증한 사진과 공개링크, 인증서 PDF, 보관함 사진",
    "잔여 이용 건수, 원데이 패스·사진함 패스, 파트너 할인권, 알림",
    "이벤트 출품작과 좋아요",
  ],
  deletedNote: "삭제는 즉시 처리되며 되돌릴 수 없습니다. 기기에만 저장된 사진은 앱을 삭제하면 함께 지워집니다.",
  retainedTitle: "보관되는 데이터와 기간",
  retained: [
    {
      title: "사진함에 올린 사진",
      period: "사진함 유지 기간",
      body: "다른 참여자와 공유한 증빙이라 사진함에 남습니다. 업로더는 '탈퇴한 회원'으로 표시되고 계정 식별정보는 삭제됩니다. 부동산사진함 사진은 등록일로부터 5년 후 파기됩니다.",
    },
    { title: "결제 기록", period: "5년", body: "전자상거래법에 따른 보관" },
    { title: "접속 기록", period: "3개월", body: "통신비밀보호법에 따른 보관" },
    { title: "파트너 참여 기록(이메일 해시)", period: "챌린지 종료 후 1년", body: "부정 참여 방지" },
  ],
  footer: (
    <>
      자세한 내용은 <Link href="/privacy">개인정보 처리방침</Link>을 확인해 주세요. 문의{" "}
      <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>
    </>
  ),
};

const EN: Copy = {
  back: "Back",
  title: "Deleting your OriPics account",
  lead: "You can delete your account and data yourself in the app or on the web, or ask us by email.",
  meta: `Operated by SantaHades Co., Ltd. · Last updated ${LAST_UPDATED}`,
  howTitle: "How to delete your account",
  methods: [
    {
      icon: <Smartphone size={18} />,
      label: "In the app",
      steps: [
        <>Open the <b>Settings</b> tab in OriPics</>,
        <>Tap <b>Delete account</b> at the bottom</>,
        <>Type the confirmation word and tap <b>Delete permanently</b></>,
      ],
    },
    {
      icon: <Globe size={18} />,
      label: "On the web",
      steps: [
        <>Sign in at <a href="https://www.ori.pics/en/login">ori.pics</a></>,
        <>Open your <b>Profile</b></>,
        <>Choose <b>Delete Account</b> and confirm</>,
      ],
    },
  ],
  emailTitle: "Can't use the app or website?",
  emailBody:
    "Email us from your account email. We process requests within 7 days after verifying your identity and confirm by email.",
  accountMail: mailto(
    "[Account deletion request] OriPics",
    "I request deletion of my OriPics account and data.\n\nAccount email:\nSign-in method (email/Google/Apple/Kakao/Naver):\n\nPlease send this from your account email.",
  ),
  accountMailLabel: "Request account deletion by email",
  dataTitle: "Delete data but keep your account",
  dataLead: "You can remove photos or public links without closing your account.",
  dataItems: [
    {
      title: "Certified photos and public links",
      body: (
        <>
          In <a href="https://www.ori.pics/en/profile">your web profile</a>, open <b>My Public Links</b> and choose{" "}
          <b>Delete</b> on a photo. The original image, certificate, and public link are permanently deleted right away.
        </>
      ),
    },
    {
      title: "Photos in the app list",
      body: "Deleting from the app list removes them from your device only. To delete the public link on our server, delete it in your web profile or email us.",
    },
    { title: "Bulk, full, or other data", body: "Email us. We process requests within 7 days." },
    {
      title: "Photos added to a photo box",
      body: "These are shared evidence and cannot be deleted until the photo box is deleted.",
    },
  ],
  dataMail: mailto(
    "[Data deletion request] OriPics",
    "I want to keep my account and request deletion of the following data.\n\nAccount email:\nData to delete (e.g. public link URLs, all certified photos):\n\nPlease send this from your account email.",
  ),
  dataMailLabel: "Request data deletion by email",
  deletedTitle: "Deleted when you close your account",
  deleted: [
    "Account information: email, name, and linked sign-ins (Google, Apple, Kakao, Naver)",
    "Certified photos, public links, certificate PDFs, and photos in your storage",
    "Remaining usage, One-Day Passes, Photo Box Passes, partner coupons, and notifications",
    "Event entries and likes",
  ],
  deletedNote:
    "Deletion is immediate and cannot be undone. Photos stored only on your device are removed when you uninstall the app.",
  retainedTitle: "Retained data and periods",
  retained: [
    {
      title: "Photos added to a photo box",
      period: "While the photo box exists",
      body: "They stay in the photo box because they were shared with other participants as evidence. The uploader is shown as 'Deleted member' and account identifiers are erased. Real-estate photo box photos are erased 5 years after registration.",
    },
    { title: "Payment records", period: "5 years", body: "Korean Act on Consumer Protection in E-Commerce" },
    { title: "Access logs", period: "3 months", body: "Korean Communications Privacy Act" },
    { title: "Partner records (email hash)", period: "1 year after the challenge", body: "Fraud prevention" },
  ],
  footer: (
    <>
      See our <Link href="/privacy">Privacy Policy</Link> for details. Contact{" "}
      <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>
    </>
  ),
};

function Section({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
      <h2 className="mb-5 flex items-center gap-2.5 text-lg font-bold text-slate-900">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-slate-700">{icon}</span>
        {title}
      </h2>
      {children}
    </section>
  );
}

function MailButton({ href, children, variant = "dark" }: { href: string; children: ReactNode; variant?: "dark" | "light" }) {
  const cls =
    variant === "dark"
      ? "bg-slate-900 !text-white hover:bg-slate-700"
      : "border border-slate-300 bg-white hover:bg-slate-50";
  return (
    <a
      href={href}
      className={`inline-flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold !no-underline transition-colors ${cls}`}
    >
      <Mail size={16} />
      {children}
    </a>
  );
}

export default function AccountDeletionPage() {
  const params = useParams();
  const locale = (params?.locale as string) || "ko";
  const c = locale === "en" ? EN : KO;

  return (
    <div className="min-h-screen bg-slate-50 px-5 py-10 text-slate-700 sm:py-14 [&_a]:font-medium [&_a]:text-slate-900 [&_a]:underline [&_a]:underline-offset-2">
      <div className="mx-auto max-w-3xl space-y-6">
        <Link href="/" className="inline-flex items-center gap-2 text-sm !font-normal !text-slate-500 !no-underline hover:!text-slate-900">
          <ArrowLeft size={16} /> {c.back}
        </Link>

        <header className="pb-2">
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">{c.title}</h1>
          <p className="mt-3 text-base leading-relaxed text-slate-600">{c.lead}</p>
          <p className="mt-2 text-xs text-slate-400">{c.meta}</p>
        </header>

        <Section icon={<UserX size={18} />} title={c.howTitle}>
          <div className="grid gap-4 sm:grid-cols-2">
            {c.methods.map((m) => (
              <div key={m.label} className="rounded-xl bg-slate-50 p-5">
                <p className="mb-3 flex items-center gap-2 font-semibold text-slate-900">
                  {m.icon}
                  {m.label}
                </p>
                <ol className="space-y-2.5">
                  {m.steps.map((s, i) => (
                    <li key={i} className="flex gap-3 text-sm leading-relaxed">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-900 text-xs font-bold text-white">
                        {i + 1}
                      </span>
                      <span className="pt-0.5">{s}</span>
                    </li>
                  ))}
                </ol>
              </div>
            ))}
          </div>
          <div className="mt-5 flex flex-col gap-4 rounded-xl border border-slate-200 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-semibold text-slate-900">{c.emailTitle}</p>
              <p className="mt-1 text-sm leading-relaxed text-slate-600">{c.emailBody}</p>
            </div>
            <div className="shrink-0">
              <MailButton href={c.accountMail}>{c.accountMailLabel}</MailButton>
            </div>
          </div>
        </Section>

        <Section icon={<Trash2 size={18} />} title={c.dataTitle}>
          <p className="-mt-2 mb-3 text-sm text-slate-600">{c.dataLead}</p>
          <dl className="divide-y divide-slate-100">
            {c.dataItems.map((d) => (
              <div key={d.title} className="grid gap-1 py-3.5 sm:grid-cols-[180px_1fr] sm:gap-6">
                <dt className="text-sm font-semibold text-slate-900">{d.title}</dt>
                <dd className="text-sm leading-relaxed text-slate-600">{d.body}</dd>
              </div>
            ))}
          </dl>
          <div className="mt-5">
            <MailButton href={c.dataMail} variant="light">
              {c.dataMailLabel}
            </MailButton>
          </div>
        </Section>

        <div className="grid gap-6 md:grid-cols-2">
          <Section icon={<Trash2 size={18} />} title={c.deletedTitle}>
            <ul className="space-y-2.5">
              {c.deleted.map((d) => (
                <li key={d} className="flex gap-2.5 text-sm leading-relaxed">
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-red-500" />
                  {d}
                </li>
              ))}
            </ul>
            <p className="mt-5 rounded-lg bg-red-50 px-4 py-3 text-xs leading-relaxed text-red-700">{c.deletedNote}</p>
          </Section>

          <Section icon={<Archive size={18} />} title={c.retainedTitle}>
            <ul className="space-y-4">
              {c.retained.map((r) => (
                <li key={r.title}>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-slate-900">{r.title}</span>
                    <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">
                      {r.period}
                    </span>
                  </div>
                  <p className="mt-1 text-sm leading-relaxed text-slate-600">{r.body}</p>
                </li>
              ))}
            </ul>
          </Section>
        </div>

        <p className="pt-2 text-center text-sm text-slate-500">{c.footer}</p>
      </div>
    </div>
  );
}
