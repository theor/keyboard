import rawWords from './data/words-fr.txt?raw';
import { BOOST_WORDS } from './phrases';

// Lowercase and strip accents, so typing "ete" finds "été".
export function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/œ/g, 'oe')
    .replace(/æ/g, 'ae');
}

// Moves boost words that rank below `rank` up to that rank.
export function buildWordList(words: string[], boost: string[], rank = 300): string[] {
  const keep = new Set(words.slice(0, rank));
  const extra = boost.filter((w) => !keep.has(w));
  const extraSet = new Set(extra);
  const rest = words.slice(rank).filter((w) => !extraSet.has(w));
  return [...words.slice(0, rank), ...extra, ...rest];
}

export class Predictor {
  private entries: { word: string; key: string }[];

  constructor(words: string[]) {
    this.entries = words.map((word) => ({ word, key: normalize(word) }));
  }

  // Personal words come first, then words by frequency.
  suggest(prefix: string, n: number, personal: string[] = []): string[] {
    const p = normalize(prefix);
    if (!p) return [];
    const out: string[] = [];
    const push = (w: string) => {
      if (w !== prefix && !out.includes(w)) out.push(w);
    };
    for (const w of personal) {
      if (out.length >= n) break;
      if (normalize(w).startsWith(p)) push(w);
    }
    for (const e of this.entries) {
      if (out.length >= n) break;
      if (e.key.startsWith(p)) push(e.word);
    }
    return out;
  }
}

// The partial word being typed: text after the last space or apostrophe.
export function currentWord(text: string): string {
  return /[^\s']*$/.exec(text)![0];
}

export function applySuggestion(text: string, word: string): string {
  const base = text.slice(0, text.length - currentWord(text).length);
  return base + word + (word.endsWith("'") ? '' : ' ');
}

export function deleteWord(text: string): string {
  return text.replace(/\S*\s*$/, '');
}

export function addSpace(text: string): string {
  return text === '' || /\s$/.test(text) ? text : text + ' ';
}

export const predictor = new Predictor(
  buildWordList(rawWords.split('\n').filter(Boolean), BOOST_WORDS),
);
