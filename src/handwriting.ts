import weightsUrl from './data/letters.bin?url';

// Reads one handwritten letter with a small neural network trained on EMNIST
// letters (scripts/train-letters.py). The drawing is turned into a 28×28 image
// the way EMNIST letters were made, then run through the network.

export type Point = { x: number; y: number };
export type Stroke = Point[];

const SIZE = 28;
// EMNIST letters fill a 24×24 box in the middle of the image.
const BOX = 24;
// Pen radius and soft edge, in pixels of the 28×28 image.
const PEN = 1.1;
const EDGE = 1.4;
const LETTERS = 'abcdefghijklmnopqrstuvwxyz';

// Readings of a written letter, best first: "ilt".
export const READINGS = 4;

function segmentDistance(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = dx * dx + dy * dy;
  const t = len ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len)) : 0;
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
}

// White strokes on black, centered and scaled to fit the box, keeping the shape.
export function rasterize(strokes: Stroke[]): Float32Array {
  const all = strokes.flat();
  const xs = all.map((p) => p.x);
  const ys = all.map((p) => p.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const w = Math.max(...xs) - minX;
  const h = Math.max(...ys) - minY;
  const scale = (BOX - 2 * PEN) / (Math.max(w, h) || 1);
  const place = (p: Point) => ({
    x: SIZE / 2 + (p.x - minX - w / 2) * scale,
    y: SIZE / 2 + (p.y - minY - h / 2) * scale,
  });
  const segments = strokes.flatMap((s) => {
    const pts = s.map(place);
    return pts.length === 1 ? [[pts[0], pts[0]]] : pts.slice(1).map((p, i) => [pts[i], p]);
  });
  const image = new Float32Array(SIZE * SIZE);
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const p = { x: x + 0.5, y: y + 0.5 };
      let d = Infinity;
      for (const [a, b] of segments) d = Math.min(d, segmentDistance(p, a, b));
      image[y * SIZE + x] = Math.max(0, Math.min(1, (PEN - d) / EDGE + 0.5));
    }
  }
  return image;
}

// 3×3 convolution with padding 1, then ReLU and 2×2 max pooling.
function convBlock(input: Float32Array, c: number, size: number, w: Float32Array, b: Float32Array): Float32Array {
  const out = b.length;
  const conv = new Float32Array(out * size * size);
  for (let o = 0; o < out; o++) {
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        let sum = b[o];
        for (let i = 0; i < c; i++) {
          for (let ky = 0; ky < 3; ky++) {
            const yy = y + ky - 1;
            if (yy < 0 || yy >= size) continue;
            for (let kx = 0; kx < 3; kx++) {
              const xx = x + kx - 1;
              if (xx < 0 || xx >= size) continue;
              sum += input[(i * size + yy) * size + xx] * w[((o * c + i) * 3 + ky) * 3 + kx];
            }
          }
        }
        conv[(o * size + y) * size + x] = Math.max(0, sum);
      }
    }
  }
  const half = Math.floor(size / 2);
  const pooled = new Float32Array(out * half * half);
  for (let o = 0; o < out; o++) {
    for (let y = 0; y < half; y++) {
      for (let x = 0; x < half; x++) {
        const at = (dy: number, dx: number) => conv[(o * size + 2 * y + dy) * size + 2 * x + dx];
        pooled[(o * half + y) * half + x] = Math.max(at(0, 0), at(0, 1), at(1, 0), at(1, 1));
      }
    }
  }
  return pooled;
}

function dense(input: Float32Array, w: Float32Array, b: Float32Array, relu: boolean): Float32Array {
  const out = new Float32Array(b.length);
  for (let o = 0; o < b.length; o++) {
    let sum = b[o];
    for (let i = 0; i < input.length; i++) sum += input[i] * w[o * input.length + i];
    out[o] = relu ? Math.max(0, sum) : sum;
  }
  return out;
}

// Weight shapes, in the order the training script writes them.
const SHAPES = {
  conv1: [32 * 1 * 9, 32],
  conv2: [64 * 32 * 9, 64],
  conv3: [64 * 64 * 9, 64],
  fc1: [128 * 576, 128],
  fc2: [26 * 128, 26],
} as const;

type Weights = Record<keyof typeof SHAPES, [Float32Array, Float32Array]>;

export class LetterReader {
  private w: Weights;

  constructor(data: Float32Array) {
    let at = 0;
    const take = (n: number) => data.subarray(at, (at += n));
    this.w = Object.fromEntries(
      Object.entries(SHAPES).map(([name, [w, b]]) => [name, [take(w), take(b)]]),
    ) as Weights;
    if (at !== data.length) throw new Error(`letters.bin: expected ${at} weights, got ${data.length}`);
  }

  // Scores for a through z, higher is likelier.
  scores(image: Float32Array): Float32Array {
    const { conv1, conv2, conv3, fc1, fc2 } = this.w;
    let x = convBlock(image, 1, 28, ...conv1);
    x = convBlock(x, 32, 14, ...conv2);
    x = convBlock(x, 64, 7, ...conv3);
    return dense(dense(x, ...fc1, true), ...fc2, false);
  }

  // The likely letters for a drawing, best first.
  read(strokes: Stroke[]): string {
    const s = this.scores(rasterize(strokes));
    return [...LETTERS]
      .map((c, i) => [c, s[i]] as const)
      .sort((a, b) => b[1] - a[1])
      .slice(0, READINGS)
      .map(([c]) => c)
      .join('');
  }
}

let loading: Promise<LetterReader> | undefined;

export function loadLetterReader(): Promise<LetterReader> {
  return (loading ??= fetch(weightsUrl)
    .then((r) => r.arrayBuffer())
    .then((b) => new LetterReader(new Float32Array(b))));
}
