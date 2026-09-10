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
  timeZone?: string;
  members: MailboxReportMember[];
  photos: MailboxReportPhoto[];
}
export declare function renderMailboxReportPdf(opts: { data: MailboxReportData; locale: "ko" | "en" }): Promise<Buffer>;
