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

import { LOGO_DATA_URL, WATERMARK_DATA_URL } from "./logoData";

type Locale = "ko" | "en";

export interface CertificateData {
  linkId: string;
  /** 스탬프에 기록된 인증(등록) 시각 */
  capturedAt: Date;
  /** 기기 촬영 시각 (모바일 촬영 P — 있으면 인증 시각과 병기) */
  deviceCapturedAt?: Date | null;
  /** 공개링크 발행 시각 (인증 시각과 1분 이상 차이나면 병기) */
  publishedAt?: Date | null;
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
  /** 대상 이미지 썸네일 — JPEG data URL (호출 측에서 축소 생성, 선택) */
  imageDataUrl?: string;
  /** 표기 시간대 (IANA) — 미지정 시 Asia/Seoul. 서버는 UTC라 명시 필수 (2026-08-29) */
  timeZone?: string;
  /** 검증 등급 (links.tier) — verified면 기기 검증 상세 섹션 표시 (2026-08-29 대표 요청) */
  tier?: "standard" | "verified";
  /** verified 상세 — 발행본 C2PA com.oripics.verified 어서션에서 추출 (서명된 값만) */
  verifiedDetail?: {
    platform?: "ios" | "android";
    zoomFactor?: number;
    lensPosition?: string;
  };
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
    capturedDevice: "촬영 일시 (기기 기록)",
    certified: "인증 일시",
    published: "공개링크 발행",
    source: "출처",
    source_F: "파일 업로드(웹)",
    source_P: "모바일 카메라(Verified)",
    source_C: "복사·붙여넣기",
    resolution: "해상도",
    location: "위치(GPS)",
    locationNone: "기록 없음",
    verifiedTitle: "기기 검증 (Verified)",
    verifiedAuthority: "검증 주체",
    verifiedAuthority_ios: "Apple App Attest (iOS)",
    verifiedAuthority_android: "Google Play Integrity (Android)",
    verifiedAuthority_unknown: "Apple App Attest / Google Play Integrity",
    verifiedFact: "확인된 사실",
    verifiedFact_ios:
      "정품 Apple 기기에서, 위·변조되지 않은 OriPics 정식 앱이 촬영 시점에 이 사진을 인증했음을 Apple의 하드웨어 검증으로 확인했습니다.",
    verifiedFact_android:
      "정품 Android 기기에서, 위·변조되지 않은 OriPics 정식 앱이 촬영 시점에 이 사진을 인증했음을 Google의 하드웨어 검증으로 확인했습니다.",
    verifiedFact_unknown:
      "정품 기기에서, 위·변조되지 않은 OriPics 정식 앱이 촬영 시점에 이 사진을 인증했음이 하드웨어 수준에서 확인되었습니다.",
    verifiedLens: "촬영 렌즈",
    verifiedZoom: "촬영 배율",
    lens_wide: "광각 (기본 카메라)",
    "lens_ultra-wide": "초광각",
    lens_telephoto: "망원",
    lens_front: "전면",
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
    capturedDevice: "Captured (device)",
    certified: "Certified",
    published: "Link published",
    source: "Source",
    source_F: "File upload (web)",
    source_P: "Mobile camera (Verified)",
    source_C: "Paste / clipboard",
    resolution: "Resolution",
    location: "Location (GPS)",
    locationNone: "Not recorded",
    verifiedTitle: "Device Verification (Verified)",
    verifiedAuthority: "Verified by",
    verifiedAuthority_ios: "Apple App Attest (iOS)",
    verifiedAuthority_android: "Google Play Integrity (Android)",
    verifiedAuthority_unknown: "Apple App Attest / Google Play Integrity",
    verifiedFact: "Attested facts",
    verifiedFact_ios:
      "Apple's hardware attestation confirmed that a genuine Apple device, running an untampered official OriPics app, certified this photo at the moment of capture.",
    verifiedFact_android:
      "Google's hardware attestation confirmed that a genuine Android device, running an untampered official OriPics app, certified this photo at the moment of capture.",
    verifiedFact_unknown:
      "Hardware-level attestation confirmed that a genuine device running the untampered official OriPics app certified this photo at the moment of capture.",
    verifiedLens: "Capture lens",
    verifiedZoom: "Zoom factor",
    lens_wide: "Wide (main camera)",
    "lens_ultra-wide": "Ultra-wide",
    lens_telephoto: "Telephoto",
    lens_front: "Front",
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
    paddingBottom: 10,
    marginBottom: 12,
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
    marginBottom: 12,
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
    marginBottom: 10,
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
    marginBottom: 3,
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
    padding: 8,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 6,
  },
  qrImage: {
    width: 64,
    height: 64,
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
    lineHeight: 1.4,
    marginTop: 2,
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
  frameOuter: {
    position: "absolute",
    top: 20,
    left: 20,
    right: 20,
    bottom: 20,
    borderWidth: 1.4,
    borderColor: "#b8c6da",
  },
  frameInner: {
    position: "absolute",
    top: 25,
    left: 25,
    right: 25,
    bottom: 25,
    borderWidth: 0.6,
    borderColor: "#d8e1ec",
  },
  watermark: {
    position: "absolute",
    top: 268,
    left: 158,
    width: 280,
    height: 280,
    opacity: 0.05,
  },
});

function formatTimestamp(d: Date, locale: Locale, timeZone: string): string {
  const opts: Intl.DateTimeFormatOptions = {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    // 시간대 라벨(GMT+9 등)은 증거 문서라 반드시 함께 표기
    timeZoneName: "short",
    timeZone,
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
  const tz = data.timeZone ?? "Asia/Seoul";

  const sourceLabel =
    data.sourceCode === "P"
      ? t.source_P
      : data.sourceCode === "C"
        ? t.source_C
        : t.source_F;

  const certShortId = `cert_${data.linkId}_${data.issuedAt.getTime().toString(36)}`;

  // 썸네일 박스 = 사진 비율 그대로 (긴 변 124pt) — 고정 정사각형이면 테두리와
  // 이미지 모양이 어긋남 (2026-08-28 대표 피드백). react-pdf Image는 고정 치수 필수.
  const thumbRatio = data.width > 0 && data.height > 0 ? data.width / data.height : 1;
  const thumbW = thumbRatio >= 1 ? 112 : Math.max(24, Math.round(112 * thumbRatio));
  const thumbH = thumbRatio >= 1 ? Math.max(24, Math.round(112 / thumbRatio)) : 112;

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* 문서 프레임(이중 테두리) + 배경 워터마크 — 공문서 무드 (2026-08-28 대표 요청) */}
        <View fixed style={styles.frameOuter} />
        <View fixed style={styles.frameInner} />
        <Image fixed src={WATERMARK_DATA_URL} style={styles.watermark} />
        {/* 헤더 */}
        <View style={styles.header}>
          <View style={styles.brandRow}>
            <Image src={logoDataUrl ?? LOGO_DATA_URL} style={{ width: 26, height: 26 }} />
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

        {/* 대상 이미지 — 정보 행(좌) + 썸네일(우, 있을 때만. 세로/가로 모두 contain) */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t.subject}</Text>
          <View style={{ flexDirection: "row" }}>
          <View style={{ flex: 1 }}>
          <View style={styles.row}>
            <Text style={styles.label}>{t.linkId}</Text>
            <Text style={styles.monoValue}>{data.linkId}</Text>
          </View>
          {data.deviceCapturedAt ? (
            <View style={styles.row}>
              <Text style={styles.label}>{t.capturedDevice}</Text>
              <Text style={styles.value}>{formatTimestamp(data.deviceCapturedAt, locale, tz)}</Text>
            </View>
          ) : null}
          <View style={styles.row}>
            <Text style={styles.label}>{data.deviceCapturedAt ? t.certified : t.captured}</Text>
            <Text style={styles.value}>{formatTimestamp(data.capturedAt, locale, tz)}</Text>
          </View>
          {data.publishedAt &&
          Math.abs(data.publishedAt.getTime() - data.capturedAt.getTime()) > 60_000 ? (
            <View style={styles.row}>
              <Text style={styles.label}>{t.published}</Text>
              <Text style={styles.value}>{formatTimestamp(data.publishedAt, locale, tz)}</Text>
            </View>
          ) : null}
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
            {/* 좌표(ASCII)만 Courier — "기록 없음" 같은 한글을 Courier로 찍으면
                글리프가 깨짐 (2026-08-28 첫 실발급에서 실측) */}
            {data.lat != null && data.lng != null ? (
              <Text style={styles.monoValue}>
                {`${data.lat.toFixed(6)}, ${data.lng.toFixed(6)}`}
              </Text>
            ) : (
              <Text style={styles.value}>{t.locationNone}</Text>
            )}
          </View>
          </View>
          {data.imageDataUrl ? (
            <View
              style={{
                marginLeft: 16,
                padding: 4,
                borderWidth: 1,
                borderColor: "#e2e8f0",
                borderRadius: 4,
              }}
            >
              {/* react-pdf Image는 고정 치수 필수 — max* 만 주면 레이아웃이 수렴하지 않고
                  렌더가 멈출 수 있음 (2026-08-28 테스트 행 실측) */}
              <Image
                src={data.imageDataUrl}
                style={{ width: thumbW, height: thumbH, objectFit: "fill" }}
              />
            </View>
          ) : null}
          </View>
        </View>

        {/* 기기 검증 (Verified) 상세 — links.tier=verified일 때만. 렌즈·배율은
            발행본 C2PA 서명 어서션 값이라 편집 불가한 사실만 기재 (2026-08-29 대표 요청) */}
        {data.tier === "verified" ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t.verifiedTitle}</Text>
            <View
              style={{
                backgroundColor: "#eff6ff",
                borderWidth: 1,
                borderColor: "#bfdbfe",
                borderRadius: 4,
                paddingVertical: 6,
                paddingHorizontal: 10,
              }}
            >
              <View style={styles.row}>
                <Text style={styles.label}>{t.verifiedAuthority}</Text>
                <Text style={styles.value}>
                  {data.verifiedDetail?.platform === "ios"
                    ? t.verifiedAuthority_ios
                    : data.verifiedDetail?.platform === "android"
                      ? t.verifiedAuthority_android
                      : t.verifiedAuthority_unknown}
                </Text>
              </View>
              <View style={styles.row}>
                <Text style={styles.label}>{t.verifiedFact}</Text>
                <Text style={[styles.value, { flex: 1 }]}>
                  {data.verifiedDetail?.platform === "ios"
                    ? t.verifiedFact_ios
                    : data.verifiedDetail?.platform === "android"
                      ? t.verifiedFact_android
                      : t.verifiedFact_unknown}
                </Text>
              </View>
              {data.verifiedDetail?.lensPosition ? (
                <View style={styles.row}>
                  <Text style={styles.label}>{t.verifiedLens}</Text>
                  <Text style={styles.value}>
                    {t[`lens_${data.verifiedDetail.lensPosition}`] ?? data.verifiedDetail.lensPosition}
                  </Text>
                </View>
              ) : null}
              {data.verifiedDetail?.zoomFactor != null ? (
                <View style={styles.row}>
                  <Text style={styles.label}>{t.verifiedZoom}</Text>
                  <Text style={styles.value}>{`${data.verifiedDetail.zoomFactor.toFixed(1)}×`}</Text>
                </View>
              ) : null}
            </View>
          </View>
        ) : null}

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
              {t.issued}: {formatTimestamp(data.issuedAt, locale, tz)}
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
