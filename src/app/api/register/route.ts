import { prisma } from "@/lib/prisma";
import * as bcrypt from "bcryptjs";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const { email, password, name, verificationCode } = await req.json();

    if (!email || !password) {
      return NextResponse.json(
        { code: "missing_fields", message: "이메일과 비밀번호를 모두 입력해 주세요." },
        { status: 400 }
      );
    }

    // 이메일 형식 검증
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { code: "invalid_email", message: "유효하지 않은 이메일 형식입니다." },
        { status: 400 }
      );
    }

    // 비밀번호 최소 길이 검증
    if (password.length < 6) {
      return NextResponse.json(
        { code: "short_password", message: "비밀번호는 최소 6자 이상이어야 합니다." },
        { status: 400 }
      );
    }

    // 이메일 인증 코드 검증
    if (!verificationCode) {
      return NextResponse.json(
        { code: "missing_code", message: "이메일 인증 코드를 입력해 주세요." },
        { status: 400 }
      );
    }

    const verificationToken = await prisma.verificationToken.findFirst({
      where: { identifier: email, token: verificationCode },
    });

    if (!verificationToken) {
      return NextResponse.json(
        { code: "invalid_code", message: "인증 코드가 올바르지 않습니다." },
        { status: 400 }
      );
    }

    if (verificationToken.expires < new Date()) {
      await prisma.verificationToken.deleteMany({ where: { identifier: email } });
      return NextResponse.json(
        { code: "expired_code", message: "인증 코드가 만료되었습니다. 다시 발송해 주세요." },
        { status: 400 }
      );
    }

    // 인증 성공 시 토큰 삭제
    await prisma.verificationToken.deleteMany({ where: { identifier: email } });

    // 1. 사용자 존재 여부 확인
    const existingUser = await prisma.user.findUnique({
      where: { email },
    }).catch(err => {
      console.error("DB 조회 에러:", err);
      throw new Error(`데이터베이스 연결 실패: ${err.message}`);
    });

    if (existingUser) {
      return NextResponse.json(
        { code: "email_exists", message: "이미 가입된 이메일입니다." },
        { status: 400 }
      );
    }

    // 2. 비밀번호 암호화
    const hashedPassword = await bcrypt.hash(password, 10);

    // 3. 사용자 생성
    const user = await prisma.user.create({
      data: {
        email,
        name,
        password: hashedPassword,
      },
    });

    return NextResponse.json(
      { code: "success", message: "Registration complete.", user: { email: user.email, name: user.name } },
      { status: 201 }
    );
  } catch (error: any) {
    console.error("Registration error details:", error);
    return NextResponse.json(
      { 
        code: "server_error",
        message: "Internal server error during registration.", 
      },
      { status: 500 }
    );
  }
}
