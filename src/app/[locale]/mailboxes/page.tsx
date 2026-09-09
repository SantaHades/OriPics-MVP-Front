"use client";
// 웹 사서함 (A-81 2차, 2026-09-09) — 탭 [참여 중 | 백업]. 참여 중 = 앱과 같은 목록(현재 상태), 백업 = 내 저장소의 스냅샷(백업 시각·용량·PDF·영구삭제).
import { Link } from "@/navigation";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, FileText, Mailbox as MailboxIcon, RefreshCw, Trash2 } from "lucide-react";

import { downloadPdf, fmtBytes, fmtDateTime, getJson, type WBackup, type WMailbox } from "@/lib/mailboxes/webClient";

export default function MailboxesPage() {
  const params = useParams();
  const router = useRouter();
  const lang = ((params?.locale as string) || "ko") === "en" ? "en" : "ko";
  const ko = lang === "ko";
  const { status } = useSession();
  const [tab, setTab] = useState<"live" | "backups">("live");
  const [mine, setMine] = useState<WMailbox[]>([]);
  const [invited, setInvited] = useState<WMailbox[]>([]);
  const [backups, setBackups] = useState<WBackup[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [m, b] = await Promise.all([
        getJson<{ mine: WMailbox[]; invited: WMailbox[] }>("/api/mailboxes"),
        getJson<{ backups: WBackup[] }>("/api/mailboxes/backups").catch(() => ({ backups: [] })),
      ]);
      setMine(m.mine); setInvited(m.invited); setBackups(b.backups);
    } catch { /* 표시만 */ } finally { setLoading(false); }
  }, []);
  useEffect(() => {
    if (status === "unauthenticated") router.replace(`/${lang}/login`);
    if (status === "authenticated") void load();
  }, [status, lang, router, load]);

  const deleteBackup = async (b: WBackup) => {
    if (!confirm(ko ? `'${b.mailbox_name}' ${fmtDateTime(b.taken_at, lang)} 백업본을 영구삭제할까요? 복구할 수 없습니다.` : `Permanently delete the backup of '${b.mailbox_name}' from ${fmtDateTime(b.taken_at, lang)}? This cannot be undone.`)) return;
    setBusy(b.id);
    try {
      const r = await fetch(`/api/mailboxes/backups/${b.id}`, { method: "DELETE" });
      if (!r.ok) throw new Error();
      setBackups((prev) => prev.filter((x) => x.id !== b.id));
    } catch { alert(ko ? "삭제에 실패했습니다." : "Delete failed."); } finally { setBusy(null); }
  };
  const pdf = async (b: WBackup) => {
    setBusy(b.id);
    try { await downloadPdf(`/api/mailboxes/backups/${b.id}/report?locale=${lang}`, `mailbox-${b.mailbox_id}.pdf`); }
    catch { alert(ko ? "PDF 생성에 실패했습니다." : "PDF generation failed."); }
    finally { setBusy(null); }
  };

  const card = (mb: WMailbox) => (
    <Link key={mb.id} href={`/mailboxes/${mb.id}`} className="block rounded-2xl border border-slate-200 bg-white p-5 hover:border-blue-300 transition-colors">
      <div className="flex items-start justify-between gap-3">
        <h3 className="font-bold text-slate-900">{mb.name}</h3>
        <span className="text-xs text-slate-500 whitespace-nowrap">
          {mb.delete_after ? (ko ? `⚠️ ${fmtDateTime(mb.delete_after, lang)} 삭제 예정` : `⚠️ deletes ${fmtDateTime(mb.delete_after, lang)}`) : mb.locked ? (ko ? "🔒 잠금" : "🔒 Locked") : mb.invite_status !== "open" ? (ko ? "초대 종료" : "Invites closed") : ""}
        </span>
      </div>
      <p className="text-xs text-slate-500 mt-1">{ko ? `개설 ${fmtDateTime(mb.created_at, lang)} · 개설자 ${mb.owner_name}` : `Created ${fmtDateTime(mb.created_at, lang)} · Owner ${mb.owner_name}`}</p>
      {mb.description ? <p className="text-sm text-slate-600 mt-2 line-clamp-2">{mb.description}</p> : null}
      <p className={`text-sm mt-3 ${mb.unread_count > 0 ? "text-red-600 font-semibold" : "text-slate-500"}`}>
        {ko ? `사진 ${mb.photo_count} · 미열람 ${mb.unread_count} · 참여자 ${mb.member_count}` : `${mb.photo_count} photos · ${mb.unread_count} unread · ${mb.member_count} participants`}
      </p>
    </Link>
  );

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <div className="max-w-4xl mx-auto px-6 py-10">
        <Link href="/profile" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800 mb-6"><ArrowLeft size={14} /> {ko ? "내 정보" : "Profile"}</Link>
        <div className="flex items-center gap-3 mb-6">
          <MailboxIcon className="text-blue-600" size={22} />
          <h1 className="text-2xl font-bold">{ko ? "사서함" : "Mailboxes"}</h1>
          <button type="button" onClick={() => void load()} className="ml-auto text-slate-500 hover:text-slate-800" aria-label="refresh"><RefreshCw size={16} className={loading ? "animate-spin" : ""} /></button>
        </div>
        <div className="inline-flex rounded-xl bg-slate-200 p-1 mb-6">
          {(["live", "backups"] as const).map((k) => (
            <button key={k} type="button" onClick={() => setTab(k)} className={`px-4 py-1.5 rounded-lg text-sm font-semibold ${tab === k ? "bg-white shadow text-slate-900" : "text-slate-600"}`}>
              {k === "live" ? (ko ? "참여 중" : "Active") : (ko ? `백업 (${backups.length})` : `Backups (${backups.length})`)}
            </button>
          ))}
        </div>

        {tab === "live" ? (
          <div className="space-y-8">
            <section>
              <h2 className="text-sm font-bold text-slate-500 mb-3">{ko ? "나의 사서함" : "My mailboxes"}</h2>
              {mine.length === 0 ? <p className="text-sm text-slate-500">{ko ? "개설한 사서함이 없습니다. 개설은 앱 제출 탭에서 할 수 있습니다." : "No mailboxes yet. Create one in the app's Submit tab."}</p> : <div className="grid gap-3 sm:grid-cols-2">{mine.map(card)}</div>}
            </section>
            <section>
              <h2 className="text-sm font-bold text-slate-500 mb-3">{ko ? "초대받은 사서함" : "Invited mailboxes"}</h2>
              {invited.length === 0 ? <p className="text-sm text-slate-500">{ko ? "초대받은 사서함이 없습니다." : "No invited mailboxes."}</p> : <div className="grid gap-3 sm:grid-cols-2">{invited.map(card)}</div>}
            </section>
          </div>
        ) : (
          <section>
            <p className="text-xs text-slate-500 mb-3">{ko ? "백업은 그 시점의 사서함 상태(참여자·사진 속성·열람 현황)를 내 저장소에 남긴 스냅샷입니다. 사서함이 삭제돼도 백업본은 남고, 여기서 언제든 영구삭제할 수 있습니다." : "A backup is a snapshot of the mailbox state at that moment, kept in your storage. It survives mailbox deletion and can be permanently deleted here."}</p>
            {backups.length === 0 ? <p className="text-sm text-slate-500">{ko ? "백업본이 없습니다. 앱이나 사서함 페이지의 [백업]으로 만들 수 있습니다." : "No backups yet. Use [Back up] in the app or on a mailbox page."}</p> : (
              <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-slate-500 text-xs">
                    <tr><th className="text-left p-3">{ko ? "사서함" : "Mailbox"}</th><th className="text-left p-3">{ko ? "백업 시각" : "Backed up"}</th><th className="text-left p-3">{ko ? "내용" : "Contents"}</th><th className="text-left p-3">{ko ? "용량" : "Size"}</th><th className="p-3"></th></tr>
                  </thead>
                  <tbody>
                    {backups.map((b) => (
                      <tr key={b.id} className="border-t border-slate-100">
                        <td className="p-3 font-semibold">{b.mailbox_name}<div className="text-xs text-slate-500 font-normal">{b.mailbox_id}{b.owner_name ? ` · ${ko ? "개설자" : "owner"} ${b.owner_name}` : ""}</div></td>
                        <td className="p-3 whitespace-nowrap">{fmtDateTime(b.taken_at, lang)}</td>
                        <td className="p-3 whitespace-nowrap">{ko ? `사진 ${b.photo_count} · 참여자 ${b.member_count}${b.copied_files ? " · 파일 포함" : ""}` : `${b.photo_count} photos · ${b.member_count} participants${b.copied_files ? " · files copied" : ""}`}</td>
                        <td className="p-3 whitespace-nowrap">{b.copied_files ? fmtBytes(b.bytes) : (ko ? "참조만" : "refs only")}</td>
                        <td className="p-3 whitespace-nowrap text-right">
                          <Link href={`/mailboxes/backups/${b.id}`} className="text-blue-600 font-semibold hover:underline mr-3">{ko ? "열기" : "Open"}</Link>
                          <button type="button" disabled={busy === b.id} onClick={() => void pdf(b)} className="inline-flex items-center gap-1 text-blue-600 font-semibold hover:underline mr-3 disabled:opacity-40"><FileText size={14} /> PDF</button>
                          <button type="button" disabled={busy === b.id} onClick={() => void deleteBackup(b)} className="inline-flex items-center gap-1 text-red-600 font-semibold hover:underline disabled:opacity-40"><Trash2 size={14} /> {ko ? "영구삭제" : "Delete"}</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
