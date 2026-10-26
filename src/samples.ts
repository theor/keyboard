import type { Stroke } from './handwriting';
import { normalize } from './words';

// Handwritten letters kept to retrain the letter reader on this person's hand
// (scripts/train-letters.py). They come from two places:
// - prompt: the collection screen asked for this letter;
// - use: a word was picked after writing its first letters, so each written
//   letter is labelled with the word's letter in that place.

export type Source = 'prompt' | 'use';

export interface Sample {
  letter: string;
  source: Source;
  // What the reader made of it at the time, best first.
  reading: string;
  // Each stroke as flat x, y pairs, in pad pixels.
  strokes: number[][];
  at: number;
}

const KEY = 'kb-samples';
// About 1 KB each, so this stays well inside localStorage.
export const MAX_SAMPLES = 3000;
const LETTERS = 'abcdefghijklmnopqrstuvwxyz';

// The letters of a picked word that match the n written letters, or undefined
// if the word is too short. Accents are dropped; apostrophes and hyphens skipped,
// as the word guesser does.
export function labelsFor(word: string, n: number): string | undefined {
  const letters = [...normalize(word)].filter((c) => LETTERS.includes(c));
  return letters.length >= n ? letters.slice(0, n).join('') : undefined;
}

// Shuffled rounds of a–z, so every letter is asked for as often.
export function promptOrder(random = Math.random): string[] {
  const out = [...LETTERS];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export class SampleStore {
  samples: Sample[];

  constructor(samples: Sample[] = []) {
    this.samples = samples;
  }

  // False when full.
  add(letter: string, source: Source, reading: string, strokes: Stroke[]): boolean {
    if (this.samples.length >= MAX_SAMPLES) return false;
    this.samples.push({
      letter,
      source,
      reading,
      strokes: strokes.map((s) => s.flatMap((p) => [Math.round(p.x), Math.round(p.y)])),
      at: Date.now(),
    });
    return true;
  }

  removeLast() {
    this.samples.pop();
  }

  forget() {
    this.samples = [];
  }

  count(source?: Source): number {
    return source ? this.samples.filter((s) => s.source === source).length : this.samples.length;
  }

  // How often the reader's first reading was right.
  rightFirst(): number {
    return this.samples.filter((s) => s.reading[0] === s.letter).length / (this.samples.length || 1);
  }

  toJSON(): string {
    return JSON.stringify({ version: 1, samples: this.samples });
  }

  save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.samples));
    } catch {
      // Storage can be unavailable or full; samples then last for this session only.
    }
  }

  static load(): SampleStore {
    try {
      return new SampleStore(JSON.parse(localStorage.getItem(KEY) ?? '[]'));
    } catch {
      return new SampleStore();
    }
  }
}

export const samples = SampleStore.load();

// Shares the samples as a file (email, Drive…) where the tablet can, else downloads it.
export async function exportSamples(store: SampleStore) {
  const name = `lettres-${new Date().toISOString().slice(0, 10)}.json`;
  const file = new File([store.toJSON()], name, { type: 'application/json' });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: name });
      return;
    } catch (e) {
      if ((e as Error).name === 'AbortError') return;
    }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(file);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
