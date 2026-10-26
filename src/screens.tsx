import type { ComponentChildren } from 'preact';
import { useEffect, useRef } from 'preact/hooks';
import type { Stroke } from './handwriting';
import { flash } from './pointer';
import { GROUPS } from './words';

interface KeyProps {
  label: ComponentChildren;
  onPress?: () => void;
  class?: string;
  disabled?: boolean;
  hold?: number;
  // What the key types, for the preview while it's held.
  letter?: string;
  group?: number;
  // Columns the key spans in its row.
  span?: number;
}

export function Key({ label, onPress, class: cls, disabled, hold, letter, group, span }: KeyProps) {
  return (
    <button
      type="button"
      class={`key ${cls ?? ''}`}
      data-key=""
      data-hold={hold}
      data-letter={letter}
      data-group={group}
      style={{ ...(hold && { '--hold-ms': `${hold}ms` }), ...(span && { gridColumn: `span ${span}` }) }}
      aria-disabled={disabled ? 'true' : undefined}
      onClick={disabled ? undefined : onPress}
    >
      {label}
    </button>
  );
}

// Text on top of every screen, with speak / show / clear / settings.
// With onInput, the text is a field typed with the tablet's own keyboard.
export function MessageBar(props: {
  text: string;
  onInput?: (text: string) => void;
  // Not yet in the text: the guessed word, or what the held key would add.
  pending?: { typed: string; added?: string; rest: string };
  showSpeak: boolean;
  showShow: boolean;
  onSpeak: () => void;
  onShow: () => void;
  onClear: () => void;
  onSettings: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLTextAreaElement>(null);
  // Set while the change comes from the field, so the caret stays where it is.
  const typing = useRef(false);
  useEffect(() => {
    ref.current?.scrollTo({ top: ref.current.scrollHeight });
    // Guesses and deletes work on the end of the text, so the caret goes there.
    const f = field.current;
    if (f && !typing.current) {
      f.setSelectionRange(f.value.length, f.value.length);
      f.scrollTo({ top: f.scrollHeight });
    }
    typing.current = false;
  }, [props.text]);
  useEffect(() => field.current?.focus(), [!!props.onInput]);

  return (
    <div class="bar" data-scan-row="90">
      {props.onInput ? (
        <textarea
          class="text field"
          data-native=""
          ref={field}
          value={props.text}
          placeholder="Touchez ici pour écrire"
          autocapitalize="sentences"
          onInput={(e) => {
            typing.current = true;
            props.onInput!(e.currentTarget.value);
          }}
        />
      ) : (
        <div class="text" ref={ref}>
          {props.text}
          {props.pending && (
            <span class="pending">
              {props.pending.typed}
              {props.pending.added && <mark class="added">{props.pending.added}</mark>}
              <span class="caret" />
              <span class="rest">{props.pending.rest}</span>
            </span>
          )}
          {!props.pending && <span class="caret" />}
        </div>
      )}
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

// "_" is the space key; it widens to fill its row.
const LETTER_ROWS = {
  abc: ['ABCDEFG', 'HIJKLMN', 'OPQRSTU', "VWXYZ'_"],
  azerty: ['AZERTYUIOP', 'QSDFGHJKLM', "WXCVBN'_"],
};
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
        <div class={g < 0 ? 'cell middle' : 'cell'} data-cell="" data-group={g < 0 ? undefined : g}>
          {g < 0 ? 'espace' : GROUPS[g].toUpperCase()}
        </div>
      ))}
    </div>
  );
}

// Write one letter with a finger; it's read once the finger has stayed off
// the pad for pauseMs. Only the first finger draws.
export function WritingPad(props: { pauseMs: number; onLetter: (strokes: Stroke[]) => void; hint?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const live = useRef(props);
  live.current = props;
  useEffect(() => {
    const canvas = ref.current!;
    const ctx = canvas.getContext('2d')!;
    let strokes: Stroke[] = [];
    let pointerId: number | null = null;
    let timer = 0;

    const redraw = () => {
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      ctx.clearRect(0, 0, w, h);
      ctx.strokeStyle = getComputedStyle(canvas).color;
      ctx.lineWidth = Math.max(6, Math.min(w, h) / 30);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      for (const s of strokes) {
        ctx.beginPath();
        ctx.moveTo(s[0].x, s[0].y);
        for (const p of s) ctx.lineTo(p.x, p.y);
        if (s.length === 1) ctx.lineTo(s[0].x + 0.1, s[0].y);
        ctx.stroke();
      }
    };
    const resize = () => {
      canvas.width = canvas.clientWidth * devicePixelRatio;
      canvas.height = canvas.clientHeight * devicePixelRatio;
      ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
      redraw();
    };
    const at = (e: PointerEvent) => {
      const box = canvas.getBoundingClientRect();
      return { x: e.clientX - box.left, y: e.clientY - box.top };
    };

    const down = (e: PointerEvent) => {
      if (pointerId !== null) return;
      pointerId = e.pointerId;
      canvas.setPointerCapture(e.pointerId);
      clearTimeout(timer);
      strokes.push([at(e)]);
      redraw();
    };
    const move = (e: PointerEvent) => {
      if (e.pointerId !== pointerId) return;
      strokes.at(-1)!.push(...(e.getCoalescedEvents?.() ?? [e]).map(at));
      redraw();
    };
    const up = (e: PointerEvent) => {
      if (e.pointerId !== pointerId) return;
      pointerId = null;
      timer = window.setTimeout(() => {
        const letter = strokes;
        strokes = [];
        redraw();
        flash(canvas, 'chosen');
        live.current.onLetter(letter);
      }, live.current.pauseMs);
    };

    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    canvas.addEventListener('pointerdown', down);
    canvas.addEventListener('pointermove', move);
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);
    return () => {
      clearTimeout(timer);
      observer.disconnect();
      canvas.removeEventListener('pointerdown', down);
      canvas.removeEventListener('pointermove', move);
      canvas.removeEventListener('pointerup', up);
      canvas.removeEventListener('pointercancel', up);
    };
  }, []);
  return (
    <div class="pad">
      <span class="pad-hint">{props.hint ?? 'Écrivez une lettre'}</span>
      <canvas data-draw="" ref={ref} />
    </div>
  );
}

const SUGGESTION_COUNT = 4;

export function KeyboardScreen(props: {
  suggestions: string[];
  layout: keyof typeof LETTER_ROWS;
  // Set on the group keyboard; the key to switch shows when either is set.
  onGroup?: (g: number) => void;
  swipe?: boolean;
  // Set on the handwriting keyboard. `readings`: the last letter's, best first.
  write?: { pauseMs: number; onLetter: (strokes: Stroke[]) => void; readings: string; onPick: (c: string) => void };
  // The tablet's keyboard is used: no keys of our own.
  system?: boolean;
  onSwitch?: () => void;
  switchLabel?: string;
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
      {props.system ? null : props.write ? (
        <div class="write">
          <WritingPad pauseMs={props.write.pauseMs} onLetter={props.write.onLetter} />
          <div class="write-side">
            {[0, 1, 2].map((i) => {
              const c = props.write!.readings[i];
              return (
                <Key
                  class={i === 0 ? 'reading chosen' : 'reading'}
                  label={c?.toUpperCase() ?? ''}
                  disabled={!c}
                  onPress={() => c && props.write!.onPick(c)}
                />
              );
            })}
            <Key class="space" label="espace" onPress={props.onSpace} />
          </div>
        </div>
      ) : props.onGroup && props.swipe ? (
        <SwipePad onGroup={props.onGroup} onSpace={props.onSpace} />
      ) : props.onGroup ? (
        GROUP_ROWS.map((row, i) => (
            <div class="row" data-scan-row={10 + i}>
              {row.map((g) =>
                g < 0 ? (
                  <Key class="space" label="espace" onPress={props.onSpace} />
                ) : (
                  <Key class="group" label={GROUPS[g].toUpperCase()} group={g} onPress={() => props.onGroup!(g)} />
                ),
              )}
            </div>
          ))
      ) : (
        LETTER_ROWS[props.layout].map((row, i, rows) => (
            <div class="row" data-scan-row={10 + i}>
              {[...row].map((c) =>
                c === '_' ? (
                  <Key
                    class="space"
                    label="espace"
                    span={Math.max(...rows.map((r) => r.length)) - row.length + 1}
                    onPress={props.onSpace}
                  />
                ) : (
                  <Key label={c} letter={c.toLowerCase()} onPress={() => props.onLetter(c.toLowerCase())} />
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
          <Key class="nav" label={props.switchLabel} onPress={props.onSwitch} />
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
