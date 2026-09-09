// 사서함 v2 서버 헬퍼 (A-81, 2026-09-09) — 기획 apps/web/docs/mailbox-v2-ux-draft.md
// 테이블: mailboxes · mailbox_members · mailbox_invites · mailbox_photos · mailbox_reads · mailbox_notices
// 모든 접근은 service role(eventsDb) — RLS deny-by-default. 비밀번호는 bcryptjs.
import type { SupabaseClient } from "@supabase/supabase-js";
import * as bcrypt from "bcryptjs";
import { randomInt } from "crypto";

import { prisma } from "@/lib/prisma";
import { isMissingTable } from "@/lib/events/server";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SITE_URL = "https://www.ori.pics"; // ori.pics는 www로 301 — 앱 목록 탭 공개링크와 동일 표기 (9/9 대표)
export const INVITE_TTL_DAYS = 7;
export const DELETE_GRACE_DAYS = 7;

/** 한도 (대표 확정 9/9): 무료 1개·참여자 20명 / Pro·Business 무제한·참여자 50명 */
export const LIMITS = {
  free: { mailboxes: 1, members: 20 },
  paid: { mailboxes: Infinity, members: 50 },
} as const;

export type Lang = "ko" | "en";
export const langOf = (v: string | null | undefined): Lang => (v === "en" ? "en" : "ko");

// ── 행 타입 ─────────────────────────────────────────────────────────────
export interface MailboxRow {
  id: string;
  name: string;
  description: string | null;
  memo: string | null;
  password_hash: string | null;
  invite_status: string; // open | closed
  status: string; // active | closed(구)
  owner_user_id: string | null;
  created_at: string;
  locked_at: string | null;
  delete_after: string | null;
}
export const MAILBOX_COLS =
  "id, name, description, memo, password_hash, invite_status, status, owner_user_id, created_at, locked_at, delete_after";

export interface MemberRow {
  mailbox_id: string;
  user_id: string;
  display_name: string;
  role_text: string | null;
  kind: string; // owner | member
  accepted_at: string;
  kicked_at: string | null;
  left_at: string | null;
  can_capture: boolean;
  capture_billing: string; // owner | self
}
export const MEMBER_COLS =
  "mailbox_id, user_id, display_name, role_text, kind, accepted_at, kicked_at, left_at, can_capture, capture_billing";

export interface InviteRow {
  code: string;
  mailbox_id: string;
  invitee_name: string;
  role_text: string | null;
  can_capture: boolean;
  capture_billing: string;
  created_by: string | null;
  created_at: string;
  expires_at: string;
  used_by: string | null;
  used_at: string | null;
  revoked_at: string | null;
}
export const INVITE_COLS =
  "code, mailbox_id, invitee_name, role_text, can_capture, capture_billing, created_by, created_at, expires_at, used_by, used_at, revoked_at";

export interface PhotoRow {
  id: string;
  mailbox_id: string;
  link_id: string;
  uploaded_by: string | null;
  billing_user_id: string | null;
  source: string;
  created_at: string;
}
export const PHOTO_COLS = "id, mailbox_id, link_id, uploaded_by, billing_user_id, source, created_at";

// ── 공통 ─────────────────────────────────────────────────────────────────
export function isActiveMember(m: MemberRow | null | undefined): m is MemberRow {
  return !!m && !m.kicked_at && !m.left_at;
}
export function isLocked(mb: MailboxRow): boolean {
  return !!mb.locked_at || !!mb.delete_after;
}

export async function loadMailbox(db: SupabaseClient, id: string): Promise<MailboxRow | null> {
  const { data, error } = await db.from("mailboxes").select(MAILBOX_COLS).eq("id", id).maybeSingle();
  if (error) {
    if (!isMissingTable(error)) console.error("[mailboxes] load failed:", error.message);
    return null;
  }
  return (data as MailboxRow | null) ?? null;
}

export async function loadMember(db: SupabaseClient, mailboxId: string, userId: string): Promise<MemberRow | null> {
  const { data } = await db
    .from("mailbox_members")
    .select(MEMBER_COLS)
    .eq("mailbox_id", mailboxId)
    .eq("user_id", userId)
    .maybeSingle();
  return (data as MemberRow | null) ?? null;
}

export async function listMembers(db: SupabaseClient, mailboxId: string): Promise<MemberRow[]> {
  const { data } = await db
    .from("mailbox_members")
    .select(MEMBER_COLS)
    .eq("mailbox_id", mailboxId)
    .order("accepted_at", { ascending: true });
  return (data ?? []) as MemberRow[];
}

/** 사용자 티어 → 한도 */
export async function limitsFor(userId: string) {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { tier: true } });
  const paid = u?.tier === "pro" || u?.tier === "business";
  return { paid, ...(paid ? LIMITS.paid : LIMITS.free) };
}

/** 표시 이름 (User.name → 이메일 앞부분 → '사용자') */
export async function userDisplayName(userId: string): Promise<string> {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { name: true, email: true } });
  return (u?.name?.trim() || u?.email?.split("@")[0] || "사용자").slice(0, 40);
}

export async function hashPassword(pw: string): Promise<string> {
  return bcrypt.hash(pw, 10);
}
export async function verifyPassword(pw: string, hash: string | null): Promise<boolean> {
  if (!hash) return true;
  try {
    return await bcrypt.compare(pw, hash);
  } catch {
    return false;
  }
}

// ── 초대코드 ────────────────────────────────────────────────────────────
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // 0/O/1/I 제외
export function generateInviteCode(): string {
  let s = "";
  for (let i = 0; i < 8; i++) s += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return s;
}
/** 입력 정규화 — 하이픈·공백 제거, 대문자. 유효 형식이 아니면 null */
export function normalizeInviteCode(raw: string): string | null {
  const s = raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return /^[A-Z0-9]{8}$/.test(s) ? s : null;
}
/** URL·QR 문자열에서 코드 추출 (앱 스캐너·랜딩 공용 규칙) */
export function extractInviteCode(value: string): string | null {
  const m = value.toUpperCase().match(/([A-Z0-9]{4})-?([A-Z0-9]{4})(?![A-Z0-9])/);
  return m ? normalizeInviteCode(m[1] + m[2]) : null;
}
export function formatInviteCode(code: string): string {
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}
export function inviteUrl(code: string, lang: Lang): string {
  return `${SITE_URL}/${lang}/invite/${formatInviteCode(code)}`;
}
export function inviteState(inv: InviteRow, mailbox?: MailboxRow | null): "valid" | "used" | "expired" | "revoked" | "closed" {
  if (inv.used_at) return "used";
  if (inv.revoked_at) return "revoked";
  if (new Date(inv.expires_at).getTime() <= Date.now()) return "expired";
  if (mailbox && (mailbox.invite_status !== "open" || mailbox.status !== "active" || isLocked(mailbox))) return "closed";
  return "valid";
}

/** 초대문 (서버 템플릿, 개설자 편집 불가 — 코드·만료일 누락 방지) */
export function inviteMessage(
  lang: Lang,
  p: { inviteeName: string; roleText: string | null; ownerName: string; mailboxName: string; code: string; expiresAt: string },
): string {
  const url = inviteUrl(p.code, lang);
  const code = formatInviteCode(p.code);
  const d = new Date(p.expiresAt);
  if (lang === "en") {
    const exp = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
    return [
      `Hi ${p.inviteeName}, this is ${p.ownerName}.`,
      `You are invited to the OriPics photo mailbox "${p.mailboxName}".`,
      ``,
      `1. Tap the link below or scan the QR code. If you don't have the app yet, it will guide you to install it.`,
      `   ${url}`,
      `2. In the app: Submit tab > Mailboxes > Invited mailboxes [+ Add] > enter the invite code ${code}`,
      `※ The code can be used once, until ${exp}.`,
      `※ You will appear as "${p.inviteeName}"${p.roleText ? ` (${p.roleText})` : ""} in the mailbox.`,
    ].join("\n");
  }
  const kst = new Date(d.getTime() + 9 * 3600_000);
  const exp = `${kst.getUTCMonth() + 1}/${kst.getUTCDate()}`;
  return [
    `${p.inviteeName}님, ${p.ownerName}입니다.`,
    `OriPics 사진 사서함 '${p.mailboxName}'에 초대합니다.`,
    ``,
    `1. 아래 링크를 누르거나 QR을 찍어 주세요. 앱이 없으면 설치로 이어집니다.`,
    `   ${url}`,
    `2. 앱 > 제출 탭 > 사서함 > 초대받은 사서함 [+ 추가하기]에 초대코드 ${code} 입력`,
    `※ ${exp}까지 1회만 사용할 수 있습니다.`,
    `※ 사서함에는 '${p.inviteeName}'${p.roleText ? `(${p.roleText})` : ""}으로 표시됩니다.`,
  ].join("\n");
}

// ── 알림 ─────────────────────────────────────────────────────────────────
export type NoticeKind =
  | "invite_accepted" | "new_photos" | "delete_scheduled" | "delete_cancelled" | "locked" | "unlocked"
  | "kicked" | "unkicked" | "left" | "owner_credits_low" | "billing_changed";

export async function notify(
  db: SupabaseClient,
  userIds: string[],
  mailboxId: string | null,
  kind: NoticeKind,
  payload: Record<string, unknown>,
): Promise<void> {
  const ids = Array.from(new Set(userIds.filter(Boolean)));
  if (ids.length === 0) return;
  const rows = ids.map((user_id) => ({ user_id, mailbox_id: mailboxId, kind, payload }));
  const { error } = await db.from("mailbox_notices").insert(rows);
  if (error && !isMissingTable(error)) console.error("[mailboxes] notify failed:", error.message);
}

// ── DTO ─────────────────────────────────────────────────────────────────
export interface MemberDto {
  user_id: string;
  display_name: string;
  role_text: string | null;
  kind: string;
  accepted_at: string;
  kicked: boolean;
  left: boolean;
  can_capture: boolean;
  /** 요금 정보 — 개설자 화면과 본인 행에만 내려간다 */
  capture_billing?: string;
  me: boolean;
}
export function memberDto(m: MemberRow, viewerId: string, viewerIsOwner: boolean): MemberDto {
  const me = m.user_id === viewerId;
  return {
    user_id: m.user_id,
    display_name: m.display_name,
    role_text: m.role_text,
    kind: m.kind,
    accepted_at: m.accepted_at,
    kicked: !!m.kicked_at,
    left: !!m.left_at,
    can_capture: m.can_capture,
    ...(viewerIsOwner || me ? { capture_billing: m.capture_billing } : {}),
    me,
  };
}

export interface MailboxDto {
  id: string;
  name: string;
  description: string | null;
  /** 개설자에게만 */
  memo?: string | null;
  invite_status: string;
  has_password?: boolean;
  locked: boolean;
  delete_after: string | null;
  created_at: string;
  owner_user_id: string | null;
  owner_name: string;
  mine: boolean;
  member_count: number;
  photo_count: number;
  /** 내가 아직 안 본 사진 수 */
  unread_count: number;
  /** 내 참여 정보 */
  me: { display_name: string; role_text: string | null; can_capture: boolean; capture_billing: string; kicked: boolean } | null;
  /** 사서함 촬영 시 차감 주체가 Pro/패스 → 앱이 verified 요청 */
  capture_pro: boolean;
}

export async function mailboxDto(
  db: SupabaseClient,
  mb: MailboxRow,
  members: MemberRow[],
  viewerId: string,
  counts: { photo_count: number; unread_count: number },
): Promise<MailboxDto> {
  const owner = members.find((m) => m.kind === "owner") ?? null;
  const me = members.find((m) => m.user_id === viewerId) ?? null;
  const mine = mb.owner_user_id === viewerId;
  const billingUser = me?.capture_billing === "self" ? viewerId : mb.owner_user_id;
  let capturePro = false;
  if (billingUser) {
    const u = await prisma.user.findUnique({ where: { id: billingUser }, select: { tier: true } });
    capturePro = u?.tier === "pro" || u?.tier === "business";
  }
  return {
    id: mb.id,
    name: mb.name,
    description: mb.description,
    ...(mine ? { memo: mb.memo, has_password: !!mb.password_hash } : {}),
    invite_status: mb.invite_status,
    locked: !!mb.locked_at,
    delete_after: mb.delete_after,
    created_at: mb.created_at,
    owner_user_id: mb.owner_user_id,
    owner_name: owner?.display_name ?? "",
    mine,
    member_count: members.filter(isActiveMember).length,
    photo_count: counts.photo_count,
    unread_count: counts.unread_count,
    me: me
      ? { display_name: me.display_name, role_text: me.role_text, can_capture: me.can_capture, capture_billing: me.capture_billing, kicked: !!me.kicked_at }
      : null,
    capture_pro: capturePro,
  };
}

/** 사서함별 사진 수·내 미열람 수 */
export async function photoCounts(
  db: SupabaseClient,
  mailboxIds: string[],
  viewerId: string,
): Promise<Map<string, { photo_count: number; unread_count: number }>> {
  const out = new Map<string, { photo_count: number; unread_count: number }>();
  for (const id of mailboxIds) out.set(id, { photo_count: 0, unread_count: 0 });
  if (mailboxIds.length === 0) return out;
  const { data: photos } = await db.from("mailbox_photos").select("id, mailbox_id").in("mailbox_id", mailboxIds);
  const list = (photos ?? []) as { id: string; mailbox_id: string }[];
  if (list.length === 0) return out;
  const { data: reads } = await db
    .from("mailbox_reads")
    .select("photo_id")
    .eq("user_id", viewerId)
    .in("photo_id", list.map((p) => p.id));
  const readSet = new Set((reads ?? []).map((r) => r.photo_id as string));
  for (const p of list) {
    const c = out.get(p.mailbox_id)!;
    c.photo_count += 1;
    if (!readSet.has(p.id)) c.unread_count += 1;
  }
  return out;
}

export interface PhotoDto {
  id: string;
  link_id: string;
  source: string;
  created_at: string;
  uploaded_by: string | null;
  uploader_name: string;
  uploader_role: string | null;
  image_url: string | null;
  link_url: string;
  width: number | null;
  height: number | null;
  captured_at: string | null;
  timestamp: string | null;
  lat: number | null;
  lng: number | null;
  tier: string | null;
  memo: string | null;
  /** 참여 중 인원 중 아직 안 본 사람 수 (0도 그대로) */
  unread_count: number;
  read_count: number;
  read_by_me: boolean;
  /** 상세 요청 시에만 */
  readers?: { user_id: string; display_name: string; read_at: string | null }[];
}

export async function photoDtos(
  db: SupabaseClient,
  photos: PhotoRow[],
  members: MemberRow[],
  viewerId: string,
  lang: Lang,
  withReaders = false,
): Promise<PhotoDto[]> {
  if (photos.length === 0) return [];
  const linkIds = Array.from(new Set(photos.map((p) => p.link_id)));
  const LINK_COLS = "link_id, width, height, captured_at, timestamp, lat, lng, tier, signed_url, preview_path";
  let { data: links, error } = await db.from("links").select(`${LINK_COLS}, memo`).in("link_id", linkIds);
  if (error) {
    const fb = await db.from("links").select(LINK_COLS).in("link_id", linkIds);
    links = fb.data as unknown as typeof links;
  }
  const linkMap = new Map<string, Record<string, unknown>>();
  for (const l of (links ?? []) as Record<string, unknown>[]) linkMap.set(l.link_id as string, l);

  const { data: reads } = await db
    .from("mailbox_reads")
    .select("photo_id, user_id, read_at")
    .in("photo_id", photos.map((p) => p.id));
  const readsByPhoto = new Map<string, { user_id: string; read_at: string }[]>();
  for (const r of (reads ?? []) as { photo_id: string; user_id: string; read_at: string }[]) {
    const arr = readsByPhoto.get(r.photo_id) ?? [];
    arr.push(r);
    readsByPhoto.set(r.photo_id, arr);
  }
  const active = members.filter(isActiveMember);
  const activeIds = new Set(active.map((m) => m.user_id));
  const memberMap = new Map(members.map((m) => [m.user_id, m]));

  return photos.map((p) => {
    const l = linkMap.get(p.link_id);
    const rs = readsByPhoto.get(p.id) ?? [];
    const readActive = rs.filter((r) => activeIds.has(r.user_id));
    const readSet = new Set(readActive.map((r) => r.user_id));
    const uploader = p.uploaded_by ? memberMap.get(p.uploaded_by) : undefined;
    const image_url = l
      ? l.preview_path
        ? `${SUPABASE_URL}/storage/v1/object/public/oripics-proofs/${l.preview_path}`
        : ((l.signed_url as string | null) ?? null)
      : null;
    return {
      id: p.id,
      link_id: p.link_id,
      source: p.source,
      created_at: p.created_at,
      uploaded_by: p.uploaded_by,
      uploader_name: uploader?.display_name ?? "",
      uploader_role: uploader?.role_text ?? null,
      image_url,
      link_url: `${SITE_URL}/${p.link_id}`, // 앱 목록 탭 공개링크(API_URL/link_id)와 같은 형식 — 뷰어가 언어를 자동 판별
      width: (l?.width as number | null) ?? null,
      height: (l?.height as number | null) ?? null,
      captured_at: (l?.captured_at as string | null) ?? null,
      timestamp: (l?.timestamp as string | null) ?? null,
      lat: (l?.lat as number | null) ?? null,
      lng: (l?.lng as number | null) ?? null,
      tier: (l?.tier as string | null) ?? null,
      memo: (l?.memo as string | null) ?? null,
      unread_count: Math.max(active.length - readSet.size, 0),
      read_count: readSet.size,
      read_by_me: rs.some((r) => r.user_id === viewerId),
      ...(withReaders
        ? {
            readers: active.map((m) => ({
              user_id: m.user_id,
              display_name: m.display_name,
              read_at: rs.find((r) => r.user_id === m.user_id)?.read_at ?? null,
            })),
          }
        : {}),
    };
  });
}

export function newPhotoId(): string {
  return `MP${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

/** 사서함 소속 여부 — 링크 삭제 잠금 판정 (DELETE /api/links/:id · cleanup cron) */
export async function mailboxesHoldingLink(db: SupabaseClient, linkId: string): Promise<{ id: string; name: string }[]> {
  const { data, error } = await db.from("mailbox_photos").select("mailbox_id").eq("link_id", linkId);
  if (error || !data || data.length === 0) return [];
  const ids = Array.from(new Set(data.map((r) => r.mailbox_id as string)));
  const { data: mbs } = await db.from("mailboxes").select("id, name").in("id", ids);
  return ((mbs ?? []) as { id: string; name: string }[]);
}
/** 링크 ID 집합 중 사서함에 묶인 것만 */
export async function lockedLinkIds(db: SupabaseClient, linkIds: string[]): Promise<Set<string>> {
  if (linkIds.length === 0) return new Set();
  const { data, error } = await db.from("mailbox_photos").select("link_id").in("link_id", linkIds);
  if (error) return new Set();
  return new Set((data ?? []).map((r) => r.link_id as string));
}
