import { NextRequest, NextResponse } from 'next/server';
import createMiddleware from 'next-intl/middleware';

const locales = ['en', 'ko'];

/** 정식 호스트 — apex(ori.pics)는 아래에서 301로 여기로 보낸다 */
const CANONICAL_ORIGIN = 'https://www.ori.pics';

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

  const response = intlMiddleware(request);

  // canonical (2026-09-21): 정식 주소를 명시해 중복 색인을 막는다.
  // 사이트맵 대상 페이지 대부분이 'use client'라 generateMetadata를 쓸 수 없어,
  // 구글이 meta 태그와 동등하게 취급하는 Link 헤더 방식으로 한 곳에서 처리한다.
  // (현재 어떤 페이지도 canonical meta를 내보내지 않으므로 신호 충돌 없음)
  // 쿼리스트링은 제외 — ?ref=1234 같은 파라미터가 별도 URL로 색인되지 않도록.
  if (response && response.status < 300) {
    // hreflang (2026-09-24 Search Console '중복 페이지, Google이 사용자와 다른 표준을 선택함'):
    // 루트(/)가 언어별 307 리다이렉트라 구글이 /와 /en을 같은 문서로 보고 /를 표준으로 골랐다.
    // → 같은 문서의 ko·en 대안과 x-default(언어 선택 루트)를 명시해 각 로케일 URL이 제각기 표준으로 인정되게 한다.
    const path = request.nextUrl.pathname;
    const m = path.match(/^\/(en|ko)(\/.*)?$/);
    const links = [`<${CANONICAL_ORIGIN}${path}>; rel="canonical"`];
    if (m) {
      const rest = m[2] ?? '';
      for (const l of locales) links.push(`<${CANONICAL_ORIGIN}/${l}${rest}>; rel="alternate"; hreflang="${l}"`);
      // 홈은 언어 자동 선택 루트, 하위 페이지는 기본 언어(en)를 x-default로
      links.push(`<${CANONICAL_ORIGIN}${rest ? `/en${rest}` : '/'}>; rel="alternate"; hreflang="x-default"`);
    }
    response.headers.set('Link', links.join(', '));
  }
  return response;
}

export const config = {
  // Match all pathnames except for
  // - API routes
  // - _next (static files, etc.)
  // - _vercel (Vercel specific files)
  // - all files in the public folder (e.g. favicon.ico)
  matcher: ['/((?!api|_next|_vercel|.*\\..*).*)']
};
