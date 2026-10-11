// 브라우저 사진 검사 (2026-10-01 검증 레이어 2단계) — 사진을 서버로 보내지 않는다.
//   - C2PA: @contentauth/c2pa-web (WASM, 자체 호스팅 /vendor/c2pa-web/<ver>/) + 서버와 같은 공식 Trust List
//   - EXIF·XMP·IPTC: exifr
// 두 라이브러리 모두 검사 버튼을 누를 때만 동적 import (첫 화면 번들에 넣지 않음).
import c2paPkg from "@contentauth/c2pa-web/package.json";
import { summarizeC2pa, EMPTY_C2PA, type C2paSummary } from "./c2paSummary";
import { summarizeExif, EMPTY_EXIF, type ExifSummary } from "./exifSummary";

type C2paModule = typeof import("@contentauth/c2pa-web");
let c2paInstance: Promise<{ mod: C2paModule; c2pa: Awaited<ReturnType<C2paModule["createC2pa"]>>; context: InstanceType<C2paModule["Context"]> }> | null = null;

function loadC2pa() {
  if (!c2paInstance) {
    c2paInstance = (async () => {
      const mod = await import("@contentauth/c2pa-web");
      const origin = window.location.origin;
      const c2pa = await mod.createC2pa({ wasmSrc: `${origin}/vendor/c2pa-web/${c2paPkg.version}/c2pa_bg.wasm` });
      const context = new mod.Context({
        trust: {
          trustAnchors: `${origin}/api/c2pa/trust?kind=anchors`,
          trustConfig: `${origin}/api/c2pa/trust?kind=config`,
        },
        // 원격 매니페스트·OCSP 조회 끔 — 검사 중 제3자 서버로 요청을 보내지 않는다
        verify: { verifyTrust: true, verifyTimestampTrust: true, remoteManifestFetch: false, ocspFetch: false },
      });
      return { mod, c2pa, context };
    })();
    c2paInstance.catch(() => {
      c2paInstance = null; // 다음 시도에서 다시 로드
    });
  }
  return c2paInstance;
}

export type C2paCheck = C2paSummary & { error?: string };

export async function readC2pa(file: Blob): Promise<C2paCheck> {
  try {
    const { mod, c2pa, context } = await loadC2pa();
    const reader = await mod.Reader.fromBlob(c2pa, file.type || undefined, file, context);
    if (!reader) return EMPTY_C2PA;
    try {
      return summarizeC2pa(await reader.manifestStore());
    } finally {
      await reader.free();
    }
  } catch (e: any) {
    // 지원하지 않는 형식·손상 파일 등 — 검사 전체를 막지 않고 "확인 불가"로 표시
    return { ...EMPTY_C2PA, error: String(e?.message || e).slice(0, 200) };
  }
}

export type ExifCheck = ExifSummary & { error?: string };

export async function readExif(file: Blob): Promise<ExifCheck> {
  try {
    const exifr = (await import("exifr")).default;
    const raw = await exifr.parse(file, { tiff: true, exif: true, gps: true, xmp: true, iptc: true, icc: false, mergeOutput: true });
    return summarizeExif(raw);
  } catch (e: any) {
    return { ...EMPTY_EXIF, error: String(e?.message || e).slice(0, 200) };
  }
}
