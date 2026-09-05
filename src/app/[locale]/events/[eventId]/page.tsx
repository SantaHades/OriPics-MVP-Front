"use client";
// 이벤트 상세 + 출품작 갤러리 + 좋아요 + 명예의 전당 (A-72, 2026-09-05)
// 데이터: GET /api/events/:id/entries (공개, 로그인 시 liked/mine), POST /api/events/entries/:entryId/like (로그인).
// 명예의 전당 = 좋아요 상위 3 (status=winner가 있으면 그것을 우선 고정). 출품은 앱에서만(사진이 앱 촬영분).
import { Link } from "@/navigation";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, CalendarDays, ExternalLink, Heart, Smartphone, Trophy } from "lucide-react";

import type { EventDefDto } from "@/lib/channels/server";
import { getEvent } from "@/lib/events/catalog";
import type { EntryDto } from "@/lib/events/server";
import { ANDROID_STORE_URL, IOS_APP_URL } from "@/lib/appLinks";

type Sort = "likes" | "new";

export default function EventDetailPage() {
  const params = useParams();
  const router = useRouter();
  const lang = ((params?.locale as string) || "ko") === "en" ? "en" : "ko";
  const ko = lang === "ko";
  const eventId = params?.eventId as string;
  const catalog = getEvent(eventId);
  // 사설 이벤트(코드 카탈로그에 없음)는 API로 정의 조회 — 비공개는 추가한 사용자만(403→없음 표시)
  const [remote, setRemote] = useState<EventDefDto | null | "loading">(catalog ? null : "loading");
  useEffect(() => {
    if (catalog || !eventId) return;
    fetch(`/api/events/${encodeURIComponent(eventId)}?locale=${lang}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setRemote(d?.event ?? null))
      .catch(() => setRemote(null));
  }, [catalog, eventId, lang]);
  const event: EventDefDto | null =
    catalog
      ? { id: catalog.id, name: catalog.name[lang], summary: catalog.summary[lang], details: catalog.details[lang], rules: catalog.rules[lang], period: catalog.period[lang], ends_at: catalog.endsAt, open: new Date(catalog.endsAt).getTime() > Date.now(), private: false }
      : remote === "loading" ? null : remote;
  const { status: sessionStatus } = useSession();
  const signedIn = sessionStatus === "authenticated";

  const [sort, setSort] = useState<Sort>("likes");
  const [entries, setEntries] = useState<EntryDto[]>([]);
  const [total, setTotal] = useState(0);
  const [open, setOpen] = useState(true);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!eventId) return;
    setLoading(true);
    try {
      const r = await fetch(`/api/events/${encodeURIComponent(eventId)}/entries?sort=${sort}&limit=100&locale=${lang}`, { cache: "no-store" });
      if (!r.ok) return;
      const d = await r.json();
      setEntries(d.entries ?? []);
      setTotal(d.total ?? 0);
      setOpen(d.open !== false);
    } finally {
      setLoading(false);
    }
  }, [eventId, sort, lang]);

  useEffect(() => { void load(); }, [load]);

  const hall = useMemo(() => {
    const winners = entries.filter((e) => e.status === "winner");
    const base = winners.length > 0 ? winners : [...entries].sort((a, b) => b.like_count - a.like_count || a.created_at.localeCompare(b.created_at));
    return base.filter((e) => e.like_count > 0 || e.status === "winner").slice(0, 3);
  }, [entries]);

  const toggleLike = async (entry: EntryDto) => {
    if (!signedIn) {
      router.push(`/${lang}/login`);
      return;
    }
    if (busyId) return;
    setBusyId(entry.id);
    try {
      const r = await fetch(`/api/events/entries/${encodeURIComponent(entry.id)}/like`, { method: "POST" });
      if (!r.ok) return;
      const d = (await r.json()) as { liked: boolean; like_count: number };
      setEntries((prev) => prev.map((e) => (e.id === entry.id ? { ...e, liked: d.liked, like_count: d.like_count } : e)));
    } finally {
      setBusyId(null);
    }
  };

  if (!event) {
    return (
      <div className="min-h-screen bg-slate-50 text-slate-900">
        <div className="max-w-4xl mx-auto px-6 py-12">
          <Link href="/events" className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-900 mb-10"><ArrowLeft size={16} /> {ko ? "이벤트 목록" : "All events"}</Link>
          <p className="text-slate-600">{remote === "loading" ? (ko ? "불러오는 중…" : "Loading…") : (ko ? "이벤트를 찾을 수 없거나 접근 권한이 없습니다. 비공개 이벤트는 앱에서 추가한 사용자만 볼 수 있습니다." : "Event not found or not accessible. Private events are visible only to users who added them in the app.")}</p>
        </div>
      </div>
    );
  }

  const LikeButton = ({ entry, size = "sm" }: { entry: EntryDto; size?: "sm" | "md" }) => (
    <button
      type="button"
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); void toggleLike(entry); }}
      disabled={busyId === entry.id}
      aria-pressed={entry.liked}
      title={signedIn ? (ko ? "좋아요" : "Like") : (ko ? "로그인 후 좋아요를 누를 수 있어요" : "Sign in to like")}
      className={`inline-flex items-center gap-1 rounded-full border font-semibold transition-colors ${size === "md" ? "px-3 py-1.5 text-sm" : "px-2.5 py-1 text-xs"} ${entry.liked ? "bg-rose-50 border-rose-200 text-rose-600" : "bg-white/90 border-slate-200 text-slate-700 hover:bg-rose-50 hover:text-rose-600"}`}
    >
      <Heart size={size === "md" ? 16 : 13} fill={entry.liked ? "currentColor" : "none"} /> {entry.like_count}
    </button>
  );

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <div className="max-w-5xl mx-auto px-6 py-12">
        <Link href="/events" className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-900 transition-colors mb-10">
          <ArrowLeft size={16} /> {ko ? "이벤트 목록" : "All events"}
        </Link>

        {/* 소개 */}
        <div className="mb-10">
          <p className="text-xs font-bold text-amber-600 uppercase tracking-[0.25em] mb-3">{ko ? "출시기념 이벤트" : "Launch event"}</p>
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight leading-snug mb-4">{event.name}</h1>
          <p className="text-slate-600 leading-relaxed whitespace-pre-line mb-5">{event.details}</p>
          <div className="p-5 rounded-2xl bg-white border border-slate-200">
            <p className="text-sm font-bold mb-2">{ko ? "참여 방법 · 심사 · 상품" : "How to enter · Judging · Prizes"}</p>
            <ul className="text-sm text-slate-700 leading-relaxed list-disc pl-5 space-y-1">
              {event.rules.map((r) => <li key={r}>{r}</li>)}
            </ul>
            <p className="inline-flex items-center gap-1.5 text-xs text-slate-500 mt-3"><CalendarDays size={14} /> {event.period}{!open ? (ko ? " · 접수 마감" : " · Closed") : ""}</p>
          </div>
          <div className="flex flex-wrap gap-2 mt-4">
            <a href={IOS_APP_URL} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-900 text-white text-sm font-semibold hover:bg-slate-700"><Smartphone size={14} /> {ko ? "iPhone 앱에서 참여" : "Enter on iPhone"}</a>
            <a href={ANDROID_STORE_URL} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-900 text-white text-sm font-semibold hover:bg-slate-700"><Smartphone size={14} /> {ko ? "Android 앱에서 참여" : "Enter on Android"}</a>
          </div>
        </div>

        {/* 명예의 전당 */}
        <div className="mb-10">
          <div className="flex items-center gap-2 mb-3">
            <Trophy className="text-amber-500" size={20} />
            <h2 className="text-2xl font-bold tracking-tight">{ko ? "명예의 전당" : "Hall of Fame"}</h2>
            <span className="text-xs text-slate-500">{ko ? "좋아요 상위 3 · 실시간" : "Top 3 by likes · live"}</span>
          </div>
          {hall.length === 0 ? (
            <p className="text-sm text-slate-500 p-5 rounded-2xl bg-white border border-dashed border-slate-300">
              {ko ? "아직 좋아요를 받은 출품작이 없습니다. 첫 주인공이 되어 보세요." : "No entry has received a like yet — be the first."}
            </p>
          ) : (
            <div className="grid sm:grid-cols-3 gap-4">
              {hall.map((e, i) => (
                <a key={e.id} href={e.link_url} target="_blank" rel="noopener noreferrer" className="group rounded-3xl overflow-hidden bg-white border border-amber-200 shadow-sm">
                  <div className="relative aspect-[4/3] bg-slate-100">
                    {e.image_url ? <img src={e.image_url} alt="" className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform" /> : null}
                    <span className="absolute top-2 left-2 rounded-full bg-amber-500 text-white text-xs font-bold px-2 py-0.5">#{i + 1}</span>
                    <span className="absolute bottom-2 right-2"><LikeButton entry={e} /></span>
                  </div>
                  {e.caption ? <p className="px-4 py-3 text-sm text-slate-700 line-clamp-2">{e.caption}</p> : null}
                </a>
              ))}
            </div>
          )}
        </div>

        {/* 출품작 */}
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <h2 className="text-2xl font-bold tracking-tight">{ko ? "출품작" : "Entries"} <span className="text-base font-semibold text-slate-400">{total}</span></h2>
          <div className="inline-flex rounded-xl bg-slate-200/70 p-0.5 text-sm">
            {(["likes", "new"] as Sort[]).map((s) => (
              <button key={s} type="button" onClick={() => setSort(s)} className={`px-3 py-1.5 rounded-lg font-semibold ${sort === s ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"}`}>
                {s === "likes" ? (ko ? "인기순" : "Most liked") : (ko ? "최신순" : "Newest")}
              </button>
            ))}
          </div>
        </div>
        {!signedIn ? (
          <p className="text-xs text-slate-500 mb-4">{ko ? "좋아요는 로그인 후 누를 수 있어요. " : "Sign in to like entries. "}<Link href="/login" className="text-blue-600 font-semibold hover:underline">{ko ? "로그인" : "Sign in"}</Link></p>
        ) : null}
        {loading && entries.length === 0 ? (
          <p className="text-sm text-slate-500">{ko ? "불러오는 중…" : "Loading…"}</p>
        ) : entries.length === 0 ? (
          <p className="text-sm text-slate-500 p-8 rounded-2xl bg-white border border-dashed border-slate-300 text-center">
            {ko ? "아직 출품작이 없습니다. 앱의 제출 탭 → 이벤트에서 첫 출품작을 올려 보세요." : "No entries yet. Be the first from the app's Submit tab → Events."}
          </p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {entries.map((e) => (
              <a key={e.id} href={e.link_url} target="_blank" rel="noopener noreferrer" className="group relative rounded-2xl overflow-hidden bg-white border border-slate-200 shadow-sm">
                <div className="aspect-square bg-slate-100">
                  {e.image_url ? <img src={e.image_url} alt="" loading="lazy" className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform" /> : null}
                </div>
                <span className="absolute bottom-2 right-2"><LikeButton entry={e} /></span>
                {e.mine ? <span className="absolute top-2 left-2 rounded-full bg-blue-600 text-white text-[10px] font-bold px-2 py-0.5">{ko ? "내 출품" : "Mine"}</span> : null}
                <span className="absolute top-2 right-2 rounded-full bg-white/90 text-slate-600 p-1"><ExternalLink size={12} /></span>
              </a>
            ))}
          </div>
        )}
        <p className="text-xs text-slate-400 mt-6">{ko ? "사진을 누르면 공개링크가 열려 촬영 시각·원본 여부를 확인할 수 있습니다." : "Tap a photo to open its public link and verify capture time and originality."}</p>
      </div>
    </div>
  );
}
