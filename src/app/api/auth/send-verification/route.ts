import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import nodemailer from "nodemailer";

export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json();

    if (!email) {
      return NextResponse.json({ code: "missing_email", message: "이메일을 입력해 주세요." }, { status: 400 });
    }

    // 이메일 형식 검증
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json({ code: "invalid_email", message: "유효하지 않은 이메일 형식입니다." }, { status: 400 });
    }

    // 이미 가입된 이메일인지 확인
    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return NextResponse.json({ code: "email_exists", message: "이미 가입된 이메일입니다." }, { status: 400 });
    }

    // 6자리 인증 코드 생성
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expires = new Date(Date.now() + 10 * 60 * 1000); // 10분 유효

    // 기존 인증 코드 삭제 후 새로 생성
    await prisma.verificationToken.deleteMany({ where: { identifier: email } });
    await prisma.verificationToken.create({
      data: {
        identifier: email,
        token: code,
        expires,
      },
    });

    // 이메일 발송
    const transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASSWORD,
      },
    });

    await transporter.sendMail({
      from: `"OriPics" <${process.env.SMTP_FROM || process.env.SMTP_USER}>`,
      to: email,
      subject: "OriPics - 이메일 인증 코드 / Email Verification Code",
      html: `
        <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 32px; background: #0f172a; border-radius: 16px; color: #e2e8f0;">
          <div style="text-align: center; margin-bottom: 24px;">
            <h2 style="color: #ffffff; margin: 0;">OriPics 이메일 인증</h2>
            <p style="color: #94a3b8; font-size: 14px;">Email Verification</p>
          </div>
          <div style="background: #1e293b; border-radius: 12px; padding: 24px; text-align: center; margin-bottom: 24px;">
            <p style="color: #94a3b8; font-size: 14px; margin: 0 0 12px 0;">아래 인증 코드를 입력해 주세요.</p>
            <div style="font-size: 36px; font-weight: bold; letter-spacing: 8px; color: #60a5fa; font-family: monospace;">
              ${code}
            </div>
          </div>
          <p style="color: #64748b; font-size: 12px; text-align: center;">이 코드는 10분 동안 유효합니다. 본인이 요청하지 않았다면 이 메일을 무시하세요.</p>
        </div>
      `,
    });

    return NextResponse.json({ code: "code_sent", message: "인증 코드가 발송되었습니다." }, { status: 200 });
  } catch (error: any) {
    console.error("[Send Verification] Error:", error);
    return NextResponse.json(
      { code: "send_failed", message: "인증 코드 발송에 실패했습니다." },
      { status: 500 }
    );
  }
}
