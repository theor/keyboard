import { describe, expect, it } from 'vitest';
import { NextWords } from './nextword';
import { tokenize } from './tokens';

describe('tokenize', () => {
  it('splits elisions and drops punctuation', () => {
    expect(tokenize("J'ai mal, où est l’infirmière ?")).toEqual(["j'", 'ai', 'mal', 'où', 'est', "l'", 'infirmière']);
    expect(tokenize('Est-ce que tu viens ?')).toEqual(['est-ce', 'que', 'tu', 'viens']);
  });
});

describe('NextWords', () => {
  const data = { bi: { veux: 'pas que', ai: 'pas besoin' }, tri: { 'je veux': 'que voir' } };
  const vocab = new Set(['je', 'veux', 'pas', 'que', 'voir', 'boire', 'ai', 'besoin']);

  it('prefers two-word context, then one-word', () => {
    const n = new NextWords(data, vocab);
    expect(n.candidates(['je', 'veux'])).toEqual(['que', 'voir', 'pas']);
    expect(n.candidates(['veux'])).toEqual(['pas', 'que']);
    expect(n.candidates([])).toEqual([]);
  });

  it('puts what the person typed first', () => {
    const n = new NextWords(data, vocab);
    n.learn('Je veux boire. Je veux boire');
    expect(n.candidates(['je', 'veux'])).toEqual(['boire', 'que', 'voir', 'pas']);
    expect(n.learnedWords()).toEqual(['je', 'veux', 'boire']);
  });

  it('needs unknown words twice before offering them', () => {
    const n = new NextWords(data, vocab);
    n.learn('je veux Monique');
    expect(n.candidates(['veux'])).toEqual(['pas', 'que']);
    n.learn('je veux Monique');
    expect(n.candidates(['veux'])).toEqual(['monique', 'pas', 'que']);
  });

  it('forgets', () => {
    const n = new NextWords(data, vocab);
    n.learn('je veux boire');
    n.forget();
    expect(n.learnedCount()).toBe(0);
    expect(n.candidates(['veux'])).toEqual(['pas', 'que']);
  });
});
