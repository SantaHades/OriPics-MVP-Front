import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/partner/admin";
import {
  approveMilestone,
  listReferralsWithValidityBulk,
  partnerStats,
  recordPartnerAudit,
  withActor,
} from "@/lib/partner/server";
import { sendMilestoneGrantedMail } from "@/lib/partner/mailer";
import { PARTNER, benefitExpiry, normalizePartnerCode } from "@/lib/partner/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 파트너 챌린지 최소 어드민 (ADMIN_EMAILS 화이트리스트).
 * GET  ?view=participants|milestones|benefits&q=  — 목록 (+ participants 뷰에 metrics 집계, 2026-09-11 A-93)
 * POST { action, ... }
 *   approve_milestone {userId} · reject_milestone {userId, reason}
 *   revoke_benefit {benefitId, reason} · restore_benefit {benefitId}
 *   grant_benefit {userId, type, count}
 *   assign_code {userId|email, code, partner?:boolean}  — 제휴사 100~999 등 수동 부여
 *   revoke_referral {referralId, reason, free_seat?:boolean=true}  — 추천 무효 + 미사용 혜택 회수
 *       free_seat: 피추천인의 partnerRank·referredById·partnerJoinedAt 을 비워 좌석 회수 + 재참여 허용 (A-93 §5)
 * 모든 조치는 실행자(admin.email)를 사유 텍스트와 meta(마이그레이션 적용 시)에 남긴다.
 */

/** (2026-09-11 A-93) 운영 지표 — 집계 쿼리만 사용 */
async function partnerMetrics() {
  const [participants, participantsViaCode, proConverted, discountAgg, freeMonthsIssued, milestonesPending] = await Promise.all([
    prisma.user.count({ where: { partnerCode: { not: null } } }),
    prisma.user.count({ where: { referredById: { not: null } } }),
    prisma.user.count({ where: { referredById: { not: null }, tier: { in: ["pro", "business"] } } }),
    prisma.chargeIntent.aggregate({ where: { status: "paid" }, _sum: { discountAmount: true } }),
    prisma.partnerBenefit.count({ where: { type: "pro_free_month" } }),
    prisma.partnerMilestone.count({ where: { approvedAt: null, rejectedAt: null } }),
  ]);
  return {
    participants,
    participantsViaCode,
    joinRate: participants > 0 ? participantsViaCode / participants : 0,
    proConverted,
    proConversionRate: participantsViaCode > 0 ? proConverted / participantsViaCode : 0,
    discountTotalKrw: discountAgg._sum.discountAmount ?? 0,
    freeMonthsIssued,
    milestonesPending,
  };
}

export async function GET(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ detail: "forbidden" }, { status: 403 });
  const view = req.nextUrl.searchParams.get("view") ?? "participants";
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim();

  if (view === "milestones") {
    const rows = await prisma.partnerMilestone.findMany({
      orderBy: { reachedAt: "desc" },
      include: { user: { select: { id: true, name: true, email: true, partnerCode: true, partnerRank: true } } },
      take: 200,
    });
    return NextResponse.json({ ok: true, milestones: rows });
  }

  if (view === "benefits") {
    const where = q ? { user: { OR: [{ email: { contains: q } }, { partnerCode: q }] } } : {};
    const rows = await prisma.partnerBenefit.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: { user: { select: { email: true, partnerCode: true } } },
      take: 300,
    });
    return NextResponse.json({ ok: true, benefits: rows });
  }

  // participants — 코드 입력 참여자 + 초대 수·유효 수·플래그
  const users = await prisma.user.findMany({
    where: {
      OR: [{ partnerJoinedAt: { not: null } }, { partnerReferralsMade: { some: {} } }],
      ...(q ? { AND: [{ OR: [{ email: { contains: q } }, { partnerCode: q }, { name: { contains: q } }] }] } : {}),
    },
    select: {
      id: true, name: true, email: true, partnerCode: true, partnerRank: true, partnerJoinedAt: true,
      referredBy: { select: { partnerCode: true, email: true } },
      partnerReferralReceived: { select: { ipHash: true, riskFlags: true, status: true } },
      _count: { select: { partnerReferralsMade: true } },
    },
    orderBy: [{ partnerRank: "asc" }, { partnerJoinedAt: "desc" }],
    take: 500,
  });
  // (2026-09-11 A-93) N+1 제거 — 추천 유효성은 한 번에, 혜택 수는 groupBy 로
  const ids = users.map((u) => u.id);
  const [refsByUser, benefitAgg] = await Promise.all([
    listReferralsWithValidityBulk(users.filter((u) => u._count.partnerReferralsMade > 0).map((u) => u.id)),
    ids.length
      ? prisma.partnerBenefit.groupBy({ by: ["userId", "type", "status"], where: { userId: { in: ids } }, _count: { _all: true } })
      : Promise.resolve([] as Array<{ userId: string; type: string; status: string; _count: { _all: number } }>),
  ]);
  const couponsByUser = new Map<string, number>();
  const usedByUser = new Map<string, number>();
  for (const b of benefitAgg) {
    if (b.type === "pro_50" && b.status === "available") couponsByUser.set(b.userId, (couponsByUser.get(b.userId) ?? 0) + b._count._all);
    if (b.status === "used") usedByUser.set(b.userId, (usedByUser.get(b.userId) ?? 0) + b._count._all);
  }
  const detailed = users.map((u) => {
    const refs = refsByUser.get(u.id) ?? [];
    return {
      id: u.id, name: u.name, email: u.email, code: u.partnerCode, rank: u.partnerRank, joinedAt: u.partnerJoinedAt,
      referredByCode: u.referredBy?.partnerCode ?? null,
      ipHash: u.partnerReferralReceived?.ipHash ?? null,
      riskFlags: u.partnerReferralReceived?.riskFlags ?? null,
      referralStatus: u.partnerReferralReceived?.status ?? null,
      referrals: refs.length,
      validReferrals: refs.filter((r) => r.valid).length,
      couponsAvailable: couponsByUser.get(u.id) ?? 0,
      benefitsUsed: usedByUser.get(u.id) ?? 0,
      referralList: refs,
    };
  });
  // 같은 IP 해시 24h 3건 이상 — 전역 플래그
  const [ipGroups, stats, metrics] = await Promise.all([
    prisma.partnerReferral.groupBy({
      by: ["ipHash"],
      where: { ipHash: { not: null } },
      _count: { _all: true },
      having: { ipHash: { _count: { gte: 3 } } },
    }),
    partnerStats(),
    partnerMetrics(),
  ]);
  return NextResponse.json({ ok: true, stats, metrics, participants: detailed, suspiciousIps: ipGroups });
}

export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ detail: "forbidden" }, { status: 403 });
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ detail: "invalid_json" }, { status: 400 });
  }
  const action = String(body?.action ?? "");
  const actedAt = new Date().toISOString();

  if (action === "approve_milestone") {
    const userId = String(body.userId ?? "");
    const r = await approveMilestone(userId, admin.email);
    if (r === "granted") {
      await recordPartnerAudit(prisma, { table: "partner_milestones", userId }, { approved_by: admin.email, approved_at: actedAt });
      const u = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
      if (u?.email) sendMilestoneGrantedMail({ to: u.email }).catch(() => {});
    }
    return NextResponse.json({ ok: true, result: r });
  }
  if (action === "reject_milestone") {
    const userId = String(body.userId ?? "");
    await prisma.partnerMilestone.update({
      where: { userId },
      data: { rejectedAt: new Date(), rejectReason: withActor(String(body.reason ?? ""), admin.email) },
    });
    await recordPartnerAudit(prisma, { table: "partner_milestones", userId }, { rejected_by: admin.email, rejected_at: actedAt });
    return NextResponse.json({ ok: true });
  }
  if (action === "revoke_benefit") {
    const benefitId = String(body.benefitId ?? "");
    const r = await prisma.partnerBenefit.updateMany({
      where: { id: benefitId, status: { in: ["available", "reserved"] } },
      data: { status: "revoked", revokedReason: withActor(String(body.reason ?? "admin"), admin.email) },
    });
    if (r.count) await recordPartnerAudit(prisma, { table: "partner_benefits", id: benefitId }, { revoked_by: admin.email, revoked_at: actedAt });
    return NextResponse.json({ ok: true, count: r.count });
  }
  if (action === "restore_benefit") {
    const benefitId = String(body.benefitId ?? "");
    const r = await prisma.partnerBenefit.updateMany({
      where: { id: benefitId, status: "revoked" },
      data: { status: "available", revokedReason: null },
    });
    if (r.count) await recordPartnerAudit(prisma, { table: "partner_benefits", id: benefitId }, { restored_by: admin.email, restored_at: actedAt });
    return NextResponse.json({ ok: true, count: r.count });
  }
  if (action === "grant_benefit") {
    const type = body.type === "pro_free_month" ? "pro_free_month" : "pro_50";
    const count = Math.min(12, Math.max(1, Number(body.count ?? 1) || 1));
    const userId = String(body.userId ?? "");
    const exists = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!exists) return NextResponse.json({ detail: "user_not_found" }, { status: 404 });
    const expires = benefitExpiry();
    const created = await prisma.$transaction(
      Array.from({ length: count }, () =>
        prisma.partnerBenefit.create({ data: { userId, type, source: "admin", expiresAt: expires }, select: { id: true } }),
      ),
    );
    for (const b of created) {
      await recordPartnerAudit(prisma, { table: "partner_benefits", id: b.id }, { granted_by: admin.email, granted_at: actedAt });
    }
    return NextResponse.json({ ok: true, count });
  }
  if (action === "assign_code") {
    const code = normalizePartnerCode(body.code);
    if (!code) return NextResponse.json({ detail: "invalid_code" }, { status: 400 });
    const target = body.userId
      ? await prisma.user.findUnique({ where: { id: String(body.userId) }, select: { id: true } })
      : body.email
        ? await prisma.user.findUnique({ where: { email: String(body.email) }, select: { id: true } })
        : null;
    if (!target) return NextResponse.json({ detail: "user_not_found" }, { status: 404 });
    const taken = await prisma.user.findUnique({ where: { partnerCode: code }, select: { id: true } });
    if (taken && taken.id !== target.id) return NextResponse.json({ detail: "code_taken" }, { status: 409 });
    await prisma.user.update({ where: { id: target.id }, data: { partnerCode: code } });
    console.info("[admin/partner] assign_code", { by: admin.email, userId: target.id, code });
    return NextResponse.json({ ok: true, code, reservedRange: Number(code) <= Number(PARTNER.OWNER_CODE) });
  }
  if (action === "revoke_referral") {
    const referralId = String(body.referralId ?? "");
    const freeSeat = body.free_seat !== false; // 기본 true
    const ref = await prisma.partnerReferral.findUnique({ where: { id: referralId } });
    if (!ref) return NextResponse.json({ detail: "not_found" }, { status: 404 });
    const reason = withActor(String(body.reason ?? "admin"), admin.email);
    const result = await prisma.$transaction(async (tx) => {
      await tx.partnerReferral.update({ where: { id: referralId }, data: { status: "revoked", revokedReason: reason } });
      // 이 추천으로 발급된 미사용 혜택(양쪽) 회수 — 이미 사용분은 유지(기획 §3.3)
      const benefits = await tx.partnerBenefit.updateMany({
        where: { referralId, status: { in: ["available", "reserved"] } },
        data: { status: "revoked", revokedReason: withActor("referral_revoked", admin.email) },
      });
      // (2026-09-11 A-93 §5) 좌석 회수 — 피추천인의 참여 상태를 비워 500명 카운트에서 빼고 재참여를 허용.
      // referredById 가 여전히 이 추천인일 때만(그 사이 다른 상태로 바뀐 계정은 건드리지 않음)
      let seatFreed = 0;
      if (freeSeat) {
        const u = await tx.user.updateMany({
          where: { id: ref.refereeId, referredById: ref.referrerId },
          data: { partnerRank: null, referredById: null, partnerJoinedAt: null },
        });
        seatFreed = u.count;
      }
      await recordPartnerAudit(tx, { table: "partner_referrals", id: referralId }, {
        revoked_by: admin.email,
        revoked_at: actedAt,
        free_seat: freeSeat,
        seat_freed: seatFreed > 0,
        benefits_revoked: benefits.count,
      });
      return { benefitsRevoked: benefits.count, seatFreed: seatFreed > 0 };
    });
    return NextResponse.json({ ok: true, ...result });
  }
  return NextResponse.json({ detail: "invalid_action" }, { status: 400 });
}
