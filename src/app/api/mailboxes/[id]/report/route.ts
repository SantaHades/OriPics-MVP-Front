// 사서함 확인서 PDF — 현재 상태 (A-81 2차) — GET /api/mailboxes/:id/report?locale= (참여자, 무료)
import { NextRequest, NextResponse } from "next/server";
import { FONT_UNAVAILABLE, renderMailboxReportPdf } from "@oripics/certificate";

import { getSessionUserId } from "@/lib/auth/getSessionUserId";
import { eventsDb } from "@/lib/events/server";
import { buildReportData, reportFileName, safeTimeZone } from "@/lib/mailboxes/report";
import { buildSnapshot, isActiveMember, langOf, listMembers, loadMailbox, loadMember } from "@/lib/mailboxes/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ detail: "unauthenticated" }, { status: 401 });
  const db = eventsDb();
  if (!db) return NextResponse.json({ detail: "server_misconfigured" }, { status: 500 });
  const mb = await loadMailbox(db, id);
  if (!mb || mb.status !== "active") return NextResponse.json({ detail: "not_found" }, { status: 404 });
  const me = await loadMember(db, id, userId);
  if (!isActiveMember(me)) return NextResponse.json({ detail: "forbidden" }, { status: 403 });
  const locale = langOf(req.nextUrl.searchParams.get("locale"));
  const members = await listMembers(db, id);
  const snapshot = await buildSnapshot(db, mb, members, userId, locale);
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { name: true, email: true } });
  // 시간대: ?tz= (IANA) 없으면 Asia/Seoul — 본문·라벨 공통. issuedAt은 한 번만 만들어 파일명·본문에 같이 씀 (2026-09-11 A-87)
  const timeZone = safeTimeZone(req.nextUrl.searchParams.get("tz"));
  const now = new Date();
  const data = await buildReportData({
    snapshot, basis: "live", basisAt: now, issuedAt: now, timeZone,
    issuedTo: me.display_name || user?.name || user?.email || userId, issuedToEmail: user?.email,
  });
  try {
    const pdf = await renderMailboxReportPdf({ data, locale });
    console.log(`[mailboxes] report mailbox=${id} user=${userId} photos=${snapshot.photos.length}`);
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(reportFileName(mb.name, now))}`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (e: any) {
    console.error("[mailboxes] report render failed:", e?.message || e);
    // 폰트 미탑재 → 한글 빠진 PDF가 200으로 나가지 않게 명시적 500 (2026-09-11 A-87)
    const detail = e?.message === FONT_UNAVAILABLE ? FONT_UNAVAILABLE : "render_failed";
    return NextResponse.json({ detail }, { status: 500 });
  }
}
