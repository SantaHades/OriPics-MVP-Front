import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { prisma } from "@/lib/prisma";

// GET: 로그인된 사용자의 증명 히스토리 목록 조회
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ code: "unauthorized" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
    });

    if (!user) {
      return NextResponse.json({ code: "user_not_found" }, { status: 404 });
    }

    const proofs = await prisma.proofHistory.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 50, // 최대 50개
    });

    return NextResponse.json({ proofs }, { status: 200 });
  } catch (error: any) {
    console.error("[Proof History GET] Error:", error);
    return NextResponse.json({ code: "server_error" }, { status: 500 });
  }
}

// POST: 새로운 증명 기록 저장
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ code: "unauthorized" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
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
