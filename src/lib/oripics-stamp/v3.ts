// M0-2 모노레포 추출(2026-08-07): 코어는 @oripics/stamp/v3. 웹 어댑터 — 시그니처 호환 유지.
import { selectEmbedMode, bytesEqual, int32BE } from '@oripics/stamp/common';
import type { EmbedMode } from '@oripics/stamp';
import { computeBorderHashV3 as coreComputeBorderHashV3 } from '@oripics/stamp/v3';
import { webSha256 } from './v2';

// v2에서 재사용 (픽셀 크기 무관 함수들)
export { decodeImageToCanvas, computeInnerHash, encodeCanvasToPng } from './v2';
export { payloadHasMagic } from '@oripics/stamp/v2';

export {
  selectEmbedModeV3,
  embedPayloadV3,
  extractPayloadV3,
  splitPayloadV3,
  buildPayloadV3,
  readGpsFromMeta,
} from '@oripics/stamp/v3';

export async function computeBorderHashV3(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  mode: EmbedMode,
): Promise<Uint8Array> {
  return coreComputeBorderHashV3(pixels, width, height, mode, webSha256);
}

export { selectEmbedMode, bytesEqual, int32BE };
