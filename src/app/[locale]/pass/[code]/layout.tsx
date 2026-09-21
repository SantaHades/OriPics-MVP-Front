import type { Metadata } from "next";

// 패스 코드 랜딩은 URL 자체가 등록 가능한 코드다(어드민 발급분은 누구나 등록 가능).
// 검색에 색인되면 코드가 조회 가능한 채널이 되므로 색인을 차단한다. (2026-09-21)
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function PassCodeLayout({ children }: { children: React.ReactNode }) {
  return children;
}
