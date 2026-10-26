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

// Group keyboard: one key per group, the word is guessed from the keys pressed.
export const GROUPS = ['abc', 'def', 'ghi', 'jkl', 'mno', 'pqrs', 'tuv', 'wxyz'];

const GROUP_OF = new Map([...GROUPS.entries()].flatMap(([i, g]) => [...g].map((c) => [c, String(i)])));

// The keys to press for a word, as digits: "été" → "131". Apostrophes are skipped.
export function groupCode(word: string): string {
  return [...normalize(word)].map((c) => GROUP_OF.get(c) ?? '').join('');
}

// How many characters of `word` the first `keys` key presses cover.
export function typedLength(word: string, keys: number): number {
  let count = 0;
  for (let i = 0; i < word.length; i++) {
    if (count >= keys) return i;
    count += groupCode(word[i]).length;
  }
  return word.length;
}

type Match = (key: string, code: string) => boolean;

const MAX_COST = 3;

// How far down the readings of each written letter a word's letters are, or -1
// if one isn't there. `exact`: the word has no more letters than were written.
// Apostrophes and hyphens are skipped.
function readCost(key: string, written: string[], exact: boolean): number {
  let cost = 0;
  let i = 0;
  for (const c of key) {
    if (c < 'a' || c > 'z') continue;
    if (i === written.length) return exact ? -1 : cost;
    const rank = written[i++].indexOf(c);
    if (rank < 0) return -1;
    cost += rank;
  }
  return i === written.length ? cost : -1;
}

export class Predictor {
  private entries: { word: string; key: string; code: string }[];

  constructor(words: string[]) {
    this.entries = words.map((word) => ({ word, key: normalize(word), code: groupCode(word) }));
  }

  // Order: up to 2 personal words (names), then likely next words for the
  // context, then words this person uses, then words by frequency.
  // With nothing typed yet, only next words are offered.
  suggest(prefix: string, n: number, hints: Hints = {}): string[] {
    const p = normalize(prefix);
    if (!p) return this.pick([() => true], n, { next: hints.next }, prefix, false);
    return this.pick([(key) => key.startsWith(p)], n, hints, prefix);
  }

  // Same order, for group key presses: words of exactly that length first,
  // then longer words that start with them.
  suggestGroups(keys: string, n: number, hints: Hints = {}): string[] {
    if (!keys) return this.suggest('', n, hints);
    return this.pick([(_, code) => code === keys, (_, code) => code.startsWith(keys)], n, hints, '');
  }

  // Handwriting: each written letter comes as its readings, best first ("ilt").
  // Words that use only best readings come first, words of that length before
  // longer ones; each step down a reading costs one, up to MAX_COST.
  suggestLetters(written: string[], n: number, hints: Hints = {}): string[] {
    if (!written.length) return this.suggest('', n, hints);
    const passes: Match[] = [];
    for (let c = 0; c <= MAX_COST; c++) {
      passes.push((key) => readCost(key, written, true) === c, (key) => readCost(key, written, false) === c);
    }
    return this.pick(passes, n, hints, '');
  }

  private pick(passes: Match[], n: number, hints: Hints, typed: string, frequent = true): string[] {
    const out: string[] = [];
    const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
    const add = (w: string, key: string, code: string, match: Match) => {
      if (out.length >= n || !match(key, code) || same(w, typed) || out.some((o) => same(o, w))) return false;
      out.push(w);
      return true;
    };
    let personal = 0;
    for (const match of passes) {
      for (const w of hints.personal ?? []) {
        if (personal < PERSONAL_MAX && add(w, normalize(w), groupCode(w), match)) personal++;
      }
      for (const w of [...(hints.next ?? []), ...(hints.learned ?? [])]) add(w, normalize(w), groupCode(w), match);
      if (!frequent) continue;
      for (const e of this.entries) {
        if (out.length >= n) break;
        add(e.word, e.key, e.code, match);
      }
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
