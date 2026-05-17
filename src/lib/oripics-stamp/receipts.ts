/**
 * 미공개 인증 receipt JWT의 localStorage 보관/조회.
 *
 * 흐름 (2026-05-17 B-2):
 *   - /api/links/confirm 응답에 receipt JWT 포함 → 인증 완료 시점에 자동 저장
 *   - 같은 브라우저에서 미공개 stamped 이미지를 다시 드롭 → timestamp로 receipt 매칭
 *   - 매칭되면 "본인 미공개 인증" UI에서 "간편링크 생성" 버튼 활성
 *   - publish 성공 시 해당 receipt 삭제 (이미 공개됨)
 *
 * 보안: receipt JWT는 user_id를 포함하지만 HS256 서명. 평문에서 user_id 노출은 base64이므로 가능 →
 * 보관 대상이 본인 브라우저이므로 허용 가능 (다른 사람 브라우저면 publish 시 session.user_id 불일치로 차단).
 *
 * TTL: receipt JWT 자체에 exp(30일). localStorage entry는 만료 시 자동 정리.
 */

const PREFIX = "oripics_receipt:";

export interface ReceiptRecord {
  receipt: string;        // JWT 본문
  timestamp: string;      // 워터마크 timestamp (재드롭 매칭 key)
  linkId: string;         // sign 시점에 할당된 link_id
  width: number;
  height: number;
  /** stamped+C2PA 이미지의 Blob URL 또는 base64 (선택). publish 시 재전송용 */
  imageBlobUrl?: string;
  /** stamped 이미지를 IndexedDB에 저장한 경우의 key (선택) */
  imageStorageKey?: string;
  /** 인증 시점 (UTC 초) */
  proofedAt: number;
  /** receipt JWT 만료 (UTC 초) */
  expiresAt: number;
}

function decodeJwtPayload(token: string): any | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    return JSON.parse(atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")));
  } catch {
    return null;
  }
}

export function saveReceipt(record: Omit<ReceiptRecord, "proofedAt" | "expiresAt">): void {
  if (typeof window === "undefined") return;
  const payload = decodeJwtPayload(record.receipt);
  const now = Math.floor(Date.now() / 1000);
  const entry: ReceiptRecord = {
    ...record,
    proofedAt: now,
    expiresAt: payload?.exp ?? now + 30 * 24 * 60 * 60,
  };
  try {
    localStorage.setItem(PREFIX + record.timestamp, JSON.stringify(entry));
  } catch (e) {
    // quota 초과 가능 — 만료된 항목 정리 후 재시도
    pruneExpired();
    try {
      localStorage.setItem(PREFIX + record.timestamp, JSON.stringify(entry));
    } catch {
      console.warn("[receipts] localStorage save failed:", e);
    }
  }
}

export function getReceipt(timestamp: string): ReceiptRecord | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(PREFIX + timestamp);
  if (!raw) return null;
  try {
    const entry = JSON.parse(raw) as ReceiptRecord;
    const now = Math.floor(Date.now() / 1000);
    if (entry.expiresAt <= now) {
      localStorage.removeItem(PREFIX + timestamp);
      return null;
    }
    return entry;
  } catch {
    return null;
  }
}

export function removeReceipt(timestamp: string): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(PREFIX + timestamp);
}

export function pruneExpired(): void {
  if (typeof window === "undefined") return;
  const now = Math.floor(Date.now() / 1000);
  const toRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key || !key.startsWith(PREFIX)) continue;
    try {
      const entry = JSON.parse(localStorage.getItem(key)!) as ReceiptRecord;
      if (entry.expiresAt <= now) toRemove.push(key);
    } catch {
      toRemove.push(key);
    }
  }
  toRemove.forEach((k) => localStorage.removeItem(k));
}

export function listReceipts(): ReceiptRecord[] {
  if (typeof window === "undefined") return [];
  const out: ReceiptRecord[] = [];
  const now = Math.floor(Date.now() / 1000);
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key || !key.startsWith(PREFIX)) continue;
    try {
      const entry = JSON.parse(localStorage.getItem(key)!) as ReceiptRecord;
      if (entry.expiresAt > now) out.push(entry);
    } catch {
      // 손상 항목 무시
    }
  }
  return out.sort((a, b) => b.proofedAt - a.proofedAt);
}
