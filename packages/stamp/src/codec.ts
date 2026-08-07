// 플랫폼 어댑터 인터페이스 — 픽셀 IO·해시를 주입받아 코어 로직을 플랫폼 무관으로 유지한다.
// 웹: Canvas + crypto.subtle / 모바일: react-native-skia(readPixels, unpremul 필수) + expo-crypto.
// 규약: data는 RGBA 8bit, sRGB, non-premultiplied. 이 규약이 깨지면 웹·모바일 해시가 어긋난다.

export interface PixelData {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

export type Sha256Fn = (buf: Uint8Array) => Promise<Uint8Array>;

export interface ImageCodec<TIn = unknown, TOut = unknown> {
  /** 이미지 → RGBA 픽셀 (EXIF 방향 적용, premultiply 금지, 색공간 변환 금지) */
  decode(input: TIn): Promise<PixelData>;
  /** RGBA 픽셀 → 무손실 PNG */
  encodePng(pixels: Uint8ClampedArray, width: number, height: number): Promise<TOut>;
}
