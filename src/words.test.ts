import { describe, expect, it } from 'vitest';
import {
  Predictor,
  addSpace,
  applySuggestion,
  buildWordList,
  contextWords,
  currentWord,
  deleteWord,
  groupCode,
  normalize,
  predictor,
  typedLength,
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
    expect(p.suggest('e', 2, { personal: ['Émilie'] })).toEqual(['Émilie', 'été']);
    expect(p.suggest('et', 3)).toEqual(['été', 'être']);
  });

  it('offers only next words for an empty prefix', () => {
    expect(p.suggest('', 3)).toEqual([]);
    expect(p.suggest('', 3, { next: ['est', 'de'], personal: ['Émilie'] })).toEqual(['est', 'de']);
  });

  it('orders personal, next, learned, then frequency words', () => {
    const hints = { personal: ['Éric', 'Émile', 'Ève'], next: ['être'], learned: ['est'] };
    expect(p.suggest('e', 5, hints)).toEqual(['Éric', 'Émile', 'être', 'est', 'été']);
  });

  it('ignores case when removing duplicates', () => {
    expect(p.suggest('e', 3, { personal: ['Été'], learned: ['été'] })).toEqual(['Été', 'est', 'être']);
  });

  it('knows common French words', () => {
    expect(predictor.suggest('soi', 4)).toContain('soif');
    expect(predictor.suggest('infirmi', 4)).toContain('infirmière');
  });
});

describe('group keys', () => {
  const p = new Predictor(['de', 'été', 'est', 'être', 'et', 'fut']);

  it('turns words into key codes, ignoring accents and apostrophes', () => {
    expect(groupCode('été')).toBe('161');
    expect(groupCode("j'")).toBe('3');
    expect(groupCode('cœur')).toBe('04165');
  });

  it('puts words of the same length first, then longer ones', () => {
    expect(p.suggestGroups('16', 4)).toEqual(['et', 'été', 'être', 'fut']);
    expect(p.suggestGroups('161', 4)).toEqual(['été']);
    expect(p.suggestGroups('156', 4)).toEqual(['est']);
  });

  it('uses the same hint order as letters', () => {
    expect(p.suggestGroups('16', 3, { personal: ['Éva'], learned: ['être'] })).toEqual(['et', 'Éva', 'être']);
  });

  it('finds common words', () => {
    expect(predictor.suggestGroups(groupCode('soif'), 4)).toContain('soif');
    expect(predictor.suggestGroups(groupCode('mal'), 4)).toContain('mal');
  });

  it('measures the typed part of a word', () => {
    expect(typedLength('bonjour', 4)).toBe(4);
    expect(typedLength("j'", 1)).toBe(1);
    expect(typedLength('cœur', 2)).toBe(2);
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

  it('finds the context words before the current word', () => {
    expect(contextWords("j'ai so")).toEqual(["j'", 'ai']);
    expect(contextWords('je veux ')).toEqual(['je', 'veux']);
    expect(contextWords('oui. je ')).toEqual(['je']);
    expect(contextWords('')).toEqual([]);
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
