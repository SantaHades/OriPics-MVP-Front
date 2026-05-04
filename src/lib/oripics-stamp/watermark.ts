const WATERMARK_PATH = '/watermark-logo.png';
const NATIVE_W = 300;
const NATIVE_H = 340;
const MAX_W = 150;
const TARGET_PCT = 0.04;
const MARGIN_PCT = 0.02;
const OPACITY = 0.5;
const LUMINANCE_THRESHOLD = 0.5;

let logoPromise: Promise<HTMLImageElement> | null = null;

function loadLogo(): Promise<HTMLImageElement> {
  if (logoPromise) return logoPromise;
  logoPromise = new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => {
      logoPromise = null;
      reject(new Error('watermark_load_failed'));
    };
    img.src = WATERMARK_PATH;
  });
  return logoPromise;
}

function meanLuminance(
  pixels: Uint8ClampedArray,
  width: number,
  x0: number,
  y0: number,
  w: number,
  h: number,
): number {
  const step = 4;
  const x1 = x0 + w;
  const y1 = y0 + h;
  let sum = 0;
  let count = 0;
  for (let y = y0; y < y1; y += step) {
    for (let x = x0; x < x1; x += step) {
      const i = (y * width + x) * 4;
      const r = pixels[i] / 255;
      const g = pixels[i + 1] / 255;
      const b = pixels[i + 2] / 255;
      sum += 0.2126 * r + 0.7152 * g + 0.0722 * b;
      count++;
    }
  }
  return count > 0 ? sum / count : 1;
}

export async function applyWatermark(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
): Promise<Uint8ClampedArray> {
  const logo = await loadLogo();

  const targetW = Math.min(MAX_W, Math.round(width * TARGET_PCT));
  const targetH = Math.round((targetW * NATIVE_H) / NATIVE_W);

  const margin = Math.round(width * MARGIN_PCT);
  const x = margin;
  const y = margin;

  if (x + targetW > width || y + targetH > height) {
    return pixels;
  }

  const lum = meanLuminance(pixels, width, x, y, targetW, targetH);
  const useWhite = lum < LUMINANCE_THRESHOLD;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true, colorSpace: 'srgb' });
  if (!ctx) throw new Error('canvas_context_unavailable');
  const imgData = new ImageData(new Uint8ClampedArray(pixels), width, height);
  ctx.putImageData(imgData, 0, 0);

  if (useWhite) {
    const off = document.createElement('canvas');
    off.width = targetW;
    off.height = targetH;
    const offCtx = off.getContext('2d');
    if (!offCtx) throw new Error('canvas_context_unavailable');
    offCtx.drawImage(logo, 0, 0, targetW, targetH);
    offCtx.globalCompositeOperation = 'source-in';
    offCtx.fillStyle = '#ffffff';
    offCtx.fillRect(0, 0, targetW, targetH);
    ctx.globalAlpha = OPACITY;
    ctx.drawImage(off, x, y);
    ctx.globalAlpha = 1;
  } else {
    ctx.globalAlpha = OPACITY;
    ctx.drawImage(logo, x, y, targetW, targetH);
    ctx.globalAlpha = 1;
  }

  const out = ctx.getImageData(0, 0, width, height, { colorSpace: 'srgb' });
  return out.data;
}
