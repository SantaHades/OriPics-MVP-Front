/**
 * 인증 파이프라인 단계별 서버 처리 시간 계측 (2026-08-31 병목 진단용).
 *
 * 사용:
 *   const t = new StepTimer();
 *   const user = await t.span("db_user", () => prisma.user.findUnique(...));
 *   ...
 *   t.log("links/publish", { link_id });                 // [timing] JSON 한 줄 → Vercel 로그
 *   return t.withServerTiming(NextResponse.json(body));  // Server-Timing 응답 헤더
 *
 * - `[timing]` 로그는 Vercel 로그에서 route별 단계 분포를 검색/집계하는 용도.
 * - Server-Timing 헤더는 브라우저 DevTools(Network→Timing)와 모바일 클라이언트
 *   로그에서 단계별 시간이 바로 보이게 한다. 진단 정보일 뿐 신뢰 경계 아님.
 */
export class StepTimer {
  private readonly t0 = Date.now();
  private readonly steps: Array<[string, number]> = [];

  /** fn 실행 시간을 name 단계로 기록. fn이 throw해도 기록은 남는다. */
  async span<T>(name: string, fn: () => T | Promise<T>): Promise<T> {
    const s = Date.now();
    try {
      return await fn();
    } finally {
      this.steps.push([name, Date.now() - s]);
    }
  }

  /** 외부에서 이미 측정된 값을 기록 (예: attachC2paManifest 내부 breakdown). */
  add(name: string, ms: number | undefined): void {
    if (typeof ms === "number") this.steps.push([name, ms]);
  }

  totalMs(): number {
    return Date.now() - this.t0;
  }

  /** `[timing] {"route":...,"total_ms":...,"steps":{...}}` 한 줄 로그. */
  log(route: string, extra?: Record<string, unknown>): void {
    const steps: Record<string, number> = {};
    for (const [n, ms] of this.steps) steps[n] = (steps[n] ?? 0) + ms;
    console.log(
      `[timing] ${JSON.stringify({ route, total_ms: this.totalMs(), steps, ...extra })}`,
    );
  }

  /** Server-Timing 헤더를 붙여 그대로 반환. 이름은 토큰 문자만 허용되므로 언더스코어 사용. */
  withServerTiming<T extends Response>(res: T): T {
    const parts = this.steps.map(([n, ms]) => `${n};dur=${ms}`);
    parts.push(`total;dur=${this.totalMs()}`);
    res.headers.set("Server-Timing", parts.join(", "));
    return res;
  }
}
