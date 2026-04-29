import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({ status: "ok", message: "API 시스템이 정상 작동 중입니다." });
}
