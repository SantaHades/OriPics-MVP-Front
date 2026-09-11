export interface CertificateData {
  linkId: string;
  capturedAt: Date;
  deviceCapturedAt?: Date | null;
  publishedAt?: Date | null;
  sourceCode: "F" | "P" | "C";
  width: number;
  height: number;
  lat?: number | null;
  lng?: number | null;
  issuedTo: string;
  /** 발급 대상 이메일 병기 — issuedTo와 다를 때만 표시 */
  issuedToEmail?: string | null;
  issuedAt: Date;
  verifyUrl: string;
  qrDataUrl: string;
  timeZone?: string;
  imageDataUrl?: string;
  c2pa?: { present: boolean; valid?: boolean; issuer?: string; claimGenerator?: string };
  tier?: "standard" | "verified";
  verifiedDetail?: {
    platform?: "ios" | "android";
    zoomFactor?: number;
    lensPosition?: string;
    attestTokenHash?: string;
    deviceIntegrity?: string;
    deviceModel?: string;
    osVersion?: string;
    appVersion?: string;
    iso?: number;
    exposureTime?: number;
    fNumber?: number;
    focalLength?: number;
    stampVersion?: number;
  };
}
export declare function renderCertificatePdf(opts: {
  data: CertificateData;
  locale: "ko" | "en";
  logoDataUrl?: string;
}): Promise<Buffer>;

// A-81 사서함 확인서 PDF (2026-09-09)
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
  thumbDataUrl?: string | null;
  capturedAt?: Date | null;
  publishedAt?: Date | null;
  lat?: number | null;
  lng?: number | null;
  tier: "standard" | "verified";
  linkUrl: string;
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
/** 폰트 등록 실패 시 renderMailboxReportPdf가 던지는 Error.message — 라우트가 500 detail로 그대로 전달 (2026-09-11 A-87) */
export declare const FONT_UNAVAILABLE: "font_unavailable";
export declare function renderMailboxReportPdf(opts: { data: MailboxReportData; locale: "ko" | "en" }): Promise<Buffer>;
