import { useEffect, useMemo, useReducer, useRef, useState } from 'preact/hooks';
import { STARTERS } from './phrases';
import { activate, installPointer } from './pointer';
import { Scanner } from './scan';
import { BigText, KeyboardScreen, MessageBar, PhraseScreen } from './screens';
import { lines, loadSettings, saveSettings } from './settings';
import { SettingsScreen } from './SettingsScreen';
import { speak } from './speech';
import {
  addSpace,
  applySuggestion,
  contextWords,
  currentWord,
  deleteWord,
  nextWords,
  predictor,
} from './words';

type Screen = 'phrases' | 'keyboard' | 'settings';

const UNDO_LIMIT = 50;

export function App() {
  const [settings, setSettings] = useState(loadSettings);
  const [screen, setScreen] = useState<Screen>('phrases');
  const [text, setText] = useState('');
  const [showBig, setShowBig] = useState(false);
  const [hint, setHint] = useState('');
  const hintTimer = useRef(0);
  const undo = useRef<string[]>([]);
  const lastLearned = useRef('');
  const [, rerender] = useReducer((n: number) => n + 1, 0);
  const rootRef = useRef<HTMLDivElement>(null);

  // Pointer and scanner callbacks outlive renders, so they read from here.
  const live = useRef({ settings, screen });
  live.current = { settings, screen };
  const scanning = settings.scanning && screen !== 'settings';

  const showHint = (message: string) => {
    setHint(message);
    clearTimeout(hintTimer.current);
    hintTimer.current = window.setTimeout(() => setHint(''), 3000);
  };

  const scanner = useMemo(() => new Scanner(() => live.current.settings.scanMs, activate), []);

  useEffect(() => {
    saveSettings(settings);
    document.documentElement.dataset.theme = settings.theme;
    document.documentElement.style.setProperty('--fs', `${settings.fontSize}px`);
  }, [settings]);

  useEffect(
    () =>
      installPointer(rootRef.current!, () => {
        const { settings: s, screen: sc } = live.current;
        return {
          debounceMs: s.debounceMs,
          minHoldMs: s.minHoldMs,
          scanning: s.scanning && sc !== 'settings',
          onScanSelect: () => scanner.select(),
          onHoldTooShort: () => showHint('Gardez le doigt sur ⚙ pour ouvrir les réglages'),
        };
      }),
    [],
  );

  useEffect(() => {
    if (scanning) scanner.start();
    else scanner.stop();
  }, [scanning]);

  useEffect(keepScreenOn, []);

  const edit = (next: string) => {
    if (next === text) return;
    undo.current.push(text);
    if (undo.current.length > UNDO_LIMIT) undo.current.shift();
    setText(next);
  };

  const say = (t: string) => settings.speech && speak(t, settings.rate, settings.voiceURI);

  // Learn from a sentence once it's been used: spoken, shown or cleared.
  const learn = (t: string) => {
    if (!t.trim() || t === lastLearned.current) return;
    lastLearned.current = t;
    nextWords.learn(t);
    nextWords.save();
  };

  const suggestions =
    text.trim() === ''
      ? STARTERS
      : predictor.suggest(currentWord(text), 4, {
          personal: lines(settings.personalWords),
          next: nextWords.candidates(contextWords(text)),
          learned: nextWords.learnedWords(),
        });

  return (
    <div class="app" ref={rootRef}>
      {screen === 'settings' ? (
        <SettingsScreen
          settings={settings}
          onChange={setSettings}
          onClose={() => setScreen('phrases')}
          learnedCount={nextWords.learnedCount()}
          onForget={() => {
            nextWords.forget();
            nextWords.save();
            rerender(0);
          }}
        />
      ) : (
        <div class="screen" data-scan-root={showBig ? undefined : ''}>
          <MessageBar
            text={text}
            showSpeak={settings.speech && settings.showSpeak}
            showShow={settings.showShow}
            onSpeak={() => {
              learn(text);
              say(text);
            }}
            onShow={() => {
              learn(text);
              setShowBig(true);
            }}
            onClear={() => {
              learn(text);
              edit('');
            }}
            onSettings={() => setScreen('settings')}
          />
          {screen === 'phrases' ? (
            <PhraseScreen
              phrases={lines(settings.phrases)}
              onPhrase={(p) => {
                edit(p);
                say(p);
              }}
              onKeyboard={() => setScreen('keyboard')}
            />
          ) : (
            <KeyboardScreen
              suggestions={suggestions}
              onLetter={(c) => edit(text + c)}
              onSpace={() => edit(addSpace(text))}
              onSuggestion={(w) => edit(applySuggestion(text, w))}
              onDeleteLetter={() => edit(text.slice(0, -1))}
              onDeleteWord={() => edit(deleteWord(text))}
              onUndo={() => setText(undo.current.pop() ?? '')}
              canUndo={undo.current.length > 0}
              onPhrases={() => setScreen('phrases')}
            />
          )}
          {showBig && <BigText text={text} onClose={() => setShowBig(false)} />}
        </div>
      )}
      {hint && <div class="hint-toast">{hint}</div>}
    </div>
  );
}

function keepScreenOn() {
  const request = async () => {
    if (document.visibilityState !== 'visible' || !('wakeLock' in navigator)) return;
    try {
      await navigator.wakeLock.request('screen');
    } catch {
      // Needs HTTPS and a user gesture on some browsers; we retry on the next touch.
    }
  };
  request();
  document.addEventListener('visibilitychange', request);
  window.addEventListener('pointerdown', request, { once: true });
  return () => document.removeEventListener('visibilitychange', request);
}
