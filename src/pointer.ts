// Touch handling for an unsteady hand:
// - a key fires when the finger lifts, so the user can slide onto the right key;
// - only the first finger counts (a resting palm is ignored);
// - touches shorter than minHoldMs and repeats within debounceMs are ignored;
// - keys with data-hold="ms" need a long press (used for settings);
// - in scanning mode any touch means "select";
// - on a swipe pad ([data-swipe]), the direction of the slide picks one of 8
//   cells around the middle, and a touch without a slide picks the middle.
//   The pad gets a "swipe" event with the cell index (0–8, row by row).
//   While sliding, the pad's --sx/--sy/--len/--angle/--reach show the slide.
// Feedback: the key or cell under the finger is passed to onPreview, and on
// lift it flashes (data-flash="chosen", or "ignored" when the touch is ignored).
// Elements inside [data-native] (the settings form) get normal browser behaviour,
// and touches that start in a writing pad ([data-draw]) are left to the pad.

export interface PointerOptions {
  debounceMs: number;
  minHoldMs: number;
  scanning: boolean;
  onScanSelect: () => void;
  // A long-press key was tapped too briefly.
  onHoldTooShort: () => void;
  // The key or swipe cell that lifting the finger would pick, or null.
  onPreview: (el: HTMLElement | null) => void;
}

const FLASH_MS = 300;

export function flash(el: HTMLElement, kind: 'chosen' | 'ignored') {
  el.dataset.flash = kind;
  setTimeout(() => {
    if (el.dataset.flash === kind) delete el.dataset.flash;
  }, FLASH_MS);
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

const MIDDLE = 4;
// Grid cell for each eighth of a turn, starting east and going clockwise (y points down).
const DIRECTION_CELLS = [5, 8, 7, 6, 3, 0, 1, 2];

// A slide shorter than a tenth of the pad (at least 40 px) counts as a touch.
const swipeReach = (pad: HTMLElement) => Math.max(40, 0.1 * Math.min(pad.clientWidth, pad.clientHeight));

function swipeCell(dx: number, dy: number, pad: HTMLElement): number {
  if (Math.hypot(dx, dy) < swipeReach(pad)) return MIDDLE;
  const eighth = Math.round(Math.atan2(dy, dx) / (Math.PI / 4));
  return DIRECTION_CELLS[(eighth + 8) % 8];
}

const isNative = (t: EventTarget | null) => t instanceof Element && !!t.closest('[data-native]');
const isDraw = (t: EventTarget | null) => t instanceof Element && !!t.closest('[data-draw]');

export function installPointer(root: HTMLElement, getOpts: () => PointerOptions): () => void {
  let pointerId: number | null = null;
  let downAt = 0;
  let lastActivation = -Infinity;
  let hovered: HTMLElement | null = null;
  let holdTimer = 0;
  // Set once a long press has fired, so lifting the finger does nothing more.
  let consumed = false;
  let pad: HTMLElement | null = null;
  let startX = 0;
  let startY = 0;
  let cell = MIDDLE;

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
    getOpts().onPreview(el);

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

  const cellEl = (c: number) => pad?.querySelectorAll<HTMLElement>('[data-cell]')[c] ?? null;

  const setCell = (c: number) => {
    if (c === cell && cellEl(c)?.hasAttribute('data-pressed')) return;
    cellEl(cell)?.removeAttribute('data-pressed');
    cell = c;
    cellEl(cell)?.setAttribute('data-pressed', '');
    getOpts().onPreview(cellEl(cell));
  };

  const slide = (x: number, y: number) => {
    if (!pad) return;
    const dx = x - startX;
    const dy = y - startY;
    pad.style.setProperty('--len', `${Math.hypot(dx, dy)}px`);
    pad.style.setProperty('--angle', `${Math.atan2(dy, dx)}rad`);
    setCell(swipeCell(dx, dy, pad));
  };

  const leavePad = () => {
    if (!pad) return;
    cellEl(cell)?.removeAttribute('data-pressed');
    delete pad.dataset.active;
    pad = null;
    cell = MIDDLE;
    getOpts().onPreview(null);
  };

  const down = (e: PointerEvent) => {
    if (isNative(e.target) || isDraw(e.target) || pointerId !== null) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    pointerId = e.pointerId;
    downAt = e.timeStamp;
    consumed = false;
    pad = getOpts().scanning ? null : ((e.target as Element).closest?.<HTMLElement>('[data-swipe]') ?? null);
    if (pad) {
      startX = e.clientX;
      startY = e.clientY;
      const box = pad.getBoundingClientRect();
      pad.style.setProperty('--sx', `${startX - box.left}px`);
      pad.style.setProperty('--sy', `${startY - box.top}px`);
      pad.style.setProperty('--reach', `${swipeReach(pad)}px`);
      pad.dataset.active = '';
      slide(startX, startY);
    } else {
      setHover(keyAt(e.clientX, e.clientY));
    }
  };

  const move = (e: PointerEvent) => {
    if (e.pointerId !== pointerId || consumed) return;
    if (pad) slide(e.clientX, e.clientY);
    else setHover(keyAt(e.clientX, e.clientY));
  };

  const up = (e: PointerEvent) => {
    if (e.pointerId !== pointerId) return;
    const swiped = pad;
    const picked = swiped ? swipeCell(e.clientX - startX, e.clientY - startY, swiped) : MIDDLE;
    const el = swiped ? cellEl(picked) : hovered;
    setHover(null);
    leavePad();
    pointerId = null;
    if (consumed) return;

    const o = getOpts();
    if (e.timeStamp - downAt < o.minHoldMs || e.timeStamp - lastActivation < o.debounceMs) {
      if (el) flash(el, 'ignored');
      return;
    }
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
    flash(el, 'chosen');
    if (swiped) swiped.dispatchEvent(new CustomEvent('swipe', { detail: picked }));
    else activate(el);
  };

  const cancel = (e: PointerEvent) => {
    if (e.pointerId !== pointerId) return;
    setHover(null);
    leavePad();
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
