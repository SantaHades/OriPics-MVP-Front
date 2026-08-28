"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var render_exports = {};
__export(render_exports, {
  CertificateDocument: () => CertificateDocument
});
module.exports = __toCommonJS(render_exports);
var import_react = __toESM(require("react"));
var import_renderer = require("@react-pdf/renderer");
function resolveKrFont(weight) {
  const path = require("path");
  return path.join(
    process.cwd(),
    "node_modules/@fontsource/noto-sans-kr/files",
    `noto-sans-kr-korean-${weight}-normal.woff`
  );
}
let fontRegistered = false;
function ensureFontRegistered() {
  if (fontRegistered) return;
  try {
    import_renderer.Font.register({
      family: "NotoSansKR",
      fonts: [
        { src: resolveKrFont("400"), fontWeight: "normal" },
        { src: resolveKrFont("700"), fontWeight: "bold" }
      ]
    });
    import_renderer.Font.registerHyphenationCallback((word) => [word]);
    fontRegistered = true;
  } catch (e) {
    console.error("[certificate] Korean font register failed", e?.message);
  }
}
const STRINGS = {
  ko: {
    title: "\uC6D0\uBCF8 \uC99D\uBA85\uC11C",
    subtitle: "Certificate of Originality",
    issuedTo: "\uBC1C\uAE09 \uB300\uC0C1",
    subject: "\uB300\uC0C1 \uC774\uBBF8\uC9C0",
    linkId: "\uB9C1\uD06C ID",
    captured: "\uCD2C\uC601\xB7\uB4F1\uB85D \uC77C\uC2DC",
    source: "\uCD9C\uCC98",
    source_F: "\uD30C\uC77C \uC5C5\uB85C\uB4DC(\uC6F9)",
    source_P: "\uBAA8\uBC14\uC77C \uCE74\uBA54\uB77C(Verified)",
    source_C: "\uBCF5\uC0AC\xB7\uBD99\uC5EC\uB123\uAE30",
    resolution: "\uD574\uC0C1\uB3C4",
    location: "\uC704\uCE58(GPS)",
    locationNone: "\uAE30\uB85D \uC5C6\uC74C",
    verification: "\uC628\uB77C\uC778 \uAC80\uC99D",
    verifyScan: "QR\uC744 \uC2A4\uCE94\uD558\uBA74 \uB204\uAD6C\uB098 \uC6D0\uBCF8 \uBB34\uACB0\uC131\uC744 \uD655\uC778\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4.",
    c2pa: "Content Credentials (C2PA)",
    c2paPresent: "C2PA \uB9E4\uB2C8\uD398\uC2A4\uD2B8 \uCCA8\uBD80\uB428",
    c2paAbsent: "C2PA \uB9E4\uB2C8\uD398\uC2A4\uD2B8 \uC5C6\uC74C",
    c2paValid: "\uC11C\uBA85 \uAC80\uC99D: \uC720\uD6A8",
    c2paInvalid: "\uC11C\uBA85 \uAC80\uC99D: \uBD88\uC77C\uCE58",
    c2paIssuer: "\uBC1C\uAE09 CA",
    c2paGenerator: "Generator",
    disclaimerTitle: "\uACE0\uC9C0",
    disclaimer: "\uBCF8 \uC99D\uBA85\uC11C\uB294 OriPics \uD50C\uB7AB\uD3FC\uC774 \uB300\uC0C1 \uC774\uBBF8\uC9C0\uC758 \uD53D\uC140 \uBB34\uACB0\uC131\xB7\uCD9C\uCC98 \uBA54\uD0C0\uB370\uC774\uD130\uB97C \uBC1C\uAE09 \uC2DC\uC810\uC5D0 \uD655\uC778\uD558\uC600\uC74C\uC744 \uC99D\uBA85\uD569\uB2C8\uB2E4. \uCF58\uD150\uCE20\uC758 \uD569\uBC95\uC131\xB7\uC9C4\uC2E4\uC131 \uC790\uCCB4\uB97C \uBCF4\uC99D\uD558\uC9C0 \uC54A\uC73C\uBA70, \uC774\uBBF8\uC9C0 \uC800\uC791\uAD8C\uC740 \uBC1C\uAE09 \uB300\uC0C1\uC790 \uB610\uB294 \uC801\uBC95\uD55C \uAD8C\uB9AC\uC790\uC5D0\uAC8C \uADC0\uC18D\uB429\uB2C8\uB2E4.",
    issued: "\uBC1C\uAE09",
    issuer: "\uBC1C\uAE09\uC790",
    issuerName: "\uC8FC\uC2DD\uD68C\uC0AC \uC0B0\uD0C0\uD558\uB370\uC2A4 (SantaHades Co., Ltd.)",
    issuerSite: "www.ori.pics",
    certId: "\uC99D\uBA85\uC11C ID",
    footer: "OriPics \u2014 \uC0AC\uC9C4\uC758 \uC6D0\uBCF8\uC744 \uC99D\uBA85\uD569\uB2C8\uB2E4."
  },
  en: {
    title: "Certificate of Originality",
    subtitle: "OriPics \uC6D0\uBCF8 \uC99D\uBA85\uC11C",
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
    disclaimer: "This certificate attests that the OriPics platform verified the subject image's pixel integrity and provenance metadata at the time of issuance. It does not warrant the legality or factual truth of the content; image copyright remains with the recipient or rightful holder.",
    issued: "Issued",
    issuer: "Issuer",
    issuerName: "SantaHades Co., Ltd. (\uC8FC\uC2DD\uD68C\uC0AC \uC0B0\uD0C0\uD558\uB370\uC2A4)",
    issuerSite: "www.ori.pics",
    certId: "Certificate ID",
    footer: "OriPics \u2014 proof of original photographs."
  }
};
const styles = import_renderer.StyleSheet.create({
  page: {
    fontFamily: "NotoSansKR",
    fontSize: 10,
    color: "#0f172a",
    padding: 48,
    paddingBottom: 64
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f0",
    paddingBottom: 16,
    marginBottom: 24
  },
  brandRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8
  },
  brandText: {
    fontSize: 14,
    fontWeight: "bold",
    color: "#0f172a",
    marginLeft: 8
  },
  titleBlock: {
    marginBottom: 24
  },
  title: {
    fontSize: 22,
    fontWeight: "bold",
    color: "#0f172a",
    marginBottom: 2
  },
  subtitle: {
    fontSize: 11,
    color: "#64748b"
  },
  section: {
    marginBottom: 18
  },
  sectionTitle: {
    fontSize: 9,
    color: "#475569",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 6,
    fontWeight: "bold"
  },
  row: {
    flexDirection: "row",
    marginBottom: 4
  },
  label: {
    width: 110,
    color: "#64748b",
    fontSize: 10
  },
  value: {
    flex: 1,
    color: "#0f172a",
    fontSize: 10
  },
  monoValue: {
    flex: 1,
    color: "#0f172a",
    fontSize: 9,
    fontFamily: "Courier"
  },
  qrBlock: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 6
  },
  qrImage: {
    width: 80,
    height: 80
  },
  qrTextBlock: {
    flex: 1,
    marginLeft: 16
  },
  qrUrl: {
    fontSize: 11,
    color: "#1d4ed8",
    fontWeight: "bold",
    marginBottom: 4
  },
  qrHint: {
    fontSize: 9,
    color: "#475569"
  },
  c2paBlock: {
    padding: 10,
    backgroundColor: "#f0fdf4",
    borderLeftWidth: 3,
    borderLeftColor: "#16a34a",
    borderRadius: 3
  },
  c2paBlockMissing: {
    padding: 10,
    backgroundColor: "#f8fafc",
    borderLeftWidth: 3,
    borderLeftColor: "#cbd5e1",
    borderRadius: 3
  },
  c2paStatus: {
    fontSize: 10,
    fontWeight: "bold",
    marginBottom: 4
  },
  disclaimer: {
    fontSize: 8,
    color: "#475569",
    lineHeight: 1.5,
    marginTop: 4
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
    justifyContent: "space-between"
  },
  footerText: {
    fontSize: 8,
    color: "#64748b"
  }
});
function formatTimestamp(d, locale) {
  const opts = {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZoneName: "short"
  };
  return new Intl.DateTimeFormat(locale === "ko" ? "ko-KR" : "en-US", opts).format(d);
}
function CertificateDocument({
  data,
  locale,
  logoDataUrl
}) {
  ensureFontRegistered();
  const t = STRINGS[locale];
  const sourceLabel = data.sourceCode === "P" ? t.source_P : data.sourceCode === "C" ? t.source_C : t.source_F;
  const certShortId = `cert_${data.linkId}_${data.issuedAt.getTime().toString(36)}`;
  return /* @__PURE__ */ import_react.default.createElement(import_renderer.Document, null, /* @__PURE__ */ import_react.default.createElement(import_renderer.Page, { size: "A4", style: styles.page }, /* @__PURE__ */ import_react.default.createElement(import_renderer.View, { style: styles.header }, /* @__PURE__ */ import_react.default.createElement(import_renderer.View, { style: styles.brandRow }, logoDataUrl ? /* @__PURE__ */ import_react.default.createElement(import_renderer.Image, { src: logoDataUrl, style: { width: 28, height: 28 } }) : null, /* @__PURE__ */ import_react.default.createElement(import_renderer.Text, { style: styles.brandText }, "OriPics")), /* @__PURE__ */ import_react.default.createElement(import_renderer.Text, { style: { fontSize: 9, color: "#64748b" } }, t.issuerSite)), /* @__PURE__ */ import_react.default.createElement(import_renderer.View, { style: styles.titleBlock }, /* @__PURE__ */ import_react.default.createElement(import_renderer.Text, { style: styles.title }, t.title), /* @__PURE__ */ import_react.default.createElement(import_renderer.Text, { style: styles.subtitle }, t.subtitle)), /* @__PURE__ */ import_react.default.createElement(import_renderer.View, { style: styles.section }, /* @__PURE__ */ import_react.default.createElement(import_renderer.Text, { style: styles.sectionTitle }, t.issuedTo), /* @__PURE__ */ import_react.default.createElement(import_renderer.Text, { style: { fontSize: 13, fontWeight: "bold", color: "#0f172a" } }, data.issuedTo)), /* @__PURE__ */ import_react.default.createElement(import_renderer.View, { style: styles.section }, /* @__PURE__ */ import_react.default.createElement(import_renderer.Text, { style: styles.sectionTitle }, t.subject), /* @__PURE__ */ import_react.default.createElement(import_renderer.View, { style: styles.row }, /* @__PURE__ */ import_react.default.createElement(import_renderer.Text, { style: styles.label }, t.linkId), /* @__PURE__ */ import_react.default.createElement(import_renderer.Text, { style: styles.monoValue }, data.linkId)), /* @__PURE__ */ import_react.default.createElement(import_renderer.View, { style: styles.row }, /* @__PURE__ */ import_react.default.createElement(import_renderer.Text, { style: styles.label }, t.captured), /* @__PURE__ */ import_react.default.createElement(import_renderer.Text, { style: styles.value }, formatTimestamp(data.capturedAt, locale))), /* @__PURE__ */ import_react.default.createElement(import_renderer.View, { style: styles.row }, /* @__PURE__ */ import_react.default.createElement(import_renderer.Text, { style: styles.label }, t.source), /* @__PURE__ */ import_react.default.createElement(import_renderer.Text, { style: styles.value }, sourceLabel)), /* @__PURE__ */ import_react.default.createElement(import_renderer.View, { style: styles.row }, /* @__PURE__ */ import_react.default.createElement(import_renderer.Text, { style: styles.label }, t.resolution), /* @__PURE__ */ import_react.default.createElement(import_renderer.Text, { style: styles.value }, data.width, " \xD7 ", data.height, " px")), /* @__PURE__ */ import_react.default.createElement(import_renderer.View, { style: styles.row }, /* @__PURE__ */ import_react.default.createElement(import_renderer.Text, { style: styles.label }, t.location), /* @__PURE__ */ import_react.default.createElement(import_renderer.Text, { style: styles.monoValue }, data.lat != null && data.lng != null ? `${data.lat.toFixed(6)}, ${data.lng.toFixed(6)}` : t.locationNone))), /* @__PURE__ */ import_react.default.createElement(import_renderer.View, { style: styles.section }, /* @__PURE__ */ import_react.default.createElement(import_renderer.Text, { style: styles.sectionTitle }, t.verification), /* @__PURE__ */ import_react.default.createElement(import_renderer.View, { style: styles.qrBlock }, /* @__PURE__ */ import_react.default.createElement(import_renderer.Image, { src: data.qrDataUrl, style: styles.qrImage }), /* @__PURE__ */ import_react.default.createElement(import_renderer.View, { style: styles.qrTextBlock }, /* @__PURE__ */ import_react.default.createElement(import_renderer.Text, { style: styles.qrUrl }, data.verifyUrl), /* @__PURE__ */ import_react.default.createElement(import_renderer.Text, { style: styles.qrHint }, t.verifyScan)))), /* @__PURE__ */ import_react.default.createElement(import_renderer.View, { style: styles.section }, /* @__PURE__ */ import_react.default.createElement(import_renderer.Text, { style: styles.sectionTitle }, t.c2pa), data.c2pa?.present ? /* @__PURE__ */ import_react.default.createElement(import_renderer.View, { style: styles.c2paBlock }, /* @__PURE__ */ import_react.default.createElement(import_renderer.Text, { style: [styles.c2paStatus, { color: data.c2pa.valid ? "#15803d" : "#b45309" }] }, t.c2paPresent, " \u2014 ", data.c2pa.valid ? t.c2paValid : t.c2paInvalid), data.c2pa.claimGenerator ? /* @__PURE__ */ import_react.default.createElement(import_renderer.View, { style: styles.row }, /* @__PURE__ */ import_react.default.createElement(import_renderer.Text, { style: styles.label }, t.c2paGenerator), /* @__PURE__ */ import_react.default.createElement(import_renderer.Text, { style: styles.monoValue }, data.c2pa.claimGenerator)) : null, data.c2pa.issuer ? /* @__PURE__ */ import_react.default.createElement(import_renderer.View, { style: styles.row }, /* @__PURE__ */ import_react.default.createElement(import_renderer.Text, { style: styles.label }, t.c2paIssuer), /* @__PURE__ */ import_react.default.createElement(import_renderer.Text, { style: styles.monoValue }, data.c2pa.issuer)) : null) : /* @__PURE__ */ import_react.default.createElement(import_renderer.View, { style: styles.c2paBlockMissing }, /* @__PURE__ */ import_react.default.createElement(import_renderer.Text, { style: { fontSize: 10, color: "#64748b" } }, t.c2paAbsent))), /* @__PURE__ */ import_react.default.createElement(import_renderer.View, { style: styles.section }, /* @__PURE__ */ import_react.default.createElement(import_renderer.Text, { style: styles.sectionTitle }, t.disclaimerTitle), /* @__PURE__ */ import_react.default.createElement(import_renderer.Text, { style: styles.disclaimer }, t.disclaimer)), /* @__PURE__ */ import_react.default.createElement(import_renderer.View, { style: styles.footer, fixed: true }, /* @__PURE__ */ import_react.default.createElement(import_renderer.View, null, /* @__PURE__ */ import_react.default.createElement(import_renderer.Text, { style: styles.footerText }, t.issued, ": ", formatTimestamp(data.issuedAt, locale)), /* @__PURE__ */ import_react.default.createElement(import_renderer.Text, { style: styles.footerText }, t.issuer, ": ", t.issuerName)), /* @__PURE__ */ import_react.default.createElement(import_renderer.View, null, /* @__PURE__ */ import_react.default.createElement(import_renderer.Text, { style: [styles.footerText, { textAlign: "right" }] }, t.certId, ":"), /* @__PURE__ */ import_react.default.createElement(import_renderer.Text, { style: [styles.footerText, { fontFamily: "Courier", textAlign: "right" }] }, certShortId)))));
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  CertificateDocument
});
