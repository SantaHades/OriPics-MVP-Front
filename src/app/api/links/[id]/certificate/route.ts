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
import { CREDIT_COSTS } from "@/lib/payment";
import { consumeCredits, refundCredits } from "@/lib/credits/consumeCredits";
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

function certificateStoragePath(linkId: string): string {
  return `certificates/${linkId}.pdf`;
}

/**
 * GET /api/links/[id]/certificate
 *
 * 동작 (2026-05-17 갱신: PDF 캐시 도입):
 *   - 기본: 캐시가 있으면 그대로 반환 (무차감 다운로드). 없으면 발급(-10) + 캐시 저장.
 *   - ?reissue=1: 캐시 무시하고 새로 발급(-10). 캐시 덮어쓰기.
 *
 * 권한:
 *   - Pro/Business 티어 한정
 *   - 본인 소유 link만
 */
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
  const reissue = url.searchParams.get("reissue") === "1";

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
  if (row.user_id !== userId) {
    return NextResponse.json({ detail: "not_owner" }, { status: 403 });
  }

  // 3. 캐시 확인 (reissue=1이 아닐 때만)
  const history = await prisma.proofHistory.findUnique({
    where: { linkId },
    select: { pdfStoragePath: true },
  });
  if (!reissue && history?.pdfStoragePath) {
    const { data: cachedBlob, error: dlErr } = await supabase.storage
      .from(BUCKET_NAME)
      .download(history.pdfStoragePath);
    if (cachedBlob && !dlErr) {
      const buf = Buffer.from(await cachedBlob.arrayBuffer());
      const filename = `OriPics_Certificate_${linkId}.pdf`;
      return new NextResponse(new Uint8Array(buf), {
        status: 200,
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="${filename}"`,
          "Cache-Control": "no-store",
          "X-Oripics-Cached": "1",
        },
      });
    }
    // 캐시 누락 시 (Storage 삭제됨 등) → 신규 발급으로 fallback (차감 발생)
    console.warn(`[certificate] cache miss link_id=${linkId} path=${history.pdfStoragePath}`);
  }

  // 4. 크레딧 차감 (-10). 실패 시 즉시 종료.
  const consume = await consumeCredits({
    userId,
    amount: CREDIT_COSTS.CERTIFICATE_PDF,
    action: "pdf_issue",
    metadata: { link_id: linkId, locale, reissue } as any,
  });
  if (!consume.ok) {
    return NextResponse.json(
      {
        detail: "insufficient_credits",
        balance: consume.balance,
        required: CREDIT_COSTS.CERTIFICATE_PDF,
      },
      { status: 402 },
    );
  }

  // 5. C2PA 매니페스트 best-effort 조회
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
    // C2PA 조회 실패는 무시 (PDF는 정상 발급)
  }

  // 6. QR 생성
  const verifyUrl = `https://www.ori.pics/${linkId}`;
  const qrDataUrl = await QRCode.toDataURL(verifyUrl, {
    errorCorrectionLevel: "M",
    margin: 1,
    width: 240,
    color: { dark: "#0f172a", light: "#ffffff" },
  });

  // 7. PDF 렌더링
  const capturedAt = parseMetaTimestamp(row.timestamp) ?? new Date();
  const issuedAt = new Date();
  const certData: CertificateData = {
    linkId: row.link_id,
    capturedAt,
    sourceCode: getSourceCode(row.timestamp),
    width: row.width,
    height: row.height,
    lat: row.lat ?? null,
    lng: row.lng ?? null,
    issuedTo: user.name || user.email || userId,
    issuedAt,
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
    await refundCredits({
      userId,
      amount: CREDIT_COSTS.CERTIFICATE_PDF,
      action: "pdf_issue",
      metadata: { link_id: linkId, reason: `render_failed:${e?.message ?? "unknown"}` } as any,
    }).catch((rfErr) => console.warn("[certificate] refund failed:", rfErr));
    return NextResponse.json(
      { detail: `render_failed:${e?.message ?? "unknown"}` },
      { status: 500 },
    );
  }

  // 8. 캐시 저장 (best-effort) + ProofHistory 갱신
  const cachePath = certificateStoragePath(linkId);
  try {
    const { error: upErr } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(cachePath, pdfBuffer, {
        contentType: "application/pdf",
        upsert: true,
      });
    if (upErr) throw new Error(upErr.message);
    await prisma.proofHistory.update({
      where: { linkId },
      data: { pdfStoragePath: cachePath, pdfIssuedAt: issuedAt },
    }).catch((e) => {
      // ProofHistory row 없을 수도 (legacy data) → upsert로 처리
      if (String(e?.message || "").includes("Record to update not found")) {
        return prisma.proofHistory.create({
          data: {
            userId,
            linkId,
            width: row.width,
            height: row.height,
            timestamp: row.timestamp,
            pdfStoragePath: cachePath,
            pdfIssuedAt: issuedAt,
          },
        });
      }
      throw e;
    });
  } catch (e: any) {
    // 캐시 실패해도 사용자에게는 PDF 응답 — 다음 호출에 다시 시도
    console.warn(`[certificate] cache save failed link_id=${linkId}:`, e?.message || e);
  }

  const filename = `OriPics_Certificate_${linkId}.pdf`;
  return new NextResponse(new Uint8Array(pdfBuffer), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
      "X-Oripics-Cached": "0",
    },
  });
}
