// PDF 렌더 진입점 — 라우트는 이 함수만 호출한다 (React 엘리먼트를 앱 번들에서 만들지 않음).
import React from "react";
import { renderToBuffer } from "@react-pdf/renderer";
import { CertificateDocument, type CertificateData } from "./render";

export type { CertificateData };

export async function renderCertificatePdf(opts: {
  data: CertificateData;
  locale: "ko" | "en";
  logoDataUrl?: string;
}): Promise<Buffer> {
  const element = React.createElement(CertificateDocument as any, opts as any);
  return renderToBuffer(element as any);
}

// A-81 사서함 확인서 PDF (2026-09-09)
import { FONT_UNAVAILABLE, MailboxReportDocument, type MailboxReportData, type MailboxReportMember, type MailboxReportPhoto } from "./mailboxReport";
export type { MailboxReportData, MailboxReportMember, MailboxReportPhoto };
/** 폰트 등록 실패 시 renderMailboxReportPdf가 던지는 Error.message — 라우트가 500 detail로 그대로 전달 (2026-09-11 A-87) */
export { FONT_UNAVAILABLE };
export async function renderMailboxReportPdf(opts: { data: MailboxReportData; locale: "ko" | "en" }): Promise<Buffer> {
  const element = React.createElement(MailboxReportDocument as any, opts as any);
  return renderToBuffer(element as any);
}
