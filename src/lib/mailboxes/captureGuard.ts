// 사서함 촬영 — 차감 직전 재검증 (2026-09-11 A-84②)
//   sign이 JWT에 넣은 mailbox_id·billing_user_id는 5분(confirm)·30일(publish receipt)간 그대로 신뢰되어,
//   sign 이후 내보내기·나감·잠금·삭제예고·촬영 불가·부담 변경이 있어도 개설자 크레딧이 차감되고
//   (publish 4.5단계의 멤버 검사 실패로) 사진은 미등록·expires_at=null 고아 링크가 남았다.
//   confirm·publish는 크레딧/패스 차감 전에 이 함수로 DB 상태를 다시 본다. sign(route.ts)의 판정과 같은 규칙.
import type { SupabaseClient } from "@supabase/supabase-js";

import { isActiveMember, isLocked, loadMailbox, loadMember } from "@/lib/mailboxes/server";

export type CaptureGuardFail = "mailbox_forbidden" | "mailbox_locked" | "mailbox_capture_disabled" | "mailbox_billing_changed";

/**
 * 세션 사용자가 지금도 이 사서함에서 촬영할 수 있고, JWT의 부담 주체가 현재 설정과 일치하는지.
 * 실패 detail은 앱(mailbox-panel localErr)이 이미 매핑하는 문자열을 재사용한다.
 *   mailbox_forbidden        — 사서함 없음/비활성, 또는 참여자가 아님(내보내기·나감)
 *   mailbox_locked           — 잠금 또는 삭제 예고 중
 *   mailbox_capture_disabled — 개설자가 촬영 불가로 변경
 *   mailbox_billing_changed  — 부담 주체(개설자↔본인)가 sign 이후 바뀜 → 앱은 sign부터 재시도
 */
export async function verifyMailboxCapture(
  db: SupabaseClient,
  mailboxId: string,
  userId: string,
  billingUserId: string,
): Promise<{ ok: true } | { ok: false; detail: CaptureGuardFail }> {
  const mb = await loadMailbox(db, mailboxId);
  if (!mb || mb.status !== "active") return { ok: false, detail: "mailbox_forbidden" };
  if (isLocked(mb)) return { ok: false, detail: "mailbox_locked" };
  const me = await loadMember(db, mailboxId, userId);
  if (!isActiveMember(me)) return { ok: false, detail: "mailbox_forbidden" };
  if (!me.can_capture) return { ok: false, detail: "mailbox_capture_disabled" };
  const expectedBilling = me.kind === "owner" || me.capture_billing !== "self" ? mb.owner_user_id : userId;
  if (!expectedBilling || expectedBilling !== billingUserId) return { ok: false, detail: "mailbox_billing_changed" };
  return { ok: true };
}
