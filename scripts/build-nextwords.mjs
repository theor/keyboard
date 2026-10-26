// Builds src/data/next-fr.json, the likely next words after one or two words,
// from Tatoeba's French sentences (CC BY 2.0 FR):
// https://downloads.tatoeba.org/exports/per_language/fra/fra_sentences.tsv.bz2
// Usage: node scripts/build-nextwords.mjs path/to/fra_sentences.tsv
import { readFileSync, writeFileSync } from 'node:fs';
import { splitSentences, tokenize } from '../src/tokens.ts';

const BIGRAM = { minTotal: 10, minCount: 2, keep: 8 };
const TRIGRAM = { minTotal: 20, minCount: 3, keep: 6 };
// Names Tatoeba uses in thousands of example sentences.
const BLOCK = new Set(['tom', 'mary', 'john', 'marie']);

const src = process.argv[2];
if (!src) {
  console.error('usage: node scripts/build-nextwords.mjs fra_sentences.tsv');
  process.exit(1);
}

const vocab = new Set(readFileSync('src/data/words-fr.txt', 'utf8').split('\n').filter(Boolean));
const ok = (w) => w !== undefined && vocab.has(w) && !BLOCK.has(w);

const bi = new Map();
const tri = new Map();
const count = (table, ctx, next) => {
  let m = table.get(ctx);
  if (!m) table.set(ctx, (m = new Map()));
  m.set(next, (m.get(next) ?? 0) + 1);
};

for (const line of readFileSync(src, 'utf8').split('\n')) {
  const text = line.split('\t')[2];
  if (!text) continue;
  for (const sentence of splitSentences(text)) {
    const t = tokenize(sentence);
    for (let i = 1; i < t.length; i++) {
      if (!ok(t[i]) || !ok(t[i - 1])) continue;
      count(bi, t[i - 1], t[i]);
      if (ok(t[i - 2])) count(tri, `${t[i - 2]} ${t[i - 1]}`, t[i]);
    }
  }
}

// Keeps, for each context, its most common next words as one space-separated string.
function prune(table, { minTotal, minCount, keep }) {
  const out = {};
  for (const [ctx, nexts] of table) {
    let total = 0;
    for (const c of nexts.values()) total += c;
    if (total < minTotal) continue;
    const top = [...nexts]
      .filter(([, c]) => c >= minCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, keep)
      .map(([w]) => w);
    if (top.length) out[ctx] = top.join(' ');
  }
  return out;
}

const data = { bi: prune(bi, BIGRAM), tri: prune(tri, TRIGRAM) };
// Two-word contexts only earn their place if they guess better than the last word alone.
for (const [ctx, words] of Object.entries(data.tri)) {
  const first = (s) => s?.split(' ').slice(0, 4).join(' ');
  if (first(words) === first(data.bi[ctx.split(' ')[1]])) delete data.tri[ctx];
}
writeFileSync('src/data/next-fr.json', JSON.stringify(data));
console.log(`${Object.keys(data.bi).length} one-word and ${Object.keys(data.tri).length} two-word contexts`);
