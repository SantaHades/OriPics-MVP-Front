import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { renewCreditsIfDue } from "@/lib/credits/renewCredits";
import { assertCron } from "@/lib/security/cron";

const BATCH_SIZE = 500;

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const denied = assertCron(req);
  if (denied) return denied;

  let renewed = 0;
  let skipped = 0;
  const errors: string[] = [];

  try {
    const users = await prisma.user.findMany({
      where: { creditsRenewAt: { lte: new Date() } },
      select: { id: true },
      take: BATCH_SIZE,
    });

    for (const { id } of users) {
      try {
        const result = await renewCreditsIfDue(id);
        if (result.renewed) renewed++;
        else skipped++;
      } catch (e: any) {
        errors.push(`${id}: ${e?.message || e}`);
      }
    }
  } catch (e: any) {
    return NextResponse.json(
      { detail: `renew_error:${e?.message || e}`, renewed, skipped, errors },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, renewed, skipped, errors });
}
