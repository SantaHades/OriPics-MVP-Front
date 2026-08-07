// M0-2 모노레포 추출(2026-08-07): 코어는 @oripics/stamp/v4. 웹 어댑터 — 시그니처 호환 유지.
import { selectEmbedModeV4, bytesEqual, int32BE } from '@oripics/stamp/common';
import type { EmbedMode } from '@oripics/stamp';
import { computeBorderHashV4 as coreComputeBorderHashV4 } from '@oripics/stamp/v4';
import { webSha256 } from './v2';

// v2/v3에서 재사용 (픽셀 크기 무관 함수들)
export { decodeImageToCanvas, computeInnerHash, encodeCanvasToPng } from './v2';
export { payloadHasMagic } from '@oripics/stamp/v2';

export {
  embedPayloadV4,
  extractPayloadV4,
  splitPayloadV4,
  buildPayloadV4,
  readGpsFromMetaV4,
  readCounterFromMetaV4,
} from '@oripics/stamp/v4';

export async function computeBorderHashV4(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  mode: EmbedMode,
): Promise<Uint8Array> {
  return coreComputeBorderHashV4(pixels, width, height, mode, webSha256);
}

export { selectEmbedModeV4, bytesEqual, int32BE };
