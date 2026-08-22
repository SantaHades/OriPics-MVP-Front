const withNextIntl = require('next-intl/plugin')(
  './src/i18n/request.ts'
);

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // 모노레포 상위 lockfile 자동감지로 트레이싱 루트가 잘못 잡히는 것 방지 —
  // 이 앱 디렉터리로 고정(로컬=apps/web, subtree split 배포=리포 루트 둘 다 정확).
  outputFileTracingRoot: __dirname,
  // Next 15: experimental.serverComponentsExternalPackages → 최상위 serverExternalPackages 로 이동.
  // c2pa-node 네이티브 모듈을 서버 번들에서 제외해야 서명이 런타임에 정상 로드됨.
  serverExternalPackages: ['@contentauth/c2pa-node'],
  // Next 15: experimental.outputFileTracingIncludes → 최상위 outputFileTracingIncludes 로 이동.
  // 증명서 PDF 한글 폰트(woff)를 서버리스 함수 번들에 강제 포함 — 런타임 CDN 의존 제거.
  outputFileTracingIncludes: {
    '/api/links/[id]/certificate': [
      './node_modules/@fontsource/noto-sans-kr/files/noto-sans-kr-korean-400-normal.woff',
      './node_modules/@fontsource/noto-sans-kr/files/noto-sans-kr-korean-700-normal.woff',
    ],
  },
  // 보안 헤더 (2026-08-22 보안 점검) — HSTS는 Vercel이 이미 부여.
  // CSP는 Next 인라인 스크립트·PortOne SDK 때문에 report-only로 먼저 관측 후 강제 전환.
  async headers() {
    // Report-Only CSP (L-7): 위반을 강제 차단하지 않고 콘솔에 보고만 한다.
    // 실사용 위반을 관측해 도메인을 확정한 뒤 Content-Security-Policy(강제)로 승격.
    // frame-ancestors는 X-Frame-Options의 현대적 대체(클릭재킹 방어)도 겸한다.
    const cspReportOnly = [
      "default-src 'self'",
      // Next는 인라인/eval 스크립트를 사용 → 초기엔 완화. PortOne SDK 도메인 허용.
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.portone.io https://*.portone.io",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data:",
      "connect-src 'self' https://*.supabase.co https://*.portone.io https://api.portone.io",
      "frame-src 'self' https://*.portone.io",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'self'",
    ].join('; ');
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          // 우리가 쓰는 기능만 허용 (geolocation은 웹 촬영 제거로 불필요 — 2026-08-22)
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()' },
          { key: 'X-DNS-Prefetch-Control', value: 'on' },
          { key: 'Content-Security-Policy-Report-Only', value: cspReportOnly },
        ],
      },
      {
        // API 응답은 캐시/색인 금지
        source: '/api/:path*',
        headers: [
          { key: 'Cache-Control', value: 'no-store' },
          { key: 'X-Robots-Tag', value: 'noindex' },
        ],
      },
    ];
  },
};

module.exports = withNextIntl(nextConfig);
