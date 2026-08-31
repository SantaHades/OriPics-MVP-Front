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
