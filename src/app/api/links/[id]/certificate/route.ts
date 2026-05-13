import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { createClient } from "@supabase/supabase-js";
import QRCode from "qrcode";
import { renderToBuffer } from "@react-pdf/renderer";
import React from "react";
import { prisma } from "@/lib/prisma";
import { verifyLinkId } from "@/lib/oripics-stamp/common";
import { readC2paManifest } from "@/lib/oripics-stamp/c2pa";
import {
  CertificateDocument,
  type CertificateData,
} from "@/lib/certificate/render";

export const runtime = "nodejs";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const BUCKET_NAME = "oripics-proofs";

// 메타 timestamp 디코드: prefix(F/P/C) + YYMMDDHHMMSScs(=14자리) → Date
function parseMetaTimestamp(ts: string): Date | null {
  const cleanTs = isNaN(parseInt(ts[0])) ? ts.substring(1) : ts;
  if (cleanTs.length !== 14) return null;
  try {
    const year = parseInt("20" + cleanTs.substring(0, 2), 10);
    const month = parseInt(cleanTs.substring(2, 4), 10) - 1;
    const day = parseInt(cleanTs.substring(4, 6), 10);
    const hour = parseInt(cleanTs.substring(6, 8), 10);
    const minute = parseInt(cleanTs.substring(8, 10), 10);
    const second = parseInt(cleanTs.substring(10, 12), 10);
    const ms = parseInt(cleanTs.substring(12, 14), 10) * 10;
    return new Date(Date.UTC(year, month, day, hour, minute, second, ms));
  } catch {
    return null;
  }
}

function getSourceCode(ts: string): "F" | "P" | "C" {
  const first = ts[0];
  if (first === "P" || first === "C") return first;
  return "F";
}

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as any)?.id;
  if (!userId) {
    return NextResponse.json({ detail: "unauthenticated" }, { status: 401 });
  }

  const linkId = params.id;
  if (!linkId || !verifyLinkId(linkId)) {
    return NextResponse.json({ detail: "invalid_link_id" }, { status: 400 });
  }

  const url = new URL(req.url);
  const localeParam = url.searchParams.get("locale");
  const locale: "ko" | "en" = localeParam === "en" ? "en" : "ko";

  if (!SUPABASE_SERVICE_KEY || !SUPABASE_URL) {
    return NextResponse.json({ detail: "supabase_not_configured" }, { status: 500 });
  }

  // 1. 사용자 티어 확인 — Pro/Business만 발급 가능
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, name: true, tier: true },
  });
  if (!user) {
    return NextResponse.json({ detail: "user_not_found" }, { status: 404 });
  }
  if (user.tier !== "pro" && user.tier !== "business") {
    return NextResponse.json(
      { detail: "tier_required", required: "pro" },
      { status: 403 },
    );
  }

  // 2. 링크 조회 + 소유자 검증
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const { data: row, error } = await supabase
    .from("links")
    .select("link_id, timestamp, width, height, lat, lng, storage_path, user_id")
    .eq("link_id", linkId)
    .single();
  if (error || !row) {
    return NextResponse.json({ detail: "link_not_found" }, { status: 404 });
  }
  if (row.user_id && row.user_id !== userId) {
    // 본인이 생성한 링크에 대해서만 PDF 발급 허용
    return NextResponse.json({ detail: "not_owner" }, { status: 403 });
  }

  // 3. C2PA 매니페스트 best-effort 조회
  let c2paSummary: CertificateData["c2pa"] | undefined;
  try {
    const { data: blob } = await supabase.storage
      .from(BUCKET_NAME)
      .download(row.storage_path);
    if (blob) {
      const buf = Buffer.from(await blob.arrayBuffer());
      const result = await readC2paManifest(buf);
      if (result.present) {
        const valid =
          result.valid &&
          !result.validation_status.some((s) =>
            s.code?.startsWith("assertion.") || s.code?.startsWith("signing"),
          );
        c2paSummary = {
          present: true,
          valid,
          issuer: result.signature?.issuer,
          claimGenerator: result.claim_generator,
        };
      } else {
        c2paSummary = { present: false };
      }
    }
  } catch {
    // 매니페스트 조회 실패는 무시 (PDF는 정상 발급)
  }

  // 4. QR 생성 — 검증 URL을 PNG data URL로
  const verifyUrl = `https://www.ori.pics/${linkId}`;
  const qrDataUrl = await QRCode.toDataURL(verifyUrl, {
    errorCorrectionLevel: "M",
    margin: 1,
    width: 240,
    color: { dark: "#0f172a", light: "#ffffff" },
  });

  // 5. PDF 렌더링
  const capturedAt = parseMetaTimestamp(row.timestamp) ?? new Date();
  const certData: CertificateData = {
    linkId: row.link_id,
    capturedAt,
    sourceCode: getSourceCode(row.timestamp),
    width: row.width,
    height: row.height,
    lat: row.lat ?? null,
    lng: row.lng ?? null,
    issuedTo: user.name || user.email || userId,
    issuedAt: new Date(),
    verifyUrl,
    qrDataUrl,
    c2pa: c2paSummary,
  };

  let pdfBuffer: Buffer;
  try {
    const element = React.createElement(CertificateDocument as any, {
      data: certData,
      locale,
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    pdfBuffer = await renderToBuffer(element as any);
  } catch (e: any) {
    console.error("[certificate] render failed", e);
    return NextResponse.json(
      { detail: `render_failed:${e?.message ?? "unknown"}` },
      { status: 500 },
    );
  }

  // 6. 발급 이력 기록 (best-effort, 실패해도 PDF 응답은 진행)
  try {
    const u = await prisma.user.findUnique({
      where: { id: userId },
      select: { credits: true },
    });
    await prisma.creditTransaction.create({
      data: {
        userId,
        delta: 0,
        action: "pdf_issue",
        balanceAfter: u?.credits ?? 0,
        metadata: { linkId, locale } as any,
      },
    });
  } catch (e) {
    console.warn("[certificate] failed to record pdf_issue transaction", e);
  }

  const filename = `OriPics_Certificate_${linkId}.pdf`;
  return new NextResponse(new Uint8Array(pdfBuffer), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
