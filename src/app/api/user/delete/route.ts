import { NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/auth/getSessionUserId";
import { prisma } from "@/lib/prisma";

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

    // Cascade 설정으로 Account, Session, MobileRefreshToken도 자동 삭제됨
    // PasswordResetToken은 별도로 삭제
    if (user.email) {
      await prisma.passwordResetToken.deleteMany({
        where: { email: user.email },
      });
    }

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
