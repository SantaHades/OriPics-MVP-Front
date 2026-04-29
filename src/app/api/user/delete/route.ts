import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { prisma } from "@/lib/prisma";

export async function DELETE() {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.email) {
      return NextResponse.json(
        { code: "unauthorized", message: "인증되지 않은 요청입니다." },
        { status: 401 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
    });

    if (!user) {
      return NextResponse.json(
        { code: "user_not_found", message: "사용자를 찾을 수 없습니다." },
        { status: 404 }
      );
    }

    // Cascade 설정으로 Account, Session도 자동 삭제됨
    // PasswordResetToken은 별도로 삭제
    await prisma.passwordResetToken.deleteMany({
      where: { email: session.user.email },
    });

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
