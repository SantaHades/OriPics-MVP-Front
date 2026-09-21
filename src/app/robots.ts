import type { MetadataRoute } from "next";

// robots.txt (2026-09-21) — 기존에는 [locale]="robots.txt" 로 잡혀 홈 HTML을 반환했다.
// 정적 세그먼트가 동적 세그먼트보다 우선하므로 이 파일이 실제 /robots.txt 를 담당한다.
const BASE = "https://www.ori.pics";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/api/",
          // 인증·결제·개인 데이터 경로 (로케일 프리픽스 양쪽)
          "/*/profile",
          "/*/admin",
          "/*/billing",
          "/*/mailboxes",
          "/*/login",
          "/*/signup",
          "/*/forgot-password",
          "/*/reset-password",
          "/*/invite/",
          "/*/pass/checkout",
          "/*/pass/success",
        ],
      },
    ],
    sitemap: `${BASE}/sitemap.xml`,
    host: BASE,
  };
}
