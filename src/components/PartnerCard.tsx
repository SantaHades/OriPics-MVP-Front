"use client";

// 파트너 릴레이 챌린지 카드 (A-82) — 프로필 #partner.
// 내 코드·복사·공유 / 코드 입력(가능할 때) / 초대 현황(마스킹·유효 여부) / 혜택 보유·사용 내역 / 다음 결제 예상.
// 금액 문구는 웹 전용(앱은 코드·공유·입력만 — App Store 3.1.1).
import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Check, Copy, Gift, Share2, Users } from "lucide-react";

export interface PartnerOverview {
  ok: boolean;
  listAmount: number;
  code: string | null;
  isPartner: boolean;
  partnerRank: number | null;
  joined: { at: string | null; referrerNameMasked: string | null; referrerCode: string | null } | null;
  canJoin: boolean;
  joinBlockedReason: string | null;
  campaign: {
    cap: number;
    partnersJoined: number;
    remaining: number;
    campaignEnd: string;
    campaignEnded: boolean;
    discountAmount: number;
    milestoneCount: number;
    milestoneFreeMonths: number;
    benefitValidMonths: number;
  };
  referrals: Array<{ id: string; status: string; rewarded: boolean; joinedAt: string; nameMasked: string; valid: boolean }>;
  validCount: number;
  milestone: { reachedAt: string; status: "pending" | "approved" | "rejected"; approvedAt: string | null } | null;
  benefits: {
    coupons: number;
    couponsNearestExpiry: string | null;
    freeMonths: number;
    list: Array<{ id: string; type: string; source: string; status: string; issuedAt: string; expiresAt: string; usedAt: string | null; paymentId: string | null; revokedReason: string | null }>;
  };
  usage: Array<{ paymentId: string; usedAt: string | null; coupons: number; freeMonths: number; listAmount: number; discountAmount: number | null; paidAmount: number | null }>;
  nextCharge: {
    expectedAmount: number;
    listAmount: number;
    discountAmount: number;
    couponsApplied: number;
    freeMonthApplied: boolean;
    maxCoupons: 1 | 2;
    couponsAvailable: number;
    freeMonthsAvailable: number;
    subscriptionActive: boolean;
    nextBillingAt: string | null;
  };
}

export function partnerShareUrl(locale: string, code: string) {
  return `https://www.ori.pics/${locale}/signup?ref=${encodeURIComponent(code)}`;
}

export default function PartnerCard({ highlight = false }: { highlight?: boolean }) {
  const t = useTranslations("Partner");
  const locale = useLocale();
  const [data, setData] = useState<PartnerOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);
  const [copied, setCopied] = useState<"code" | "link" | null>(null);
  const [codeInput, setCodeInput] = useState("");
  const [lookupName, setLookupName] = useState<string | null>(null);
  const [lookupBusy, setLookupBusy] = useState(false);
  const [joinBusy, setJoinBusy] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [joinDone, setJoinDone] = useState<string | null>(null);
  const [showAllBenefits, setShowAllBenefits] = useState(false);

  const fmtWon = useCallback((n: number) => new Intl.NumberFormat(locale === "en" ? "en-US" : "ko-KR").format(n), [locale]);
  const fmtDate = useCallback(
    (d: string | null | undefined) => (d ? new Date(d).toLocaleDateString(locale === "en" ? "en-US" : "ko-KR") : "—"),
    [locale],
  );

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/partner/me", { cache: "no-store" });
      if (!res.ok) {
        setUnavailable(true);
        return;
      }
      setData(await res.json());
    } catch {
      setUnavailable(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const shareUrl = useMemo(() => (data?.code ? partnerShareUrl(locale, data.code) : ""), [data?.code, locale]);
  const shareText = useMemo(() => (data?.code ? t("share_text", { code: data.code, url: shareUrl }) : ""), [data?.code, shareUrl, t]);

  const copy = async (what: "code" | "link") => {
    if (!data?.code) return;
    try {
      await navigator.clipboard.writeText(what === "code" ? data.code : shareText);
      setCopied(what);
      setTimeout(() => setCopied(null), 1600);
    } catch {
      /* ignore */
    }
  };
  const share = async () => {
    if (!data?.code) return;
    if (typeof navigator !== "undefined" && "share" in navigator) {
      try {
        await (navigator as any).share({ title: "OriPics", text: shareText, url: shareUrl });
        return;
      } catch {
        /* fall through to copy */
      }
    }
    copy("link");
  };

  const lookup = async () => {
    const code = codeInput.replace(/[^0-9]/g, "");
    if (code.length < 3) return;
    setLookupBusy(true);
    setJoinError(null);
    try {
      const res = await fetch(`/api/partner/lookup?code=${code}`);
      const d = await res.json().catch(() => ({}));
      if (!res.ok || !d.ok) {
        setLookupName(null);
        setJoinError(t(`errors.${d?.error ?? "code_not_found"}`));
        return;
      }
      setLookupName(d.ownerNameMasked);
    } finally {
      setLookupBusy(false);
    }
  };
  const join = async () => {
    const code = codeInput.replace(/[^0-9]/g, "");
    if (!code) return;
    setJoinBusy(true);
    setJoinError(null);
    try {
      const res = await fetch("/api/partner/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setJoinError(t(`errors.${d?.detail ?? "unavailable"}`));
        return;
      }
      setJoinDone(d.referrerNameMasked ?? lookupName ?? "");
      setLookupName(null);
      setCodeInput("");
      await load();
    } finally {
      setJoinBusy(false);
    }
  };

  if (loading) {
    return (
      <div id="partner" className="mt-12 pt-8 border-t border-slate-100 scroll-mt-24">
        <p className="text-sm text-slate-400">{t("loading")}</p>
      </div>
    );
  }
  if (unavailable || !data) {
    return (
      <div id="partner" className="mt-12 pt-8 border-t border-slate-100 scroll-mt-24">
        <div className="flex items-center gap-3 mb-3">
          <Gift size={20} className="text-blue-600" />
          <h2 className="text-lg font-bold">{t("title")}</h2>
        </div>
        <p className="text-sm text-slate-500">{t("unavailable")}</p>
      </div>
    );
  }

  const c = data.campaign;
  const benefitList = showAllBenefits ? data.benefits.list : data.benefits.list.filter((b) => b.status === "available").slice(0, 6);
  const nc = data.nextCharge;

  return (
    <div id="partner" className={`mt-12 pt-8 border-t border-slate-100 scroll-mt-24 ${highlight ? "animate-in fade-in duration-500" : ""}`}>
      <div className="flex items-center gap-3 mb-2">
        <Gift size={20} className="text-blue-600" />
        <h2 className="text-lg font-bold">{t("title")}</h2>
        {data.isPartner && (
          <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 text-[11px] font-bold">
            {data.partnerRank ? t("rank_badge", { rank: data.partnerRank }) : t("partner_badge")}
          </span>
        )}
        <a href={`/${locale}/partner`} className="ml-auto text-xs font-semibold text-blue-600 hover:underline">
          {t("about_link")}
        </a>
      </div>
      <p className="text-xs text-slate-500 mb-5">
        {c.campaignEnded
          ? t("campaign_ended")
          : t("campaign_line", { end: fmtDate(c.campaignEnd), remaining: c.remaining, cap: c.cap })}
      </p>

      {highlight && joinDone === null && data.joined && (
        <div className="mb-4 px-4 py-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm">
          {t("welcome_banner", { code: data.code ?? "" })}
        </div>
      )}
      {joinDone !== null && (
        <div className="mb-4 px-4 py-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm">
          {t("join_done", { name: joinDone })}
        </div>
      )}

      {/* 내 코드 */}
      <div className="rounded-2xl border border-slate-200 bg-white/60 p-5 mb-4">
        <p className="text-xs text-slate-500 mb-1">{t("my_code")}</p>
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-3xl font-extrabold tracking-[0.15em] tabular-nums">{data.code ?? "—"}</span>
          <button onClick={() => copy("code")} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold hover:bg-slate-50">
            {copied === "code" ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />} {copied === "code" ? t("copied") : t("copy_code")}
          </button>
          <button onClick={share} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700">
            {copied === "link" ? <Check size={14} /> : <Share2 size={14} />} {copied === "link" ? t("copied") : t("share")}
          </button>
        </div>
        <p className="mt-2 text-[11px] text-slate-400 break-all">{shareUrl}</p>
        {!data.isPartner && !c.campaignEnded && (
          <p className="mt-2 text-xs text-amber-700">{t("not_partner_notice")}</p>
        )}
      </div>

      {/* 코드 입력 (참여 전) */}
      {data.canJoin && (
        <div className="rounded-2xl border border-blue-200 bg-blue-50/50 p-5 mb-4">
          <p className="text-sm font-bold text-blue-900 mb-1">{t("join_title")}</p>
          <p className="text-xs text-blue-800/80 mb-3">{t("join_desc", { amount: fmtWon(c.discountAmount) })}</p>
          <div className="flex gap-2">
            <input
              inputMode="numeric"
              value={codeInput}
              onChange={(e) => {
                setCodeInput(e.target.value.replace(/[^0-9]/g, "").slice(0, 8));
                setLookupName(null);
                setJoinError(null);
              }}
              placeholder={t("code_placeholder")}
              className="flex-1 min-w-0 px-4 py-2.5 rounded-xl border border-slate-200 text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-blue-500/40"
            />
            {lookupName ? (
              <button onClick={join} disabled={joinBusy} className="shrink-0 whitespace-nowrap px-4 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-bold hover:bg-blue-700 disabled:bg-slate-300">
                {joinBusy ? "…" : t("join_button")}
              </button>
            ) : (
              <button onClick={lookup} disabled={lookupBusy || codeInput.length < 3} className="shrink-0 whitespace-nowrap px-4 py-2.5 rounded-xl border border-blue-300 text-blue-700 text-sm font-bold hover:bg-blue-100 disabled:opacity-40">
                {lookupBusy ? "…" : t("check_button")}
              </button>
            )}
          </div>
          {lookupName && <p className="mt-2 text-xs text-emerald-700">{t("lookup_ok", { name: lookupName })}</p>}
          {joinError && <p className="mt-2 text-xs text-red-600">{joinError}</p>}
        </div>
      )}
      {!data.canJoin && !data.joined && data.joinBlockedReason && (
        <p className="mb-4 text-xs text-slate-400">{t(`blocked.${data.joinBlockedReason}`)}</p>
      )}
      {data.joined && (
        <p className="mb-4 text-xs text-slate-500">
          {t("joined_line", { name: data.joined.referrerNameMasked ?? "—", code: data.joined.referrerCode ?? "—", date: fmtDate(data.joined.at) })}
        </p>
      )}

      <div className="grid md:grid-cols-2 gap-4">
        {/* 초대 현황 */}
        <div className="rounded-2xl border border-slate-200 bg-white/60 p-5">
          <div className="flex items-center gap-2 mb-2">
            <Users size={16} className="text-blue-600" />
            <h3 className="text-sm font-bold">{t("referrals_title")}</h3>
            <span className="ml-auto text-xs text-slate-500">{t("referrals_count", { valid: data.validCount, total: data.referrals.length })}</span>
          </div>
          <div className="h-2 rounded-full bg-slate-100 overflow-hidden mb-1">
            <div className="h-full bg-blue-600 transition-all" style={{ width: `${Math.min(100, (data.validCount / c.milestoneCount) * 100)}%` }} />
          </div>
          <p className="text-[11px] text-slate-500 mb-3">{t("milestone_progress", { valid: data.validCount, goal: c.milestoneCount, months: c.milestoneFreeMonths })}</p>
          {data.milestone && (
            <p className={`mb-3 px-3 py-2 rounded-lg text-xs ${data.milestone.status === "approved" ? "bg-emerald-50 text-emerald-800" : data.milestone.status === "rejected" ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-800"}`}>
              {t(`milestone_${data.milestone.status}`, { date: fmtDate(data.milestone.approvedAt ?? data.milestone.reachedAt) })}
            </p>
          )}
          {data.referrals.length === 0 ? (
            <p className="text-xs text-slate-400">{t("referrals_empty")}</p>
          ) : (
            <ul className="divide-y divide-slate-100 max-h-56 overflow-y-auto">
              {data.referrals.map((r) => (
                <li key={r.id} className="py-2 flex items-center gap-2 text-xs">
                  <span className="font-semibold text-slate-800">{r.nameMasked}</span>
                  <span className="text-slate-400">{fmtDate(r.joinedAt)}</span>
                  <span className={`ml-auto px-1.5 py-0.5 rounded ${r.status !== "confirmed" ? "bg-red-50 text-red-600" : r.valid ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                    {r.status !== "confirmed" ? t("ref_revoked") : r.valid ? t("ref_valid") : t("ref_pending")}
                  </span>
                  {!r.rewarded && r.status === "confirmed" && <span className="text-[10px] text-slate-400">{t("ref_unrewarded")}</span>}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* 혜택 */}
        <div className="rounded-2xl border border-slate-200 bg-white/60 p-5">
          <div className="flex items-center gap-2 mb-3">
            <Gift size={16} className="text-blue-600" />
            <h3 className="text-sm font-bold">{t("benefits_title")}</h3>
          </div>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div className="rounded-xl bg-slate-50 p-3">
              <p className="text-[11px] text-slate-500">{t("coupons_label", { amount: fmtWon(c.discountAmount) })}</p>
              <p className="text-xl font-extrabold">{t("coupons_value", { count: data.benefits.coupons })}</p>
              {data.benefits.couponsNearestExpiry && <p className="text-[10px] text-slate-400">{t("nearest_expiry", { date: fmtDate(data.benefits.couponsNearestExpiry) })}</p>}
            </div>
            <div className="rounded-xl bg-slate-50 p-3">
              <p className="text-[11px] text-slate-500">{t("free_months_label")}</p>
              <p className="text-xl font-extrabold">{t("free_months_value", { count: data.benefits.freeMonths })}</p>
            </div>
          </div>
          <p className="text-xs text-slate-700 mb-3">
            {nc.subscriptionActive
              ? nc.expectedAmount === 0
                ? t("next_charge_free", { date: fmtDate(nc.nextBillingAt), kind: nc.freeMonthApplied ? t("kind_free_month") : t("kind_coupons", { count: nc.couponsApplied }) })
                : nc.discountAmount > 0
                  ? t("next_charge_discount", { date: fmtDate(nc.nextBillingAt), amount: fmtWon(nc.expectedAmount), count: nc.couponsApplied, left: nc.couponsAvailable - nc.couponsApplied })
                  : t("next_charge_list", { date: fmtDate(nc.nextBillingAt), amount: fmtWon(nc.expectedAmount) })
              : nc.expectedAmount === 0
                ? t("first_charge_free", { count: nc.couponsApplied })
                : nc.discountAmount > 0
                  ? t("first_charge_discount", { amount: fmtWon(nc.expectedAmount), count: nc.couponsApplied })
                  : t("first_charge_none")}
          </p>
          {benefitList.length > 0 && (
            <ul className="divide-y divide-slate-100 text-xs">
              {benefitList.map((b) => (
                <li key={b.id} className="py-1.5 flex items-center gap-2">
                  <span className="font-semibold">{t(`type_${b.type}`)}</span>
                  <span className="text-slate-400">{t(`source_${b.source}`)}</span>
                  <span className="ml-auto text-slate-400">{b.status === "used" ? t("used_on", { date: fmtDate(b.usedAt) }) : b.status === "available" ? t("expires_on", { date: fmtDate(b.expiresAt) }) : t(`status_${b.status}`)}</span>
                </li>
              ))}
            </ul>
          )}
          {data.benefits.list.length > benefitList.length || showAllBenefits ? (
            <button onClick={() => setShowAllBenefits((v) => !v)} className="mt-2 text-[11px] text-blue-600 hover:underline">
              {showAllBenefits ? t("show_less") : t("show_all", { count: data.benefits.list.length })}
            </button>
          ) : null}
        </div>
      </div>

      {/* 사용 내역 */}
      {data.usage.length > 0 && (
        <div className="mt-4 rounded-2xl border border-slate-200 bg-white/60 p-5">
          <h3 className="text-sm font-bold mb-2">{t("usage_title")}</h3>
          <ul className="divide-y divide-slate-100 text-xs">
            {data.usage.map((u) => (
              <li key={u.paymentId} className="py-2 flex flex-wrap items-center gap-2">
                <span className="text-slate-500">{fmtDate(u.usedAt)}</span>
                <span className="font-semibold">
                  {u.freeMonths > 0 ? t("usage_free_month") : t("usage_coupons", { count: u.coupons })}
                </span>
                <span className="ml-auto tabular-nums">
                  {u.paidAmount != null ? t("usage_paid", { list: fmtWon(u.listAmount), paid: fmtWon(u.paidAmount) }) : "—"}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="mt-3 text-[11px] text-slate-400">{t("terms_note", { months: c.benefitValidMonths })}</p>
    </div>
  );
}
