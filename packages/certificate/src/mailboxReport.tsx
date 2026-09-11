/* eslint-disable react/no-unescaped-entities */
// 사서함 확인서 PDF (A-81 2차, 2026-09-09) — 기획 apps/web/docs/mailbox-v2-ux-draft.md §4 '확인서 PDF'
// 사서함 정보 · 참여자 표 · 사진별(썸네일·촬영시각·좌표·등급·공개링크 QR·올린 사람·미열람 수) · 고지문.
// 기준(basis) = 현재 상태 또는 백업본(백업 시각) — 머리말에 명시. 증거능력을 단정하지 않는다(기록서 PDF 고지와 동일).
import React from "react";
import { Document, Page, Text, View, Image, Link, StyleSheet, Font } from "@react-pdf/renderer";

import { LOGO_DATA_URL } from "./logoData";

function resolveKrFont(weight: "400" | "700"): string {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const path = require("path") as typeof import("path");
  return path.join(process.cwd(), "node_modules/@fontsource/noto-sans-kr/files", `noto-sans-kr-korean-${weight}-normal.woff`);
}
let fontRegistered = false;
/** 폰트 파일 부재·등록 실패 → 한글이 모두 빠진 PDF가 200으로 나가던 문제. throw 해서 라우트가 500 `font_unavailable`로 응답 (2026-09-11 A-87) */
export const FONT_UNAVAILABLE = "font_unavailable";
function ensureFontRegistered() {
  if (fontRegistered) return;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const fs = require("fs") as typeof import("fs");
    const files = [resolveKrFont("400"), resolveKrFont("700")];
    const missing = files.filter((f) => !fs.existsSync(f));
    if (missing.length > 0) throw new Error(`${FONT_UNAVAILABLE}: ${missing.join(", ")}`);
    Font.register({
      family: "NotoSansKR",
      fonts: [
        { src: files[0], fontWeight: "normal" },
        { src: files[1], fontWeight: "bold" },
      ],
    });
    Font.registerHyphenationCallback((word) => [word]);
    fontRegistered = true;
  } catch (e) {
    console.error("[mailbox-report] Korean font register failed", (e as any)?.message);
    const err = new Error(FONT_UNAVAILABLE);
    (err as any).cause = e;
    throw err;
  }
}

/** 공백 없는 장문(설명문·메모·URL)이 칸을 넘치지 않게 문자 단위로 잘라 준다 — 전역 콜백은 단어 유지 (2026-09-11 A-87) */
const breakAnywhere = (word: string): string[] => (word.length <= 12 ? [word] : Array.from(word));

/** 시간대 라벨 — 모든 시각이 이 시간대로 표기됨을 지면에 명시 (2026-09-11 A-87). Asia/Seoul → "KST (UTC+9)" */
function tzLabel(tz: string, locale: Locale): string {
  let offset = "";
  try {
    const part = new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "shortOffset" }).formatToParts(new Date()).find((p) => p.type === "timeZoneName")?.value ?? "";
    offset = part.replace(/^GMT/, "UTC").replace(/^UTC$/, "UTC+0");
  } catch { /* 라벨만 생략 */ }
  if (tz === "Asia/Seoul") return offset ? `KST (${offset})` : "KST (UTC+9)";
  return offset ? `${tz} (${offset})` : tz;
}

type Locale = "ko" | "en";

export interface MailboxReportMember {
  name: string;
  role?: string | null;
  kind: "owner" | "member";
  acceptedAt: Date;
  state: "active" | "kicked" | "left";
  photoCount: number;
}
export interface MailboxReportPhoto {
  no: number;
  /** JPEG data URL (호출 측에서 축소 생성) */
  thumbDataUrl?: string | null;
  capturedAt?: Date | null;
  publishedAt?: Date | null;
  lat?: number | null;
  lng?: number | null;
  tier: "standard" | "verified";
  linkUrl: string;
  /** PNG data URL (호출 측 생성, 선택) */
  qrDataUrl?: string | null;
  uploader: string;
  uploaderRole?: string | null;
  unread: number;
  total: number;
  memo?: string | null;
  source: "capture" | "submit";
}
export interface MailboxReportData {
  mailboxId: string;
  mailboxName: string;
  /** 개설자가 지정한 확인서 제목. 비어 있으면 로케일 기본 문구 (2026-09-10) */
  reportTitle?: string | null;
  description?: string | null;
  ownerName: string;
  createdAt: Date;
  status: "active" | "locked" | "delete_scheduled";
  deleteAfter?: Date | null;
  /** 'live' = 현재 상태, 'backup' = 백업본 */
  basis: "live" | "backup";
  basisAt: Date;
  issuedAt: Date;
  issuedTo: string;
  issuedToEmail?: string | null;
  /** IANA 시간대 — 본문 모든 시각의 표기 기준. 기본 Asia/Seoul. 지면에 라벨로도 인쇄 (2026-09-11 A-87) */
  timeZone?: string;
  members: MailboxReportMember[];
  photos: MailboxReportPhoto[];
  /** 사서함의 실제 사진 총수. photos.length보다 크면 '앞 N장만 수록' 고지 (2026-09-11 A-87) */
  photoTotal?: number;
  /** 썸네일을 생성한 상한(호출 측 MAX_THUMBS). photos.length보다 작으면 '썸네일 N장까지만' 고지 */
  thumbLimit?: number;
}

const S: Record<Locale, Record<string, string>> = {
  ko: {
    title: "사서함 확인서",
    subtitle: "OriPics Photo Mailbox Report",
    issued: "발행",
    basisLive: "기준: 발행 시점의 현재 상태",
    basisBackup: "기준: 백업본",
    mailbox: "사서함",
    number: "번호",
    created: "개설",
    owner: "개설자",
    status: "상태",
    status_active: "진행 중",
    status_locked: "잠금(읽기 전용)",
    status_delete_scheduled: "삭제 예고",
    description: "설명문",
    issuedTo: "발행 요청",
    members: "참여자",
    mName: "이름",
    mRole: "역할",
    mJoined: "수락 시각",
    mState: "상태",
    mState_active: "참여 중",
    mState_kicked: "내보냄",
    mState_left: "나감",
    mCount: "올린 사진",
    ownerTag: "개설자",
    photos: "사진",
    pNo: "No",
    pThumb: "사진",
    pInfo: "촬영시각 · 좌표 · 등급",
    pLink: "공개링크",
    pUploader: "올린 사람",
    pRead: "미열람",
    capturedAt: "촬영",
    publishedAt: "발행",
    noCoords: "좌표 없음",
    sourceCapture: "사서함 촬영",
    sourceSubmit: "제출",
    memo: "공개메모",
    noPhotos: "사진이 없습니다.",
    unreadFmt: "{u} / {n}명 미열람",
    noticeTitle: "고지",
    notice1: "이 확인서는 표기된 기준 시점의 사서함 상태(참여자·사진 속성·열람 현황)를 OriPics 서버 기록에 따라 그대로 출력한 것입니다.",
    notice2: "각 사진의 원본 무결성·촬영시각·좌표는 해당 공개링크(QR)에서 누구나 온라인으로 검증할 수 있습니다. 공개메모는 올린 사람이 적은 내용으로 검증 대상이 아닙니다.",
    notice3: "본 문서는 사실관계 기록을 돕기 위한 것으로, 법적 증거능력이나 콘텐츠의 진실성을 단정하지 않습니다.",
    issuer: "발행자",
    issuerName: "주식회사 산타하데스 (SantaHades Co., Ltd.) · www.ori.pics",
    signature: "확인자 서명",
    page: "페이지",
    footer: "OriPics — 그 시각·그곳·실제 기기 촬영을 증명합니다.",
    tzNote: "모든 시각은 {tz} 기준",
    truncPhotos: "사진 {total}장 중 앞 {shown}장만 수록됨 (확인서 상한). 전체 목록은 웹 사서함에서 확인하세요.",
    truncThumbs: "사진 {total}장 중 {shown}장까지만 썸네일 표시 — 이후 사진은 정보·공개링크만 수록됨.",
  },
  en: {
    title: "Photo Mailbox Report",
    subtitle: "OriPics 사서함 확인서",
    issued: "Issued",
    basisLive: "Basis: current state at issuance",
    basisBackup: "Basis: backup snapshot",
    mailbox: "Mailbox",
    number: "Number",
    created: "Created",
    owner: "Owner",
    status: "Status",
    status_active: "Active",
    status_locked: "Locked (read-only)",
    status_delete_scheduled: "Deletion scheduled",
    description: "Description",
    issuedTo: "Requested by",
    members: "Participants",
    mName: "Name",
    mRole: "Role",
    mJoined: "Joined",
    mState: "State",
    mState_active: "Active",
    mState_kicked: "Removed",
    mState_left: "Left",
    mCount: "Photos",
    ownerTag: "owner",
    photos: "Photos",
    pNo: "No",
    pThumb: "Photo",
    pInfo: "Captured · location · tier",
    pLink: "Public link",
    pUploader: "Uploaded by",
    pRead: "Unseen",
    capturedAt: "Captured",
    publishedAt: "Published",
    noCoords: "No location",
    sourceCapture: "captured in mailbox",
    sourceSubmit: "submitted",
    memo: "Public memo",
    noPhotos: "No photos.",
    unreadFmt: "{u} of {n} unseen",
    noticeTitle: "Notice",
    notice1: "This report reproduces the mailbox state (participants, photo attributes, read status) as recorded on OriPics servers at the stated basis time.",
    notice2: "The originality, capture time and location of each photo can be verified online by anyone via its public link (QR). Public memos are written by the uploader and are not verified.",
    notice3: "This document supports factual record-keeping; it does not assert legal evidentiary value or the truth of the content.",
    issuer: "Issuer",
    issuerName: "SantaHades Co., Ltd. · www.ori.pics",
    signature: "Signature",
    page: "Page",
    footer: "OriPics — proof of when, where and on which device a photo was taken.",
    tzNote: "All times in {tz}",
    truncPhotos: "Only the first {shown} of {total} photos are listed (report limit). See the web mailbox for the full list.",
    truncThumbs: "Thumbnails omitted beyond {shown} of {total} photos — details and public links are still listed.",
  },
};

const st = StyleSheet.create({
  page: { fontFamily: "NotoSansKR", fontSize: 9, color: "#0f172a", paddingTop: 40, paddingBottom: 56, paddingHorizontal: 40 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderBottomWidth: 1, borderBottomColor: "#e2e8f0", paddingBottom: 6, marginBottom: 8 },
  brandRow: { flexDirection: "row", alignItems: "center" },
  brandText: { fontSize: 13, fontWeight: "bold", marginLeft: 6 },
  // 제목은 2줄까지·말줄임 — 80자 제목이 지면을 밀어내지 않게 (2026-09-11 A-87)
  title: { fontSize: 20, fontWeight: "bold", marginBottom: 1, maxLines: 2, textOverflow: "ellipsis" },
  warn: { fontSize: 8, color: "#b45309", backgroundColor: "#fffbeb", borderWidth: 0.6, borderColor: "#fcd34d", borderRadius: 3, paddingVertical: 3, paddingHorizontal: 6, marginBottom: 4 },
  subtitle: { fontSize: 10, color: "#64748b", marginBottom: 6 },
  basis: { fontSize: 9, color: "#1d4ed8", fontWeight: "bold", marginBottom: 8 },
  section: { marginBottom: 8 },
  sectionTitle: { fontSize: 9, color: "#475569", letterSpacing: 1, marginBottom: 4, fontWeight: "bold", textTransform: "uppercase" },
  row: { flexDirection: "row", marginBottom: 1.5 },
  label: { width: 70, color: "#64748b" },
  value: { flex: 1 },
  table: { borderWidth: 0.6, borderColor: "#cbd5e1", borderRadius: 3 },
  th: { flexDirection: "row", backgroundColor: "#f1f5f9", borderBottomWidth: 0.6, borderBottomColor: "#cbd5e1", paddingVertical: 3, paddingHorizontal: 4 },
  tr: { flexDirection: "row", borderBottomWidth: 0.4, borderBottomColor: "#e2e8f0", paddingVertical: 3, paddingHorizontal: 4, alignItems: "center" },
  thText: { fontSize: 8, fontWeight: "bold", color: "#334155" },
  td: { fontSize: 8.5 },
  small: { fontSize: 7.5, color: "#64748b" },
  thumb: { width: 52, height: 52, borderRadius: 3, backgroundColor: "#f8fafc" },
  qr: { width: 40, height: 40 },
  link: { fontSize: 6.5, color: "#1d4ed8", lineHeight: 1.25 },
  notice: { fontSize: 7.5, color: "#475569", lineHeight: 1.4, marginBottom: 2 },
  footer: { position: "absolute", bottom: 28, left: 40, right: 40, paddingTop: 6, borderTopWidth: 1, borderTopColor: "#e2e8f0", flexDirection: "row", justifyContent: "space-between" },
  footerText: { fontSize: 7.5, color: "#64748b" },
  signBox: { marginTop: 10, flexDirection: "row", justifyContent: "flex-end", alignItems: "flex-end" },
  signLine: { width: 180, borderBottomWidth: 0.8, borderBottomColor: "#0f172a", marginLeft: 8, height: 18 },
});

function fmt(d: Date | null | undefined, locale: Locale, tz: string, withSeconds = false): string {
  if (!d || isNaN(d.getTime())) return "-";
  return new Intl.DateTimeFormat(locale === "ko" ? "ko-KR" : "en-US", {
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", ...(withSeconds ? { second: "2-digit" } : {}), timeZone: tz,
  }).format(d);
}

export function MailboxReportDocument({ data, locale }: { data: MailboxReportData; locale: Locale }) {
  ensureFontRegistered();
  const t = S[locale];
  const tz = data.timeZone ?? "Asia/Seoul";
  const statusText = t[`status_${data.status}`] + (data.status === "delete_scheduled" && data.deleteAfter ? ` (${fmt(data.deleteAfter, locale, tz)})` : "");
  const tzText = tzLabel(tz, locale);
  const basisText = `${data.basis === "backup" ? t.basisBackup : t.basisLive} · ${fmt(data.basisAt, locale, tz, true)} · ${t.tzNote.replace("{tz}", tzText)}`;
  const shortId = `mbr_${data.mailboxId}_${data.issuedAt.getTime().toString(36)}`;
  const reportTitle = (data.reportTitle ?? "").trim() || t.title;
  // 잘림 고지 — 스냅샷 상한(photoTotal > photos.length)·썸네일 상한(thumbLimit < photos.length) (2026-09-11 A-87)
  const shown = data.photos.length;
  const total = Math.max(data.photoTotal ?? shown, shown);
  const truncPhotos = total > shown ? t.truncPhotos.replace("{total}", String(total)).replace("{shown}", String(shown)) : null;
  const truncThumbs = data.thumbLimit != null && data.thumbLimit < shown ? t.truncThumbs.replace("{total}", String(shown)).replace("{shown}", String(data.thumbLimit)) : null;

  return (
    <Document title={`${reportTitle} — ${data.mailboxName}`} author="OriPics">
      <Page size="A4" style={st.page} wrap>
        <View style={st.header} fixed>
          <View style={st.brandRow}>
            <Image src={LOGO_DATA_URL} style={{ width: 22, height: 22 }} />
            <Text style={st.brandText}>OriPics</Text>
          </View>
          <Text style={{ fontSize: 8, color: "#64748b" }}>{`${t.issued} ${fmt(data.issuedAt, locale, tz, true)} (${tzText}) · ${shortId}`}</Text>
        </View>

        {/* 공백 없는 긴 제목도 2줄로 접히고 말줄임 — 전역 콜백(단어 유지)만으론 한 줄에서 잘려 나감 (2026-09-11 A-87 실측) */}
        <Text style={st.title} hyphenationCallback={breakAnywhere}>{reportTitle}</Text>
        <Text style={st.subtitle}>{t.subtitle}</Text>
        <Text style={st.basis}>{basisText}</Text>

        <View style={st.section}>
          <Text style={st.sectionTitle}>{t.mailbox}</Text>
          <View style={st.row}><Text style={st.label}>{t.mailbox}</Text><Text style={[st.value, { fontWeight: "bold", fontSize: 11, maxLines: 2, textOverflow: "ellipsis" }]} hyphenationCallback={breakAnywhere}>{data.mailboxName}</Text></View>
          <View style={st.row}><Text style={st.label}>{t.number}</Text><Text style={st.value}>{data.mailboxId}</Text></View>
          <View style={st.row}><Text style={st.label}>{t.created}</Text><Text style={st.value}>{fmt(data.createdAt, locale, tz)}</Text></View>
          <View style={st.row}><Text style={st.label}>{t.owner}</Text><Text style={st.value}>{data.ownerName}</Text></View>
          <View style={st.row}><Text style={st.label}>{t.status}</Text><Text style={st.value}>{statusText}</Text></View>
          {data.description ? (
            <View style={st.row}><Text style={st.label}>{t.description}</Text><Text style={st.value} hyphenationCallback={breakAnywhere}>{data.description}</Text></View>
          ) : null}
          <View style={st.row}>
            <Text style={st.label}>{t.issuedTo}</Text>
            <Text style={st.value}>{data.issuedTo}{data.issuedToEmail && data.issuedToEmail !== data.issuedTo ? ` (${data.issuedToEmail})` : ""}</Text>
          </View>
        </View>

        <View style={st.section}>
          <Text style={st.sectionTitle}>{`${t.members} (${data.members.filter((m) => m.state === "active").length})`}</Text>
          <View style={st.table}>
            <View style={st.th}>
              <Text style={[st.thText, { flex: 2.2 }]}>{t.mName}</Text>
              <Text style={[st.thText, { flex: 1.4 }]}>{t.mRole}</Text>
              <Text style={[st.thText, { flex: 1.8 }]}>{t.mJoined}</Text>
              <Text style={[st.thText, { flex: 1 }]}>{t.mState}</Text>
              <Text style={[st.thText, { flex: 0.8, textAlign: "right" }]}>{t.mCount}</Text>
            </View>
            {data.members.map((m, i) => (
              <View key={i} style={st.tr} wrap={false}>
                <Text style={[st.td, { flex: 2.2 }]}>{m.name}{m.kind === "owner" ? ` (${t.ownerTag})` : ""}</Text>
                <Text style={[st.td, { flex: 1.4 }]}>{m.role ?? "-"}</Text>
                <Text style={[st.td, { flex: 1.8 }]}>{fmt(m.acceptedAt, locale, tz)}</Text>
                <Text style={[st.td, { flex: 1 }]}>{t[`mState_${m.state}`]}</Text>
                <Text style={[st.td, { flex: 0.8, textAlign: "right" }]}>{String(m.photoCount)}</Text>
              </View>
            ))}
          </View>
        </View>

        <View style={st.section}>
          <Text style={st.sectionTitle}>{total > shown ? `${t.photos} (${shown} / ${total})` : `${t.photos} (${shown})`}</Text>
          {truncPhotos ? <Text style={st.warn}>{`⚠ ${truncPhotos}`}</Text> : null}
          {truncThumbs ? <Text style={st.warn}>{`⚠ ${truncThumbs}`}</Text> : null}
          {data.photos.length === 0 ? (
            <Text style={st.small}>{t.noPhotos}</Text>
          ) : (
            <View style={st.table}>
              <View style={st.th} fixed>
                <Text style={[st.thText, { width: 22 }]}>{t.pNo}</Text>
                <Text style={[st.thText, { width: 58 }]}>{t.pThumb}</Text>
                <Text style={[st.thText, { flex: 2.4 }]}>{t.pInfo}</Text>
                <Text style={[st.thText, { width: 92, textAlign: "center" }]}>{t.pLink}</Text>
                <Text style={[st.thText, { flex: 1.3 }]}>{t.pUploader}</Text>
                <Text style={[st.thText, { width: 52, textAlign: "right" }]}>{t.pRead}</Text>
              </View>
              {data.photos.map((p) => (
                <View key={p.no} style={st.tr} wrap={false}>
                  <Text style={[st.td, { width: 22 }]}>{String(p.no)}</Text>
                  <View style={{ width: 58 }}>
                    {p.thumbDataUrl ? <Image src={p.thumbDataUrl} style={st.thumb} /> : <View style={st.thumb} />}
                  </View>
                  <View style={{ flex: 2.4, paddingRight: 4 }}>
                    <Text style={st.td}>{`${t.capturedAt} ${fmt(p.capturedAt ?? p.publishedAt, locale, tz, true)}`}</Text>
                    {p.capturedAt && p.publishedAt ? <Text style={st.small}>{`${t.publishedAt} ${fmt(p.publishedAt, locale, tz)}`}</Text> : null}
                    <Text style={st.small}>{p.lat != null && p.lng != null ? `${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}` : t.noCoords}</Text>
                    <Text style={st.small}>{`${p.tier === "verified" ? "Verified" : "Standard"} · ${p.source === "capture" ? t.sourceCapture : t.sourceSubmit}`}</Text>
                    {p.memo ? <Text style={st.small} hyphenationCallback={breakAnywhere}>{`${t.memo}: ${p.memo}`}</Text> : null}
                  </View>
                  {/* QR 위·주소 아래 세로 배치 — 주소가 옆 칸으로 넘치지 않게 고정 폭 (2026-09-10 대표) */}
                  {/* 실제 PDF 링크(annotation)로 — 글자만 두면 Android 뷰어에서 탭해도 열리지 않음 (2026-09-10 갤럭시) */}
                  <View style={{ width: 92, alignItems: "center", paddingHorizontal: 2 }}>
                    {p.qrDataUrl ? (
                      <Link src={p.linkUrl}>
                        <Image src={p.qrDataUrl} style={st.qr} />
                      </Link>
                    ) : null}
                    {/* 긴 URL은 문자 단위로 줄바꿈 — Link에는 hyphenationCallback이 없어 Text로 감쌈 (2026-09-11 A-87) */}
                    <Link src={p.linkUrl} style={[st.link, { textAlign: "center", marginTop: 2, textDecoration: "none" }]}>
                      <Text style={st.link} hyphenationCallback={breakAnywhere}>{p.linkUrl.replace(/^https?:\/\//, "")}</Text>
                    </Link>
                  </View>
                  <Text style={[st.td, { flex: 1.3, paddingLeft: 4 }]}>{p.uploader}{p.uploaderRole ? `\n(${p.uploaderRole})` : ""}</Text>
                  <Text style={[st.td, { width: 52, textAlign: "right" }]}>{t.unreadFmt.replace("{u}", String(p.unread)).replace("{n}", String(p.total))}</Text>
                </View>
              ))}
            </View>
          )}
        </View>

        <View style={st.section} wrap={false}>
          <Text style={st.sectionTitle}>{t.noticeTitle}</Text>
          <Text style={st.notice}>{`· ${t.notice1}`}</Text>
          <Text style={st.notice}>{`· ${t.notice2}`}</Text>
          <Text style={st.notice}>{`· ${t.notice3}`}</Text>
          <View style={st.row}><Text style={st.label}>{t.issuer}</Text><Text style={st.value}>{t.issuerName}</Text></View>
          <View style={st.signBox}>
            <Text style={st.small}>{t.signature}</Text>
            <View style={st.signLine} />
          </View>
        </View>

        <View style={st.footer} fixed>
          <Text style={st.footerText}>{t.footer}</Text>
          <Text style={st.footerText} render={({ pageNumber, totalPages }) => `${t.page} ${pageNumber} / ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}
