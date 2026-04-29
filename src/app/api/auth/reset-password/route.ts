import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

export async function POST(req: NextRequest) {
  try {
    const { token, password } = await req.json();

    if (!token || !password) {
      return NextResponse.json({ code: "missing_fields", message: "필수 정보가 누락되었습니다." }, { status: 400 });
    }

    const resetToken = await prisma.passwordResetToken.findUnique({
      where: { token },
    });

    if (!resetToken) {
      return NextResponse.json({ code: "invalid_token", message: "유효하지 않은 토큰입니다." }, { status: 400 });
    }

    if (resetToken.expires < new Date()) {
      // 만료된 토큰 삭제
      await prisma.passwordResetToken.delete({
        where: { id: resetToken.id },
      });
      return NextResponse.json({ code: "expired_token", message: "만료된 토큰입니다." }, { status: 400 });
    }

    const user = await prisma.user.findUnique({
      where: { email: resetToken.email },
    });

    if (!user) {
      return NextResponse.json({ code: "user_not_found", message: "사용자를 찾을 수 없습니다." }, { status: 404 });
    }

    // 비밀번호 해싱
    const hashedPassword = await bcrypt.hash(password, 10);

    // 비밀번호 업데이트
    await prisma.user.update({
      where: { id: user.id },
      data: { password: hashedPassword },
    });

    // 토큰 삭제 (일회용)
    await prisma.passwordResetToken.delete({
      where: { id: resetToken.id },
    });

    return NextResponse.json({ code: "password_changed", message: "비밀번호가 성공적으로 변경되었습니다." }, { status: 200 });
  } catch (error: any) {
    console.error("Reset password error:", error);
    return NextResponse.json({ code: "server_error", message: "서버 오류가 발생했습니다." }, { status: 500 });
  }
}
