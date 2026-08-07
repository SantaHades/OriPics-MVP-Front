// M0-2 모노레포 추출(2026-08-07): 비트·해시 코어는 @oripics/stamp로 이동(단일 소스).
// 이 파일은 웹 플랫폼 어댑터 — Canvas 픽셀 IO + crypto.subtle SHA-256 바인딩.
// 기존 임포트 경로·시그니처는 그대로 유지된다.
import { selectEmbedMode } from '@oripics/stamp/common';
import type { EmbedMode, Sha256Fn } from '@oripics/stamp';
import {
  computeInnerHash as coreComputeInnerHash,
  computeBorderHash as coreComputeBorderHash,
} from '@oripics/stamp/v2';

export {
  embedPayload,
  extractPayload,
  payloadHasMagic,
  splitPayload,
  buildPayload,
} from '@oripics/stamp/v2';
export { selectEmbedMode };

export const webSha256: Sha256Fn = async (buf: Uint8Array): Promise<Uint8Array> => {
  const hash = await crypto.subtle.digest('SHA-256', buf as unknown as BufferSource);
  return new Uint8Array(hash);
};

export async function decodeImageToCanvas(file: Blob): Promise<{ data: Uint8ClampedArray; width: number; height: number }> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image', premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true, colorSpace: 'srgb' });
  if (!ctx) throw new Error('canvas_context_unavailable');
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height, { colorSpace: 'srgb' });
  return { data: imageData.data, width: canvas.width, height: canvas.height };
}

export async function computeInnerHash(pixels: Uint8ClampedArray, width: number, height: number): Promise<Uint8Array> {
  return coreComputeInnerHash(pixels, width, height, webSha256);
}

export async function computeBorderHash(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  mode: EmbedMode,
): Promise<Uint8Array> {
  return coreComputeBorderHash(pixels, width, height, mode, webSha256);
}

export async function encodeCanvasToPng(pixels: Uint8ClampedArray, width: number, height: number): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { colorSpace: 'srgb' });
  if (!ctx) throw new Error('canvas_context_unavailable');
  const imageData = new ImageData(pixels as unknown as ImageDataArray, width, height, { colorSpace: 'srgb' });
  ctx.putImageData(imageData, 0, 0);
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('png_encode_failed'));
    }, 'image/png');
  });
}
