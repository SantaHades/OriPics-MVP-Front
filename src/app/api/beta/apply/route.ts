import { NextRequest, NextResponse } from "next/server";
import nodemailer from "nodemailer";
import { checkRateLimit, clientIp, tooManyRequests, RATE_LIMITS } from "@/lib/security/rateLimit";

export const runtime = "nodejs";

const APPLY_TO = "hi@ori.pics";
// 넉넉한 이메일 형식 검사 — 최종 유효성은 대표가 테스터 등록 시 확인
const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/;

/**
 * POST /api/beta/apply — 베타 테스터 신청 (2026-08-31 대표 지시).
 * 공개 폼: 신청자 이메일을 hi@ori.pics로 전달 → 대표가 Google 테스터 목록에 수동 등록.
 * 인증 불요 · IP 레이트리밋(시간당 5회)으로 스팸 방어. 발송 실패는 500으로 정직하게
 * 반환 (성공 표시 후 메일 유실이 최악 — 신청자는 재시도 또는 직접 메일 안내).
 */
export async function POST(req: NextRequest) {
  const rl = await checkRateLimit(RATE_LIMITS.betaApply, clientIp(req));
  if (!rl.allowed) {
    return tooManyRequests(rl, "신청이 너무 잦습니다. 잠시 후 다시 시도해 주세요.");
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ detail: "invalid_json" }, { status: 400 });
  }
  const email = typeof body?.email === "string" ? body.email.trim() : "";
  if (!EMAIL_RE.test(email) || email.length > 320) {
    return NextResponse.json({ detail: "invalid_email" }, { status: 400 });
  }

  if (!process.env.SMTP_USER || !process.env.SMTP_PASSWORD) {
    return NextResponse.json({ detail: "mailer_not_configured" }, { status: 500 });
  }

  const when = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul", dateStyle: "medium", timeStyle: "short",
  }).format(new Date());

  try {
    const transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD },
    });
    await transporter.sendMail({
      from: `"OriPics" <${process.env.SMTP_FROM || process.env.SMTP_USER}>`,
      to: APPLY_TO,
      subject: `[OriPics] 베타 테스터 신청: ${email}`,
      text: [
        "웹 메인 베타 모집 팝업에서 신청이 접수되었습니다.",
        "",
        `신청 이메일: ${email}`,
        `신청 시각: ${when} (KST)`,
        `User-Agent: ${req.headers.get("user-agent") ?? "-"}`,
        "",
        "→ Google Play 테스터 목록(internal)에 등록 후, 필요 시 안내 메일을 보내주세요.",
      ].join("\n"),
    });
  } catch (e: any) {
    console.error("[beta/apply] mail send failed:", e?.message || e);
    return NextResponse.json({ detail: "send_failed" }, { status: 500 });
  }

  console.log(`[beta/apply] received: ${email}`);
  return NextResponse.json({ ok: true });
}
