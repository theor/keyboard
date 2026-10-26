import rawNext from './data/next-fr.json?raw';
import rawWords from './data/words-fr.txt?raw';
import { NextWords } from './nextword';
import { BOOST_WORDS } from './phrases';
import { splitSentences, tokenize } from './tokens';

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

export interface Hints {
  personal?: string[];
  next?: string[];
  learned?: string[];
}

const PERSONAL_MAX = 2;

export class Predictor {
  private entries: { word: string; key: string }[];

  constructor(words: string[]) {
    this.entries = words.map((word) => ({ word, key: normalize(word) }));
  }

  // Order: up to 2 personal words (names), then likely next words for the
  // context, then words this person uses, then words by frequency.
  // With nothing typed yet, only next words are offered.
  suggest(prefix: string, n: number, hints: Hints = {}): string[] {
    const p = normalize(prefix);
    const out: string[] = [];
    const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
    const ok = (w: string, key: string) =>
      key.startsWith(p) && !same(w, prefix) && !out.some((o) => same(o, w));
    const take = (words: string[], limit: number) => {
      for (const w of words) {
        if (out.length >= limit) return;
        if (ok(w, normalize(w))) out.push(w);
      }
    };
    if (p) take(hints.personal ?? [], Math.min(n, PERSONAL_MAX));
    take(hints.next ?? [], n);
    if (!p) return out;
    take(hints.learned ?? [], n);
    for (const e of this.entries) {
      if (out.length >= n) break;
      if (ok(e.word, e.key)) out.push(e.word);
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

// The last two words before the one being typed, within the current sentence.
export function contextWords(text: string): string[] {
  const before = text.slice(0, text.length - currentWord(text).length);
  return tokenize(splitSentences(before).at(-1) ?? '').slice(-2);
}

export function deleteWord(text: string): string {
  return text.replace(/\S*\s*$/, '');
}

export function addSpace(text: string): string {
  return text === '' || /\s$/.test(text) ? text : text + ' ';
}

const wordList = buildWordList(rawWords.split('\n').filter(Boolean), BOOST_WORDS);

export const predictor = new Predictor(wordList);

export const nextWords = new NextWords(JSON.parse(rawNext), new Set(wordList), NextWords.loadLearned());
