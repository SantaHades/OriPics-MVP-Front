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
  };
}
export declare function renderCertificatePdf(opts: {
  data: CertificateData;
  locale: "ko" | "en";
  logoDataUrl?: string;
}): Promise<Buffer>;
