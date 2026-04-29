import { NextRequest, NextResponse } from 'next/server';
import createMiddleware from 'next-intl/middleware';

const locales = ['en', 'ko'];

const intlMiddleware = createMiddleware({
  locales,
  defaultLocale: 'en',
  localeDetection: true
});

export default function middleware(request: NextRequest) {
  const hostname = request.headers.get('host');
  const { pathname } = request.nextUrl;

  // WWW 리다이렉트 (ori.pics -> www.ori.pics)
  // 실배포 환경에서 ori.pics로 접속한 경우에만 동작
  if (hostname === 'ori.pics') {
    const url = request.nextUrl.clone();
    url.protocol = 'https';
    url.hostname = 'www.ori.pics';
    return NextResponse.redirect(url, 301);
  }

  // 최초 로딩시(루트 경로 접속 시) 브라우저 언어 설정을 확인하여 리다이렉트
  if (pathname === '/') {
    const acceptLanguage = request.headers.get('accept-language') || '';
    // 브라우저 설정에 'ko'가 포함되어 있으면 한국어로, 아니면 영어로 지정
    const preferredLocale = acceptLanguage.toLowerCase().includes('ko') ? 'ko' : 'en';
    
    return NextResponse.redirect(new URL(`/${preferredLocale}`, request.url));
  }

  return intlMiddleware(request);
}

export const config = {
  // Match all pathnames except for
  // - API routes
  // - _next (static files, etc.)
  // - _vercel (Vercel specific files)
  // - all files in the public folder (e.g. favicon.ico)
  matcher: ['/((?!api|_next|_vercel|.*\\..*).*)']
};
