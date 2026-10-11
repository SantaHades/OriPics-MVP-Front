import { redirect } from "next/navigation";

// /check (전략 문서의 '사진 검사' 이름) → /verify 하나로 통합 (2026-10-01 검증 레이어 2단계)
export default async function CheckPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  redirect(`/${locale}/verify`);
}
