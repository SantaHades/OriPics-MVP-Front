// 백업본 확인서 PDF (A-81 2차) — GET /api/mailboxes/backups/:backupId/report?locale= (백업 소유자)
import { NextRequest, NextResponse } from "next/server";
import { renderMailboxReportPdf } from "@oripics/certificate";

import { getSessionUserId } from "@/lib/auth/getSessionUserId";
import { eventsDb } from "@/lib/events/server";
import { buildReportData, reportFileName } from "@/lib/mailboxes/report";
import { BACKUP_COLS, langOf, type BackupRow } from "@/lib/mailboxes/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest, props: { params: Promise<{ backupId: string }> }) {
  const { backupId } = await props.params;
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ detail: "unauthenticated" }, { status: 401 });
  const db = eventsDb();
  if (!db) return NextResponse.json({ detail: "server_misconfigured" }, { status: 500 });
  const { data } = await db.from("mailbox_backups").select(BACKUP_COLS).eq("id", backupId).maybeSingle();
  if (!data) return NextResponse.json({ detail: "not_found" }, { status: 404 });
  const row = data as BackupRow;
  if (row.owner_user_id !== userId) return NextResponse.json({ detail: "forbidden" }, { status: 403 });
  const locale = langOf(req.nextUrl.searchParams.get("locale"));
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { name: true, email: true } });
  const me = row.snapshot.members.find((m) => m.user_id === userId);
  const basisAt = new Date(row.taken_at);
  const reportData = await buildReportData({ snapshot: row.snapshot, basis: "backup", basisAt, issuedTo: me?.display_name || user?.name || user?.email || userId, issuedToEmail: user?.email });
  try {
    const pdf = await renderMailboxReportPdf({ data: reportData, locale });
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(reportFileName(row.mailbox_name, basisAt))}`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (e: any) {
    console.error("[mailboxes] backup report render failed:", e?.message || e);
    return NextResponse.json({ detail: "render_failed" }, { status: 500 });
  }
}
