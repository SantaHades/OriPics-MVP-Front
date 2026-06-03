/* eslint-disable react/no-unescaped-entities */
import React from "react";
import {
  Document,
  Page,
  Text,
  View,
  Image,
  StyleSheet,
  Font,
} from "@react-pdf/renderer";

// 한글 폰트 — @fontsource/noto-sans-kr (npm 의존성, 로컬 번들).
// 과거 gstatic CDN URL을 직접 참조했으나 URL이 불안정해(bold URL이 실제로 404가
// 되어 bold 한글이 □로 렌더됨) 런타임 CDN 의존을 제거하고 npm 패키지로 전환.
// woff(woff2 아님) — @react-pdf/renderer(fontkit)가 woff를 지원. korean 서브셋은
// 전체 현대 한글을 커버하므로 임의 한글 이름도 렌더 가능.
//
// webpack의 require.resolve는 실제 경로가 아닌 모듈 ID를 반환하므로 사용 불가.
// 런타임 fs 경로(process.cwd 기준 node_modules)를 직접 구성한다. 서버리스 함수
// 번들 포함은 next.config.js의 outputFileTracingIncludes가 동일 경로로 보장.
function resolveKrFont(weight: "400" | "700"): string {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const path = require("path") as typeof import("path");
  return path.join(
    process.cwd(),
    "node_modules/@fontsource/noto-sans-kr/files",
    `noto-sans-kr-korean-${weight}-normal.woff`,
  );
}

let fontRegistered = false;
function ensureFontRegistered() {
  if (fontRegistered) return;
  try {
    Font.register({
      family: "NotoSansKR",
      fonts: [
        { src: resolveKrFont("400"), fontWeight: "normal" },
        { src: resolveKrFont("700"), fontWeight: "bold" },
      ],
    });
    // 자동 줄바꿈 비활성화 — 한국어/영문 혼용 줄 단위 분리 방지
    Font.registerHyphenationCallback((word) => [word]);
    fontRegistered = true;
  } catch (e) {
    // 실패 시에도 영문 텍스트는 기본 폰트로 렌더됨
    console.error("[certificate] Korean font register failed", (e as any)?.message);
  }
}

type Locale = "ko" | "en";

export interface CertificateData {
  linkId: string;
  capturedAt: Date;
  sourceCode: "F" | "P" | "C";
  width: number;
  height: number;
  lat?: number | null;
  lng?: number | null;
  /** 사용자 이름 또는 이메일 (발급 대상 표시용) */
  issuedTo: string;
  /** 발급 시각 (보통 now) */
  issuedAt: Date;
  /** PDF 안에 인용할 검증 URL (예: https://www.ori.pics/{linkId}) */
  verifyUrl: string;
  /** QR 코드 — PNG data URL 또는 SVG 문자열 (호출 측에서 생성) */
  qrDataUrl: string;
  /** C2PA 매니페스트 요약 (선택) */
  c2pa?: {
    present: boolean;
    valid?: boolean;
    issuer?: string;
    claimGenerator?: string;
  };
}

const STRINGS: Record<Locale, Record<string, string>> = {
  ko: {
    title: "원본 증명서",
    subtitle: "Certificate of Originality",
    issuedTo: "발급 대상",
    subject: "대상 이미지",
    linkId: "링크 ID",
    captured: "촬영·등록 일시",
    source: "출처",
    source_F: "파일 업로드(웹)",
    source_P: "모바일 카메라(Verified)",
    source_C: "복사·붙여넣기",
    resolution: "해상도",
    location: "위치(GPS)",
    locationNone: "기록 없음",
    verification: "온라인 검증",
    verifyScan: "QR을 스캔하면 누구나 원본 무결성을 확인할 수 있습니다.",
    c2pa: "Content Credentials (C2PA)",
    c2paPresent: "C2PA 매니페스트 첨부됨",
    c2paAbsent: "C2PA 매니페스트 없음",
    c2paValid: "서명 검증: 유효",
    c2paInvalid: "서명 검증: 불일치",
    c2paIssuer: "발급 CA",
    c2paGenerator: "Generator",
    disclaimerTitle: "고지",
    disclaimer:
      "본 증명서는 OriPics 플랫폼이 대상 이미지의 픽셀 무결성·출처 메타데이터를 발급 시점에 확인하였음을 증명합니다. 콘텐츠의 합법성·진실성 자체를 보증하지 않으며, 이미지 저작권은 발급 대상자 또는 적법한 권리자에게 귀속됩니다.",
    issued: "발급",
    issuer: "발급자",
    issuerName: "주식회사 산타하데스 (SantaHades Co., Ltd.)",
    issuerSite: "www.ori.pics",
    certId: "증명서 ID",
    footer: "OriPics — 사진의 원본을 증명합니다.",
  },
  en: {
    title: "Certificate of Originality",
    subtitle: "OriPics 원본 증명서",
    issuedTo: "Issued to",
    subject: "Subject Image",
    linkId: "Link ID",
    captured: "Captured / registered",
    source: "Source",
    source_F: "File upload (web)",
    source_P: "Mobile camera (Verified)",
    source_C: "Paste / clipboard",
    resolution: "Resolution",
    location: "Location (GPS)",
    locationNone: "Not recorded",
    verification: "Online verification",
    verifyScan: "Scan the QR to verify the image's originality online.",
    c2pa: "Content Credentials (C2PA)",
    c2paPresent: "C2PA manifest attached",
    c2paAbsent: "No C2PA manifest",
    c2paValid: "Signature: valid",
    c2paInvalid: "Signature: mismatch",
    c2paIssuer: "Issuing CA",
    c2paGenerator: "Generator",
    disclaimerTitle: "Disclaimer",
    disclaimer:
      "This certificate attests that the OriPics platform verified the subject image's pixel integrity and provenance metadata at the time of issuance. It does not warrant the legality or factual truth of the content; image copyright remains with the recipient or rightful holder.",
    issued: "Issued",
    issuer: "Issuer",
    issuerName: "SantaHades Co., Ltd. (주식회사 산타하데스)",
    issuerSite: "www.ori.pics",
    certId: "Certificate ID",
    footer: "OriPics — proof of original photographs.",
  },
};

const styles = StyleSheet.create({
  page: {
    fontFamily: "NotoSansKR",
    fontSize: 10,
    color: "#0f172a",
    padding: 48,
    paddingBottom: 64,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f0",
    paddingBottom: 16,
    marginBottom: 24,
  },
  brandRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  brandText: {
    fontSize: 14,
    fontWeight: "bold",
    color: "#0f172a",
    marginLeft: 8,
  },
  titleBlock: {
    marginBottom: 24,
  },
  title: {
    fontSize: 22,
    fontWeight: "bold",
    color: "#0f172a",
    marginBottom: 2,
  },
  subtitle: {
    fontSize: 11,
    color: "#64748b",
  },
  section: {
    marginBottom: 18,
  },
  sectionTitle: {
    fontSize: 9,
    color: "#475569",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 6,
    fontWeight: "bold",
  },
  row: {
    flexDirection: "row",
    marginBottom: 4,
  },
  label: {
    width: 110,
    color: "#64748b",
    fontSize: 10,
  },
  value: {
    flex: 1,
    color: "#0f172a",
    fontSize: 10,
  },
  monoValue: {
    flex: 1,
    color: "#0f172a",
    fontSize: 9,
    fontFamily: "Courier",
  },
  qrBlock: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 6,
  },
  qrImage: {
    width: 80,
    height: 80,
  },
  qrTextBlock: {
    flex: 1,
    marginLeft: 16,
  },
  qrUrl: {
    fontSize: 11,
    color: "#1d4ed8",
    fontWeight: "bold",
    marginBottom: 4,
  },
  qrHint: {
    fontSize: 9,
    color: "#475569",
  },
  c2paBlock: {
    padding: 10,
    backgroundColor: "#f0fdf4",
    borderLeftWidth: 3,
    borderLeftColor: "#16a34a",
    borderRadius: 3,
  },
  c2paBlockMissing: {
    padding: 10,
    backgroundColor: "#f8fafc",
    borderLeftWidth: 3,
    borderLeftColor: "#cbd5e1",
    borderRadius: 3,
  },
  c2paStatus: {
    fontSize: 10,
    fontWeight: "bold",
    marginBottom: 4,
  },
  disclaimer: {
    fontSize: 8,
    color: "#475569",
    lineHeight: 1.5,
    marginTop: 4,
  },
  footer: {
    position: "absolute",
    bottom: 32,
    left: 48,
    right: 48,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#e2e8f0",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  footerText: {
    fontSize: 8,
    color: "#64748b",
  },
});

function formatTimestamp(d: Date, locale: Locale): string {
  const opts: Intl.DateTimeFormatOptions = {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZoneName: "short",
  };
  return new Intl.DateTimeFormat(locale === "ko" ? "ko-KR" : "en-US", opts).format(d);
}

export function CertificateDocument({
  data,
  locale,
  logoDataUrl,
}: {
  data: CertificateData;
  locale: Locale;
  /** OriPics 로고 — data URL 또는 절대 URL */
  logoDataUrl?: string;
}) {
  ensureFontRegistered();
  const t = STRINGS[locale];

  const sourceLabel =
    data.sourceCode === "P"
      ? t.source_P
      : data.sourceCode === "C"
        ? t.source_C
        : t.source_F;

  const certShortId = `cert_${data.linkId}_${data.issuedAt.getTime().toString(36)}`;

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* 헤더 */}
        <View style={styles.header}>
          <View style={styles.brandRow}>
            {logoDataUrl ? <Image src={logoDataUrl} style={{ width: 28, height: 28 }} /> : null}
            <Text style={styles.brandText}>OriPics</Text>
          </View>
          <Text style={{ fontSize: 9, color: "#64748b" }}>{t.issuerSite}</Text>
        </View>

        {/* 제목 */}
        <View style={styles.titleBlock}>
          <Text style={styles.title}>{t.title}</Text>
          <Text style={styles.subtitle}>{t.subtitle}</Text>
        </View>

        {/* 발급 대상 */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t.issuedTo}</Text>
          <Text style={{ fontSize: 13, fontWeight: "bold", color: "#0f172a" }}>
            {data.issuedTo}
          </Text>
        </View>

        {/* 대상 이미지 */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t.subject}</Text>
          <View style={styles.row}>
            <Text style={styles.label}>{t.linkId}</Text>
            <Text style={styles.monoValue}>{data.linkId}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>{t.captured}</Text>
            <Text style={styles.value}>{formatTimestamp(data.capturedAt, locale)}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>{t.source}</Text>
            <Text style={styles.value}>{sourceLabel}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>{t.resolution}</Text>
            <Text style={styles.value}>
              {data.width} × {data.height} px
            </Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>{t.location}</Text>
            <Text style={styles.monoValue}>
              {data.lat != null && data.lng != null
                ? `${data.lat.toFixed(6)}, ${data.lng.toFixed(6)}`
                : t.locationNone}
            </Text>
          </View>
        </View>

        {/* 검증 QR */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t.verification}</Text>
          <View style={styles.qrBlock}>
            <Image src={data.qrDataUrl} style={styles.qrImage} />
            <View style={styles.qrTextBlock}>
              <Text style={styles.qrUrl}>{data.verifyUrl}</Text>
              <Text style={styles.qrHint}>{t.verifyScan}</Text>
            </View>
          </View>
        </View>

        {/* C2PA */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t.c2pa}</Text>
          {data.c2pa?.present ? (
            <View style={styles.c2paBlock}>
              <Text style={[styles.c2paStatus, { color: data.c2pa.valid ? "#15803d" : "#b45309" }]}>
                {t.c2paPresent} — {data.c2pa.valid ? t.c2paValid : t.c2paInvalid}
              </Text>
              {data.c2pa.claimGenerator ? (
                <View style={styles.row}>
                  <Text style={styles.label}>{t.c2paGenerator}</Text>
                  <Text style={styles.monoValue}>{data.c2pa.claimGenerator}</Text>
                </View>
              ) : null}
              {data.c2pa.issuer ? (
                <View style={styles.row}>
                  <Text style={styles.label}>{t.c2paIssuer}</Text>
                  <Text style={styles.monoValue}>{data.c2pa.issuer}</Text>
                </View>
              ) : null}
            </View>
          ) : (
            <View style={styles.c2paBlockMissing}>
              <Text style={{ fontSize: 10, color: "#64748b" }}>{t.c2paAbsent}</Text>
            </View>
          )}
        </View>

        {/* 면책 */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t.disclaimerTitle}</Text>
          <Text style={styles.disclaimer}>{t.disclaimer}</Text>
        </View>

        {/* 푸터 */}
        <View style={styles.footer} fixed>
          <View>
            <Text style={styles.footerText}>
              {t.issued}: {formatTimestamp(data.issuedAt, locale)}
            </Text>
            <Text style={styles.footerText}>
              {t.issuer}: {t.issuerName}
            </Text>
          </View>
          <View>
            <Text style={[styles.footerText, { textAlign: "right" }]}>{t.certId}:</Text>
            <Text style={[styles.footerText, { fontFamily: "Courier", textAlign: "right" }]}>
              {certShortId}
            </Text>
          </View>
        </View>
      </Page>
    </Document>
  );
}
