import { NextRequest, NextResponse } from "next/server";
import { runDailyBatch } from "@/lib/ledger/server";
import { assertCron } from "@/lib/security/cron";

// 해시 원장 일일 머클 배치 + TSA (2026-10-01) — vercel.json "10 15 * * *" (= 00:10 KST)
// 전날(KST)까지의 미배치 인증을 일자별 머클 루트로 묶고 루트를 SSL.com TSA로 타임스탬프한다.
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const denied = assertCron(req);
  if (denied) return denied;
  try {
    const result = await runDailyBatch();
    console.log("[cron/ledger-batch]", JSON.stringify(result));
    return NextResponse.json(result, { status: result.tsaErrors.length ? 207 : 200 });
  } catch (e: any) {
    console.error("[cron/ledger-batch] failed:", e?.message || e);
    return NextResponse.json({ detail: `ledger_batch_error:${e?.message || e}` }, { status: 500 });
  }
}
