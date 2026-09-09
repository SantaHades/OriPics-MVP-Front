// 사서함 이메일 알림 (A-81 2차, 2026-09-09) — 인앱 알림 중 '행동이 필요한' 종류만 이메일 병행(기획 §3 알림 센터).
// 발송은 best-effort — 실패해도 API 흐름을 막지 않는다. graceMailer와 같은 SMTP(Gmail) 경로.
import nodemailer from "nodemailer";

import type { NoticeKind } from "./server";

export const EMAIL_KINDS: ReadonlySet<NoticeKind> = new Set<NoticeKind>([
  "delete_scheduled", "delete_cancelled", "kicked", "unkicked", "owner_credits_low", "billing_changed", "owner_transferred",
]);

function transporter() {
  return nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD },
  });
}
const FROM = () => `"OriPics" <${process.env.SMTP_FROM || process.env.SMTP_USER}>`;
const MAILBOXES_URL = "https://www.ori.pics/ko/mailboxes";

function fmt(iso: unknown): string {
  const d = typeof iso === "string" ? new Date(iso) : null;
  if (!d || isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(d);
}

export function noticeMail(kind: NoticeKind, p: Record<string, unknown>): { subject: string; title: string; body: string } | null {
  const name = String(p.mailbox_name ?? "");
  switch (kind) {
    case "delete_scheduled":
      return {
        subject: `[OriPics] 사서함 '${name}'이(가) ${fmt(p.delete_after)}에 삭제됩니다`,
        title: "사서함 삭제 예고",
        body: `<p>개설자가 사서함 <strong>'${name}'</strong>의 삭제를 예고했습니다.</p>
               <p><strong>${fmt(p.delete_after)}</strong>에 서버에서 삭제되며, 그 전까지 누구나 열람하고 웹 저장소로 <strong>백업</strong>할 수 있습니다.</p>`,
      };
    case "delete_cancelled":
      return { subject: `[OriPics] 사서함 '${name}' 삭제가 취소되었습니다`, title: "사서함 삭제 취소", body: `<p>사서함 <strong>'${name}'</strong>의 삭제 예고가 취소되어 계속 사용할 수 있습니다.</p>` };
    case "kicked":
      return { subject: `[OriPics] 사서함 '${name}'에서 내보내졌습니다`, title: "사서함 참여 종료", body: `<p>개설자가 사서함 <strong>'${name}'</strong>에서 회원님을 내보냈습니다. 올린 사진과 열람 기록은 사서함에 남습니다. 다시 참여하려면 개설자에게 해제를 요청하세요.</p>` };
    case "unkicked":
      return { subject: `[OriPics] 사서함 '${name}'에 다시 참여되었습니다`, title: "사서함 참여 복귀", body: `<p>개설자가 사서함 <strong>'${name}'</strong>에 회원님을 다시 참여시켰습니다.</p>` };
    case "owner_credits_low":
      return {
        subject: `[OriPics] 사서함 '${name}' 참여자 촬영 실패 — 잔여 건수 부족`,
        title: "인증 건수 부족",
        body: `<p>사서함 <strong>'${name}'</strong>의 참여자가 촬영을 시도했지만 회원님(개설자)의 잔여 인증 건수가 부족해 등록되지 않았습니다.</p><p>필요 ${String(p.required ?? "")}건 · 잔여 ${String(p.balance ?? "")}건. 설정 탭 또는 웹 프로필에서 건수를 확인해 주세요.</p>`,
      };
    case "billing_changed":
      return {
        subject: `[OriPics] 사서함 '${name}' 촬영 건수 부담이 바뀌었습니다`,
        title: "촬영 건수 부담 변경",
        body: `<p>사서함 <strong>'${name}'</strong>에서 회원님의 촬영 건수 부담이 <strong>${p.capture_billing === "self" ? "참여자 본인" : "개설자"}</strong>으로 바뀌었습니다. 이후 촬영부터 적용됩니다.</p>`,
      };
    case "owner_transferred":
      return {
        subject: `[OriPics] 사서함 '${name}'의 개설자가 되었습니다`,
        title: "개설자 권한 이전",
        body: `<p>${String(p.actor_name ?? "이전 개설자")}님이 사서함 <strong>'${name}'</strong>의 개설자 권한을 회원님에게 이전했습니다.</p>
               <p><strong>개설자 부담으로 설정된 참여자 ${String(p.owner_billed_count ?? 0)}명</strong>의 촬영이 이제 회원님의 잔여 건수에서 차감됩니다. 원치 않으면 설정 → 참여자 편집에서 '참여자 본인 부담'으로 바꾸거나 촬영을 끄세요.</p>
               ${p.recipient_paid === false ? "<p>무료 플랜에서는 참여자 촬영이 Standard 등급으로 인증되고, 참여자 20명을 넘는 사서함은 새 초대가 막힙니다.</p>" : ""}`,
      };
    default:
      return null;
  }
}

export async function sendNoticeEmail(to: string, kind: NoticeKind, payload: Record<string, unknown>): Promise<boolean> {
  const m = noticeMail(kind, payload);
  if (!m || !process.env.SMTP_USER) return false;
  const html = `
  <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Noto Sans KR',sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#0f172a">
    <h2 style="font-size:18px;margin:0 0 16px">${m.title}</h2>
    <div style="font-size:14px;line-height:1.7;color:#334155">${m.body}</div>
    <p style="margin-top:24px"><a href="${MAILBOXES_URL}" style="display:inline-block;background:#1d61e7;color:#fff;text-decoration:none;font-weight:bold;padding:10px 20px;border-radius:10px">웹에서 사서함 보기</a></p>
    <p style="margin-top:24px;font-size:12px;color:#94a3b8">OriPics — 그 시각·그곳·실제 기기 촬영을 증명합니다 · 주식회사 산타하데스<br/>문의: hi@ori.pics</p>
  </div>`;
  try {
    await transporter().sendMail({ from: FROM(), to, subject: m.subject, html });
    return true;
  } catch (e: any) {
    console.warn("[mailboxes] email failed:", e?.message || e);
    return false;
  }
}
