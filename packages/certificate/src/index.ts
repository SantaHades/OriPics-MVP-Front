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
