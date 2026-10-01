// RFC 3161 타임스탬프 클라이언트 (2026-10-01) — 원장 머클 루트 1개/일을 SSL.com TSA로 보증.
// C2PA 서명과 같은 TSA(ORIPICS_C2PA_TSA_URL)를 쓴다. 의존성 없이 필요한 최소 DER만 직접 다룬다.
// 토큰 서명 검증은 제3자 몫(`openssl ts -verify`) — 여기서는 상태·messageImprint·genTime만 확인해 저장한다.
import { randomBytes } from "crypto";

const DEFAULT_TSA_URL = "http://ts.ssl.com";
// sha256 OID 2.16.840.1.101.3.4.2.1
const OID_SHA256 = Buffer.from([0x06, 0x09, 0x60, 0x86, 0x48, 0x01, 0x65, 0x03, 0x04, 0x02, 0x01]);

function derLen(n: number): Buffer {
  if (n < 0x80) return Buffer.from([n]);
  const bytes: number[] = [];
  while (n > 0) {
    bytes.unshift(n & 0xff);
    n >>= 8;
  }
  return Buffer.from([0x80 | bytes.length, ...bytes]);
}

function tlv(tag: number, content: Buffer): Buffer {
  return Buffer.concat([Buffer.from([tag]), derLen(content.length), content]);
}

/** TimeStampReq DER (version 1, sha256 messageImprint, nonce, certReq=true) */
export function buildTimeStampReq(digest: Buffer, nonce: Buffer): Buffer {
  if (digest.length !== 32) throw new Error("tsa_digest_length");
  const nonceInt = nonce[0] & 0x80 ? Buffer.concat([Buffer.from([0]), nonce]) : nonce;
  const algId = tlv(0x30, Buffer.concat([OID_SHA256, Buffer.from([0x05, 0x00])]));
  const imprint = tlv(0x30, Buffer.concat([algId, tlv(0x04, digest)]));
  return tlv(
    0x30,
    Buffer.concat([
      tlv(0x02, Buffer.from([0x01])),
      imprint,
      tlv(0x02, nonceInt),
      Buffer.from([0x01, 0x01, 0xff]), // certReq BOOLEAN TRUE
    ]),
  );
}

interface Node {
  tag: number;
  start: number; // TLV 시작
  contentStart: number;
  end: number; // TLV 끝 (exclusive)
}

function readNode(buf: Buffer, offset: number): Node {
  const tag = buf[offset];
  let len = buf[offset + 1];
  let p = offset + 2;
  if (len & 0x80) {
    const nBytes = len & 0x7f;
    if (nBytes === 0 || nBytes > 4) throw new Error("der_length");
    len = 0;
    for (let i = 0; i < nBytes; i++) len = len * 256 + buf[p++];
  }
  const end = p + len;
  if (end > buf.length) throw new Error("der_truncated");
  return { tag, start: offset, contentStart: p, end };
}

function children(buf: Buffer, node: Node): Node[] {
  const out: Node[] = [];
  let p = node.contentStart;
  while (p < node.end) {
    const c = readNode(buf, p);
    out.push(c);
    p = c.end;
  }
  return out;
}

function parseGeneralizedTime(s: string): Date {
  // YYYYMMDDHHMMSS[.fff]Z
  const m = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(\.\d+)?Z$/.exec(s);
  if (!m) throw new Error("tsa_gentime_format");
  const ms = m[7] ? Math.round(parseFloat(m[7]) * 1000) : 0;
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6], ms));
}

export interface ParsedTimeStampResp {
  status: number;
  /** TimeStampToken(ContentInfo) DER — 그대로 저장·배포 */
  token: Buffer;
  genTime: Date;
  hashedMessage: Buffer;
  nonce: Buffer | null;
}

/** TimeStampResp DER → 상태·토큰·genTime·messageImprint */
export function parseTimeStampResp(resp: Buffer): ParsedTimeStampResp {
  const root = readNode(resp, 0);
  const [statusInfo, tokenNode] = children(resp, root);
  const statusInt = children(resp, statusInfo)[0];
  const status = resp[statusInt.end - 1];
  if (status !== 0 && status !== 1) throw new Error(`tsa_status_${status}`);
  if (!tokenNode) throw new Error("tsa_no_token");
  const token = resp.subarray(tokenNode.start, tokenNode.end);

  // ContentInfo { contentType, [0] SignedData { version, digestAlgs, encapContentInfo { eContentType, [0] OCTET STRING(TSTInfo) } } }
  const signedDataWrap = children(resp, tokenNode)[1];
  const signedData = children(resp, signedDataWrap)[0];
  const encap = children(resp, signedData)[2];
  const eContentWrap = children(resp, encap)[1];
  const octet = children(resp, eContentWrap)[0];
  const tstInfo = readNode(resp, octet.contentStart);
  const tst = children(resp, tstInfo);
  // TSTInfo { version, policy, messageImprint, serialNumber, genTime, [accuracy], [ordering], [nonce] ... }
  const imprintParts = children(resp, tst[2]);
  const hashedMessage = resp.subarray(imprintParts[1].contentStart, imprintParts[1].end);
  const gt = tst[4];
  if (gt.tag !== 0x18) throw new Error("tsa_gentime_tag");
  const genTime = parseGeneralizedTime(resp.subarray(gt.contentStart, gt.end).toString("ascii"));
  let nonce: Buffer | null = null;
  for (const n of tst.slice(5)) {
    if (n.tag === 0x02) {
      nonce = resp.subarray(n.contentStart, n.end);
      break;
    }
  }
  return { status, token: Buffer.from(token), genTime, hashedMessage: Buffer.from(hashedMessage), nonce };
}

/** 32바이트 digest를 TSA로 타임스탬프 — 상태·imprint·nonce 대조까지 통과해야 반환 */
export async function requestTimestamp(digest: Buffer): Promise<{ token: Buffer; genTime: Date }> {
  const url = process.env.ORIPICS_C2PA_TSA_URL || DEFAULT_TSA_URL;
  const nonce = randomBytes(8);
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/timestamp-query" },
    body: new Uint8Array(buildTimeStampReq(digest, nonce)),
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`tsa_http_${res.status}`);
  const parsed = parseTimeStampResp(Buffer.from(await res.arrayBuffer()));
  if (!parsed.hashedMessage.equals(digest)) throw new Error("tsa_imprint_mismatch");
  if (parsed.nonce) {
    const strip = (b: Buffer) => (b[0] === 0 ? b.subarray(1) : b);
    if (!strip(parsed.nonce).equals(strip(nonce))) throw new Error("tsa_nonce_mismatch");
  }
  return { token: parsed.token, genTime: parsed.genTime };
}
