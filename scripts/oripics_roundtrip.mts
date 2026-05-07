const v2 = await import('../src/lib/oripics-stamp/v2.ts');
const common = await import('../src/lib/oripics-stamp/common.ts');

function makePixels(w: number, h: number, seed: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(w * h * 4);
  let s = seed >>> 0;
  for (let i = 0; i < out.length; i++) {
    s = (Math.imul(s, 1103515245) + 12345) >>> 0;
    out[i] = (s >>> 16) & 0xff;
  }
  for (let i = 3; i < out.length; i += 4) out[i] = 0xff;
  return out;
}

function randomPayload(): Uint8Array {
  const p = new Uint8Array(common.PAYLOAD_LENGTH);
  p.set(common.MAGIC_BYTES, 0);
  for (let i = common.MAGIC_BYTES.length; i < p.length; i++) p[i] = (i * 37 + 11) & 0xff;
  return p;
}

let allPass = true;
for (const [w, h] of [[50, 50], [100, 100], [143, 143], [400, 400]] as Array<[number, number]>) {
  const pixels = makePixels(w, h, w * 31 + h);
  const original = new Uint8ClampedArray(pixels);
  const mode = common.selectEmbedMode(w, h);
  const payload = randomPayload();

  v2.embedPayload(pixels, w, h, payload, mode);
  const extracted = v2.extractPayload(pixels, w, h, mode);
  const ok = common.bytesToHex(payload) === common.bytesToHex(extracted);

  let innerChanged = false;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      for (let c = 0; c < 4; c++) {
        const off = (y * w + x) * 4 + c;
        if (pixels[off] !== original[off]) { innerChanged = true; break; }
      }
      if (innerChanged) break;
    }
    if (innerChanged) break;
  }

  let nonLsbChanged = false;
  for (let i = 0; i < pixels.length; i++) {
    if ((pixels[i] & 0xfe) !== (original[i] & 0xfe)) { nonLsbChanged = true; break; }
  }

  console.log(`[${w}x${h} ${mode}] roundtrip=${ok ? 'OK' : 'FAIL'} inner_pristine=${!innerChanged ? 'OK' : 'FAIL'} only_lsb=${!nonLsbChanged ? 'OK' : 'FAIL'}`);
  if (!ok || innerChanged || nonLsbChanged) allPass = false;
}

if (!allPass) process.exit(1);
console.log('\nROUND-TRIP + INNER PRISTINE + LSB-ONLY OK');
