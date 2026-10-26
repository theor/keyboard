import { useEffect, useMemo, useReducer, useRef, useState } from 'preact/hooks';
import { CollectScreen } from './CollectScreen';
import { type LetterReader, loadLetterReader, type Stroke } from './handwriting';
import { STARTERS } from './phrases';
import { activate, installPointer } from './pointer';
import { Scanner } from './scan';
import { BigText, KeyboardScreen, MessageBar, PhraseScreen } from './screens';
import { labelsFor, samples } from './samples';
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
  typedLength,
} from './words';

type Screen = 'phrases' | 'keyboard' | 'settings' | 'collect';

// Scanning runs on the screens the patient uses, not settings or letter collection.
const scans = (sc: Screen) => sc === 'phrases' || sc === 'keyboard';

// A handwritten letter's drawing and the reader's first readings of it.
type Ink = { strokes: Stroke[]; reading: string };

const UNDO_LIMIT = 50;

export function App() {
  const [settings, setSettings] = useState(loadSettings);
  const [screen, setScreen] = useState<Screen>('keyboard');
  const [text, setText] = useState('');
  const [showBig, setShowBig] = useState(false);
  const [hint, setHint] = useState('');
  const hintTimer = useRef(0);
  // Group keys pressed for the word being guessed, as digits.
  const [keys, setKeys] = useState('');
  // Handwritten letters of the word being guessed, each as its readings, best first.
  const [written, setWritten] = useState<string[]>([]);
  const [reader, setReader] = useState<LetterReader>();
  // The drawings behind each `written` array, so a picked word can label them.
  const inks = useMemo(() => new WeakMap<string[], Ink[]>(), []);
  const inkOf = (w: string[]) => inks.get(w) ?? (w.length ? undefined : []);
  const withInk = (next: string[], ink?: Ink[]) => {
    if (ink) inks.set(next, ink);
    return next;
  };
  const [spelling, setSpelling] = useState(false);
  // What the key or swipe cell under the finger would type.
  const [held, setHeld] = useState<{ letter?: string; group?: string }>({});
  const undo = useRef<{ text: string; keys: string; written: string[] }[]>([]);
  const lastLearned = useRef('');
  const [, rerender] = useReducer((n: number) => n + 1, 0);
  const rootRef = useRef<HTMLDivElement>(null);

  // Pointer and scanner callbacks outlive renders, so they read from here.
  const live = useRef({ settings, screen });
  live.current = { settings, screen };
  const scanning = settings.scanning && scans(screen);

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
          scanning: s.scanning && scans(sc),
          onScanSelect: () => scanner.select(),
          onHoldTooShort: () => showHint('Gardez le doigt sur ⚙ pour ouvrir les réglages'),
          onPreview: (el) => setHeld({ letter: el?.dataset.letter, group: el?.dataset.group }),
        };
      }),
    [],
  );

  useEffect(() => {
    if (scanning) scanner.start();
    else scanner.stop();
  }, [scanning]);

  useEffect(keepScreenOn, []);

  const edit = (next: string, nextKeys = '', nextWritten: string[] = []) => {
    const sameWritten = nextWritten === written || (!nextWritten.length && !written.length);
    if (next === text && nextKeys === keys && sameWritten) return;
    undo.current.push({ text, keys, written });
    if (undo.current.length > UNDO_LIMIT) undo.current.shift();
    setText(next);
    setKeys(nextKeys);
    setWritten(nextWritten);
  };

  const say = (t: string) => settings.speech && speak(t, settings.rate, settings.voiceURI);

  // Learn from a sentence once it's been used: spoken, shown or cleared.
  const learn = (t: string) => {
    if (!t.trim() || t === lastLearned.current) return;
    lastLearned.current = t;
    nextWords.learn(t);
    nextWords.save();
  };

  // Keeps the written letters, labelled by the word picked for them, to retrain the reader.
  const keepWritten = (word: string) => {
    const ink = inkOf(pendingWritten);
    const labels = labelsFor(word, pendingWritten.length);
    if (!pendingWritten.length || !labels || ink?.length !== pendingWritten.length) return;
    ink.forEach((k, i) => samples.add(labels[i], 'use', k.reading, k.strokes));
    samples.save();
  };

  // Handwriting needs a finger on the pad, so scanning falls back to A–Z keys.
  const canWrite = settings.keyboard === 'handwriting' && !settings.scanning;
  const canSwitch = settings.keyboard === 'groups' || settings.keyboard === 'swipe' || canWrite;
  // The tablet's keyboard also needs a finger, so scanning falls back to A–Z keys.
  const system = settings.keyboard === 'system' && !settings.scanning && screen === 'keyboard';
  const groups = (settings.keyboard === 'groups' || settings.keyboard === 'swipe') && !spelling;
  const writing = canWrite && !spelling;
  const pendingKeys = groups ? keys : '';
  const pendingWritten = writing ? written : [];
  // Letters (or groups) given for the word being guessed.
  const count = pendingKeys.length + pendingWritten.length;
  // The best reading of each written letter, used when no word fits.
  const raw = pendingWritten.map((w) => w[0]).join('');

  useEffect(() => {
    if (canWrite) loadLetterReader().then(setReader, () => showHint('Lecture de l’écriture indisponible'));
  }, [canWrite]);
  const hints = () => ({
    personal: lines(settings.personalWords),
    next: nextWords.candidates(contextWords(text)),
    learned: nextWords.learnedWords(),
  });
  const suggestions = pendingKeys
    ? predictor.suggestGroups(pendingKeys, 4, hints())
    : pendingWritten.length
      ? predictor.suggestLetters(pendingWritten, 4, hints())
      : text.trim() === ''
      ? STARTERS
      : predictor.suggest(currentWord(text), 4, hints());

  // On the group and handwriting keyboards, the first guess is shown in the text as if typed.
  const guess = count ? suggestions[0] : undefined;
  const typedPart = guess?.slice(0, typedLength(guess, count));
  const full = text + (guess ?? '');

  // Shown in the bar: the guess, or while a key is held, what lifting would give.
  const guessed = (k: string, word?: string) => {
    if (!word) return { typed: '?'.repeat(k.length - 1), added: k ? '?' : '', rest: '' };
    const before = typedLength(word, k.length - 1);
    const after = typedLength(word, k.length);
    return { typed: word.slice(0, before), added: word.slice(before, after), rest: word.slice(after) };
  };
  let pending: { typed: string; added?: string; rest: string } | undefined;
  if (groups && held.group) {
    const k = pendingKeys + held.group;
    pending = guessed(k, predictor.suggestGroups(k, 1, hints())[0]);
  } else if (!groups && held.letter) {
    pending = { typed: '', added: held.letter, rest: '' };
  } else if (count) {
    pending = { typed: typedPart ?? (raw || '?'.repeat(count)), rest: guess?.slice(typedPart!.length) ?? '' };
  }


  return (
    <div class="app" ref={rootRef}>
      {screen === 'settings' ? (
        <SettingsScreen
          settings={settings}
          onChange={setSettings}
          onClose={() => setScreen('keyboard')}
          learnedCount={nextWords.learnedCount()}
          onForget={() => {
            nextWords.forget();
            nextWords.save();
            rerender(0);
          }}
          onCollect={() => setScreen('collect')}
        />
      ) : screen === 'collect' ? (
        <CollectScreen pauseMs={settings.writePauseMs} onClose={() => setScreen('settings')} />
      ) : (
        <div class={system ? 'screen system' : 'screen'} data-scan-root={showBig ? undefined : ''}>
          <MessageBar
            text={text}
            onInput={system ? (t) => edit(t) : undefined}
            pending={pending}
            showSpeak={settings.speech && settings.showSpeak}
            showShow={settings.showShow}
            onSpeak={() => {
              learn(full);
              say(full);
            }}
            onShow={() => {
              learn(full);
              // Closes the tablet's keyboard so it doesn't cover the text.
              if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
              setShowBig(true);
            }}
            onClear={() => {
              learn(full);
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
              layout={settings.layout}
              onGroup={groups ? (g) => edit(text, keys + g) : undefined}
              swipe={settings.keyboard === 'swipe' && !settings.scanning}
              system={system}
              write={
                writing
                  ? {
                      pauseMs: settings.writePauseMs,
                      onLetter: (strokes) => {
                        if (!reader) return;
                        const reading = reader.read(strokes);
                        const ink = inkOf(written);
                        edit(text, '', withInk([...written, reading], ink && [...ink, { strokes, reading }]));
                      },
                      readings: written.at(-1) ?? '',
                      // Puts the picked reading first, keeping the others.
                      onPick: (c) => {
                        const last = written.at(-1)!;
                        edit(text, '', withInk([...written.slice(0, -1), c + last.replace(c, '')], inkOf(written)));
                      },
                    }
                  : undefined
              }
              onSwitch={
                canSwitch
                  ? () => {
                      // Keep the typed part of the guess, to finish it letter by letter.
                      if (groups || writing) edit(text + (typedPart ?? raw));
                      setSpelling(groups || writing);
                    }
                  : undefined
              }
              switchLabel={groups || writing ? 'Épeler' : canWrite ? 'Écrire' : 'Groupes'}
              onLetter={(c) => edit(text + c)}
              onSpace={() => {
                if (!count) edit(addSpace(text));
                else if (guess) {
                  keepWritten(guess);
                  edit(applySuggestion(text, guess));
                }
                else if (raw) edit(applySuggestion(text, raw));
                else showHint('Aucun mot trouvé : touchez « Épeler » pour l’écrire lettre par lettre');
              }}
              onSuggestion={(w) => {
                if (count) keepWritten(w);
                edit(applySuggestion(text, w));
              }}
              onDeleteLetter={() =>
                pendingKeys
                  ? edit(text, keys.slice(0, -1))
                  : pendingWritten.length
                    ? edit(text, '', withInk(written.slice(0, -1), inkOf(written)?.slice(0, -1)))
                    : edit(text.slice(0, -1))
              }
              onDeleteWord={() => (count ? edit(text) : edit(deleteWord(text)))}
              onUndo={() => {
                const prev = undo.current.pop() ?? { text: '', keys: '', written: [] };
                setText(prev.text);
                setKeys(prev.keys);
                setWritten(prev.written);
              }}
              canUndo={undo.current.length > 0}
              onPhrases={() => setScreen('phrases')}
            />
          )}
          {showBig && <BigText text={full} onClose={() => setShowBig(false)} />}
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
