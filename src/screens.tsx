import type { ComponentChildren } from 'preact';
import { useEffect, useRef } from 'preact/hooks';
import { GROUPS } from './words';

interface KeyProps {
  label: ComponentChildren;
  onPress?: () => void;
  class?: string;
  disabled?: boolean;
  hold?: number;
}

export function Key({ label, onPress, class: cls, disabled, hold }: KeyProps) {
  return (
    <button
      type="button"
      class={`key ${cls ?? ''}`}
      data-key=""
      data-hold={hold}
      style={hold ? { '--hold-ms': `${hold}ms` } : undefined}
      aria-disabled={disabled ? 'true' : undefined}
      onClick={disabled ? undefined : onPress}
    >
      {label}
    </button>
  );
}

// Text on top of every screen, with speak / show / clear / settings.
export function MessageBar(props: {
  text: string;
  pending?: { typed: string; rest: string };
  showSpeak: boolean;
  showShow: boolean;
  onSpeak: () => void;
  onShow: () => void;
  onClear: () => void;
  onSettings: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.scrollTo({ top: ref.current.scrollHeight });
  }, [props.text]);

  return (
    <div class="bar" data-scan-row="90">
      <div class="text" ref={ref}>
        {props.text}
        {props.pending && (
          <span class="pending">
            {props.pending.typed}
            <span class="caret" />
            <span class="rest">{props.pending.rest}</span>
          </span>
        )}
        {!props.pending && <span class="caret" />}
      </div>
      {props.showSpeak && (
        <Key class="bar-key" label="🔊 Parler" onPress={props.onSpeak} disabled={!(props.text.trim() || props.pending)} />
      )}
      {props.showShow && (
        <Key class="bar-key" label="Montrer" onPress={props.onShow} disabled={!(props.text.trim() || props.pending)} />
      )}
      <Key class="bar-key" label="Effacer tout" onPress={props.onClear} disabled={!props.text && !props.pending} />
      <Key class="gear" label="⚙" onPress={props.onSettings} hold={1500} />
    </div>
  );
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export function PhraseScreen(props: {
  phrases: string[];
  onPhrase: (p: string) => void;
  onKeyboard: () => void;
}) {
  const cols = 4;
  return (
    <div class="rows">
      <div class="row" data-scan-row="1" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
        <Key class="yes" label="Oui" onPress={() => props.onPhrase('Oui')} />
        <Key class="no" label="Non" onPress={() => props.onPhrase('Non')} />
        <Key class="nav" label="⌨ Clavier" onPress={props.onKeyboard} />
      </div>
      {chunk(props.phrases, cols).map((row, i) => (
        <div class="row" data-scan-row={10 + i} style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
          {row.map((p) => (
            <Key class="phrase" label={p} onPress={() => props.onPhrase(p)} />
          ))}
        </div>
      ))}
    </div>
  );
}

const LETTER_ROWS = ['ABCDEFG', 'HIJKLMN', 'OPQRSTU', "VWXYZ'_"];
// Indexes into GROUPS around a space key (-1), so each group is also a
// direction for the swipe pad.
const GROUP_ROWS = [
  [0, 1, 2],
  [3, -1, 4],
  [5, 6, 7],
];

// Slide from anywhere toward a group; a touch without a slide is a space.
// The pointer code sends a "swipe" event with the grid cell.
function SwipePad(props: { onGroup: (g: number) => void; onSpace: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const live = useRef(props);
  live.current = props;
  useEffect(() => {
    const onSwipe = (e: Event) => {
      const g = GROUP_ROWS.flat()[(e as CustomEvent<number>).detail];
      if (g < 0) live.current.onSpace();
      else live.current.onGroup(g);
    };
    ref.current!.addEventListener('swipe', onSwipe);
    return () => ref.current?.removeEventListener('swipe', onSwipe);
  }, []);
  return (
    <div class="swipe" data-swipe="" ref={ref}>
      {GROUP_ROWS.flat().map((g) => (
        <div class={g < 0 ? 'cell middle' : 'cell'} data-cell="">
          {g < 0 ? 'espace' : GROUPS[g].toUpperCase()}
        </div>
      ))}
    </div>
  );
}
const SUGGESTION_COUNT = 4;

export function KeyboardScreen(props: {
  suggestions: string[];
  // Set on the group keyboard; the key to switch shows when either is set.
  onGroup?: (g: number) => void;
  swipe?: boolean;
  onSwitch?: () => void;
  onLetter: (c: string) => void;
  onSpace: () => void;
  onSuggestion: (w: string) => void;
  onDeleteLetter: () => void;
  onDeleteWord: () => void;
  onUndo: () => void;
  canUndo: boolean;
  onPhrases: () => void;
}) {
  // Fixed slots so the layout never shifts.
  const slots = Array.from({ length: SUGGESTION_COUNT }, (_, i) => props.suggestions[i]);
  return (
    <div class="rows">
      <div class="row suggestions" data-scan-row="1">
        {slots.map((w) => (
          <Key class="suggestion" label={w ?? ''} disabled={!w} onPress={() => w && props.onSuggestion(w)} />
        ))}
      </div>
      {props.onGroup && props.swipe ? (
        <SwipePad onGroup={props.onGroup} onSpace={props.onSpace} />
      ) : props.onGroup ? (
        GROUP_ROWS.map((row, i) => (
            <div class="row" data-scan-row={10 + i}>
              {row.map((g) =>
                g < 0 ? (
                  <Key class="space" label="espace" onPress={props.onSpace} />
                ) : (
                  <Key class="group" label={GROUPS[g].toUpperCase()} onPress={() => props.onGroup!(g)} />
                ),
              )}
            </div>
          ))
      ) : (
        LETTER_ROWS.map((row, i) => (
            <div class="row" data-scan-row={10 + i}>
              {[...row].map((c) =>
                c === '_' ? (
                  <Key class="space" label="espace" onPress={props.onSpace} />
                ) : (
                  <Key label={c} onPress={() => props.onLetter(c.toLowerCase())} />
                ),
              )}
            </div>
          ))
      )}
      <div class="row tools" data-scan-row="50">
        <Key class="del" label="⌫ Lettre" onPress={props.onDeleteLetter} />
        <Key class="del" label="⌫ Mot" onPress={props.onDeleteWord} />
        <Key class="nav" label="↶ Annuler" onPress={props.onUndo} disabled={!props.canUndo} />
        {props.onSwitch && (
          <Key class="nav" label={props.onGroup ? 'Épeler' : 'Groupes'} onPress={props.onSwitch} />
        )}
        <Key class="nav" label="Phrases" onPress={props.onPhrases} />
      </div>
    </div>
  );
}

// Full-screen text for the person reading. Any touch closes it.
export function BigText(props: { text: string; onClose: () => void }) {
  return (
    <div class="overlay" data-scan-root="">
      <div class="rows" data-scan-row="1">
        <Key class="big-text" label={props.text} onPress={props.onClose} />
      </div>
    </div>
  );
}
