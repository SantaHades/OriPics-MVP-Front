import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { prisma } from "@/lib/prisma";
import * as bcrypt from "bcryptjs";
import { NextResponse } from "next/server";

export async function PUT(req: Request) {
  try {
    const session = await getServerSession(authOptions);

    if (!session || !session.user) {
      return NextResponse.json({ code: "unauthorized", message: "인증이 필요합니다." }, { status: 401 });
    }

    const { name, password, currentPassword, image } = await req.json();
    const userId = (session.user as any).id;

    const updateData: any = {};
    if (name) updateData.name = name;
    if (typeof image === "string" && image.length <= 2048) updateData.image = image;

    // 비밀번호 변경 (M-4): 세션 탈취만으로 영구 계정 탈취가 되지 않도록 현재 비밀번호를
    // 재확인하고, 최소 길이 정책(가입과 동일 6자)을 강제한다.
    if (password) {
      if (typeof password !== "string" || password.length < 6) {
        return NextResponse.json(
          { code: "short_password", message: "비밀번호는 최소 6자 이상이어야 합니다." },
          { status: 400 },
        );
      }
      const dbUser = await prisma.user.findUnique({
        where: { id: userId },
        select: { password: true },
      });
      // 이미 비밀번호가 있는 계정은 현재 비밀번호 확인 필수.
      // (소셜 전용 계정은 비번이 없으므로 최초 설정 허용)
      if (dbUser?.password) {
        if (!currentPassword || typeof currentPassword !== "string") {
          return NextResponse.json(
            { code: "current_password_required", message: "현재 비밀번호를 입력해 주세요." },
            { status: 400 },
          );
        }
        const ok = await bcrypt.compare(currentPassword, dbUser.password);
        if (!ok) {
          return NextResponse.json(
            { code: "invalid_current_password", message: "현재 비밀번호가 올바르지 않습니다." },
            { status: 403 },
          );
        }
      }
      updateData.password = await bcrypt.hash(password, 10);
    }

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: updateData,
    });

    return NextResponse.json({
      message: "정보가 성공적으로 수정되었습니다.",
      user: {
        name: updatedUser.name,
        image: updatedUser.image,
      },
    }, { status: 200 });
  } catch (error: any) {
    console.error("User update error:", error);
    return NextResponse.json({ code: "server_error", message: "정보 수정 중 오류가 발생했습니다." }, { status: 500 });
  }
}
