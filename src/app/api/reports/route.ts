// 사용자 콘텐츠 신고 (2026-09-26, Google Play UGC 정책) — POST /api/reports
//   { target_type: 'event_entry' | 'mailbox_photo', target_id, reason, note? } (로그인 필수)
//   - 이벤트 출품작: 공개 갤러리. 서로 다른 신고자 3명이면 자동 숨김(status='hidden') 후 운영자 확인.
//   - 사진함 사진: 초대 참여자만 신고 가능(참여자 검사). 증빙 보존 원칙(삭제 잠금)이라 자동 숨김 없이 운영자 확인.
//   - 같은 사람이 같은 대상을 다시 신고하면 성공으로 응답(중복 기록 없음). 본인 사진은 신고 불가.
//   운영자(ADMIN_EMAILS)에게 메일 알림(best-effort).
import { NextRequest, NextResponse } from "next/server";
import nodemailer from "nodemailer";

import { getSessionUserId } from "@/lib/auth/getSessionUserId";
import { eventsDb } from "@/lib/events/server";
import { isActiveMember, loadMember } from "@/lib/mailboxes/server";
import { adminEmails } from "@/lib/partner/mailer";
import { prisma } from "@/lib/prisma";
import { checkRateLimit, tooManyRequests } from "@/lib/security/rateLimit";

export const dynamic = "force-dynamic";

const RULE = { name: "report", windowSec: 3600, max: 20 };
const REASONS = ["sexual", "violence", "privacy", "copyright", "spam_other"] as const;
const REASON_KO: Record<string, string> = {
  sexual: "음란·선정적", violence: "폭력·혐오", privacy: "개인정보 노출", copyright: "저작권·도용", spam_other: "스팸·기타",
};
const AUTO_HIDE_REPORTERS = 3;

async function notifyAdmins(subject: string, html: string) {
  const to = adminEmails();
  if (!to.length || !process.env.SMTP_USER || !process.env.SMTP_PASSWORD) return;
  try {
    await nodemailer
      .createTransport({ host: "smtp.gmail.com", port: 465, secure: true, auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD } })
      .sendMail({ from: `"OriPics" <${process.env.SMTP_FROM || process.env.SMTP_USER}>`, to: to.join(", "), subject, html });
  } catch (e: any) {
    console.warn("[reports] admin mail failed:", e?.message ?? e);
  }
}

export async function POST(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ detail: "unauthenticated" }, { status: 401 });
  const rl = await checkRateLimit(RULE, userId);
  if (!rl.allowed) return tooManyRequests(rl, "신고가 너무 잦습니다. 잠시 후 다시 시도해 주세요.");
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ detail: "invalid_json" }, { status: 400 });
  }
  const targetType = body.target_type === "event_entry" || body.target_type === "mailbox_photo" ? body.target_type : null;
  const targetId = typeof body.target_id === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(body.target_id) ? body.target_id : null;
  const reason = typeof body.reason === "string" && (REASONS as readonly string[]).includes(body.reason) ? body.reason : null;
  const note = typeof body.note === "string" ? body.note.trim().slice(0, 300) || null : null;
  if (!targetType || !targetId || !reason) return NextResponse.json({ detail: "invalid_request" }, { status: 400 });

  const db = eventsDb();
  if (!db) return NextResponse.json({ detail: "server_misconfigured" }, { status: 500 });

  let contextId: string | null = null;
  let linkId: string | null = null;
  let ownerId: string | null = null;
  if (targetType === "event_entry") {
    const { data } = await db.from("event_entries").select("id, event_id, link_id, user_id, status").eq("id", targetId).maybeSingle();
    if (!data) return NextResponse.json({ detail: "not_found" }, { status: 404 });
    contextId = data.event_id as string;
    linkId = data.link_id as string;
    ownerId = data.user_id as string;
  } else {
    const { data } = await db.from("mailbox_photos").select("id, mailbox_id, link_id, uploaded_by").eq("id", targetId).maybeSingle();
    if (!data) return NextResponse.json({ detail: "not_found" }, { status: 404 });
    contextId = data.mailbox_id as string;
    linkId = data.link_id as string;
    ownerId = (data.uploaded_by as string | null) ?? null;
    // 사진함 사진은 그 사진함 참여자만 볼 수 있으므로 참여자만 신고
    if (!isActiveMember(await loadMember(db, contextId, userId))) return NextResponse.json({ detail: "forbidden" }, { status: 403 });
  }
  if (ownerId === userId) return NextResponse.json({ detail: "own_content" }, { status: 400 });

  const inserted = await prisma.$executeRaw`
    INSERT INTO public.content_reports (reporter_id, target_type, target_id, context_id, link_id, reason, note)
    VALUES (${userId}, ${targetType}, ${targetId}, ${contextId}, ${linkId}, ${reason}, ${note})
    ON CONFLICT (reporter_id, target_type, target_id) DO NOTHING`;
  if (inserted === 0) return NextResponse.json({ ok: true, already: true });

  const [c] = await prisma.$queryRaw<Array<{ n: bigint }>>`
    SELECT count(DISTINCT reporter_id)::bigint AS n FROM public.content_reports
    WHERE target_type = ${targetType} AND target_id = ${targetId} AND status = 'open'`;
  const reporters = Number(c?.n ?? 0);
  let autoHidden = false;
  if (targetType === "event_entry" && reporters >= AUTO_HIDE_REPORTERS) {
    const { error } = await db.from("event_entries").update({ status: "hidden" }).eq("id", targetId).eq("status", "visible");
    autoHidden = !error;
  }

  console.log(`[reports] ${targetType}=${targetId} reason=${reason} reporters=${reporters}${autoHidden ? " auto-hidden" : ""}`);
  void notifyAdmins(
    `[OriPics 신고] ${targetType === "event_entry" ? "이벤트 출품작" : "사진함 사진"} · ${REASON_KO[reason]}${autoHidden ? " · 자동 숨김" : ""}`,
    `<div style="font-family:sans-serif;font-size:14px;line-height:1.7">
      <p>대상: ${targetType === "event_entry" ? "이벤트" : "사진함"} ${contextId} · ${targetType} <code>${targetId}</code></p>
      <p>사진: <a href="https://www.ori.pics/${linkId}">https://www.ori.pics/${linkId}</a></p>
      <p>사유: ${REASON_KO[reason]}${note ? `<br>메모: ${note.replace(/</g, "&lt;")}` : ""}</p>
      <p>누적 신고자: ${reporters}명${autoHidden ? " → <b>공개 갤러리에서 자동 숨김</b>" : ""}</p>
      <p>24시간 안에 확인해 부적절하면 숨김(이벤트 출품작 status='hidden') 처리하세요.</p>
    </div>`,
  );
  return NextResponse.json({ ok: true, auto_hidden: autoHidden });
}
