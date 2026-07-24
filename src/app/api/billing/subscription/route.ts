import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

/**
 * 구독 관리 (프로필 결제 관리 섹션).
 *
 * GET  — 현재 사용자 구독 상태 조회.
 * POST — { action: "cancel" }  일반해지 예약: cancelAtPeriodEnd=true.
 *          기간말까지 이용 유지, 다음 결제부터 청구 중단 (약관 제11조 제5항 일반해지).
 *        { action: "resume" }  해지 예약 취소: 기간 만료 전이면 구독 재개.
 *
 * 중도해지(즉시 종료 + 잔여 환불, 약관 제11조 제5항)는 환불 산정·PG 취소가 필요해
 * 1차에서는 이메일 접수(CS 수동)로 처리한다 — UI에서 안내.
 */

export async function GET() {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as any)?.id;
  if (!userId) {
    return NextResponse.json({ detail: "unauthenticated" }, { status: 401 });
  }

  const sub = await prisma.subscription.findUnique({
    where: { userId },
    select: {
      plan: true,
      status: true,
      currentPeriodStart: true,
      currentPeriodEnd: true,
      cancelAtPeriodEnd: true,
      canceledAt: true,
    },
  });

  return NextResponse.json({ subscription: sub });
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as any)?.id;
  if (!userId) {
    return NextResponse.json({ detail: "unauthenticated" }, { status: 401 });
  }

  let action: string | undefined;
  try {
    const body = await req.json();
    action = body?.action;
  } catch {
    /* fallthrough */
  }
  if (action !== "cancel" && action !== "resume") {
    return NextResponse.json({ detail: "invalid_action" }, { status: 400 });
  }

  const sub = await prisma.subscription.findUnique({ where: { userId } });
  if (!sub || sub.status !== "active") {
    return NextResponse.json({ detail: "no_active_subscription" }, { status: 404 });
  }

  if (action === "cancel") {
    if (sub.cancelAtPeriodEnd) {
      return NextResponse.json({ ok: true, alreadyCanceled: true });
    }
    await prisma.subscription.update({
      where: { userId },
      data: { cancelAtPeriodEnd: true, canceledAt: new Date() },
    });
    return NextResponse.json({ ok: true, effectiveAt: sub.currentPeriodEnd });
  }

  // resume — 기간이 아직 남아 있을 때만 재개 가능
  if (sub.currentPeriodEnd <= new Date()) {
    return NextResponse.json({ detail: "period_expired" }, { status: 409 });
  }
  await prisma.subscription.update({
    where: { userId },
    data: { cancelAtPeriodEnd: false, canceledAt: null },
  });
  return NextResponse.json({ ok: true });
}
