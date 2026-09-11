"use client";

// 파트너 챌린지 최소 어드민 (A-82 §5) — ADMIN_EMAILS 세션만 API가 허용.
// 탭: 참여자(초대 수·유효 수·플래그·회수) / 12명 검수(승인·반려) / 혜택(회수·복원·수동 발급) / 코드 부여.
// 한국어 고정(운영자 전용 화면).
// A-92 ⑤: 401(로그인 이동)·403(권한 안내)·503/기타(오류 배너+재시도) 구분, window.prompt → 인라인 사유 폼,
//          API 결과를 raw JSON 대신 읽을 수 있는 한 줄로, GET `metrics` 요약 행(API가 주기 전엔 숨김).
import { Fragment, useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { PARTNER } from "@/lib/partner/config";

type Participant = {
  id: string; name: string | null; email: string | null; code: string | null; rank: number | null; joinedAt: string | null;
  referredByCode: string | null; ipHash: string | null; riskFlags: Record<string, unknown> | null; referralStatus: string | null;
  referrals: number; validReferrals: number; couponsAvailable: number; benefitsUsed: number;
  referralList: Array<{ id: string; nameMasked: string; joinedAt: string; valid: boolean; status: string; rewarded: boolean }>;
};

/** GET 응답의 선택 필드 — 다른 에이전트가 API에 추가 중. 없으면 요약 행을 그리지 않는다 */
type Metrics = Partial<{
  participants: number;
  participantsViaCode: number;
  joinRate: number;
  proConverted: number;
  proConversionRate: number;
  discountTotalKrw: number;
  freeMonthsIssued: number;
  milestonesPending: number;
}>;

type LoadError = { kind: "forbidden" } | { kind: "error"; status: number; detail?: string };

/** 인라인 사유 폼의 대상 — 어떤 버튼이 열었는지 (`ref:<id>` · `ms:<userId>` · `bf:<id>`) */
type ReasonTarget = { key: string; label: string; submit: (reason: string) => void };

const ACTION_LABEL: Record<string, string> = {
  approve_milestone: "12명 검수 승인",
  reject_milestone: "12명 검수 반려",
  revoke_benefit: "혜택 회수",
  restore_benefit: "혜택 복원",
  grant_benefit: "혜택 수동 발급",
  assign_code: "파트너코드 부여",
  revoke_referral: "추천 회수",
};
const DETAIL_LABEL: Record<string, string> = {
  forbidden: "권한이 없습니다 (ADMIN_EMAILS 확인)",
  invalid_json: "요청 본문이 올바르지 않습니다",
  invalid_action: "알 수 없는 작업",
  user_not_found: "해당 사용자를 찾을 수 없습니다",
  invalid_code: "코드 형식이 올바르지 않습니다 (3~8자리 숫자)",
  code_taken: "이미 다른 계정이 쓰는 코드입니다",
  not_found: "대상을 찾을 수 없습니다",
  rate_limited: "요청이 많습니다. 잠시 후 다시 시도해 주세요",
};

/** POST 결과 → 사람이 읽는 한 줄 */
function describeResult(action: string, ok: boolean, status: number, d: any): string {
  const name = ACTION_LABEL[action] ?? action;
  if (!ok) {
    const detail = typeof d?.detail === "string" ? d.detail : typeof d?.code === "string" ? d.code : null;
    return `${name} 실패 — ${detail ? DETAIL_LABEL[detail] ?? detail : `HTTP ${status}`}`;
  }
  switch (action) {
    case "approve_milestone":
      return d?.result === "granted"
        ? `${name} 완료 — 1개월 무료 이용권 ${PARTNER.MILESTONE_FREE_MONTHS}장 발급·메일 발송`
        : d?.result === "already"
          ? `${name} — 이미 승인된 건입니다 (변경 없음)`
          : d?.result === "not_reached"
            ? `${name} — 아직 ${PARTNER.MILESTONE_COUNT}명 미달이라 승인할 수 없습니다`
            : `${name} 완료`;
    case "reject_milestone":
      return `${name} 완료 — 반려 사유가 기록되었습니다`;
    case "revoke_benefit":
      return d?.count === 0 ? `${name} — 회수 가능한(사용 가능·예약) 상태가 아니어서 변경 없음` : `${name} 완료 — ${d?.count ?? 1}건 회수`;
    case "restore_benefit":
      return d?.count === 0 ? `${name} — 회수됨 상태가 아니어서 변경 없음` : `${name} 완료 — ${d?.count ?? 1}건 복원`;
    case "grant_benefit":
      return `${name} 완료 — ${d?.count ?? "?"}장 발급`;
    case "assign_code":
      return `${name} 완료 — 코드 ${d?.code ?? ""}${d?.reservedRange ? " (예약 범위: 대표·제휴사, 500명 카운트 제외)" : ""}`;
    case "revoke_referral":
      return `${name} 완료 — 추천 무효 처리·연결된 미사용 혜택 회수`;
    default:
      return `${name} 완료`;
  }
}

export default function PartnerAdminPage() {
  const params = useParams<{ locale: string }>();
  const locale = params?.locale ?? "ko";
  const [tab, setTab] = useState<"participants" | "milestones" | "benefits" | "tools">("participants");
  const [q, setQ] = useState("");
  const [data, setData] = useState<any>(null);
  const [loadError, setLoadError] = useState<LoadError | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [reasonTarget, setReasonTarget] = useState<ReasonTarget | null>(null);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const view = tab === "tools" ? "participants" : tab;
      const res = await fetch(`/api/admin/partner?view=${view}&q=${encodeURIComponent(q)}`, { cache: "no-store" });
      if (res.status === 401) {
        // 세션 없음 → 로그인 후 이 페이지로 복귀
        window.location.href = `/${locale}/login?redirect=${encodeURIComponent(`/${locale}/admin/partner`)}`;
        return;
      }
      if (res.status === 403) {
        setLoadError({ kind: "forbidden" });
        return;
      }
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setLoadError({ kind: "error", status: res.status, detail: typeof d?.detail === "string" ? d.detail : undefined });
        return;
      }
      setData(await res.json());
      setLoadError(null);
    } catch {
      setLoadError({ kind: "error", status: 0 });
    } finally {
      setBusy(false);
    }
  }, [tab, q, locale]);

  useEffect(() => {
    load();
  }, [load]);

  const act = async (body: Record<string, unknown>) => {
    setBusy(true);
    setMsg(null);
    setReasonTarget(null);
    const action = String(body.action ?? "");
    try {
      const res = await fetch("/api/admin/partner", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const d = await res.json().catch(() => ({}));
      setMsg({ ok: res.ok, text: describeResult(action, res.ok, res.status, d) });
      if (res.ok) await load();
    } catch {
      setMsg({ ok: false, text: `${ACTION_LABEL[action] ?? action} 실패 — 네트워크 오류` });
    } finally {
      setBusy(false);
    }
  };

  /** 사유가 필요한 작업의 버튼 자리에 인라인 폼을 띄운다 (window.prompt 대체) */
  const openReason = (key: string, label: string, submit: (reason: string) => void) => setReasonTarget({ key, label, submit });
  const reasonForm = (key: string) =>
    reasonTarget?.key === key ? <InlineReason target={reasonTarget} busy={busy} onCancel={() => setReasonTarget(null)} /> : null;

  if (loadError?.kind === "forbidden") {
    return (
      <main className="min-h-screen flex items-center justify-center p-6">
        <p className="text-sm text-slate-600">운영자 계정(ADMIN_EMAILS)으로 로그인해야 볼 수 있는 페이지입니다.</p>
      </main>
    );
  }

  const fmt = (d: string | null | undefined) => (d ? new Date(d).toLocaleString("ko-KR") : "—");
  const fmtWon = (n: number) => `₩${new Intl.NumberFormat("ko-KR").format(n)}`;
  const fmtPct = (r: number) => `${(r <= 1 ? r * 100 : r).toFixed(1)}%`;
  const metrics = (data?.metrics ?? null) as Metrics | null;

  return (
    <main className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-xl font-bold mb-1">파트너 릴레이 챌린지 — 운영</h1>
        {data?.stats && (
          <p className="text-xs text-slate-500 mb-2">
            파트너 {data.stats.partnersJoined}/{data.stats.cap} (잔여 {data.stats.remaining}) · 종료 {fmt(data.stats.campaignEnd)}
            {data?.suspiciousIps?.length ? ` · ⚠️ 같은 IP 3건+ 그룹 ${data.suspiciousIps.length}개` : ""}
          </p>
        )}
        {/* 지표 요약 (§5 주 1회 지표) — API가 metrics를 주기 시작하면 자동 표시 */}
        {metrics && Object.keys(metrics).length > 0 && (
          <dl className="mb-4 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2 text-xs">
            {[
              ["참여자", metrics.participants],
              ["코드 입력 가입", metrics.participantsViaCode],
              ["코드 가입 비율", metrics.joinRate != null ? fmtPct(metrics.joinRate) : undefined],
              ["Pro 전환", metrics.proConverted],
              ["Pro 전환율", metrics.proConversionRate != null ? fmtPct(metrics.proConversionRate) : undefined],
              ["할인 총액", metrics.discountTotalKrw != null ? fmtWon(metrics.discountTotalKrw) : undefined],
              ["무료 이용권 발급", metrics.freeMonthsIssued],
              ["검수 대기", metrics.milestonesPending],
            ]
              .filter(([, v]) => v !== undefined && v !== null)
              .map(([k, v]) => (
                <div key={String(k)} className="rounded-lg bg-white border border-slate-200 px-3 py-2">
                  <dt className="text-slate-500">{k}</dt>
                  <dd className="font-bold tabular-nums text-sm">{String(v)}</dd>
                </div>
              ))}
          </dl>
        )}
        <div className="flex flex-wrap gap-2 mb-4">
          {(["participants", "milestones", "benefits", "tools"] as const).map((k) => (
            <button key={k} type="button" onClick={() => setTab(k)} aria-pressed={tab === k} className={`px-3 py-1.5 rounded-lg text-sm font-semibold ${tab === k ? "bg-slate-900 text-white" : "bg-white border border-slate-200"}`}>
              {k === "participants" ? "참여자" : k === "milestones" ? "12명 검수" : k === "benefits" ? "혜택" : "코드·수동 발급"}
            </button>
          ))}
          <label htmlFor="admin-partner-q" className="sr-only">검색</label>
          <input id="admin-partner-q" value={q} onChange={(e) => setQ(e.target.value)} placeholder="이메일·코드·이름 검색" className="ml-auto px-3 py-1.5 rounded-lg border border-slate-200 text-sm" />
          <button type="button" onClick={load} disabled={busy} aria-busy={busy} className="px-3 py-1.5 rounded-lg border border-slate-200 text-sm">{busy ? "…" : "새로고침"}</button>
        </div>

        {loadError?.kind === "error" && (
          <div role="alert" className="mb-3 flex flex-wrap items-center gap-3 text-xs px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-red-700">
            <span>
              {loadError.status === 0
                ? "네트워크 오류로 목록을 불러오지 못했습니다."
                : loadError.status === 503
                  ? "서버가 일시적으로 응답하지 않습니다 (503)."
                  : `목록을 불러오지 못했습니다 (HTTP ${loadError.status}${loadError.detail ? ` · ${DETAIL_LABEL[loadError.detail] ?? loadError.detail}` : ""}).`}
            </span>
            <button type="button" onClick={load} disabled={busy} className="ml-auto px-2 py-1 rounded border border-red-300 font-semibold hover:bg-red-100">다시 시도</button>
          </div>
        )}
        {msg && (
          <p role={msg.ok ? "status" : "alert"} className={`mb-3 text-xs px-3 py-2 rounded-lg break-words ${msg.ok ? "bg-emerald-50 text-emerald-800 border border-emerald-200" : "bg-red-50 text-red-700 border border-red-200"}`}>
            {msg.text}
          </p>
        )}

        {tab === "participants" && (
          <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  {["순번", "코드", "이름/이메일", "참여", "추천인 코드", "초대(유효)", "할인권", "사용", "플래그", ""].map((h, i) => (
                    <th key={`${h}-${i}`} className="text-left px-3 py-2 font-semibold">{h}</th>
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
                        <button type="button" onClick={() => setOpen(open === p.id ? null : p.id)} aria-expanded={open === p.id} className="text-blue-600 hover:underline">{open === p.id ? "닫기" : "초대 목록"}</button>
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
                                    <>
                                      <button
                                        type="button"
                                        onClick={() => openReason(`ref:${r.id}`, `${r.nameMasked} 추천 회수 사유`, (reason) => act({ action: "revoke_referral", referralId: r.id, reason }))}
                                        className="ml-2 text-red-600 underline"
                                      >
                                        회수
                                      </button>
                                      {reasonForm(`ref:${r.id}`)}
                                    </>
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
                {data && (data.participants?.length ?? 0) === 0 && (
                  <tr><td colSpan={10} className="px-3 py-4 text-slate-400">참여자 없음</td></tr>
                )}
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
                    <button type="button" onClick={() => act({ action: "approve_milestone", userId: m.userId })} disabled={busy} className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-bold disabled:opacity-50">
                      승인 → 1개월 무료 이용권 {PARTNER.MILESTONE_FREE_MONTHS}장 발급
                    </button>
                    <button
                      type="button"
                      onClick={() => openReason(`ms:${m.userId}`, `${m.user?.email ?? m.userId} 반려 사유`, (reason) => act({ action: "reject_milestone", userId: m.userId, reason }))}
                      disabled={busy}
                      className="px-3 py-1.5 rounded-lg border border-red-200 text-red-600 text-xs font-bold disabled:opacity-50"
                    >
                      반려
                    </button>
                    {reasonForm(`ms:${m.userId}`)}
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
                <tr>{["이메일", "코드", "종류", "출처", "상태", "발급", "만료", "사용", "결제ID", ""].map((h, i) => <th key={`${h}-${i}`} className="text-left px-3 py-2 font-semibold">{h}</th>)}</tr>
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
                        <>
                          <button
                            type="button"
                            onClick={() => openReason(`bf:${b.id}`, `${b.user?.email ?? b.id} 혜택 회수 사유`, (reason) => act({ action: "revoke_benefit", benefitId: b.id, reason }))}
                            className="text-red-600 underline"
                          >
                            회수
                          </button>
                          {reasonForm(`bf:${b.id}`)}
                        </>
                      )}
                      {b.status === "revoked" && <button type="button" onClick={() => act({ action: "restore_benefit", benefitId: b.id })} disabled={busy} className="text-blue-600 underline">복원</button>}
                    </td>
                  </tr>
                ))}
                {data && (data.benefits?.length ?? 0) === 0 && (
                  <tr><td colSpan={10} className="px-3 py-4 text-slate-400">혜택 없음</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {tab === "tools" && (
          <div className="grid md:grid-cols-2 gap-4">
            <ToolForm
              title={`파트너코드 수동 부여 (제휴사 100~999 · 대표 ${PARTNER.OWNER_CODE})`}
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

/** 회수·반려 사유 인라인 폼 — 버튼 자리에 펼쳐지고 Enter/실행으로 제출, Esc/취소로 닫힘 */
function InlineReason({ target, busy, onCancel }: { target: ReasonTarget; busy: boolean; onCancel: () => void }) {
  const [reason, setReason] = useState("");
  const inputId = `reason-${target.key.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        target.submit(reason.trim());
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") onCancel();
      }}
      className="mt-1.5 flex flex-wrap items-center gap-1.5 w-full"
    >
      <label htmlFor={inputId} className="text-[11px] text-slate-500 w-full">{target.label}</label>
      <input
        id={inputId}
        autoFocus
        value={reason}
        maxLength={300}
        onChange={(e) => setReason(e.target.value)}
        placeholder="사유 (선택, 300자)"
        className="flex-1 min-w-[10rem] px-2 py-1 rounded border border-slate-300 text-xs text-slate-800"
      />
      <button type="submit" disabled={busy} aria-busy={busy} className="px-2 py-1 rounded bg-red-600 text-white text-[11px] font-bold disabled:opacity-50">실행</button>
      <button type="button" onClick={onCancel} className="px-2 py-1 rounded border border-slate-300 text-[11px] text-slate-600">취소</button>
    </form>
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
        <div key={f.k}>
          <label htmlFor={`tool-${f.k}`} className="sr-only">{f.label}</label>
          <input id={`tool-${f.k}`} value={v[f.k] ?? ""} onChange={(e) => setV({ ...v, [f.k]: e.target.value })} placeholder={f.label} className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm" />
        </div>
      ))}
      <button type="submit" disabled={busy} aria-busy={busy} className="px-3 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-bold disabled:opacity-50">실행</button>
    </form>
  );
}
