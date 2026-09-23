// POST /api/photobox/claim { code } — 사진함 패스 코드를 내 지갑(보유 패스)에 등록 (A-108, 2026-09-24)
//   앱 설정 탭 '사진함 패스' 카드용. 등록한 코드는 부동산사진함 개설·초대 수락·좌석 추가에서 '보유한 사진함 패스'로 쓰인다.
//   - 어드민 발급(소유자 없음) → 호출자를 소유자로 지정
//   - 이미 내 코드 → 그대로 성공(already)
//   - 다른 계정이 구매한 코드 → not_owner (판매분은 구매 계정 전용)
//   사진함 좌석 연결(사용 시작)은 하지 않는다 — 환불(미등록 7일) 기준도 그대로 유지.
import { NextRequest, NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/auth/getSessionUserId";
import { prisma } from "@/lib/prisma";
import { checkRateLimit, tooManyRequests, RATE_LIMITS } from "@/lib/security/rateLimit";
import { normalizePhotoboxCode, photoboxWallet } from "@/lib/photobox/pass";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ detail: "unauthenticated" }, { status: 401 });
  const rl = await checkRateLimit(RATE_LIMITS.passPurchase, userId);
  if (!rl.allowed) return tooManyRequests(rl, "요청이 너무 잦습니다. 잠시 후 다시 시도해 주세요.");
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ detail: "invalid_json" }, { status: 400 });
  }
  const code = normalizePhotoboxCode(typeof body?.code === "string" ? body.code : "");
  if (!code) return NextResponse.json({ detail: "invalid_code" }, { status: 400 });

  const rows = await prisma.$queryRaw<Array<{ id: string; status: string; purchaser_id: string | null; payment_id: string | null; code_expires_at: Date }>>`
    SELECT id, status, purchaser_id, payment_id, code_expires_at FROM public.photobox_passes WHERE code = ${code} LIMIT 1`;
  const p = rows[0];
  if (!p) return NextResponse.json({ detail: "invalid_code" }, { status: 404 });
  if (p.status === "revoked" || p.status === "refunded") return NextResponse.json({ detail: "code_revoked" }, { status: 409 });
  if (p.purchaser_id && p.purchaser_id !== userId) return NextResponse.json({ detail: "not_owner" }, { status: 403 });
  if (p.status !== "issued") return NextResponse.json({ detail: "code_already_used" }, { status: 409 });
  if (new Date(p.code_expires_at) <= new Date()) return NextResponse.json({ detail: "code_expired" }, { status: 409 });

  const already = p.purchaser_id === userId;
  if (!already) {
    const n = await prisma.$executeRaw`
      UPDATE public.photobox_passes SET purchaser_id = ${userId}, updated_at = now()
      WHERE id = ${p.id} AND purchaser_id IS NULL AND payment_id IS NULL AND status = 'issued'`;
    if (n !== 1) return NextResponse.json({ detail: "code_already_used" }, { status: 409 });
    console.log(`[photobox] claim code=${code} user=${userId}`);
  }
  return NextResponse.json({ ok: true, already, wallet: await photoboxWallet(userId) });
}
