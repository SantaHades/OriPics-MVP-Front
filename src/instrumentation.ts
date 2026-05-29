/**
 * Next.js Instrumentation Hook
 *
 * C2PA Conformance O.5: TLS 1.3 최소 버전 강제
 * Supabase (DB + Storage) 연결을 포함한 모든 아웃바운드 TLS 연결에
 * TLS 1.3 미만을 허용하지 않는다.
 *
 * Vercel Node.js 18+ 런타임: TLS 1.3 지원. Supabase 엔드포인트도 TLS 1.3 지원.
 */
export function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const tls = require('tls') as typeof import('tls');
    (tls as any).DEFAULT_MIN_VERSION = 'TLSv1.3';
  }
}
