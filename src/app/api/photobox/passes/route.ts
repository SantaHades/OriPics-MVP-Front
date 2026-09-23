// GET /api/photobox/passes — 내 사진함 패스 목록(코드·상태·환불 가능 여부). 웹 전용 화면에서 사용.
import { NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/auth/getSessionUserId";
import { listMyPhotoboxPasses } from "@/lib/photobox/purchase";
import { photoboxWallet } from "@/lib/photobox/pass";

export const dynamic = "force-dynamic";

export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ detail: "unauthenticated" }, { status: 401 });
  const [passes, wallet] = await Promise.all([listMyPhotoboxPasses(userId), photoboxWallet(userId)]);
  return NextResponse.json({ passes, wallet });
}
