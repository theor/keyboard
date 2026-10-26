import { splitSentences, tokenize } from './tokens';

// Space-separated next words, most likely first, keyed by "w1" or "w1 w2".
export interface NextData {
  bi: Record<string, string>;
  tri: Record<string, string>;
}

// What this person has typed: word counts and next-word counts.
export interface Learned {
  words: Record<string, number>;
  next: Record<string, Record<string, number>>;
}

const KEY = 'kb-learned';
// A word the dictionary doesn't know must be typed this often before we offer it,
// so a single typo isn't suggested forever.
const UNKNOWN_MIN = 2;

const byCount = (counts: Record<string, number> = {}) =>
  Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([w]) => w);

export class NextWords {
  private learnedWordList: string[] | null = null;

  constructor(
    private data: NextData,
    private vocab: Set<string>,
    private learned: Learned = { words: {}, next: {} },
  ) {}

  // Likely next words after `context` (the last words of the sentence):
  // this person's own habits first, then the dictionary.
  candidates(context: string[]): string[] {
    const out: string[] = [];
    const add = (words: string[]) => {
      for (const w of words) if (!out.includes(w)) out.push(w);
    };
    const one = context.at(-1);
    const two = context.length >= 2 ? context.slice(-2).join(' ') : undefined;
    if (two) add(this.usable(this.learned.next[two]));
    if (one) add(this.usable(this.learned.next[one]));
    if (two) add(this.data.tri[two]?.split(' ') ?? []);
    if (one) add(this.data.bi[one]?.split(' ') ?? []);
    return out;
  }

  // Words this person uses, most used first.
  learnedWords(): string[] {
    return (this.learnedWordList ??= this.usable(this.learned.words));
  }

  learn(text: string) {
    for (const sentence of splitSentences(text)) {
      const t = tokenize(sentence);
      t.forEach((w, i) => {
        this.learned.words[w] = (this.learned.words[w] ?? 0) + 1;
        if (i >= 1) this.bump(t[i - 1], w);
        if (i >= 2) this.bump(`${t[i - 2]} ${t[i - 1]}`, w);
      });
    }
    this.learnedWordList = null;
  }

  forget() {
    this.learned = { words: {}, next: {} };
    this.learnedWordList = null;
  }

  learnedCount(): number {
    return Object.keys(this.learned.words).length;
  }

  save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.learned));
    } catch {
      // Storage can be unavailable; learning then lasts for this session only.
    }
  }

  static loadLearned(): Learned {
    try {
      return { words: {}, next: {}, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') };
    } catch {
      return { words: {}, next: {} };
    }
  }

  private bump(ctx: string, w: string) {
    const m = (this.learned.next[ctx] ??= {});
    m[w] = (m[w] ?? 0) + 1;
  }

  private usable(counts: Record<string, number> = {}): string[] {
    return byCount(counts).filter((w) => this.vocab.has(w) || counts[w] >= UNKNOWN_MIN);
  }
}
