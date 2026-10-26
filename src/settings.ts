import { DEFAULT_PHRASES } from './phrases';

export interface Settings {
  scanning: boolean;
  // Group and swipe keyboards guess the word from letter groups,
  // handwriting from letters written with a finger. System: the tablet's own
  // keyboard (Gboard, which has a handwriting layout) in a text field.
  keyboard: 'letters' | 'groups' | 'swipe' | 'handwriting' | 'system';
  layout: 'abc' | 'azerty';
  scanMs: number;
  debounceMs: number;
  minHoldMs: number;
  // How long the finger stays off the pad before the letter is read.
  writePauseMs: number;
  fontSize: number;
  speech: boolean;
  rate: number;
  voiceURI: string;
  theme: 'dark' | 'light';
  showSpeak: boolean;
  showShow: boolean;
  personalWords: string;
  phrases: string;
}

export const DEFAULT_SETTINGS: Settings = {
  scanning: false,
  keyboard: 'letters',
  layout: 'abc',
  scanMs: 1500,
  debounceMs: 400,
  minHoldMs: 0,
  writePauseMs: 800,
  fontSize: 40,
  speech: true,
  rate: 0.9,
  voiceURI: '',
  theme: 'light',
  showSpeak: true,
  showShow: true,
  personalWords: 'Théo\nMonique',
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
