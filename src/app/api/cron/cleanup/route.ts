import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY!;
const CRON_SECRET = process.env.CRON_SECRET || "";
const BUCKET_NAME = "oripics-proofs";
const RETENTION_DAYS = 7;

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  // Vercel Cron은 Authorization: Bearer <CRON_SECRET> 헤더로 호출
  if (CRON_SECRET) {
    const auth = req.headers.get("authorization") || "";
    if (auth !== `Bearer ${CRON_SECRET}`) {
      return NextResponse.json({ detail: "unauthorized" }, { status: 401 });
    }
  }
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return NextResponse.json({ detail: "server_misconfigured" }, { status: 500 });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);

  let scanned = 0;
  let removed = 0;
  const errors: string[] = [];

  try {
    const { data: folders, error: listFoldersErr } = await supabase.storage
      .from(BUCKET_NAME)
      .list();
    if (listFoldersErr) throw listFoldersErr;

    for (const folder of folders || []) {
      const folderName = folder.name;
      if (!folderName) continue;

      const { data: files, error: listFilesErr } = await supabase.storage
        .from(BUCKET_NAME)
        .list(folderName);
      if (listFilesErr) {
        errors.push(`list ${folderName}: ${listFilesErr.message}`);
        continue;
      }

      const stalePaths: string[] = [];
      const staleLinkIds: string[] = [];
      for (const f of files || []) {
        scanned++;
        const created = (f as any).created_at;
        if (!created) continue;
        const createdAt = new Date(created);
        if (isNaN(createdAt.getTime()) || createdAt >= cutoff) continue;
        stalePaths.push(`${folderName}/${f.name}`);
        staleLinkIds.push(f.name.replace(/\.png$/, ""));
      }

      if (stalePaths.length === 0) continue;

      const { error: removeErr } = await supabase.storage.from(BUCKET_NAME).remove(stalePaths);
      if (removeErr) {
        errors.push(`remove ${folderName}: ${removeErr.message}`);
        continue;
      }

      const { error: dbErr } = await supabase
        .from("links")
        .delete()
        .in("link_id", staleLinkIds);
      if (dbErr) errors.push(`db ${folderName}: ${dbErr.message}`);

      removed += stalePaths.length;
    }
  } catch (e: any) {
    return NextResponse.json(
      { detail: `cleanup_error:${e?.message || e}`, scanned, removed, errors },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, scanned, removed, errors });
}
