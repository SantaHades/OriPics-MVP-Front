"use client";

import { useEffect, useState, useCallback } from "react";
import { signOut, useSession } from "next-auth/react";

export interface CreditTransactionView {
  id: string;
  delta: number;
  action: string;
  balanceAfter: number;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export interface CreditsData {
  tier: string;
  credits: number;
  creditsRenewAt: string | null;
  /** 보관 유예 요약 (A-58) — 해지 후 만료 예정 링크가 있을 때만 존재 */
  grace?: { count: number; expires_at: string };
  recentTransactions: CreditTransactionView[];
}

/**
 * 인증된 사용자의 크레딧 잔액·이력 조회 hook.
 * 비인증 시 data=null. 세션이 인증 상태인데 401이면 죽은 세션(탈퇴 등) — 자동 로그아웃.
 */
export function useCredits(): {
  data: CreditsData | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
} {
  const { status } = useSession();
  const [data, setData] = useState<CreditsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (status !== "authenticated") return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/credits/me");
      if (res.status === 401) {
        // JWT 세션 쿠키(30일)는 무상태라 계정 삭제 후에도 살아 있음 — 서버 401 = 무효 세션.
        // 죽은 쿠키를 정리하고 로그아웃 (앱에서 탈퇴 후 웹 프로필이 이전 정보를 표시하던 문제, 2026-08-26)
        setData(null);
        void signOut({ callbackUrl: "/" });
        return;
      }
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`http_${res.status}:${text}`);
      }
      const json = (await res.json()) as CreditsData;
      setData(json);
    } catch (e: any) {
      setError(e?.message ?? "unknown");
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => {
    if (status === "authenticated") void refresh();
    if (status === "unauthenticated") setData(null);
  }, [status, refresh]);

  return { data, loading, error, refresh };
}
