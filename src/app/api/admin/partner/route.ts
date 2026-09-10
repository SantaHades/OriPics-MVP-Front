import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/partner/admin";
import { approveMilestone, listReferralsWithValidity, partnerStats } from "@/lib/partner/server";
import { sendMilestoneGrantedMail } from "@/lib/partner/mailer";
import { PARTNER, benefitExpiry, normalizePartnerCode } from "@/lib/partner/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 파트너 챌린지 최소 어드민 (ADMIN_EMAILS 화이트리스트).
 * GET  ?view=participants|milestones|benefits&q=  — 목록
 * POST { action, ... }
 *   approve_milestone {userId} · reject_milestone {userId, reason}
 *   revoke_benefit {benefitId, reason} · restore_benefit {benefitId}
 *   grant_benefit {userId, type, count}
 *   assign_code {userId|email, code, partner?:boolean}  — 제휴사 100~999 등 수동 부여
 *   revoke_referral {referralId, reason}  — 추천 무효 + 미사용 혜택 회수
 */
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
  const detailed = await Promise.all(
    users.map(async (u) => {
      const refs = u._count.partnerReferralsMade > 0 ? await listReferralsWithValidity(u.id) : [];
      const coupons = await prisma.partnerBenefit.count({ where: { userId: u.id, type: "pro_50", status: "available" } });
      const used = await prisma.partnerBenefit.count({ where: { userId: u.id, status: "used" } });
      return {
        id: u.id, name: u.name, email: u.email, code: u.partnerCode, rank: u.partnerRank, joinedAt: u.partnerJoinedAt,
        referredByCode: u.referredBy?.partnerCode ?? null,
        ipHash: u.partnerReferralReceived?.ipHash ?? null,
        riskFlags: u.partnerReferralReceived?.riskFlags ?? null,
        referralStatus: u.partnerReferralReceived?.status ?? null,
        referrals: refs.length,
        validReferrals: refs.filter((r) => r.valid).length,
        couponsAvailable: coupons,
        benefitsUsed: used,
        referralList: refs,
      };
    }),
  );
  // 같은 IP 해시 24h 3건 이상 — 전역 플래그
  const ipGroups = await prisma.partnerReferral.groupBy({
    by: ["ipHash"],
    where: { ipHash: { not: null } },
    _count: { _all: true },
    having: { ipHash: { _count: { gte: 3 } } },
  });
  return NextResponse.json({ ok: true, stats: await partnerStats(), participants: detailed, suspiciousIps: ipGroups });
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

  if (action === "approve_milestone") {
    const userId = String(body.userId ?? "");
    const r = await approveMilestone(userId, admin.email);
    if (r === "granted") {
      const u = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
      if (u?.email) sendMilestoneGrantedMail({ to: u.email }).catch(() => {});
    }
    return NextResponse.json({ ok: true, result: r });
  }
  if (action === "reject_milestone") {
    const userId = String(body.userId ?? "");
    await prisma.partnerMilestone.update({
      where: { userId },
      data: { rejectedAt: new Date(), rejectReason: String(body.reason ?? "").slice(0, 300) || null },
    });
    return NextResponse.json({ ok: true });
  }
  if (action === "revoke_benefit") {
    const r = await prisma.partnerBenefit.updateMany({
      where: { id: String(body.benefitId ?? ""), status: { in: ["available", "reserved"] } },
      data: { status: "revoked", revokedReason: String(body.reason ?? "admin").slice(0, 300) },
    });
    return NextResponse.json({ ok: true, count: r.count });
  }
  if (action === "restore_benefit") {
    const r = await prisma.partnerBenefit.updateMany({
      where: { id: String(body.benefitId ?? ""), status: "revoked" },
      data: { status: "available", revokedReason: null },
    });
    return NextResponse.json({ ok: true, count: r.count });
  }
  if (action === "grant_benefit") {
    const type = body.type === "pro_free_month" ? "pro_free_month" : "pro_50";
    const count = Math.min(12, Math.max(1, Number(body.count ?? 1) || 1));
    const userId = String(body.userId ?? "");
    const exists = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!exists) return NextResponse.json({ detail: "user_not_found" }, { status: 404 });
    const expires = benefitExpiry();
    await prisma.partnerBenefit.createMany({
      data: Array.from({ length: count }, () => ({ userId, type, source: "admin", expiresAt: expires })),
    });
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
    return NextResponse.json({ ok: true, code, reservedRange: Number(code) <= Number(PARTNER.OWNER_CODE) });
  }
  if (action === "revoke_referral") {
    const referralId = String(body.referralId ?? "");
    const ref = await prisma.partnerReferral.findUnique({ where: { id: referralId } });
    if (!ref) return NextResponse.json({ detail: "not_found" }, { status: 404 });
    await prisma.$transaction([
      prisma.partnerReferral.update({ where: { id: referralId }, data: { status: "revoked", revokedReason: String(body.reason ?? "admin").slice(0, 300) } }),
      prisma.partnerBenefit.updateMany({
        where: { referralId, status: { in: ["available", "reserved"] } },
        data: { status: "revoked", revokedReason: "referral_revoked" },
      }),
    ]);
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ detail: "invalid_action" }, { status: 400 });
}
