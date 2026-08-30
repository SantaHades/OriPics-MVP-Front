// 보관 유예(grace) 이메일 알림 (A-58, pricing-policy §5.3 — 2026-08-30 구현)
// Pro 종료로 무기한 보관이 끝난 사용자에게: ①다운그레이드 즉시 안내 ②삭제 7/3/1일 전 리마인더.
// 발송은 전부 best-effort — 실패해도 다운그레이드·크론 흐름을 막지 않는다(호출측 try/catch).
// 앱 푸시는 인프라 부재로 후속(A-58 잔여) — 현재는 이메일만.
import nodemailer from "nodemailer";

function transporter() {
  return nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASSWORD,
    },
  });
}

const FROM = () => `"OriPics" <${process.env.SMTP_FROM || process.env.SMTP_USER}>`;
const PROFILE_URL = "https://www.ori.pics/ko/profile";
const PRICING_URL = "https://www.ori.pics/ko#pricing";

function fmtDate(d: Date): string {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(d);
}

function shell(title: string, bodyHtml: string): string {
  return `
  <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Noto Sans KR',sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#0f172a">
    <h2 style="font-size:18px;margin:0 0 16px">${title}</h2>
    <div style="font-size:14px;line-height:1.7;color:#334155">${bodyHtml}</div>
    <p style="margin-top:24px">
      <a href="${PROFILE_URL}" style="display:inline-block;background:#1d61e7;color:#fff;text-decoration:none;font-weight:bold;padding:10px 20px;border-radius:10px">보관함에서 이미지 다운로드</a>
      &nbsp;
      <a href="${PRICING_URL}" style="display:inline-block;border:1px solid #cbd5e1;color:#0f172a;text-decoration:none;font-weight:bold;padding:10px 20px;border-radius:10px">Pro 재구독</a>
    </p>
    <p style="margin-top:24px;font-size:12px;color:#94a3b8">OriPics — 사진의 원본을 인증합니다 · 주식회사 산타하데스<br/>문의: hi@ori.pics</p>
  </div>`;
}

/** 다운그레이드 즉시 발송 — "30일 유예 후 7일 보관 정책 회귀" 고지 (§5.3) */
export async function sendGraceDowngradeNotice(opts: {
  email: string;
  linkCount: number;
  expiresAt: Date;
}): Promise<void> {
  const { email, linkCount, expiresAt } = opts;
  const subject = `[OriPics] 보관함 이용이 종료되었습니다 — 공개링크 ${linkCount}건이 ${fmtDate(expiresAt)}에 삭제됩니다`;
  const body = `
    <p>Pro 구독이 종료되어 보관함의 무기한 보관이 끝났습니다.</p>
    <p>현재 보관 중인 <strong>공개링크 ${linkCount}건</strong>은 30일의 유예 기간을 거쳐
    <strong>${fmtDate(expiresAt)}</strong>에 영구 삭제되며, 삭제 후에는 복구할 수 없습니다.</p>
    <p>계속 보관하시려면 그 전에 <strong>Pro를 재구독</strong>해 주세요 — 만료 전 재구독 시 무기한 보관이 자동 복원됩니다.
    또는 보관함에서 <strong>인증 이미지를 다운로드</strong>해 직접 보관하실 수 있습니다.</p>`;
  await transporter().sendMail({
    from: FROM(),
    to: email,
    subject,
    html: shell("보관함 이용 종료 안내", body),
  });
}

/** 삭제 임박 리마인더 — 7/3/1일 전 (§5.3). 일 1회 크론에서 창(window) 매칭으로 중복 없이 발송 */
export async function sendGraceReminder(opts: {
  email: string;
  linkCount: number;
  daysLeft: number;
  expiresAt: Date;
}): Promise<void> {
  const { email, linkCount, daysLeft, expiresAt } = opts;
  const subject = `[OriPics] 공개링크 ${linkCount}건이 ${daysLeft}일 후 삭제됩니다`;
  const body = `
    <p>보관 유예 기간이 곧 끝납니다.</p>
    <p>보관 중인 <strong>공개링크 ${linkCount}건</strong>이 <strong>${fmtDate(expiresAt)}</strong>
    (약 ${daysLeft}일 후)에 영구 삭제됩니다. 삭제 후에는 복구할 수 없습니다.</p>
    <p>계속 보관하시려면 <strong>Pro 재구독</strong>(만료 전 재구독 시 무기한 보관 자동 복원)
    또는 보관함에서 <strong>이미지 다운로드</strong>를 진행해 주세요.</p>`;
  await transporter().sendMail({
    from: FROM(),
    to: email,
    subject,
    html: shell(`공개링크 삭제 ${daysLeft}일 전 안내`, body),
  });
}
