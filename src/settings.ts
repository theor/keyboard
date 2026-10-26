import { DEFAULT_PHRASES } from './phrases';

export interface Settings {
  scanning: boolean;
  scanMs: number;
  debounceMs: number;
  minHoldMs: number;
  fontSize: number;
  rate: number;
  voiceURI: string;
  theme: 'dark' | 'light';
  personalWords: string;
  phrases: string;
}

export const DEFAULT_SETTINGS: Settings = {
  scanning: false,
  scanMs: 1500,
  debounceMs: 400,
  minHoldMs: 0,
  fontSize: 40,
  rate: 0.9,
  voiceURI: '',
  theme: 'dark',
  personalWords: '',
  phrases: DEFAULT_PHRASES.join('\n'),
};

const KEY = 'kb-settings';

export function loadSettings(): Settings {
  try {
    return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(s: Settings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // Storage can be unavailable; settings then last for this session only.
  }
}

export const lines = (s: string) =>
  s
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
