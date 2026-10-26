import { describe, expect, it } from 'vitest';
import {
  Predictor,
  addSpace,
  applySuggestion,
  buildWordList,
  currentWord,
  deleteWord,
  normalize,
  predictor,
} from './words';

describe('normalize', () => {
  it('strips accents and ligatures', () => {
    expect(normalize('Été')).toBe('ete');
    expect(normalize('cœur')).toBe('coeur');
    expect(normalize('ça')).toBe('ca');
  });
});

describe('Predictor', () => {
  const p = new Predictor(['de', 'été', 'est', 'être', 'et']);

  it('matches without accents, in rank order', () => {
    expect(p.suggest('e', 3)).toEqual(['été', 'est', 'être']);
    expect(p.suggest('ete', 3)).toEqual(['été']);
  });

  it('puts personal words first and skips the exact typed word', () => {
    expect(p.suggest('e', 2, ['Émilie'])).toEqual(['Émilie', 'été']);
    expect(p.suggest('et', 3)).toEqual(['été', 'être']);
  });

  it('returns nothing for an empty prefix', () => {
    expect(p.suggest('', 3)).toEqual([]);
  });

  it('knows common French words', () => {
    expect(predictor.suggest('soi', 4)).toContain('soif');
    expect(predictor.suggest('infirmi', 4)).toContain('infirmière');
  });
});

describe('buildWordList', () => {
  it('moves low-ranked boost words up', () => {
    expect(buildWordList(['a', 'b', 'c', 'd'], ['d', 'a'], 2)).toEqual(['a', 'b', 'd', 'c']);
  });
});

describe('text editing', () => {
  it('finds the current word after a space or apostrophe', () => {
    expect(currentWord("j'ai so")).toBe('so');
    expect(currentWord("j'")).toBe('');
    expect(currentWord('je ')).toBe('');
  });

  it('applies a suggestion', () => {
    expect(applySuggestion("j'ai so", 'soif')).toBe("j'ai soif ");
    expect(applySuggestion('j', "j'")).toBe("j'");
    expect(applySuggestion("l'infi", 'infirmière')).toBe("l'infirmière ");
  });

  it('deletes the last word', () => {
    expect(deleteWord('je veux ')).toBe('je ');
    expect(deleteWord('je veux')).toBe('je ');
  });

  it('adds a single space', () => {
    expect(addSpace('je')).toBe('je ');
    expect(addSpace('je ')).toBe('je ');
    expect(addSpace('')).toBe('');
  });
});
