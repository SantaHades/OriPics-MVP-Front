const withNextIntl = require('next-intl/plugin')(
  './src/i18n/request.ts'
);

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    serverComponentsExternalPackages: ['@contentauth/c2pa-node'],
    // 증명서 PDF 한글 폰트(woff)를 서버리스 함수 번들에 강제 포함 — 런타임 CDN 의존 제거.
    outputFileTracingIncludes: {
      '/api/links/[id]/certificate': [
        './node_modules/@fontsource/noto-sans-kr/files/noto-sans-kr-korean-400-normal.woff',
        './node_modules/@fontsource/noto-sans-kr/files/noto-sans-kr-korean-700-normal.woff',
      ],
    },
  },
};

module.exports = withNextIntl(nextConfig);
