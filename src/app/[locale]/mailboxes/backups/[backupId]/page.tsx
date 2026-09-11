"use client";
// 백업본 상세 (A-81 2차 W2) — 백업 시각 기준 사서함 정보·참여자·사진(라이트박스)·[확인서 PDF]·[영구삭제]
// 2026-09-11 A-90: 세션 가드(401→로그인 callbackUrl)·403 안내·라이트박스 패널 스크롤·부분 복사 실패(copy_failed) 표시
import { Link } from "@/navigation";
import { useParams, usePathname, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import { ArrowLeft, ExternalLink, FileText, RefreshCw, Trash2 } from "lucide-react";
import ZoomableImage from "@/components/ZoomableImage";

import { downloadPdf, errorText, fmtBytes, fmtCaptured, fmtDateTime, getJson, loginUrl, type WMember, type WPhoto } from "@/lib/mailboxes/webClient";

interface BackupDetail {
  id: string; mailbox_id: string; mailbox_name: string; taken_at: string; copied_files: boolean; photo_count: number; member_count: number; bytes: number;
  mailbox: { id: string; name: string; description: string | null; owner_name: string; created_at: string; invite_status: string; locked: boolean; delete_after: string | null };
  members: (WMember & { state: "active" | "kicked" | "left" })[];
  photos: WPhoto[];
  /** 백업 시 복사 실패한 파일 수 (snapshot.copy_failed, A-87) */
  copy_failed?: number;
}

export default function BackupDetailPage() {
  const params = useParams();
  const pathname = usePathname();
  const router = useRouter();
  const lang = ((params?.locale as string) || "ko") === "en" ? "en" : "ko";
  const ko = lang === "ko";
  const backupId = params?.backupId as string;
  const { status } = useSession();
  const [b, setB] = useState<BackupDetail | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [open, setOpen] = useState<WPhoto | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (status === "unauthenticated") router.replace(loginUrl(lang, pathname || `/${lang}/mailboxes/backups/${backupId}`));
  }, [status, lang, pathname, backupId, router]);
  useEffect(() => {
    if (status !== "authenticated") return;
    getJson<{ backup: BackupDetail }>(`/api/mailboxes/backups/${backupId}`).then((d) => setB(d.backup)).catch((e) => {
      const msg = (e as Error).message;
      if (msg === "http_401" || msg === "unauthenticated") { router.replace(loginUrl(lang, pathname || `/${lang}/mailboxes/backups/${backupId}`)); return; }
      setErr(msg);
    });
  }, [status, backupId, lang, pathname, router]);

  const pdf = async () => {
    setBusy(true);
    try { await downloadPdf(`/api/mailboxes/backups/${backupId}/report?locale=${lang}`, `mailbox-backup-${backupId}.pdf`); }
    catch (e) { alert(errorText((e as Error).message, lang) ?? (ko ? "PDF 생성에 실패했습니다." : "PDF generation failed.")); } finally { setBusy(false); }
  };
  const remove = async () => {
    if (!b) return;
    if (!confirm(ko ? `${fmtDateTime(b.taken_at, lang)} 백업본을 영구삭제할까요? 복구할 수 없습니다.` : `Permanently delete this backup (${fmtDateTime(b.taken_at, lang)})? This cannot be undone.`)) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/mailboxes/backups/${backupId}`, { method: "DELETE" });
      if (!r.ok) throw new Error();
      router.replace(`/${lang}/mailboxes`);
    } catch { alert(ko ? "삭제에 실패했습니다." : "Delete failed."); setBusy(false); }
  };

  const active = b?.members.filter((m) => m.state === "active").length ?? 0;
  const copyFailed = b?.copy_failed ?? 0;
  const loadingView = <div className="flex items-center gap-2 text-sm text-slate-500"><RefreshCw className="animate-spin text-blue-500" size={16} /> {ko ? "불러오는 중…" : "Loading…"}</div>;
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <div className="max-w-5xl mx-auto px-6 py-10">
        <Link href="/mailboxes" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800 mb-6"><ArrowLeft size={14} /> {ko ? "사서함 목록" : "Mailboxes"}</Link>
        {status !== "authenticated" ? loadingView : err ? (
          <div className="rounded-xl bg-red-50 border border-red-200 text-red-800 text-sm px-4 py-3">
            {errorText(err, lang) ?? `${ko ? "백업본을 열 수 없습니다: " : "Cannot open backup: "}${err}`}
          </div>
        ) : !b ? loadingView : (
          <>
            <div className="rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-sm px-4 py-3 mb-4">
              {ko ? `📦 백업본 — ${fmtDateTime(b.taken_at, lang)} 시점의 상태입니다.` : `📦 Backup — state as of ${fmtDateTime(b.taken_at, lang)}.`}
              {b.copied_files ? (ko ? ` 사진 파일 포함(${fmtBytes(b.bytes)}).` : ` Includes photo files (${fmtBytes(b.bytes)}).`) : (ko ? " 사진은 원본 링크를 참조합니다(사서함 삭제 후에는 표시되지 않을 수 있음)." : " Photos reference the live links (may disappear after mailbox deletion).")}
              {copyFailed > 0 ? (ko ? ` ⚠️ 사진 파일 ${copyFailed}건은 백업 시 복사되지 않았습니다.` : ` ⚠️ ${copyFailed} photo file(s) could not be copied at backup time.`) : null}
            </div>
            <div className="flex flex-wrap items-start justify-between gap-4 mb-2">
              <div>
                <h1 className="text-2xl font-bold">{b.mailbox_name}</h1>
                <p className="text-xs text-slate-500 mt-1">{b.mailbox_id} · {ko ? `개설 ${fmtDateTime(b.mailbox.created_at, lang)} · 개설자 ${b.mailbox.owner_name}` : `Created ${fmtDateTime(b.mailbox.created_at, lang)} · Owner ${b.mailbox.owner_name}`}</p>
                {b.mailbox.description ? <p className="text-sm text-slate-600 mt-2 whitespace-pre-wrap">{b.mailbox.description}</p> : null}
              </div>
              <div className="flex gap-2">
                <button type="button" disabled={busy} onClick={() => void pdf()} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-500 disabled:opacity-40"><FileText size={14} /> {ko ? "확인서 PDF" : "Report PDF"}</button>
                <button type="button" disabled={busy} onClick={() => void remove()} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-red-300 text-red-700 bg-white text-sm font-semibold hover:bg-red-50 disabled:opacity-40"><Trash2 size={14} /> {ko ? "영구삭제" : "Delete permanently"}</button>
              </div>
            </div>

            <section className="mt-6">
              <h2 className="text-sm font-bold text-slate-500 mb-2">{ko ? `참여자 ${active}` : `Participants ${active}`}</h2>
              <div className="flex flex-wrap gap-2">
                {b.members.filter((m) => m.state !== "left").map((m) => (
                  <span key={m.user_id} className={`text-xs px-2.5 py-1 rounded-full border ${m.state === "kicked" ? "border-slate-200 text-slate-400 line-through" : "border-slate-300 bg-white"}`}>
                    {m.display_name}{m.role_text ? `(${m.role_text})` : ""}{m.kind === "owner" ? ` · ${ko ? "개설자" : "owner"}` : ""} · {fmtDateTime(m.accepted_at, lang)}
                  </span>
                ))}
              </div>
            </section>

            <section className="mt-8">
              <h2 className="text-sm font-bold text-slate-500 mb-3">{ko ? `사진 ${b.photos.length}` : `Photos ${b.photos.length}`}</h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                {b.photos.map((p) => (
                  <button key={p.id} type="button" onClick={() => setOpen(p)} className="text-left rounded-xl bg-white border border-slate-200 overflow-hidden hover:border-blue-300">
                    <div className="relative aspect-square bg-slate-100">
                      {p.image_url ? <img src={p.image_url} alt="" className="w-full h-full object-cover" /> : null}
                      <span className="absolute bottom-1.5 right-1.5 text-[11px] font-bold bg-black/60 text-white rounded-full px-1.5">{p.unread_count}</span>
                    </div>
                    <div className="p-2">
                      <p className="text-[11px] text-slate-500">{fmtCaptured(p.captured_at, lang)} · {p.uploader_name}{p.uploader_role ? `(${p.uploader_role})` : ""}</p>
                      <p className={`text-[11px] mt-0.5 ${p.memo ? "text-slate-700" : "text-slate-400"}`}>{p.memo || (ko ? "메모 없음" : "No memo")}</p>
                    </div>
                  </button>
                ))}
              </div>
            </section>
          </>
        )}
      </div>
      {open ? (
        <div className="fixed inset-0 z-50 bg-black/90 flex flex-col">
          <div className="flex-1 min-h-0">{open.image_url ? <ZoomableImage src={open.image_url} alt="" onClose={() => setOpen(null)} /> : null}</div>
          <div className="bg-white text-sm p-4 grid gap-1 sm:grid-cols-2 max-h-[45vh] overflow-y-auto">
            <div>{ko ? "올린사람" : "Uploaded by"}: <b>{open.uploader_name}{open.uploader_role ? `(${open.uploader_role})` : ""}</b></div>
            <div>{ko ? "촬영" : "Captured"}: {fmtCaptured(open.captured_at, lang)}</div>
            <div>{ko ? "좌표" : "Location"}: {open.lat != null && open.lng != null ? `${open.lat.toFixed(5)}, ${open.lng.toFixed(5)}` : "-"}</div>
            <div>{ko ? "등급" : "Tier"}: {open.tier === "verified" ? "Verified" : "Standard"}</div>
            <div className="sm:col-span-2 break-all">{ko ? "공개링크" : "Public link"}: <a className="text-blue-600 underline inline-flex items-center gap-1" href={open.link_url} target="_blank" rel="noreferrer">{open.link_url.replace(/^https?:\/\//, "")} <ExternalLink size={12} /></a></div>
            {open.memo ? <div className="sm:col-span-2 whitespace-pre-wrap break-words">{ko ? "공개메모" : "Memo"}: {open.memo}</div> : null}
            <div className="sm:col-span-2 text-slate-600">{ko ? `백업 시점 열람 ${open.read_count}/${active} · 미열람 ${open.unread_count}` : `Seen at backup ${open.read_count}/${active} · unseen ${open.unread_count}`}</div>
            {open.readers?.length ? <div className="sm:col-span-2 text-xs text-slate-500">{open.readers.map((r) => `${r.display_name}: ${r.read_at ? fmtDateTime(r.read_at, lang) : (ko ? "미열람" : "unseen")}`).join(" · ")}</div> : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
