// 사서함 확인서 데이터 빌더 (A-81 2차) — 스냅샷(현재 상태 또는 백업본) → @oripics/certificate MailboxReportData
// 썸네일: 프리뷰 JPEG(공개 URL)를 받아 sharp로 160px 축소 → data URL. QR: 공개링크. 사진 200장까지(그 이상은 표만).
import QRCode from "qrcode";
import type { MailboxReportData, MailboxReportPhoto } from "@oripics/certificate";

import type { MailboxSnapshot } from "./server";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
export const MAX_THUMBS = 200;
/** 썸네일 fetch+sharp+QR 동시 실행 수 — 순차 처리로 수백 장이 60초를 넘던 문제 (2026-09-11 A-87) */
const CONCURRENCY = 6;

/** 순서를 유지하는 제한 병렬 map — 의존성 추가 없이 인라인 (2026-09-11 A-87) */
async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      out[i] = await fn(items[i], i);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

function publicUrl(path: string | null | undefined): string | null {
  return path ? `${SUPABASE_URL}/storage/v1/object/public/oripics-proofs/${path}` : null;
}

/** V5 촬영시각 "yymmddHHMMSSmmm"(UTC) → Date */
function parseCapturedAt(v: string | null | undefined): Date | null {
  if (!v || v.length < 12) return null;
  const d = new Date(Date.UTC(2000 + Number(v.slice(0, 2)), Number(v.slice(2, 4)) - 1, Number(v.slice(4, 6)), Number(v.slice(6, 8)), Number(v.slice(8, 10)), Number(v.slice(10, 12))));
  return isNaN(d.getTime()) ? null : d;
}
/** 스탬프 timestamp prefix+YYMMDDHHMMSScs → Date */
function parseTimestamp(ts: string | null | undefined): Date | null {
  if (!ts) return null;
  const clean = /^[0-9]/.test(ts[0]) ? ts : ts.slice(1);
  if (clean.length < 12) return null;
  const d = new Date(Date.UTC(2000 + Number(clean.slice(0, 2)), Number(clean.slice(2, 4)) - 1, Number(clean.slice(4, 6)), Number(clean.slice(6, 8)), Number(clean.slice(8, 10)), Number(clean.slice(10, 12))));
  return isNaN(d.getTime()) ? null : d;
}

async function thumbDataUrl(url: string | null): Promise<string | null> {
  if (!url) return null;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    const sharpMod = await import("sharp");
    const sharp = (sharpMod.default ?? sharpMod) as typeof import("sharp").default;
    const out = await sharp(buf).resize({ width: 160, height: 160, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 70 }).toBuffer();
    return `data:image/jpeg;base64,${out.toString("base64")}`;
  } catch {
    return null;
  }
}

export async function buildReportData(opts: {
  snapshot: MailboxSnapshot;
  basis: "live" | "backup";
  basisAt: Date;
  issuedTo: string;
  issuedToEmail?: string | null;
  /** 발행 시각 — 라우트가 한 번 만들어 파일명과 본문에 같이 쓴다 (2026-09-11 A-87, 이중 생성 제거) */
  issuedAt?: Date;
  /** 본문 시각 표기 시간대 (기본 Asia/Seoul) — PDF 지면에 라벨로도 인쇄 */
  timeZone?: string;
}): Promise<MailboxReportData> {
  const { snapshot: s } = opts;
  const activeCount = s.members.filter((m) => m.state === "active").length;
  const photos: MailboxReportPhoto[] = await mapLimit(s.photos, CONCURRENCY, async (p, i) => {
    const imgUrl = publicUrl(p.backup_preview_path) ?? p.image_url ?? publicUrl(p.preview_path);
    const [thumb, qr] = await Promise.all([
      i < MAX_THUMBS ? thumbDataUrl(imgUrl) : Promise.resolve(null),
      QRCode.toDataURL(p.link_url, { errorCorrectionLevel: "M", margin: 0, width: 120 }).catch(() => null),
    ]);
    return {
      no: i + 1,
      thumbDataUrl: thumb,
      capturedAt: parseCapturedAt(p.captured_at),
      publishedAt: parseTimestamp(p.timestamp) ?? (p.created_at ? new Date(p.created_at) : null),
      lat: p.lat,
      lng: p.lng,
      tier: p.tier === "verified" ? "verified" : "standard",
      linkUrl: p.link_url,
      qrDataUrl: qr,
      uploader: p.uploader_name,
      uploaderRole: p.uploader_role,
      unread: p.unread_count,
      total: activeCount,
      memo: p.memo,
      source: p.source === "capture" ? "capture" : "submit",
    };
  });
  const counts = new Map<string, number>();
  for (const p of s.photos) if (p.uploaded_by) counts.set(p.uploaded_by, (counts.get(p.uploaded_by) ?? 0) + 1);
  return {
    mailboxId: s.mailbox.id,
    mailboxName: s.mailbox.name,
    reportTitle: s.mailbox.report_title ?? null,
    description: s.mailbox.description,
    ownerName: s.mailbox.owner_name,
    createdAt: new Date(s.mailbox.created_at),
    status: s.mailbox.delete_after ? "delete_scheduled" : s.mailbox.locked ? "locked" : "active",
    deleteAfter: s.mailbox.delete_after ? new Date(s.mailbox.delete_after) : null,
    basis: opts.basis,
    basisAt: opts.basisAt,
    issuedAt: opts.issuedAt ?? opts.basisAt,
    issuedTo: opts.issuedTo,
    issuedToEmail: opts.issuedToEmail ?? null,
    timeZone: opts.timeZone ?? "Asia/Seoul",
    photoTotal: s.photo_total ?? s.photos.length,
    thumbLimit: MAX_THUMBS,
    members: s.members
      .filter((m) => m.state !== "left")
      .map((m) => ({
        name: m.display_name,
        role: m.role_text,
        kind: m.kind === "owner" ? "owner" : "member",
        acceptedAt: new Date(m.accepted_at),
        state: m.state,
        photoCount: counts.get(m.user_id) ?? 0,
      })),
    photos,
  };
}

export function reportFileName(mailboxName: string, basisAt: Date): string {
  const safe = mailboxName.replace(/[^\p{L}\p{N}_-]+/gu, "_").slice(0, 40) || "mailbox";
  const d = basisAt.toISOString().slice(0, 16).replace(/[-:T]/g, "");
  return `OriPics_mailbox_${safe}_${d}.pdf`;
}

/** IANA 시간대 검증 — 잘못된 값이면 Asia/Seoul (2026-09-11 A-87) */
export function safeTimeZone(v: string | null): string {
  if (!v) return "Asia/Seoul";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: v });
    return v;
  } catch {
    return "Asia/Seoul";
  }
}
