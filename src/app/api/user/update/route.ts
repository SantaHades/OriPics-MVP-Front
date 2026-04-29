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

    const { name, password, image } = await req.json();
    const userId = (session.user as any).id;

    const updateData: any = {};
    if (name) updateData.name = name;
    if (image) updateData.image = image;
    
    // 비밀번호가 입력된 경우 해싱하여 추가
    if (password) {
      const hashedPassword = await bcrypt.hash(password, 10);
      updateData.password = hashedPassword;
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
