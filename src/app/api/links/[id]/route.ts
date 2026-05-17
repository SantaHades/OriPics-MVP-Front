import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { prisma } from "@/lib/prisma";
import { verifyLinkId } from "@/lib/oripics-stamp/common";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY!;
const BUCKET_NAME = "oripics-proofs";

export const runtime = "nodejs";

/**
 * DELETE /api/links/[id] — 본인 owned link 삭제 (2026-05-17 신설)
 *
 * 삭제 대상:
 *   - Supabase links row
 *   - Supabase Storage 원본 PNG
 *   - Supabase Storage PDF 캐시 (있으면)
 *   - Prisma ProofHistory row
 *
 * 환불: 없음. 사용자 자의로 공개 취소한 것이므로.
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return NextResponse.json({ detail: "supabase_not_configured" }, { status: 500 });
  }

  const session = await getServerSession(authOptions);
  const userId = (session?.user as any)?.id;
  if (!userId) {
    return NextResponse.json({ detail: "unauthenticated" }, { status: 401 });
  }

  const linkId = params.id;
  if (!linkId || !verifyLinkId(linkId)) {
    return NextResponse.json({ detail: "invalid_link_id" }, { status: 400 });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  // 1. 소유권 확인
  const { data: row, error: fetchErr } = await supabase
    .from("links")
    .select("link_id, storage_path, user_id")
    .eq("link_id", linkId)
    .single();
  if (fetchErr || !row) {
    return NextResponse.json({ detail: "link_not_found" }, { status: 404 });
  }
  if (row.user_id !== userId) {
    return NextResponse.json({ detail: "not_owner" }, { status: 403 });
  }

  // 2. ProofHistory에서 pdfStoragePath 조회 (PDF 캐시 삭제용)
  const history = await prisma.proofHistory.findUnique({
    where: { linkId },
    select: { pdfStoragePath: true },
  });

  // 3. Storage 파일 삭제 (원본 + PDF 캐시)
  const pathsToRemove = [row.storage_path];
  if (history?.pdfStoragePath) {
    pathsToRemove.push(history.pdfStoragePath);
  }
  const { error: storageErr } = await supabase.storage
    .from(BUCKET_NAME)
    .remove(pathsToRemove);
  if (storageErr) {
    // 파일 없어도 진행 — DB만 정리하면 사용자 입장에서 삭제 완료
    console.warn(`[delete] storage remove warning link_id=${linkId}:`, storageErr.message);
  }

  // 4. links row 삭제
  const { error: dbErr } = await supabase
    .from("links")
    .delete()
    .eq("link_id", linkId);
  if (dbErr) {
    console.error(`[delete] db delete failed link_id=${linkId}:`, dbErr.message);
    return NextResponse.json({ detail: `db_error:${dbErr.message}` }, { status: 500 });
  }

  // 5. ProofHistory 삭제
  try {
    await prisma.proofHistory.delete({ where: { linkId } });
  } catch (e: any) {
    if (!String(e?.message || "").includes("Record to delete does not exist")) {
      console.warn(`[delete] ProofHistory delete warning link_id=${linkId}:`, e?.message || e);
    }
  }

  console.log(`[delete] ok link_id=${linkId} user=${userId}`);
  return NextResponse.json({ ok: true, link_id: linkId });
}
