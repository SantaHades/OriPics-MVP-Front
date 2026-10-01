// 지각 지문(perceptual fingerprint) — 해시 원장 1단계 (2026-10-01, strategy-verification-layer.md §3.2)
//
// 재압축·크기 변경된 사본에서 인증 원본을 "찾기" 위한 지문. 증명용이 아님 (증명은 SHA·스탬프·C2PA).
//   - phash256: 흑백 → 64×64 박스 평균 → 2D DCT-II → 좌상단 16×16 계수 → 중간값보다 크면 1 → 256비트
//   - dhash64 : 흑백 → 9×8 박스 평균 → 행마다 오른쪽 픽셀이 왼쪽보다 밝으면 1 → 64비트
//
// 웹·모바일 결과가 같아야 원장 대조가 된다 → 리사이즈를 플랫폼 라이브러리에 맡기지 않고
// 여기서 정수 구간 박스 평균으로 직접 축소한다. 입력은 codec 규약(RGBA·non-premultiplied)과 동일.
// 형식(비트 순서·크기)을 바꾸면 기존 원장과 호환이 깨진다 — 바꿀 때는 버전 필드를 새로 둘 것.

export const PHASH_GRID = 64;
export const PHASH_BLOCK = 16; // 16×16 = 256비트
export const DHASH_COLS = 9;
export const DHASH_ROWS = 8; // 8×8 = 64비트

/** 64×64 흑백 그리드 표준편차가 이보다 낮으면 단색·단순 패턴 → 추적 정확도 낮음 */
export const LOW_INFO_STDDEV = 8;

export interface PerceptualFingerprint {
  /** 256비트 pHash, hex 64자 */
  phash256: string;
  /** 64비트 dHash, hex 16자 */
  dhash64: string;
  /** 단색·단순 패턴이라 오인 위험이 큰 이미지 */
  lowInfo: boolean;
}

/** 원본 좌표 → 축소 그리드 인덱스 (정수 구간 분할: floor(i * n / len)) */
function bucketMap(len: number, n: number): Uint16Array {
  const m = new Uint16Array(len);
  for (let i = 0; i < len; i++) m[i] = Math.floor((i * n) / len);
  return m;
}

/** RGBA → 64×64·9×8 흑백 박스 평균을 한 번의 픽셀 순회로 계산 */
function downscaleGray(
  rgba: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
): { grid: Float64Array; small: Float64Array } {
  if (width < 1 || height < 1 || rgba.length < width * height * 4) {
    throw new Error('perceptual_invalid_pixels');
  }
  const gx = bucketMap(width, PHASH_GRID);
  const gy = bucketMap(height, PHASH_GRID);
  const sx = bucketMap(width, DHASH_COLS);
  const sy = bucketMap(height, DHASH_ROWS);

  const gSum = new Float64Array(PHASH_GRID * PHASH_GRID);
  const gCnt = new Uint32Array(PHASH_GRID * PHASH_GRID);
  const sSum = new Float64Array(DHASH_COLS * DHASH_ROWS);
  const sCnt = new Uint32Array(DHASH_COLS * DHASH_ROWS);

  for (let y = 0; y < height; y++) {
    const gRow = gy[y] * PHASH_GRID;
    const sRow = sy[y] * DHASH_COLS;
    let p = y * width * 4;
    for (let x = 0; x < width; x++, p += 4) {
      // ITU-R BT.601 정수 가중치 — 부동소수 오차 없이 웹·모바일 동일
      const lum = (rgba[p] * 299 + rgba[p + 1] * 587 + rgba[p + 2] * 114) / 1000;
      const gi = gRow + gx[x];
      gSum[gi] += lum;
      gCnt[gi]++;
      const si = sRow + sx[x];
      sSum[si] += lum;
      sCnt[si]++;
    }
  }

  // 원본이 그리드보다 작으면 빈 칸이 생긴다 → 가장 가까운 앞 칸 값으로 채움
  const grid = new Float64Array(PHASH_GRID * PHASH_GRID);
  for (let i = 0; i < grid.length; i++) {
    grid[i] = gCnt[i] ? gSum[i] / gCnt[i] : i > 0 ? grid[i - 1] : 0;
  }
  const small = new Float64Array(DHASH_COLS * DHASH_ROWS);
  for (let i = 0; i < small.length; i++) {
    small[i] = sCnt[i] ? sSum[i] / sCnt[i] : i > 0 ? small[i - 1] : 0;
  }
  return { grid, small };
}

/** cos(kπ/2N) — Math.cos는 엔진(V8·Hermes)마다 마지막 비트가 다를 수 있어 사칙연산만 쓰는
 *  테일러 급수로 계산한다(IEEE 사칙연산은 엔진 간 동일). 0~π/2 구간만 급수, 나머지는 대칭. */
function cosStep(k: number, N: number): number {
  const period = 4 * N; // k ∈ [0, 4N) ↔ [0, 2π)
  k = ((k % period) + period) % period;
  if (k > 2 * N) k = period - k; // cos(2π−θ) = cos θ
  let sign = 1;
  if (k > N) {
    k = 2 * N - k; // cos(π−θ) = −cos θ
    sign = -1;
  }
  const theta = (k * Math.PI) / (2 * N);
  const t2 = theta * theta;
  let term = 1;
  let sum = 1;
  for (let n = 1; n <= 12; n++) {
    term = (-term * t2) / ((2 * n - 1) * (2 * n));
    sum += term;
  }
  return sign * sum;
}

let cosTable: Float64Array | null = null;
/** cos((2x+1)uπ / 2N), u < PHASH_BLOCK, x < PHASH_GRID */
function getCosTable(): Float64Array {
  if (cosTable) return cosTable;
  const N = PHASH_GRID;
  const t = new Float64Array(PHASH_BLOCK * N);
  for (let u = 0; u < PHASH_BLOCK; u++) {
    for (let x = 0; x < N; x++) t[u * N + x] = cosStep((2 * x + 1) * u, N);
  }
  cosTable = t;
  return t;
}

function bitsToHex(bits: Uint8Array): string {
  let hex = '';
  for (let i = 0; i < bits.length; i += 4) {
    const nibble = (bits[i] << 3) | (bits[i + 1] << 2) | (bits[i + 2] << 1) | bits[i + 3];
    hex += nibble.toString(16);
  }
  return hex;
}

function phashFromGrid(grid: Float64Array): string {
  const N = PHASH_GRID;
  const B = PHASH_BLOCK;
  const cos = getCosTable();
  // 분리형 DCT: 행 방향(가로 주파수 u) → 열 방향(세로 주파수 v), 필요한 16개 주파수만
  const rows = new Float64Array(N * B);
  for (let y = 0; y < N; y++) {
    for (let u = 0; u < B; u++) {
      let s = 0;
      for (let x = 0; x < N; x++) s += grid[y * N + x] * cos[u * N + x];
      rows[y * B + u] = s;
    }
  }
  const coef = new Float64Array(B * B);
  for (let v = 0; v < B; v++) {
    for (let u = 0; u < B; u++) {
      let s = 0;
      for (let y = 0; y < N; y++) s += rows[y * B + u] * cos[v * N + y];
      coef[v * B + u] = s;
    }
  }
  const sorted = Array.from(coef).sort((a, b) => a - b);
  const median = (sorted[B * B / 2 - 1] + sorted[B * B / 2]) / 2;
  const bits = new Uint8Array(B * B);
  for (let i = 0; i < bits.length; i++) bits[i] = coef[i] > median ? 1 : 0;
  return bitsToHex(bits);
}

function dhashFromSmall(small: Float64Array): string {
  const bits = new Uint8Array(DHASH_ROWS * (DHASH_COLS - 1));
  let k = 0;
  for (let r = 0; r < DHASH_ROWS; r++) {
    for (let c = 0; c < DHASH_COLS - 1; c++) {
      bits[k++] = small[r * DHASH_COLS + c + 1] > small[r * DHASH_COLS + c] ? 1 : 0;
    }
  }
  return bitsToHex(bits);
}

function stddev(grid: Float64Array): number {
  let sum = 0;
  for (let i = 0; i < grid.length; i++) sum += grid[i];
  const mean = sum / grid.length;
  let v = 0;
  for (let i = 0; i < grid.length; i++) v += (grid[i] - mean) ** 2;
  return Math.sqrt(v / grid.length);
}

/** RGBA 픽셀 → pHash256 + dHash64 (+ 저정보량 여부) */
export function computePerceptualFingerprint(
  rgba: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
): PerceptualFingerprint {
  const { grid, small } = downscaleGray(rgba, width, height);
  return {
    phash256: phashFromGrid(grid),
    dhash64: dhashFromSmall(small),
    lowInfo: stddev(grid) < LOW_INFO_STDDEV,
  };
}

const POPCOUNT4 = [0, 1, 1, 2, 1, 2, 2, 3, 1, 2, 2, 3, 2, 3, 3, 4];

/** 같은 길이 hex 지문 사이의 해밍 거리 (다른 비트 수) */
export function hammingHex(a: string, b: string): number {
  if (a.length !== b.length) throw new Error('hamming_length_mismatch');
  let d = 0;
  for (let i = 0; i < a.length; i++) {
    d += POPCOUNT4[parseInt(a[i], 16) ^ parseInt(b[i], 16)];
  }
  return d;
}

/** 사본 판정 기준 (strategy §3.4) — 두 지문이 모두 기준 안이어야 후보로 본다.
 *  10/1 실측(JPEG q35·폭 500px 재압축 7종): 원본↔사본 pHash 2~8·dHash 0~16, 서로 다른 이미지 pHash ≥52.
 *  pHash가 주 판별, dHash는 우연한 pHash 근접을 거르는 2차 확인(단순 그래픽은 재압축에 dHash가 크게 흔들려 20으로 완화). */
export const PHASH_MAX_DISTANCE = 40; // /256
export const DHASH_MAX_DISTANCE = 20; // /64

export const HEX_PHASH256 = /^[0-9a-f]{64}$/;
export const HEX_DHASH64 = /^[0-9a-f]{16}$/;
