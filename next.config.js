const withNextIntl = require('next-intl/plugin')(
  './src/i18n/request.ts'
);

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async rewrites() {
    // API_URL 또는 NEXT_PUBLIC_BACKEND_URL 중 하나를 사용
    let rawUrl = process.env.API_URL || process.env.NEXT_PUBLIC_BACKEND_URL || 'http://127.0.0.1:8000';
    
    // http:// 또는 https://가 없으면 붙여줌 (Vercel 에러 방지)
    if (rawUrl && !rawUrl.startsWith('http')) {
      rawUrl = `https://${rawUrl}`;
    }
    
    // 트레일링 슬래시 제거
    const BACKEND_URL = rawUrl.replace(/\/$/, '');
    
    return [
      {
        source: '/api/process',
        destination: `${BACKEND_URL}/api/process` 
      },
      {
        source: '/api/links/:path*',
        destination: `${BACKEND_URL}/api/links/:path*` 
      }
    ]
  }
};



module.exports = withNextIntl(nextConfig);
