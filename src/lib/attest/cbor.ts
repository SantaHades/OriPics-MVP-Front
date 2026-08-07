// 최소 CBOR 디코더 — Apple App Attest attestation 객체 파싱 전용 (RFC 8949 부분집합).
// 지원: uint(0)·negint(1)·bytes(2)·text(3)·array(4)·map(5). 그 외 major type은 거부.
// attestation 객체는 {fmt: text, attStmt: map{x5c: array<bytes>, receipt: bytes}, authData: bytes}만 쓴다.

export type CborValue = number | Uint8Array | string | CborValue[] | { [key: string]: CborValue };

class Reader {
  constructor(
    private buf: Uint8Array,
    public pos = 0,
  ) {}

  byte(): number {
    if (this.pos >= this.buf.length) throw new Error("cbor_truncated");
    return this.buf[this.pos++];
  }

  bytes(n: number): Uint8Array {
    if (this.pos + n > this.buf.length) throw new Error("cbor_truncated");
    const out = this.buf.subarray(this.pos, this.pos + n);
    this.pos += n;
    return out;
  }

  length(info: number): number {
    if (info < 24) return info;
    if (info === 24) return this.byte();
    if (info === 25) {
      const b = this.bytes(2);
      return (b[0] << 8) | b[1];
    }
    if (info === 26) {
      const b = this.bytes(4);
      return ((b[0] << 24) | (b[1] << 16) | (b[2] << 8) | b[3]) >>> 0;
    }
    // 64-bit·indefinite 길이는 attestation 객체에 등장하지 않음
    throw new Error("cbor_unsupported_length");
  }
}

function decodeItem(r: Reader, depth: number): CborValue {
  if (depth > 8) throw new Error("cbor_too_deep");
  const initial = r.byte();
  const major = initial >> 5;
  const info = initial & 0x1f;

  switch (major) {
    case 0:
      return r.length(info);
    case 1:
      return -1 - r.length(info);
    case 2:
      return r.bytes(r.length(info));
    case 3:
      return new TextDecoder().decode(r.bytes(r.length(info)));
    case 4: {
      const n = r.length(info);
      const arr: CborValue[] = [];
      for (let i = 0; i < n; i++) arr.push(decodeItem(r, depth + 1));
      return arr;
    }
    case 5: {
      const n = r.length(info);
      const obj: { [key: string]: CborValue } = {};
      for (let i = 0; i < n; i++) {
        const key = decodeItem(r, depth + 1);
        if (typeof key !== "string") throw new Error("cbor_nonstring_key");
        obj[key] = decodeItem(r, depth + 1);
      }
      return obj;
    }
    default:
      throw new Error(`cbor_unsupported_major_${major}`);
  }
}

export function cborDecode(buf: Uint8Array): CborValue {
  const r = new Reader(buf);
  const value = decodeItem(r, 0);
  return value;
}
