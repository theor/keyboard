import { describe, expect, it } from 'vitest';
import { labelsFor, MAX_SAMPLES, promptOrder, SampleStore } from './samples';

describe('labelsFor', () => {
  it('drops accents and skips apostrophes', () => {
    expect(labelsFor('été', 3)).toBe('ete');
    expect(labelsFor("aujourd'hui", 8)).toBe('aujourdh');
    expect(labelsFor('cœur', 3)).toBe('coe');
  });

  it('labels only the letters written', () => {
    expect(labelsFor('bonjour', 3)).toBe('bon');
  });

  it('gives nothing when the word is too short', () => {
    expect(labelsFor('le', 3)).toBeUndefined();
  });
});

describe('promptOrder', () => {
  it('asks for every letter once', () => {
    expect(promptOrder().sort().join('')).toBe('abcdefghijklmnopqrstuvwxyz');
  });
});

describe('SampleStore', () => {
  it('keeps strokes as rounded pairs', () => {
    const s = new SampleStore();
    s.add('a', 'prompt', 'aod', [[{ x: 1.4, y: 2.6 }, { x: 3, y: 4 }]]);
    expect(s.samples[0]).toMatchObject({ letter: 'a', source: 'prompt', reading: 'aod', strokes: [[1, 3, 3, 4]] });
    expect(JSON.parse(s.toJSON())).toMatchObject({ version: 1, samples: [{ letter: 'a' }] });
  });

  it('counts by source and how often the first reading was right', () => {
    const s = new SampleStore();
    s.add('a', 'prompt', 'ao', []);
    s.add('b', 'use', 'hb', []);
    expect(s.count()).toBe(2);
    expect(s.count('use')).toBe(1);
    expect(s.rightFirst()).toBe(0.5);
    s.removeLast();
    expect(s.count('use')).toBe(0);
  });

  it('stops when full', () => {
    const s = new SampleStore();
    for (let i = 0; i < MAX_SAMPLES; i++) s.add('a', 'use', 'a', []);
    expect(s.add('a', 'use', 'a', [])).toBe(false);
    expect(s.count()).toBe(MAX_SAMPLES);
  });
});
