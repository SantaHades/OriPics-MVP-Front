"use client";
// 웹 사서함 실시간 열람 (A-81 2차 W3) — 참여 중 사서함의 현재 상태: 정보·참여자·사진 그리드(라이트박스=열람 기록)·[백업]·[확인서 PDF]
import { Link } from "@/navigation";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, Download, ExternalLink, FileText, RefreshCw, Save } from "lucide-react";
import ZoomableImage from "@/components/ZoomableImage";

import { downloadPdf, fmtCaptured, fmtDateTime, getJson, type WMailbox, type WMember, type WPhoto } from "@/lib/mailboxes/webClient";

export default function MailboxLivePage() {
  const params = useParams();
  const lang = ((params?.locale as string) || "ko") === "en" ? "en" : "ko";
  const ko = lang === "ko";
  const id = params?.id as string;
  const [mb, setMb] = useState<WMailbox | null>(null);
  const [members, setMembers] = useState<WMember[]>([]);
  const [photos, setPhotos] = useState<WPhoto[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [open, setOpen] = useState<WPhoto | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [d, p] = await Promise.all([
        getJson<{ mailbox: WMailbox; members: WMember[] }>(`/api/mailboxes/${encodeURIComponent(id)}?locale=${lang}`),
        getJson<{ photos: WPhoto[] }>(`/api/mailboxes/${encodeURIComponent(id)}/photos?locale=${lang}`),
      ]);
      setMb(d.mailbox); setMembers(d.members); setPhotos(p.photos); setErr(null);
    } catch (e) { setErr((e as Error).message); }
  }, [id, lang]);
  useEffect(() => { void load(); const t = setInterval(() => void load(), 15000); return () => clearInterval(t); }, [load]);

  const openPhoto = (p: WPhoto) => {
    setOpen(p);
    if (!p.read_by_me) {
      fetch(`/api/mailboxes/${encodeURIComponent(id)}/photos/${p.id}/read`, { method: "POST" })
        .then(() => setPhotos((prev) => prev.map((x) => (x.id === p.id ? { ...x, read_by_me: true, read_count: x.read_count + 1, unread_count: Math.max(x.unread_count - 1, 0) } : x))))
        .catch(() => {});
    }
  };
  const backup = async () => {
    setBusy("backup");
    try {
      const r = await fetch(`/api/mailboxes/${encodeURIComponent(id)}/backups?locale=${lang}`, { method: "POST" });
      if (!r.ok) throw new Error();
      const d = await r.json();
      setToast(ko ? `${fmtDateTime(d.backup.taken_at, lang)} 백업본이 저장소에 저장되었습니다.` : `Backup saved (${fmtDateTime(d.backup.taken_at, lang)}).`);
      setTimeout(() => setToast(null), 4000);
    } catch { alert(ko ? "백업에 실패했습니다." : "Backup failed."); } finally { setBusy(null); }
  };
  const pdf = async () => {
    setBusy("pdf");
    try { await downloadPdf(`/api/mailboxes/${encodeURIComponent(id)}/report?locale=${lang}`, `mailbox-${id}.pdf`); }
    catch { alert(ko ? "PDF 생성에 실패했습니다." : "PDF generation failed."); } finally { setBusy(null); }
  };

  const active = members.filter((m) => !m.kicked && !m.left);
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <div className="max-w-5xl mx-auto px-6 py-10">
        <Link href="/mailboxes" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800 mb-6"><ArrowLeft size={14} /> {ko ? "사서함 목록" : "Mailboxes"}</Link>
        {err ? <p className="text-sm text-red-600">{ko ? "사서함을 열 수 없습니다: " : "Cannot open mailbox: "}{err}</p> : !mb ? <RefreshCw className="animate-spin text-blue-500" /> : (
          <>
            {mb.delete_after ? <div className="rounded-xl bg-red-50 border border-red-200 text-red-800 text-sm px-4 py-3 mb-4">{ko ? `⚠️ 개설자가 삭제를 예고했습니다. ${fmtDateTime(mb.delete_after, lang)}에 삭제됩니다. 지금 백업해 두세요.` : `⚠️ Deletion scheduled for ${fmtDateTime(mb.delete_after, lang)}. Back up now.`}</div> : mb.locked ? <div className="rounded-xl bg-indigo-50 border border-indigo-200 text-indigo-800 text-sm px-4 py-3 mb-4">{ko ? "🔒 잠긴 사서함(읽기 전용)" : "🔒 Locked (read-only)"}</div> : null}
            <div className="flex flex-wrap items-start justify-between gap-4 mb-2">
              <div>
                <h1 className="text-2xl font-bold">{mb.name}</h1>
                <p className="text-xs text-slate-500 mt-1">{mb.id} · {ko ? `개설 ${fmtDateTime(mb.created_at, lang)} · 개설자 ${mb.owner_name}` : `Created ${fmtDateTime(mb.created_at, lang)} · Owner ${mb.owner_name}`}</p>
                {mb.description ? <p className="text-sm text-slate-600 mt-2 whitespace-pre-wrap">{mb.description}</p> : null}
              </div>
              <div className="flex gap-2">
                <button type="button" disabled={!!busy} onClick={() => void backup()} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-300 bg-white text-sm font-semibold hover:bg-slate-50 disabled:opacity-40"><Save size={14} /> {ko ? "백업" : "Back up"}</button>
                <button type="button" disabled={!!busy} onClick={() => void pdf()} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-500 disabled:opacity-40"><FileText size={14} /> {ko ? "확인서 PDF" : "Report PDF"}</button>
              </div>
            </div>
            {toast ? <p className="text-sm text-emerald-700 mb-2">{toast}</p> : null}

            <section className="mt-6">
              <h2 className="text-sm font-bold text-slate-500 mb-2">{ko ? `참여자 ${active.length}` : `Participants ${active.length}`}</h2>
              <div className="flex flex-wrap gap-2">
                {members.filter((m) => !m.left).map((m) => (
                  <span key={m.user_id} className={`text-xs px-2.5 py-1 rounded-full border ${m.kicked ? "border-slate-200 text-slate-400 line-through" : "border-slate-300 bg-white"}`}>
                    {m.display_name}{m.role_text ? `(${m.role_text})` : ""}{m.kind === "owner" ? ` · ${ko ? "개설자" : "owner"}` : ""} · {fmtDateTime(m.accepted_at, lang)}
                  </span>
                ))}
              </div>
            </section>

            <section className="mt-8">
              <h2 className="text-sm font-bold text-slate-500 mb-3">{ko ? `사진 ${photos.length}` : `Photos ${photos.length}`}</h2>
              {photos.length === 0 ? <p className="text-sm text-slate-500">{ko ? "아직 사진이 없습니다." : "No photos yet."}</p> : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                  {photos.map((p) => (
                    <button key={p.id} type="button" onClick={() => openPhoto(p)} className="text-left rounded-xl bg-white border border-slate-200 overflow-hidden hover:border-blue-300">
                      <div className="relative aspect-square bg-slate-100">
                        {p.image_url ? <img src={p.image_url} alt="" className="w-full h-full object-cover" /> : null}
                        {!p.read_by_me ? <span className="absolute top-1.5 left-1.5 text-[10px] font-bold bg-red-600 text-white rounded px-1">N</span> : null}
                        <span className="absolute bottom-1.5 right-1.5 text-[11px] font-bold bg-black/60 text-white rounded-full px-1.5">{p.unread_count}</span>
                      </div>
                      <div className="p-2">
                        <p className="text-[11px] text-slate-500">{fmtCaptured(p.captured_at, lang)} · {p.uploader_name}{p.uploader_role ? `(${p.uploader_role})` : ""}</p>
                        <p className={`text-[11px] mt-0.5 ${p.memo ? "text-slate-700" : "text-slate-400"}`}>{p.memo || (ko ? "메모 없음" : "No memo")}</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </div>

      {open ? (
        <div className="fixed inset-0 z-50 bg-black/90 flex flex-col">
          <div className="flex-1 min-h-0">{open.image_url ? <ZoomableImage src={open.image_url} alt="" onClose={() => setOpen(null)} /> : null}</div>
          <div className="bg-white text-sm p-4 grid gap-1 sm:grid-cols-2">
            <div>{ko ? "올린사람" : "Uploaded by"}: <b>{open.uploader_name}{open.uploader_role ? `(${open.uploader_role})` : ""}</b> · {open.source === "capture" ? (ko ? "사서함 촬영" : "captured") : (ko ? "제출" : "submitted")}</div>
            <div>{ko ? "촬영" : "Captured"}: {fmtCaptured(open.captured_at, lang)}</div>
            <div>{ko ? "좌표" : "Location"}: {open.lat != null && open.lng != null ? <a className="text-blue-600 underline" target="_blank" rel="noreferrer" href={`https://maps.google.com/?q=${open.lat},${open.lng}`}>{open.lat.toFixed(5)}, {open.lng.toFixed(5)}</a> : "-"}</div>
            <div>{ko ? "등급" : "Tier"}: {open.tier === "verified" ? "Verified" : "Standard"}</div>
            <div className="sm:col-span-2">{ko ? "공개링크" : "Public link"}: <a className="text-blue-600 underline inline-flex items-center gap-1" href={open.link_url} target="_blank" rel="noreferrer">{open.link_url.replace(/^https?:\/\//, "")} <ExternalLink size={12} /></a></div>
            {open.memo ? <div className="sm:col-span-2">{ko ? "공개메모" : "Memo"}: {open.memo}</div> : null}
            <div className="sm:col-span-2 text-slate-600">{ko ? `열람 ${open.read_count}/${active.length} · 미열람 ${Math.max(active.length - open.read_count, 0)}` : `Seen ${open.read_count}/${active.length} · unseen ${Math.max(active.length - open.read_count, 0)}`}</div>
            <div className="sm:col-span-2 text-right"><a className="inline-flex items-center gap-1 text-blue-600 font-semibold" href={open.link_url} target="_blank" rel="noreferrer"><Download size={14} /> {ko ? "공개링크에서 원본 검증·다운로드" : "Verify / download at the public link"}</a></div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
