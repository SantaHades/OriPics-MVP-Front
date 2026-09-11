// 웹 사서함 페이지 공용 (A-81 2차) — 타입·fetch·PDF 다운로드·표기
"use client";

export interface WMailbox {
  id: string; name: string; description: string | null; invite_status: string; locked: boolean; delete_after: string | null; created_at: string;
  /** 확인서 PDF 제목(개설자 지정, null = 기본 문구) — 웹 편집 (2026-09-11 A-90) */
  report_title?: string | null;
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

/** 로그인 페이지로 — 로그인 후 원래 위치로 돌아오게 callbackUrl(상대경로) 동봉 (2026-09-11 A-90). 로그인 페이지가 상대경로만 허용 */
export function loginUrl(lang: "ko" | "en", callbackPath: string): string {
  return `/${lang}/login?callbackUrl=${encodeURIComponent(callbackPath)}`;
}

/** API 오류 detail → 사용자 문구 (사서함 페이지 공용, 2026-09-11 A-90). 매핑 없으면 null → 호출 측이 원문 표시 */
export function errorText(detail: string | null | undefined, lang: "ko" | "en"): string | null {
  const ko = lang === "ko";
  switch (detail) {
    case "http_401": case "unauthenticated": return ko ? "로그인이 필요합니다." : "Please sign in.";
    case "http_403": case "forbidden": return ko ? "권한이 없습니다. 이 사서함의 참여자만 열 수 있습니다." : "You don't have permission. Only participants can open this mailbox.";
    case "kicked": return ko ? "개설자가 이 사서함에서 내보냈습니다." : "The owner removed you from this mailbox.";
    case "left": return ko ? "나간 사서함입니다." : "You have left this mailbox.";
    case "http_404": case "not_found": return ko ? "사서함을 찾을 수 없습니다(삭제되었을 수 있음)." : "Mailbox not found (it may have been deleted).";
    case "setup_required": case "http_503": return ko ? "서버 준비 중입니다. 잠시 후 다시 시도해 주세요." : "Server is being set up. Please try again shortly.";
    case "rate_limited": case "http_429": return ko ? "요청이 너무 잦습니다. 잠시 후 다시 시도해 주세요(백업은 시간당 5회)." : "Too many requests. Please try again later (backups: 5 per hour).";
    case "storage_quota": return ko ? "보관함 용량(5GB)을 초과해 사진 파일을 복사할 수 없습니다. 백업본을 정리하거나 용량을 확인해 주세요." : "Storage quota (5GB) exceeded — photo files cannot be copied. Free up backups or check your storage.";
    case "font_unavailable": return ko ? "확인서 폰트를 불러올 수 없어 PDF를 만들 수 없습니다. 관리자에게 알려 주세요." : "The report font is unavailable, so the PDF could not be generated. Please contact support.";
    case "render_failed": return ko ? "PDF 생성에 실패했습니다." : "PDF generation failed.";
    case "db_error": case "http_500": return ko ? "서버 오류가 발생했습니다." : "A server error occurred.";
    default: return null;
  }
}
