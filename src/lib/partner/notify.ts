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

/** 12명 도달 확인 → 새로 도달했으면 파트너·운영자 메일 (조회·참여·cron에서 호출) */
export async function notifyMilestoneIfReached(referrerId: string): Promise<boolean> {
  const reached = await checkMilestoneReached(referrerId);
  if (!reached) return false;
  const u = await prisma.user.findUnique({ where: { id: referrerId }, select: { email: true, name: true, partnerCode: true } });
  if (u?.email) {
    await sendMilestoneReachedMail({ to: u.email, nameMasked: maskName(u.name || u.email.split("@")[0]), userId: referrerId, code: u.partnerCode });
    await prisma.partnerMilestone.update({ where: { userId: referrerId }, data: { notifiedAt: new Date() } }).catch(() => {});
  }
  return true;
}
