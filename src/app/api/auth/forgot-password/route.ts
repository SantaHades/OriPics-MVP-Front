import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import nodemailer from "nodemailer";
import crypto from "crypto";

const prisma = new PrismaClient();

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const rawEmail = body.email;
    const email = rawEmail ? rawEmail.trim().toLowerCase() : "";
    const locale = body.locale || "ko";

    console.log(`[Forgot Password] Request received for email: "${email}" (raw: "${rawEmail}")`);

    if (!email) {
      console.log("[Forgot Password] Error: No email provided");
      return NextResponse.json({ code: "missing_email", message: "이메일을 입력해주세요." }, { status: 400 });
    }

    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      console.log(`[Forgot Password] User not found for email: ${email}`);
      // 디버깅을 위해 가입되지 않은 이메일인 경우 명시적으로 에러 반환
      return NextResponse.json({ code: "user_not_found", message: "가입되지 않은 이메일입니다." }, { status: 404 });
    }

    console.log(`[Forgot Password] User found. Generating token...`);

    // Generate token
    const token = crypto.randomBytes(32).toString("hex");
    const expires = new Date(Date.now() + 3600000); // 1 hour

    // Delete existing token if any
    await prisma.passwordResetToken.deleteMany({
      where: { email },
    });

    // Save token
    await prisma.passwordResetToken.create({
      data: {
        email,
        token,
        expires,
      },
    });

    // Send Email
    const transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true, // Use SSL
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASSWORD,
      },
    });

    const resetLink = `${process.env.NEXTAUTH_URL}/${locale}/reset-password?token=${token}`;

    const subject = locale === "en" ? "OriPics - Password Reset Link" : "OriPics - 비밀번호 재설정 링크";
    const title = locale === "en" ? "Reset Password" : "비밀번호 재설정";
    const greeting = locale === "en" ? "Hello," : "안녕하세요,";
    const bodyText = locale === "en" 
      ? "We received a request to reset your password. Please click the button below to reset your password." 
      : "비밀번호 재설정 요청을 받았습니다. 아래 버튼을 클릭하여 비밀번호를 재설정해 주세요.";
    const btnText = locale === "en" ? "Reset Password" : "비밀번호 재설정";
    const footerText = locale === "en" 
      ? "This link is valid for 1 hour. If you didn't request this, please ignore this email." 
      : "이 링크는 1시간 동안만 유효합니다. 만약 본인이 요청하지 않으셨다면 이 메일을 무시해 주세요.";

    const mailOptions = {
      from: `"OriPics Support" <${process.env.SMTP_FROM || process.env.SMTP_USER}>`,
      to: email,
      subject: subject,
      html: `
        <div style="font-family: sans-serif; max-w: 600px; margin: 0 auto;">
          <h2>${title}</h2>
          <p>${greeting}</p>
          <p>${bodyText}</p>
          <div style="margin: 30px 0;">
            <a href="${resetLink}" style="background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: bold;">${btnText}</a>
          </div>
          <p style="font-size: 12px; color: #666;">${footerText}</p>
        </div>
      `,
    };

    try {
      console.log(`[Forgot Password] Sending email via ${process.env.SMTP_USER}...`);
      await transporter.sendMail(mailOptions);
      console.log(`[Forgot Password] Email successfully sent to ${email}`);
    } catch (mailError) {
      console.error("[Forgot Password] Email send error:", mailError);
      return NextResponse.json({ code: "smtp_error", message: "이메일 발송에 실패했습니다." }, { status: 500 });
    }

    return NextResponse.json({ code: "email_sent", message: "비밀번호 재설정 이메일이 발송되었습니다." }, { status: 200 });
  } catch (error: any) {
    console.error("[Forgot Password] Server error:", error);
    return NextResponse.json({ code: "server_error", message: "서버 오류가 발생했습니다." }, { status: 500 });
  }
}
