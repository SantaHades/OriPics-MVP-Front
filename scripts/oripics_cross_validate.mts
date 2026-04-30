import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const v2 = await import('../src/lib/oripics-stamp/v2.ts');
const common = await import('../src/lib/oripics-stamp/common.ts');

function makeFixturePixels(width: number, height: number, seed: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(width * height * 4);
  let s = seed >>> 0;
  for (let i = 0; i < out.length; i++) {
    s = (Math.imul(s, 1103515245) + 12345) >>> 0;
    out[i] = (s >>> 16) & 0xff;
  }
  for (let i = 3; i < out.length; i += 4) out[i] = 0xff;
  return out;
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesPath = join(__dirname, '..', '..', 'backend', 'dev_tools', 'v2_fixtures.json');
const expected = JSON.parse(readFileSync(fixturesPath, 'utf-8'));

let allPass = true;
for (const fx of expected) {
  const pixels = makeFixturePixels(fx.width, fx.height, fx.seed);
  const first16 = common.bytesToHex(new Uint8Array(pixels.buffer, pixels.byteOffset, 16));
  if (first16 !== fx.first_16_bytes) {
    console.log(`[${fx.width}x${fx.height} seed=${fx.seed}] FIXTURE MISMATCH: ts=${first16} py=${fx.first_16_bytes}`);
    allPass = false;
    continue;
  }
  const mode = common.selectEmbedMode(fx.width, fx.height);
  if (mode !== fx.mode) {
    console.log(`[${fx.width}x${fx.height}] mode mismatch: ts=${mode} py=${fx.mode}`);
    allPass = false;
    continue;
  }
  const inner = common.bytesToHex(await v2.computeInnerHash(pixels, fx.width, fx.height));
  const border = common.bytesToHex(await v2.computeBorderHash(pixels, fx.width, fx.height, mode));
  const innerOk = inner === fx.inner_hash;
  const borderOk = border === fx.border_hash;
  console.log(`[${fx.width}x${fx.height} ${mode}] inner=${innerOk ? 'OK' : 'FAIL'} border=${borderOk ? 'OK' : 'FAIL'}`);
  if (!innerOk) console.log(`  inner ts=${inner}\n  inner py=${fx.inner_hash}`);
  if (!borderOk) console.log(`  border ts=${border}\n  border py=${fx.border_hash}`);
  if (!innerOk || !borderOk) allPass = false;
}

if (!allPass) process.exit(1);
console.log('\nALL FIXTURES MATCH');
