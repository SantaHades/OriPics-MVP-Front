import type { MetadataRoute } from "next";
import { locales } from "@/navigation";

// 사이트맵 (2026-09-21) — Search Console 제출용.
// localePrefix='always' 이므로 모든 URL은 /ko/* · /en/* 형태다.
// 정적 세그먼트 라우트라 [locale] 동적 세그먼트보다 우선 매칭된다
// (기존에는 /sitemap.xml 이 [locale]="sitemap.xml" 로 잡혀 홈 HTML을 반환했음).
const BASE = "https://www.ori.pics";

/** 색인 대상 = 마케팅·정책 등 공개 고정 페이지만. 인증/결제/사용자 데이터 경로는 제외 */
const PUBLIC_PATHS: { path: string; priority: number; changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"] }[] = [
  { path: "", priority: 1.0, changeFrequency: "weekly" },
  { path: "/how-it-works", priority: 0.8, changeFrequency: "monthly" },
  { path: "/use-cases", priority: 0.8, changeFrequency: "monthly" },
  { path: "/for/construction", priority: 0.7, changeFrequency: "monthly" },
  { path: "/for/rental", priority: 0.7, changeFrequency: "monthly" },
  { path: "/for/rental-fleet", priority: 0.7, changeFrequency: "monthly" },
  { path: "/pass", priority: 0.7, changeFrequency: "monthly" },
  { path: "/partner", priority: 0.6, changeFrequency: "monthly" },
  { path: "/events", priority: 0.6, changeFrequency: "weekly" },
  { path: "/terms", priority: 0.3, changeFrequency: "yearly" },
  { path: "/privacy", priority: 0.3, changeFrequency: "yearly" },
  { path: "/refund", priority: 0.3, changeFrequency: "yearly" },
];

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();

  return PUBLIC_PATHS.flatMap(({ path, priority, changeFrequency }) =>
    locales.map((locale) => ({
      url: `${BASE}/${locale}${path}`,
      lastModified,
      changeFrequency,
      priority,
      // hreflang — 같은 문서의 언어 대안을 명시해 ko/en 중복 콘텐츠 판정을 피한다
      alternates: {
        languages: {
          ...Object.fromEntries(locales.map((l) => [l, `${BASE}/${l}${path}`])),
          // x-default — 홈은 언어 자동 선택 루트(/), 하위 페이지는 기본 언어(en) (2026-09-24, middleware Link 헤더와 동일)
          "x-default": path ? `${BASE}/en${path}` : `${BASE}/`,
        },
      },
    })),
  );
}
