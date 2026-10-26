// Builds src/data/words-fr.txt from a "word count" frequency list
// (e.g. https://github.com/hermitdave/FrequencyWords fr_50k.txt).
// Usage: node scripts/build-words.mjs path/to/fr_50k.txt
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const MAX = 20000;
const VALID = /^[a-zàâäçéèêëîïôöùûüÿœæ'-]+$/;
const SINGLE_LETTERS = new Set(['a', 'à', 'y']);

const src = process.argv[2];
if (!src) {
  console.error('usage: node scripts/build-words.mjs fr_50k.txt');
  process.exit(1);
}

const seen = new Set();
const out = [];
for (const line of readFileSync(src, 'utf8').split('\n')) {
  const word = line.split(' ')[0]?.trim().toLowerCase();
  if (!word || !VALID.test(word) || seen.has(word)) continue;
  if (word.length === 1 && !SINGLE_LETTERS.has(word)) continue;
  if (word.startsWith("'") || word.startsWith('-') || word.endsWith('-')) continue;
  // Keep elisions like "j'" but drop other words containing an apostrophe.
  if (word.includes("'") && !/^[a-z]+'$/.test(word)) continue;
  seen.add(word);
  out.push(word);
  if (out.length >= MAX) break;
}

mkdirSync('src/data', { recursive: true });
writeFileSync('src/data/words-fr.txt', out.join('\n') + '\n');
console.log(`wrote ${out.length} words`);
