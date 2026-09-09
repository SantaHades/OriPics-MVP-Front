// 웹 사서함 페이지 공용 (A-81 2차) — 타입·fetch·PDF 다운로드·표기
"use client";

export interface WMailbox {
  id: string; name: string; description: string | null; invite_status: string; locked: boolean; delete_after: string | null; created_at: string;
  owner_name: string; mine: boolean; member_count: number; photo_count: number; unread_count: number;
  me: { display_name: string; role_text: string | null; can_capture: boolean; capture_billing: string; kicked: boolean } | null;
}
export interface WMember { user_id: string; display_name: string; role_text: string | null; kind: string; accepted_at: string; kicked: boolean; left: boolean; me?: boolean; state?: string }
export interface WPhoto {
  id: string; link_id: string; source: string; created_at: string; uploader_name: string; uploader_role: string | null; image_url: string | null; link_url: string;
  captured_at: string | null; timestamp: string | null; lat: number | null; lng: number | null; tier: string | null; memo: string | null;
  unread_count: number; read_count: number; read_by_me: boolean; readers?: { user_id: string; display_name: string; read_at: string | null }[];
}
export interface WBackup {
  id: string; mailbox_id: string; mailbox_name: string; taken_at: string; copied_files: boolean; photo_count: number; member_count: number; bytes: number; owner_name?: string;
}

export async function getJson<T>(url: string): Promise<T> {
  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) {
    const d = await r.json().catch(() => ({}));
    throw new Error((d as { detail?: string }).detail || `http_${r.status}`);
  }
  return (await r.json()) as T;
}

export function fmtDateTime(iso: string | null | undefined, lang: "ko" | "en"): string {
  if (!iso) return "-";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "-";
  return new Intl.DateTimeFormat(lang === "ko" ? "ko-KR" : "en-US", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(d);
}
/** V5 촬영시각 "yymmddHHMMSSmmm"(UTC) */
export function fmtCaptured(v: string | null | undefined, lang: "ko" | "en"): string {
  if (!v || v.length < 12) return "-";
  const d = new Date(Date.UTC(2000 + Number(v.slice(0, 2)), Number(v.slice(2, 4)) - 1, Number(v.slice(4, 6)), Number(v.slice(6, 8)), Number(v.slice(8, 10)), Number(v.slice(10, 12))));
  return isNaN(d.getTime()) ? "-" : fmtDateTime(d.toISOString(), lang);
}
export function fmtBytes(b: number): string {
  if (!b) return "0 B";
  const u = ["B", "KB", "MB", "GB"];
  let i = 0; let v = b;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(i === 0 ? 0 : 1)} ${u[i]}`;
}

export async function downloadPdf(url: string, fallbackName: string): Promise<void> {
  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) throw new Error(`http_${r.status}`);
  const blob = await r.blob();
  const cd = r.headers.get("content-disposition") ?? "";
  const m = cd.match(/filename\*=UTF-8''([^;]+)/);
  const name = m ? decodeURIComponent(m[1]) : fallbackName;
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}
