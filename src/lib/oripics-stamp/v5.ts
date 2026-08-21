// V5 (촬영시각 필드 추가, 2026-08-21): 코어는 @oripics/stamp/v5. 웹 어댑터 — 시그니처 호환 유지.
import { selectEmbedModeV5 } from '@oripics/stamp/common';
import type { EmbedMode } from '@oripics/stamp';
import { computeBorderHashV5 as coreComputeBorderHashV5 } from '@oripics/stamp/v5';
import { webSha256 } from './v2';

export {
  embedPayloadV5,
  extractPayloadV5,
  splitPayloadV5,
  buildPayloadV5,
  readGpsFromMetaV5,
  readCounterFromMetaV5,
  readCapturedAtFromMetaV5,
} from '@oripics/stamp/v5';

export async function computeBorderHashV5(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  mode: EmbedMode,
): Promise<Uint8Array> {
  return coreComputeBorderHashV5(pixels, width, height, mode, webSha256);
}

export { selectEmbedModeV5 };
