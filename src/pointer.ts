// Touch handling for an unsteady hand:
// - a key fires when the finger lifts, so the user can slide onto the right key;
// - only the first finger counts (a resting palm is ignored);
// - touches shorter than minHoldMs and repeats within debounceMs are ignored;
// - keys with data-hold="ms" need a long press (used for settings);
// - in scanning mode any touch means "select".
// Elements inside [data-native] (the settings form) get normal browser behaviour.

export interface PointerOptions {
  debounceMs: number;
  minHoldMs: number;
  scanning: boolean;
  onScanSelect: () => void;
  // A long-press key was tapped too briefly.
  onHoldTooShort: () => void;
}

let synthetic = false;

// Fires a key's onClick. Native clicks are blocked so only our rules apply.
export function activate(el: HTMLElement) {
  synthetic = true;
  try {
    el.click();
  } finally {
    synthetic = false;
  }
}

const isNative = (t: EventTarget | null) => t instanceof Element && !!t.closest('[data-native]');

export function installPointer(root: HTMLElement, getOpts: () => PointerOptions): () => void {
  let pointerId: number | null = null;
  let downAt = 0;
  let lastActivation = -Infinity;
  let hovered: HTMLElement | null = null;
  let holdTimer = 0;
  // Set once a long press has fired, so lifting the finger does nothing more.
  let consumed = false;

  const keyAt = (x: number, y: number) => {
    const el = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-key]');
    if (!el || !root.contains(el) || el.getAttribute('aria-disabled') === 'true') return null;
    return el;
  };

  const setHover = (el: HTMLElement | null) => {
    // While scanning, touches don't pick keys, so only long-press keys light up.
    if (el && getOpts().scanning && !el.dataset.hold) el = null;
    if (el === hovered) return;
    hovered?.removeAttribute('data-pressed');
    hovered = el;
    hovered?.setAttribute('data-pressed', '');

    // Long-press keys fire as soon as the hold time is reached.
    clearTimeout(holdTimer);
    const hold = Number(el?.dataset.hold ?? 0);
    if (el && hold) {
      holdTimer = window.setTimeout(() => {
        consumed = true;
        setHover(null);
        lastActivation = performance.now();
        activate(el);
      }, hold);
    }
  };

  const down = (e: PointerEvent) => {
    if (isNative(e.target) || pointerId !== null) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    pointerId = e.pointerId;
    downAt = e.timeStamp;
    consumed = false;
    setHover(keyAt(e.clientX, e.clientY));
  };

  const move = (e: PointerEvent) => {
    if (e.pointerId === pointerId && !consumed) setHover(keyAt(e.clientX, e.clientY));
  };

  const up = (e: PointerEvent) => {
    if (e.pointerId !== pointerId) return;
    const el = hovered;
    setHover(null);
    pointerId = null;
    if (consumed) return;

    const o = getOpts();
    if (e.timeStamp - downAt < o.minHoldMs || e.timeStamp - lastActivation < o.debounceMs) return;
    if (o.scanning) {
      lastActivation = e.timeStamp;
      o.onScanSelect();
      return;
    }
    if (!el) return;
    if (el.dataset.hold) {
      o.onHoldTooShort();
      return;
    }
    lastActivation = e.timeStamp;
    activate(el);
  };

  const cancel = (e: PointerEvent) => {
    if (e.pointerId !== pointerId) return;
    setHover(null);
    pointerId = null;
  };

  const blockClick = (e: MouseEvent) => {
    if (synthetic || isNative(e.target)) return;
    e.stopPropagation();
    e.preventDefault();
  };

  const blockMenu = (e: Event) => {
    if (!isNative(e.target)) e.preventDefault();
  };

  root.addEventListener('pointerdown', down);
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
  window.addEventListener('pointercancel', cancel);
  root.addEventListener('click', blockClick, true);
  root.addEventListener('contextmenu', blockMenu);
  return () => {
    root.removeEventListener('pointerdown', down);
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    window.removeEventListener('pointercancel', cancel);
    root.removeEventListener('click', blockClick, true);
    root.removeEventListener('contextmenu', blockMenu);
  };
}
