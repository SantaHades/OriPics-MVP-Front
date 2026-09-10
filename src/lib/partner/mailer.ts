// 파트너 릴레이 챌린지 이메일 (A-82) — 전부 best-effort(호출측 try/catch).
//  ① 코드 주인: "OOO 님이 회원님의 코드로 가입 → 할인권 1장 (총 N장)"
//  ② 12명 달성: 파트너에게 검수 안내 + 운영자(ADMIN_EMAILS)에게 승인 요청
//  ③ 6개월 무료 이용권 지급 완료
import nodemailer from "nodemailer";
import { PARTNER } from "./config";

function transporter() {
  return nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD },
  });
}
const FROM = () => `"OriPics" <${process.env.SMTP_FROM || process.env.SMTP_USER}>`;
const PARTNER_URL = "https://www.ori.pics/ko/profile#partner";
const ADMIN_URL = "https://www.ori.pics/ko/admin/partner";

export function adminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

function shell(title: string, body: string, cta?: { href: string; label: string }): string {
  return `
  <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Noto Sans KR',sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#0f172a">
    <h2 style="font-size:18px;margin:0 0 16px">${title}</h2>
    <div style="font-size:14px;line-height:1.7;color:#334155">${body}</div>
    ${cta ? `<p style="margin-top:24px"><a href="${cta.href}" style="display:inline-block;background:#1d61e7;color:#fff;text-decoration:none;font-weight:bold;padding:10px 20px;border-radius:10px">${cta.label}</a></p>` : ""}
    <p style="margin-top:28px;font-size:11px;color:#94a3b8">할인권·이용권은 Pro 월간 구독 결제에 자동 적용되며 발급일로부터 ${PARTNER.BENEFIT_VALID_MONTHS}개월 유효, 현금 환급·양도는 불가합니다. 부정 참여로 판정되면 미사용 혜택은 회수될 수 있습니다.</p>
  </div>`;
}

async function send(to: string | string[], subject: string, html: string): Promise<boolean> {
  if (!process.env.SMTP_USER || !process.env.SMTP_PASSWORD) return false;
  const list = Array.isArray(to) ? to.filter(Boolean) : [to];
  if (list.length === 0) return false;
  try {
    await transporter().sendMail({ from: FROM(), to: list.join(", "), subject, html });
    return true;
  } catch (e: any) {
    console.warn("[partner/mailer] send failed", { subject, error: e?.message ?? e });
    return false;
  }
}

export async function sendReferralJoinedMail(opts: {
  to: string;
  refereeNameMasked: string;
  totalCoupons: number;
  rewarded: boolean;
}): Promise<boolean> {
  const body = opts.rewarded
    ? `<p><strong>${opts.refereeNameMasked}</strong> 님이 회원님의 파트너코드로 가입했어요.</p>
       <p>Pro 50% 할인권 <strong>1장</strong>이 도착했습니다. 현재 보유 <strong>${opts.totalCoupons}장</strong>.</p>
       <p>할인권은 Pro 결제마다 1장씩(첫 결제는 2장까지) 자동으로 쓰입니다. ${PARTNER.MILESTONE_COUNT}명이 가입해 첫 인증까지 마치면 ${PARTNER.MILESTONE_FREE_MONTHS}개월 무료 이용권도 드려요.</p>`
    : `<p><strong>${opts.refereeNameMasked}</strong> 님이 회원님의 파트너코드로 가입했어요.</p>
       <p>파트너 모집(선착순 ${PARTNER.CAP}명)이 마감되어 이번 가입에 대한 할인권 적립은 없지만, 이미 받은 할인권은 그대로 사용할 수 있습니다.</p>`;
  return send(opts.to, "[OriPics] 파트너코드로 새 회원이 가입했어요", shell("파트너 릴레이 챌린지", body, { href: PARTNER_URL, label: "초대 현황 보기" }));
}

export async function sendMilestoneReachedMail(opts: { to: string; nameMasked: string; userId: string; code: string | null }): Promise<void> {
  await send(
    opts.to,
    `[OriPics] 유효 초대 ${PARTNER.MILESTONE_COUNT}명 달성 — 6개월 무료 이용권 검수 중`,
    shell(
      "축하합니다! 12명 달성",
      `<p>회원님의 파트너코드로 가입한 ${PARTNER.MILESTONE_COUNT}명이 첫 인증까지 마쳤습니다.</p>
       <p>Pro <strong>${PARTNER.MILESTONE_FREE_MONTHS}개월 무료 이용권</strong>은 운영자 검수 후 <strong>24시간 이내</strong>에 지급됩니다. 지급되면 다시 알려 드릴게요.</p>`,
      { href: PARTNER_URL, label: "내 혜택 보기" },
    ),
  );
  const admins = adminEmails();
  if (admins.length) {
    await send(
      admins,
      `[OriPics 운영] 파트너 12명 달성 검수 요청 — ${opts.nameMasked} (${opts.code ?? "-"})`,
      shell(
        "12명 마일스톤 검수 요청",
        `<p>파트너 <strong>${opts.nameMasked}</strong> (코드 ${opts.code ?? "-"}, userId ${opts.userId})가 유효 초대 ${PARTNER.MILESTONE_COUNT}명에 도달했습니다.</p>
         <p>어드민에서 같은 IP·기기 플래그, 초대 계정의 인증 패턴을 확인한 뒤 승인하면 무료 이용권 ${PARTNER.MILESTONE_FREE_MONTHS}장이 발급됩니다.</p>`,
        { href: ADMIN_URL, label: "어드민에서 검수" },
      ),
    );
  }
}

export async function sendMilestoneGrantedMail(opts: { to: string }): Promise<boolean> {
  return send(
    opts.to,
    `[OriPics] Pro ${PARTNER.MILESTONE_FREE_MONTHS}개월 무료 이용권이 지급되었습니다`,
    shell(
      "6개월 무료 이용권 지급 완료",
      `<p>검수가 끝나 Pro <strong>${PARTNER.MILESTONE_FREE_MONTHS}개월 무료 이용권</strong>이 계정에 담겼습니다.</p>
       <p>보유한 50% 할인권을 먼저 쓴 뒤, 그다음 결제부터 한 달씩 자동으로 적용됩니다(결제 0원, 카드 등록은 유지).</p>`,
      { href: PARTNER_URL, label: "내 혜택 보기" },
    ),
  );
}
