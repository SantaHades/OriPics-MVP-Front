import { NextRequest, NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/auth/getSessionUserId";
import { prisma } from "@/lib/prisma";

// GET: 로그인된 사용자의 증명 히스토리 목록 조회
// ?cursor=<id>: 해당 항목 이후(더 오래된) 페이지 — "더 보기" 페이지네이션 (2026-08-21)
export async function GET(req: NextRequest) {
  try {
    const userId = await getSessionUserId();
    if (!userId) {
      return NextResponse.json({ code: "unauthorized" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      return NextResponse.json({ code: "user_not_found" }, { status: 404 });
    }

    const cursor = req.nextUrl.searchParams.get("cursor");
    const PAGE = 20; // 그리드 썸네일 로딩 고려 (2026-08-21: 50→20, "더 보기"로 이어서)
    const proofs = await prisma.proofHistory.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: PAGE,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: {
        id: true,
        linkId: true,
        thumbnail: true,
        width: true,
        height: true,
        timestamp: true,
        createdAt: true,
        pdfStoragePath: true,
        pdfIssuedAt: true,
      },
    });

    // pdfStoragePath는 클라가 직접 접근하지 않음(존재 여부만 노출). PDF 다운로드는 /certificate 엔드포인트 경유.
    const safeProofs = proofs.map((p) => ({
      ...p,
      pdfIssued: !!p.pdfStoragePath,
      pdfStoragePath: undefined,
    }));

    const nextCursor = proofs.length === PAGE ? proofs[proofs.length - 1].id : null;
    return NextResponse.json({ proofs: safeProofs, nextCursor }, { status: 200 });
  } catch (error: any) {
    console.error("[Proof History GET] Error:", error);
    return NextResponse.json({ code: "server_error" }, { status: 500 });
  }
}

// POST: 새로운 증명 기록 저장
export async function POST(req: NextRequest) {
  try {
    const userId = await getSessionUserId();
    if (!userId) {
      return NextResponse.json({ code: "unauthorized" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      return NextResponse.json({ code: "user_not_found" }, { status: 404 });
    }

    const { linkId, thumbnail, width, height, timestamp } = await req.json();

    if (!linkId || !width || !height || !timestamp) {
      return NextResponse.json({ code: "missing_fields" }, { status: 400 });
    }

    // 중복 방지
    const existing = await prisma.proofHistory.findUnique({
      where: { linkId },
    });

    if (existing) {
      return NextResponse.json({ code: "already_exists" }, { status: 409 });
    }

    const proof = await prisma.proofHistory.create({
      data: {
        userId: user.id,
        linkId,
        thumbnail: thumbnail || null,
        width,
        height,
        timestamp,
      },
    });

    return NextResponse.json({ proof }, { status: 201 });
  } catch (error: any) {
    console.error("[Proof History POST] Error:", error);
    return NextResponse.json({ code: "server_error" }, { status: 500 });
  }
}
