// 사서함 사진 요약 (2026-09-13 A-98) — 폴링 경량화. 앱·웹 상세가 15초마다 사진 목록 전체(≤500행 + 링크 + 열람 정보)를
//   재수신하던 것을, 이 3개 값만 먼저 받아 이전 값과 다를 때만 목록을 다시 받게 한다.
//   unread_total = 뷰어 기준 미열람 사진 수(사서함 목록 카드의 unread_count와 같은 정의) = photo_count − 뷰어의 열람 행 수.
//   근사치: 다른 참여자의 열람(사진별 unread_count 배지)만 바뀐 경우는 감지하지 않는다(목록 갱신은 다음 사진 추가/내 열람 때).
import type { SupabaseClient } from "@supabase/supabase-js";

export interface PhotoSummary {
  photo_count: number;
  unread_total: number;
  latest_at: string | null;
}

/** 순수 계산 — 테스트용으로 분리. read_count가 photo_count를 넘는 비정상(중복 행 등)도 0 아래로 내려가지 않게 */
export function summarize(photoCount: number | null | undefined, readCount: number | null | undefined, latestAt: string | null | undefined): PhotoSummary {
  const photo_count = Math.max(photoCount ?? 0, 0);
  const read = Math.max(readCount ?? 0, 0);
  return { photo_count, unread_total: Math.max(photo_count - read, 0), latest_at: latestAt ?? null };
}

/** 이전 요약과 비교 — 하나라도 다르면 목록 재수신 필요 */
export function summaryChanged(prev: PhotoSummary | null | undefined, next: PhotoSummary): boolean {
  if (!prev) return true;
  return prev.photo_count !== next.photo_count || prev.unread_total !== next.unread_total || prev.latest_at !== next.latest_at;
}

/**
 * 3개 쿼리 모두 count/head 또는 1행 — 이미지 URL·링크 조인 없음.
 *   ① mailbox_photos count(mailbox_id)  ② mailbox_reads count(user_id, mailbox_photos!inner.mailbox_id — FK photo_id→mailbox_photos.id)
 *   ③ mailbox_photos created_at 최신 1행
 */
export async function loadPhotoSummary(db: SupabaseClient, mailboxId: string, viewerId: string): Promise<PhotoSummary> {
  const [photos, reads, latest] = await Promise.all([
    db.from("mailbox_photos").select("id", { count: "exact", head: true }).eq("mailbox_id", mailboxId),
    db.from("mailbox_reads").select("photo_id, mailbox_photos!inner(mailbox_id)", { count: "exact", head: true }).eq("user_id", viewerId).eq("mailbox_photos.mailbox_id", mailboxId),
    db.from("mailbox_photos").select("created_at").eq("mailbox_id", mailboxId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (photos.error) throw photos.error;
  if (latest.error) throw latest.error;
  // 열람 count는 임베드 조인 실패(스키마 캐시 지연 등) 시 0으로 — 요약이 실패해 폴링 전체가 멈추는 것보다 낫다(unread_total이 과대해질 뿐)
  const readCount = reads.error ? 0 : reads.count;
  return summarize(photos.count, readCount, (latest.data as { created_at: string } | null)?.created_at ?? null);
}
