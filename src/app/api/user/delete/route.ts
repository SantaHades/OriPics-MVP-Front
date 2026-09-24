import { NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/auth/getSessionUserId";
import { prisma } from "@/lib/prisma";
import { createClient } from "@supabase/supabase-js";
import { revokeSocialGrants } from "@/lib/auth/revokeSocialGrants";
import { revokeReferrerBenefitsOnRefereeDelete } from "@/lib/partner/server";

export async function DELETE() {
  try {
    // Bearer(모바일)→쿠키(웹) 공용 — 앱 내 탈퇴(2026-08-26)가 앱 세션의 계정을 삭제하도록.
    // (기존 쿠키 전용이라 앱의 웹 링크 탈퇴는 브라우저에 로그인된 다른 계정이 표시되는 문제)
    const userId = await getSessionUserId();

    if (!userId) {
      return NextResponse.json(
        { code: "unauthorized", message: "인증되지 않은 요청입니다." },
        { status: 401 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      return NextResponse.json(
        { code: "user_not_found", message: "사용자를 찾을 수 없습니다." },
        { status: 404 }
      );
    }

    // 소셜 provider 연동(grant) 서버측 철회 (2026-08-28, best-effort) — 남기면 재로그인이
    // 동의 화면 없이 자동 재가입됨. grant는 provider 계정 단위라 웹·앱 양쪽에 효과.
    const socialAccounts = await prisma.account.findMany({
      where: { userId: user.id },
      select: { provider: true, access_token: true, refresh_token: true, expires_at: true },
    });
    if (socialAccounts.length > 0) {
      await revokeSocialGrants(socialAccounts);
    }

    // Cascade 설정으로 Account, Session, MobileRefreshToken도 자동 삭제됨
    // PasswordResetToken은 별도로 삭제
    if (user.email) {
      await prisma.passwordResetToken.deleteMany({
        where: { email: user.email },
      });
    }

    // 파트너 탈퇴 파밍 방지 (2026-09-11 A-91 ⑥): 이 계정이 코드 입력으로 참여한 피추천인이면, 추천인에게 적립된
    // 미사용 할인권을 삭제 **전에** 회수(참여 30일 미만 또는 참여 후 첫 인증 없음일 때만). 삭제 후엔 referral cascade로 연결이 끊긴다.
    // 참여 원장(partner_join_ledger)은 남으므로 같은 이메일 재가입·재참여는 계속 차단된다.
    const revoked = await revokeReferrerBenefitsOnRefereeDelete(user.id);
    if (revoked > 0) console.info("[Delete User] partner benefits revoked from referrer", { userId: user.id, revoked });

    // (2026-09-26 데이터 보안 선언 정합) 탈퇴 시 본인 사진·공개링크를 파기한다 — 이전엔 links 행(FK 없음)과
    // Storage 파일이 남아 공개링크가 계속 열렸다. 예외: 사진함에 등록된 사진은 다른 참여자와 공유한 증빙이라 보존
    // (부동산사진함 5년 보관 — 처리방침 §3, 업로더 표시는 mailbox_photos.uploaded_by SET NULL로 '탈퇴한 회원').
    const purged = await purgeUserLinks(user.id);
    if (purged > 0) console.info("[Delete User] links purged", { userId: user.id, purged });

    await prisma.user.delete({
      where: { id: user.id },
    });

    return NextResponse.json(
      { code: "account_deleted", message: "회원 탈퇴가 완료되었습니다." },
      { status: 200 }
    );
  } catch (error: any) {
    console.error("[Delete User] Error:", error);
    return NextResponse.json(
      { code: "server_error", message: "회원 탈퇴 처리 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}

const BUCKET = "oripics-proofs";

/** 사진함에 속하지 않은 본인 링크의 Storage 파일(원본·경량본·썸네일·인증서 캐시)과 links 행 삭제. 실패는 로그만(탈퇴는 진행). */
async function purgeUserLinks(userId: string): Promise<number> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return 0;
  let rows: Array<{ link_id: string; storage_path: string | null; preview_path: string | null; thumb_path: string | null }> = [];
  try {
    rows = await prisma.$queryRaw`
      SELECT l.link_id, l.storage_path, l.preview_path, l.thumb_path
      FROM public.links l
      WHERE l.user_id = ${userId}
        AND NOT EXISTS (SELECT 1 FROM public.mailbox_photos mp WHERE mp.link_id = l.link_id)`;
  } catch (e: any) {
    console.error("[Delete User] link query failed:", e?.message ?? e);
    return 0;
  }
  if (rows.length === 0) return 0;
  const supabase = createClient(url, key);
  for (let i = 0; i < rows.length; i += 100) {
    const chunk = rows.slice(i, i + 100);
    const paths: string[] = [];
    for (const r of chunk) {
      if (r.storage_path) paths.push(r.storage_path);
      if (r.preview_path) paths.push(r.preview_path);
      if (r.thumb_path) paths.push(r.thumb_path);
      paths.push(`certificates/${r.link_id}.pdf`);
    }
    const { error: rmErr } = await supabase.storage.from(BUCKET).remove(paths);
    if (rmErr) console.error("[Delete User] storage remove failed:", rmErr.message);
    const { error: delErr } = await supabase.from("links").delete().in("link_id", chunk.map((r) => r.link_id));
    if (delErr) console.error("[Delete User] links delete failed:", delErr.message);
  }
  return rows.length;
}
