export interface CertificateData {
  linkId: string;
  capturedAt: Date;
  sourceCode: "F" | "P" | "C";
  width: number;
  height: number;
  lat?: number | null;
  lng?: number | null;
  issuedTo: string;
  issuedAt: Date;
  verifyUrl: string;
  qrDataUrl: string;
  c2pa?: { present: boolean; valid?: boolean; issuer?: string; claimGenerator?: string };
}
export declare function renderCertificatePdf(opts: {
  data: CertificateData;
  locale: "ko" | "en";
  logoDataUrl?: string;
}): Promise<Buffer>;
