// 레이트리밋 (2026-08-22 보안 점검 — 크리덴셜 스터핑/무차별 대입 방어).
//
// 저장소는 Postgres. Vercel 서버리스는 인스턴스가 매 요청 갈릴 수 있어 in-memory 카운터가
// 무의미하고, 현재 Redis/KV 의존성이 없으므로 DB 원자 UPSERT로 fixed-window 카운터를 만든다.
// (트래픽이 커지면 Upstash 등으로 교체 — 인터페이스는 그대로 유지)
//
// 실패 시 열림(fail-open): DB 장애로 정상 로그인까지 막히는 것을 피한다. 대신 경고 로그.
import { prisma } from "@/lib/prisma";

export interface RateLimitRule {
  /** 규칙 식별자 — 키 네임스페이스 */
  name: string;
  /** 윈도 길이(초) */
  windowSec: number;
  /** 윈도당 허용 횟수 */
  max: number;
}

export const RATE_LIMITS = {
  /** 로그인 시도 — IP+이메일 조합 */
  login: { name: "login", windowSec: 600, max: 10 },
  /** 회원가입 — IP */
  register: { name: "register", windowSec: 3600, max: 5 },
  /** 비밀번호 재설정 요청 — IP (이메일 폭탄 방지) */
  passwordReset: { name: "pwreset", windowSec: 3600, max: 5 },
  /** 인증 코드 발송 — IP */
  sendVerification: { name: "sendverify", windowSec: 3600, max: 10 },
} as const satisfies Record<string, RateLimitRule>;

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  /** 초과 시 재시도까지 남은 초 */
  retryAfterSec: number;
}

/** 프록시 뒤(Vercel) 클라이언트 IP — 스푸핑 가능하므로 식별자에만 사용 */
export function clientIp(req: Request): string {
  const h = req.headers;
  const xff = h.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return h.get("x-real-ip") ?? "unknown";
}

/**
 * fixed-window 카운터 증가 후 허용 여부 반환.
 * 같은 (key, window_start) 행에 원자적으로 +1 — 동시 요청도 정확히 집계된다.
 */
export async function checkRateLimit(
  rule: RateLimitRule,
  identifier: string,
): Promise<RateLimitResult> {
  const key = `${rule.name}:${identifier}`;
  try {
    const rows = await prisma.$queryRawUnsafe<{ count: number; window_start: Date }[]>(
      `INSERT INTO public.rate_limits (key, window_start, count)
       VALUES ($1, to_timestamp(floor(extract(epoch from now()) / $2) * $2), 1)
       ON CONFLICT (key, window_start)
       DO UPDATE SET count = public.rate_limits.count + 1
       RETURNING count, window_start`,
      key,
      rule.windowSec,
    );
    const count = Number(rows[0]?.count ?? 1);
    const windowStart = rows[0]?.window_start ?? new Date();
    const elapsed = (Date.now() - new Date(windowStart).getTime()) / 1000;
    const retryAfterSec = Math.max(1, Math.ceil(rule.windowSec - elapsed));
    return {
      allowed: count <= rule.max,
      remaining: Math.max(0, rule.max - count),
      retryAfterSec,
    };
  } catch (e: any) {
    console.warn("[rateLimit] check failed (fail-open)", { key, error: e?.message });
    return { allowed: true, remaining: rule.max, retryAfterSec: 0 };
  }
}

/** 429 응답 (Retry-After 포함) */
export function tooManyRequests(result: RateLimitResult, message: string) {
  return new Response(
    JSON.stringify({ code: "rate_limited", message, retryAfter: result.retryAfterSec }),
    {
      status: 429,
      headers: {
        "Content-Type": "application/json",
        "Retry-After": String(result.retryAfterSec),
      },
    },
  );
}
