"use client";

// 사진함 패스 소개·보유 목록·환불 (A-108 4단계, 2026-09-23). 설계: docs/photobox-pass-design.md §1·§5
// 웹 전용 화면 — 앱에는 가격·구매 링크를 두지 않는다(App Store 3.1.1). 앱은 코드 입력만.
import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { Link } from "@/navigation";
import { ArrowLeft, Images, Loader2 } from "lucide-react";

type PassItem = {
  code: string; status: string; source: string; issued_at: string; code_expires_at: string;
  mailbox_id: string | null; for_other: boolean; total: number; used: number; refundable: boolean;
};

const T = {
  ko: {
    back: "패스 목록",
    title: "사진함 패스",
    price: "₩9,900",
    priceNote: "부가세 포함 · 1장",
    lead: "부동산사진함에 참여할 때 쓰는 사진함 1개 전용 촬영 이용권입니다.",
    features: [
      "사진함 개설 또는 초대 수락 시에만 사용 — 사용한 사진함에서만 유효하고 다른 사진함에는 쓸 수 없어요.",
      "그 사진함에서 사진 100장까지, 사이즈 상관없이 찍을 수 있어요.",
      "인증·공개링크 자동 생성·인증서 PDF가 모두 포함돼요. 앱 카메라로 찍으면 Verified 등급입니다.",
      "기간 제한 없이 100장을 다 쓸 때까지 사용해요. 등록하지 않은 코드는 1년간 유효해요.",
      "사진은 5년간 보관돼요. 개설자가 Pro를 해지해도 유지됩니다.",
    ],
    notices: [
      "사진목록탭의 사진을 사진함에 등록할 때도 1장씩 차감됩니다. 꼭 필요한 사진만 등록해 주세요.",
      "100장을 모두 쓰면 사진함 패스를 추가하거나, 사진목록의 사진을 등록할 수 있어요(일반 이용 건수 차감).",
      "사진함에서 나가면 남은 장수를 쓸 수 없고, 다시 초대받아 참여하면 복구됩니다. 환불되지 않습니다(개설자가 대신 낸 경우도 같아요).",
      "사진함 삭제·회원탈퇴 시에도 남은 장수는 환불되지 않습니다.",
      "등록하지 않은 코드는 구매 후 7일 이내 전액 환불됩니다.",
    ],
    couponNote: "Pro 50% 할인권 2장으로도 사진함 패스 1장처럼 참여할 수 있어요.",
    buy: "구매하기",
    mine: "내 사진함 패스",
    loginToSee: "로그인하면 보유한 패스를 볼 수 있어요.",
    login: "로그인",
    none: "보유한 사진함 패스가 없어요.",
    loading: "불러오는 중…",
    st: { issued: "미등록", reserved: "대납 초대 예약 중", bound: "사용 중", exhausted: "소진", revoked: "회수됨", refunded: "환불됨" } as Record<string, string>,
    coupon: "할인권 전환",
    forOther: "다른 멤버 대납",
    usedOf: (u: number, t: number) => `${u}/${t}장 사용`,
    validUntil: "등록 기한",
    refund: "환불",
    refundConfirm: "이 코드를 환불할까요? 결제가 전액 취소되고 코드는 더 이상 쓸 수 없습니다.",
    refunded: "환불되었습니다.",
    refundFail: "환불하지 못했어요",
  },
  en: {
    back: "Passes",
    title: "Photo Box Pass",
    price: "₩9,900",
    priceNote: "VAT included · 1 pass",
    lead: "A capture pass for one photo box, used to join a real-estate photo box.",
    features: [
      "Used only when you create a photo box or accept an invitation — valid only in that photo box.",
      "Take up to 100 photos in that photo box, any size.",
      "Certification, automatic public links and certificate PDFs are included. App camera photos are Verified.",
      "No time limit until all 100 photos are used. Unregistered codes are valid for 1 year.",
      "Photos are kept for 5 years, even if the owner cancels Pro.",
    ],
    notices: [
      "Adding a photo from your List tab to the photo box also uses 1 photo. Add only the photos you need.",
      "After all 100 are used, add another pass or add List-tab photos (deducted from your regular usage).",
      "If you leave, the remaining photos are suspended and restored when you are invited back. No refunds (also when the owner paid for you).",
      "Remaining photos are not refunded if the photo box is deleted or you delete your account.",
      "Unregistered codes are fully refundable within 7 days of purchase.",
    ],
    couponNote: "Two Pro 50% coupons also work like one Photo Box Pass.",
    buy: "Buy",
    mine: "My Photo Box Passes",
    loginToSee: "Sign in to see your passes.",
    login: "Sign in",
    none: "You don't have any Photo Box Passes.",
    loading: "Loading…",
    st: { issued: "Unregistered", reserved: "Reserved for an invite", bound: "In use", exhausted: "Used up", revoked: "Revoked", refunded: "Refunded" } as Record<string, string>,
    coupon: "From coupons",
    forOther: "Paid for a member",
    usedOf: (u: number, t: number) => `${u}/${t} used`,
    validUntil: "Register by",
    refund: "Refund",
    refundConfirm: "Refund this code? The payment will be fully cancelled and the code can no longer be used.",
    refunded: "Refunded.",
    refundFail: "Refund failed",
  },
};

export default function PhotoboxPassPage() {
  const params = useParams<{ locale: string }>();
  const locale = (params?.locale as string) || "ko";
  const t = T[locale === "en" ? "en" : "ko"];
  const { status } = useSession();
  const [passes, setPasses] = useState<PassItem[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/photobox/passes", { cache: "no-store" });
    if (res.ok) setPasses(((await res.json()).passes ?? []) as PassItem[]);
    else setPasses([]);
  }, []);
  useEffect(() => {
    if (status === "authenticated") void load();
  }, [status, load]);

  const refund = async (code: string) => {
    if (!window.confirm(t.refundConfirm)) return;
    setBusy(code);
    setMsg(null);
    try {
      const res = await fetch("/api/photobox/refund", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const p = await res.json().catch(() => ({}));
      setMsg(res.ok ? t.refunded : `${t.refundFail}: ${p?.detail ?? res.status}`);
      await load();
    } finally {
      setBusy(null);
    }
  };

  const dateStr = (s: string) => new Date(s).toLocaleDateString(locale === "en" ? "en-US" : "ko-KR");
  return (
    <main className="min-h-screen px-6 py-12 bg-slate-50">
      <div className="w-full max-w-xl mx-auto">
        <Link href="/pass" className="inline-flex items-center gap-1 text-slate-500 hover:text-slate-900 text-sm mb-6">
          <ArrowLeft size={16} /> {t.back}
        </Link>

        <section className="bg-white border border-slate-200 rounded-3xl p-8 shadow-sm mb-6">
          <div className="flex items-start justify-between gap-4 mb-3">
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Images size={22} className="text-blue-600" /> {t.title}
            </h1>
            <div className="text-right">
              <p className="text-2xl font-extrabold">{t.price}</p>
              <p className="text-[11px] text-slate-500">{t.priceNote}</p>
            </div>
          </div>
          <p className="text-sm text-slate-600 mb-5">{t.lead}</p>
          <ul className="text-sm text-slate-700 space-y-2 mb-5 list-disc pl-5">
            {t.features.map((f) => <li key={f}>{f}</li>)}
          </ul>
          <div className="rounded-2xl bg-amber-50 border border-amber-200 px-4 py-3 text-xs text-amber-900 space-y-1.5 mb-5">
            {t.notices.map((n) => <p key={n}>· {n}</p>)}
          </div>
          <p className="text-xs text-slate-500 mb-5">{t.couponNote}</p>
          <Link
            href="/pass/photobox/checkout"
            className="block w-full text-center py-3.5 rounded-xl bg-blue-600 text-white font-bold hover:bg-blue-700 transition-colors"
          >
            {t.buy}
          </Link>
        </section>

        <section className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm">
          <h2 className="font-bold mb-3">{t.mine}</h2>
          {status !== "authenticated" ? (
            <p className="text-sm text-slate-500">
              {t.loginToSee}{" "}
              <Link href="/login?redirect=/pass/photobox" className="text-blue-600 font-semibold hover:underline">{t.login}</Link>
            </p>
          ) : passes === null ? (
            <p className="text-sm text-slate-500 flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> {t.loading}</p>
          ) : passes.length === 0 ? (
            <p className="text-sm text-slate-500">{t.none}</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {passes.map((p) => (
                <li key={p.code} className="py-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-mono text-sm font-bold select-all">{p.code}</p>
                    <p className="text-[11px] text-slate-500">
                      {t.st[p.status] ?? p.status}
                      {p.source === "coupon" ? ` · ${t.coupon}` : ""}
                      {p.for_other ? ` · ${t.forOther}` : ""}
                      {p.status === "bound" || p.status === "exhausted" ? ` · ${t.usedOf(p.used, p.total)}` : ""}
                      {p.status === "issued" ? ` · ${t.validUntil} ${dateStr(p.code_expires_at)}` : ""}
                    </p>
                  </div>
                  {p.refundable && (
                    <button
                      onClick={() => void refund(p.code)}
                      disabled={busy === p.code}
                      className="shrink-0 text-xs font-semibold px-3 py-1.5 rounded-lg border border-slate-300 hover:bg-slate-50 disabled:opacity-50"
                    >
                      {busy === p.code ? "…" : t.refund}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
          {msg && <p className="mt-3 text-xs text-slate-600">{msg}</p>}
        </section>
      </div>
    </main>
  );
}
