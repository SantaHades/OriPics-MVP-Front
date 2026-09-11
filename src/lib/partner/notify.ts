// 파트너 릴레이 챌린지 알림 오케스트레이션 (A-82) — 참여 직후 코드 주인 메일 + 12명 도달 검수 요청.
// 전부 best-effort. 호출측은 `.catch(() => {})`로 감싼다.
import { prisma } from "@/lib/prisma";
import { maskName } from "./config";
import { sendMilestoneReachedMail, sendReferralJoinedMail } from "./mailer";
import { checkMilestoneReached } from "./server";

/** refereeId가 참여한 직후 — 코드 주인에게 적립 메일 */
export async function notifyReferralJoined(refereeId: string): Promise<void> {
  const ref = await prisma.partnerReferral.findUnique({
    where: { refereeId },
    select: {
      referrerRewarded: true,
      referee: { select: { name: true, email: true } },
      referrer: { select: { id: true, email: true } },
    },
  });
  if (!ref?.referrer.email) return;
  const total = await prisma.partnerBenefit.count({
    where: { userId: ref.referrer.id, type: "pro_50", status: "available", expiresAt: { gt: new Date() } },
  });
  await sendReferralJoinedMail({
    to: ref.referrer.email,
    refereeNameMasked: maskName(ref.referee.name || ref.referee.email?.split("@")[0]),
    totalCoupons: total,
    rewarded: ref.referrerRewarded,
  });
}

/**
 * 12명 도달 확인 → 아직 알리지 않은 마일스톤이면 파트너·운영자 메일 (조회·참여·cron에서 호출).
 * (2026-09-11 A-91 ①) 판단 기준을 '이번 호출이 행을 만들었는지'에서 `notified_at IS NULL` 로 변경 —
 * getPartnerOverview가 행을 먼저 만들어 두어도 다음 호출(/api/partner/me·cron)이 발송한다.
 *  - 동시 호출 중복 발송 방지: 발송 전에 `updateMany({ notifiedAt: null } → now)` 로 선점(count=1인 쪽만 발송)
 *  - 파트너 메일 발송 실패(SMTP 미설정 등)면 notifiedAt을 되돌려 다음 기회에 재시도
 *  - 이미 승인/반려된 행(운영자가 메일 없이 처리)은 발송 없이 notifiedAt만 채운다
 * 반환: 이번 호출에서 메일을 보냈는지.
 */
export async function notifyMilestoneIfReached(referrerId: string): Promise<boolean> {
  const { row } = await checkMilestoneReached(referrerId);
  if (!row || row.notifiedAt) return false;
  const now = new Date();
  const claimed = await prisma.partnerMilestone.updateMany({
    where: { userId: referrerId, notifiedAt: null },
    data: { notifiedAt: now },
  });
  if (claimed.count !== 1) return false;
  if (row.approvedAt || row.rejectedAt) return false;
  const u = await prisma.user.findUnique({ where: { id: referrerId }, select: { email: true, name: true, partnerCode: true } });
  if (!u?.email) return false;
  const sent = await sendMilestoneReachedMail({
    to: u.email,
    nameMasked: maskName(u.name || u.email.split("@")[0]),
    userId: referrerId,
    code: u.partnerCode,
  });
  if (!sent) {
    await prisma.partnerMilestone
      .updateMany({ where: { userId: referrerId, notifiedAt: now }, data: { notifiedAt: null } })
      .catch(() => {});
    return false;
  }
  return true;
}
