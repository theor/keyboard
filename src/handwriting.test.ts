import { describe, expect, it } from 'vitest';
import weights from './data/letters.bin?inline';
import { LetterReader, rasterize, type Stroke } from './handwriting';

// Letters drawn as strokes. y points down: capitals and tall letters span 0–8,
// small letters 4–8, tails go down to 11.

// A polyline from flat coordinates.
const L = (...c: number[]): Stroke => Array.from({ length: c.length / 2 }, (_, i) => ({ x: c[2 * i], y: c[2 * i + 1] }));

// An arc of an ellipse, in degrees from east, going clockwise when `to` > `from`.
function A(cx: number, cy: number, rx: number, ry: number, from: number, to: number): Stroke {
  const n = Math.max(2, Math.ceil(Math.abs(to - from) / 15) + 1);
  return Array.from({ length: n }, (_, i) => {
    const a = ((from + ((to - from) * i) / (n - 1)) * Math.PI) / 180;
    return { x: cx + rx * Math.cos(a), y: cy + ry * Math.sin(a) };
  });
}

const cat = (...parts: Stroke[]): Stroke => parts.flat();

const bowl = A(2, 6, 2, 2, 0, 360);
const hump = (x: number, w: number) => cat(L(x, 6), A(x + w / 2, 6, w / 2, 2, 180, 360), L(x + w, 8));
const upperBowl = cat(L(0, 0, 2.5, 0), A(2.5, 2, 1.5, 2, -90, 90), L(0, 4));

const SAMPLES: Record<string, Stroke[][]> = {
  a: [[bowl, L(4, 4, 4, 8)], [L(0, 8, 2.5, 0, 5, 8), L(1, 5, 4, 5)]],
  b: [[L(0, 0, 0, 8), bowl], [L(0, 0, 0, 8), cat(upperBowl, L(3, 4), A(3, 6, 2, 2, -90, 90), L(0, 8))]],
  c: [[A(2, 6, 2, 2, -45, -315)]],
  d: [[bowl, L(4, 0, 4, 8)], [L(0, 0, 0, 8), cat(L(0, 0, 1.5, 0), A(1.5, 4, 3, 4, -90, 90), L(0, 8))]],
  e: [[cat(L(0, 6, 4, 6), A(2, 6, 2, 2, 0, -315))], [L(4, 0, 0, 0, 0, 8, 4, 8), L(0, 4, 3, 4)]],
  f: [[L(3, 0.3, 2, 0, 1, 1, 1, 8), L(0, 4, 2.5, 4)], [L(4, 0, 0, 0, 0, 8), L(0, 4, 3, 4)]],
  g: [[bowl, cat(L(4, 4, 4, 10), A(2, 10, 2, 1.5, 0, 180))], [cat(A(3, 4, 3, 4, -45, -360), L(3.5, 4))]],
  h: [[L(0, 0, 0, 8), hump(0, 4)], [L(0, 0, 0, 8), L(4, 0, 4, 8), L(0, 4, 4, 4)]],
  i: [[L(0, 4, 0, 8), L(0, 2, 0, 2.2)], [L(0, 0, 0, 8), L(-1, 0, 1, 0), L(-1, 8, 1, 8)]],
  j: [[cat(L(2, 4, 2, 10), A(1, 10, 1, 1, 0, 180)), L(2, 2, 2, 2.2)], [cat(L(4, 0, 4, 6), A(2, 6, 2, 2, 0, 180))]],
  k: [[L(0, 0, 0, 8), L(3, 4, 0, 6.5, 3, 8)], [L(0, 0, 0, 8), L(4, 0, 0, 4.5, 4, 8)]],
  l: [[L(0, 0, 0, 8)], [L(0, 0, 0, 8, 4, 8)]],
  m: [[L(0, 4, 0, 8), hump(0, 3), hump(3, 3)], [L(0, 8, 0, 0, 2.5, 5, 5, 0, 5, 8)]],
  n: [[L(0, 4, 0, 8), hump(0, 4)], [L(0, 8, 0, 0, 4, 8, 4, 0)]],
  o: [[bowl]],
  p: [[L(0, 4, 0, 11), bowl], [L(0, 0, 0, 8), upperBowl]],
  q: [[bowl, L(4, 4, 4, 11)], [A(3, 4, 3, 4, 0, 360), L(3.5, 5.5, 6, 8.5)]],
  r: [[L(0, 4, 0, 8), cat(L(0, 6), A(2, 6, 2, 2, 180, 300))], [L(0, 0, 0, 8), cat(upperBowl, L(4, 8))]],
  s: [[cat(A(2, 5, 2, 1, -30, -270), A(2, 7, 2, 1, -90, 150))]],
  t: [[L(1, 1, 1, 8, 2, 8), L(0, 4, 2.5, 4)], [L(0, 0, 5, 0), L(2.5, 0, 2.5, 8)]],
  u: [[cat(L(0, 4, 0, 6), A(2, 6, 2, 2, 180, 0)), L(4, 4, 4, 8)]],
  v: [[L(0, 4, 2, 8, 4, 4)]],
  w: [[L(0, 4, 1.5, 8, 3, 5, 4.5, 8, 6, 4)]],
  x: [[L(0, 4, 4, 8), L(4, 4, 0, 8)]],
  y: [[L(0, 4, 2, 8), L(4, 4, 1, 11)], [L(0, 0, 2.5, 4), L(5, 0, 2.5, 4, 2.5, 8)]],
  z: [[L(0, 4, 4, 4, 0, 8, 4, 8)]],
};

// As a shaky finger might draw it: bigger, moved, a little noise.
function shaky(strokes: Stroke[], seed: number): Stroke[] {
  let s = seed;
  const rand = () => ((s = (s * 16807) % 2147483647) / 2147483647 - 0.5) * 0.3;
  return strokes.map((stroke) => stroke.map((p) => ({ x: 30 * p.x + 100 + rand() * 30, y: 30 * p.y + 50 + rand() * 30 })));
}

const bytes = Uint8Array.from(atob(weights.split(',')[1]), (c) => c.charCodeAt(0));
const reader = new LetterReader(new Float32Array(bytes.buffer));

function misses(draw: (strokes: Stroke[], seed: number) => Stroke[], within: number): string[] {
  return Object.entries(SAMPLES).flatMap(([letter, shapes]) =>
    shapes.flatMap((strokes, i) => {
      const read = reader.read(draw(strokes, i + 1));
      return read.slice(0, within).includes(letter) ? [] : [`${letter}${i} → ${read}`];
    }),
  );
}

describe('LetterReader', () => {
  it('draws about as much ink as EMNIST letters', () => {
    const ink = Object.values(SAMPLES).map((shapes) => rasterize(shapes[0]).reduce((a, b) => a + b) / 784);
    const mean = ink.reduce((a, b) => a + b) / ink.length;
    expect(mean).toBeGreaterThan(0.12);
    expect(mean).toBeLessThan(0.22);
  });

  it('reads drawn letters', () => {
    expect(misses((s) => s, 1)).toEqual([]);
  });

  it('keeps the letter among the readings of a shaky drawing', () => {
    expect(misses(shaky, 3)).toEqual([]);
  });
});
