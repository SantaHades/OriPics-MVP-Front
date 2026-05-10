"use client";

import { useEffect, useState, useCallback } from "react";
import { useSession } from "next-auth/react";

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
  recentTransactions: CreditTransactionView[];
}

/**
 * 인증된 사용자의 크레딧 잔액·이력 조회 hook.
 * 비인증 시 data=null. 401 응답 시 자동 무시.
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
        setData(null);
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
