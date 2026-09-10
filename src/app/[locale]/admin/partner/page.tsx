"use client";

// 파트너 챌린지 최소 어드민 (A-82 §5) — ADMIN_EMAILS 세션만 API가 허용(403이면 안내).
// 탭: 참여자(초대 수·유효 수·플래그·회수) / 12명 검수(승인·반려) / 혜택(회수·복원·수동 발급) / 코드 부여.
// 한국어 고정(운영자 전용 화면).
import { Fragment, useCallback, useEffect, useState } from "react";

type Participant = {
  id: string; name: string | null; email: string | null; code: string | null; rank: number | null; joinedAt: string | null;
  referredByCode: string | null; ipHash: string | null; riskFlags: Record<string, unknown> | null; referralStatus: string | null;
  referrals: number; validReferrals: number; couponsAvailable: number; benefitsUsed: number;
  referralList: Array<{ id: string; nameMasked: string; joinedAt: string; valid: boolean; status: string; rewarded: boolean }>;
};

export default function PartnerAdminPage() {
  const [tab, setTab] = useState<"participants" | "milestones" | "benefits" | "tools">("participants");
  const [q, setQ] = useState("");
  const [data, setData] = useState<any>(null);
  const [forbidden, setForbidden] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const view = tab === "tools" ? "participants" : tab;
      const res = await fetch(`/api/admin/partner?view=${view}&q=${encodeURIComponent(q)}`, { cache: "no-store" });
      if (res.status === 403) {
        setForbidden(true);
        return;
      }
      setData(await res.json());
    } finally {
      setBusy(false);
    }
  }, [tab, q]);

  useEffect(() => {
    load();
  }, [load]);

  const act = async (body: Record<string, unknown>) => {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/partner", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const d = await res.json().catch(() => ({}));
      setMsg(res.ok ? `완료: ${JSON.stringify(d)}` : `실패: ${d?.detail ?? res.status}`);
      await load();
    } finally {
      setBusy(false);
    }
  };

  if (forbidden) {
    return (
      <main className="min-h-screen flex items-center justify-center p-6">
        <p className="text-sm text-slate-600">운영자 계정(ADMIN_EMAILS)으로 로그인해야 볼 수 있는 페이지입니다.</p>
      </main>
    );
  }

  const fmt = (d: string | null | undefined) => (d ? new Date(d).toLocaleString("ko-KR") : "—");

  return (
    <main className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-xl font-bold mb-1">파트너 릴레이 챌린지 — 운영</h1>
        {data?.stats && (
          <p className="text-xs text-slate-500 mb-4">
            파트너 {data.stats.partnersJoined}/{data.stats.cap} (잔여 {data.stats.remaining}) · 종료 {fmt(data.stats.campaignEnd)}
            {data?.suspiciousIps?.length ? ` · ⚠️ 같은 IP 3건+ 그룹 ${data.suspiciousIps.length}개` : ""}
          </p>
        )}
        <div className="flex flex-wrap gap-2 mb-4">
          {(["participants", "milestones", "benefits", "tools"] as const).map((k) => (
            <button key={k} onClick={() => setTab(k)} className={`px-3 py-1.5 rounded-lg text-sm font-semibold ${tab === k ? "bg-slate-900 text-white" : "bg-white border border-slate-200"}`}>
              {k === "participants" ? "참여자" : k === "milestones" ? "12명 검수" : k === "benefits" ? "혜택" : "코드·수동 발급"}
            </button>
          ))}
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="이메일·코드·이름 검색" className="ml-auto px-3 py-1.5 rounded-lg border border-slate-200 text-sm" />
          <button onClick={load} disabled={busy} className="px-3 py-1.5 rounded-lg border border-slate-200 text-sm">{busy ? "…" : "새로고침"}</button>
        </div>
        {msg && <p className="mb-3 text-xs px-3 py-2 rounded-lg bg-slate-100 break-all">{msg}</p>}

        {tab === "participants" && (
          <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  {["순번", "코드", "이름/이메일", "참여", "추천인 코드", "초대(유효)", "할인권", "사용", "플래그", ""].map((h) => (
                    <th key={h} className="text-left px-3 py-2 font-semibold">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(data?.participants as Participant[] | undefined)?.map((p) => (
                  <Fragment key={p.id}>
                    <tr className="hover:bg-slate-50">
                      <td className="px-3 py-2 tabular-nums">{p.rank ?? "—"}</td>
                      <td className="px-3 py-2 font-mono">{p.code ?? "—"}</td>
                      <td className="px-3 py-2">{p.name ?? "—"}<br /><span className="text-slate-400">{p.email}</span></td>
                      <td className="px-3 py-2">{fmt(p.joinedAt)}</td>
                      <td className="px-3 py-2 font-mono">{p.referredByCode ?? "—"}</td>
                      <td className="px-3 py-2 tabular-nums">{p.referrals} ({p.validReferrals})</td>
                      <td className="px-3 py-2 tabular-nums">{p.couponsAvailable}</td>
                      <td className="px-3 py-2 tabular-nums">{p.benefitsUsed}</td>
                      <td className="px-3 py-2 text-amber-700">{p.riskFlags ? JSON.stringify(p.riskFlags) : ""}{p.referralStatus === "revoked" ? " 회수됨" : ""}</td>
                      <td className="px-3 py-2">
                        <button onClick={() => setOpen(open === p.id ? null : p.id)} className="text-blue-600 hover:underline">{open === p.id ? "닫기" : "초대 목록"}</button>
                      </td>
                    </tr>
                    {open === p.id && (
                      <tr>
                        <td colSpan={10} className="px-3 py-2 bg-slate-50">
                          {p.referralList.length === 0 ? (
                            <span className="text-slate-400">초대 없음</span>
                          ) : (
                            <ul className="flex flex-wrap gap-2">
                              {p.referralList.map((r) => (
                                <li key={r.id} className={`px-2 py-1 rounded border ${r.status !== "confirmed" ? "border-red-200 text-red-600" : r.valid ? "border-emerald-200 text-emerald-700" : "border-slate-200 text-slate-500"}`}>
                                  {r.nameMasked} · {fmt(r.joinedAt)} · {r.status !== "confirmed" ? "회수" : r.valid ? "유효" : "가입만"}{!r.rewarded ? " · 미적립" : ""}
                                  {r.status === "confirmed" && (
                                    <button
                                      onClick={() => {
                                        const reason = window.prompt("회수 사유");
                                        if (reason !== null) act({ action: "revoke_referral", referralId: r.id, reason });
                                      }}
                                      className="ml-2 text-red-600 underline"
                                    >
                                      회수
                                    </button>
                                  )}
                                </li>
                              ))}
                            </ul>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {tab === "milestones" && (
          <div className="rounded-2xl border border-slate-200 bg-white divide-y divide-slate-100 text-sm">
            {(data?.milestones ?? []).length === 0 && <p className="p-4 text-slate-400 text-xs">검수 대기 없음</p>}
            {(data?.milestones ?? []).map((m: any) => (
              <div key={m.userId} className="p-4 flex flex-wrap items-center gap-3">
                <div className="flex-1">
                  <p className="font-semibold">{m.user?.name ?? "—"} <span className="text-slate-400 font-normal">{m.user?.email} · 코드 {m.user?.partnerCode} · 순번 {m.user?.partnerRank ?? "—"}</span></p>
                  <p className="text-xs text-slate-500">도달 {fmt(m.reachedAt)} · {m.approvedAt ? `승인 ${fmt(m.approvedAt)} (${m.approvedBy})` : m.rejectedAt ? `반려 ${fmt(m.rejectedAt)} — ${m.rejectReason ?? ""}` : "검수 대기"}</p>
                </div>
                {!m.approvedAt && (
                  <>
                    <button onClick={() => act({ action: "approve_milestone", userId: m.userId })} disabled={busy} className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-bold">승인 → 1개월 무료 이용권 6장 발급</button>
                    <button
                      onClick={() => {
                        const reason = window.prompt("반려 사유");
                        if (reason !== null) act({ action: "reject_milestone", userId: m.userId, reason });
                      }}
                      disabled={busy}
                      className="px-3 py-1.5 rounded-lg border border-red-200 text-red-600 text-xs font-bold"
                    >
                      반려
                    </button>
                  </>
                )}
              </div>
            ))}
          </div>
        )}

        {tab === "benefits" && (
          <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 text-slate-500">
                <tr>{["이메일", "코드", "종류", "출처", "상태", "발급", "만료", "사용", "결제ID", ""].map((h) => <th key={h} className="text-left px-3 py-2 font-semibold">{h}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(data?.benefits ?? []).map((b: any) => (
                  <tr key={b.id}>
                    <td className="px-3 py-2">{b.user?.email}</td>
                    <td className="px-3 py-2 font-mono">{b.user?.partnerCode}</td>
                    <td className="px-3 py-2">{b.type === "pro_50" ? "50% 할인권" : "1개월 무료 이용권"}</td>
                    <td className="px-3 py-2">{b.source}</td>
                    <td className="px-3 py-2">{b.status}{b.revokedReason ? ` (${b.revokedReason})` : ""}</td>
                    <td className="px-3 py-2">{fmt(b.issuedAt)}</td>
                    <td className="px-3 py-2">{fmt(b.expiresAt)}</td>
                    <td className="px-3 py-2">{fmt(b.usedAt)}</td>
                    <td className="px-3 py-2 font-mono">{b.paymentId ?? ""}</td>
                    <td className="px-3 py-2">
                      {(b.status === "available" || b.status === "reserved") && (
                        <button onClick={() => { const reason = window.prompt("회수 사유"); if (reason !== null) act({ action: "revoke_benefit", benefitId: b.id, reason }); }} className="text-red-600 underline">회수</button>
                      )}
                      {b.status === "revoked" && <button onClick={() => act({ action: "restore_benefit", benefitId: b.id })} className="text-blue-600 underline">복원</button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {tab === "tools" && (
          <div className="grid md:grid-cols-2 gap-4">
            <ToolForm
              title="파트너코드 수동 부여 (제휴사 100~999 · 대표 1234)"
              fields={[{ k: "email", label: "이메일" }, { k: "code", label: "코드" }]}
              onSubmit={(v) => act({ action: "assign_code", email: v.email, code: v.code })}
              busy={busy}
            />
            <ToolForm
              title="혜택 수동 발급"
              fields={[{ k: "userId", label: "userId" }, { k: "type", label: "pro_50 | pro_free_month" }, { k: "count", label: "장수(1~12)" }]}
              onSubmit={(v) => act({ action: "grant_benefit", userId: v.userId, type: v.type, count: Number(v.count || 1) })}
              busy={busy}
            />
          </div>
        )}
      </div>
    </main>
  );
}

function ToolForm({ title, fields, onSubmit, busy }: { title: string; fields: Array<{ k: string; label: string }>; onSubmit: (v: Record<string, string>) => void; busy: boolean }) {
  const [v, setV] = useState<Record<string, string>>({});
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(v);
      }}
      className="rounded-2xl border border-slate-200 bg-white p-4 space-y-2"
    >
      <p className="text-sm font-bold">{title}</p>
      {fields.map((f) => (
        <input key={f.k} value={v[f.k] ?? ""} onChange={(e) => setV({ ...v, [f.k]: e.target.value })} placeholder={f.label} className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm" />
      ))}
      <button type="submit" disabled={busy} className="px-3 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-bold">실행</button>
    </form>
  );
}
