// 사진함 패스 지갑 (A-108) — GET /api/photobox/wallet → { unusedPasses, reservedPasses, coupons }
// 앱 설정 탭 패스 카드·개설/수락 화면의 결제 수단 표시용. 가격·구매 링크는 앱에 내려주지 않는다(3.1.1).
import { NextResponse } from "next/server";

import { getSessionUserId } from "@/lib/auth/getSessionUserId";
import { photoboxWallet } from "@/lib/photobox/pass";

export const dynamic = "force-dynamic";

export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ detail: "unauthenticated" }, { status: 401 });
  return NextResponse.json({ wallet: await photoboxWallet(userId) });
}
