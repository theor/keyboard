// Row/column scanning: rows light up in turn; a touch picks the row,
// then keys in that row light up in turn; a touch picks the key.
// Rows are elements with data-scan-row="<order>" inside [data-scan-root].
// The DOM is read on every step, so screen changes need no special handling.

export class Scanner {
  private level: 'row' | 'cell' = 'row';
  private row = 0;
  private cell = 0;
  private timer = 0;
  private running = false;
  private lit: HTMLElement[] = [];

  constructor(
    private getMs: () => number,
    private onActivate: (el: HTMLElement) => void,
  ) {}

  start() {
    if (this.running) return;
    this.running = true;
    this.restart();
  }

  stop() {
    this.running = false;
    clearTimeout(this.timer);
    this.paint([]);
  }

  select() {
    if (!this.running) return;
    const rows = this.rows();
    const r = rows[this.row % Math.max(rows.length, 1)];
    if (!r) return;
    if (this.level === 'row' && r.length > 1) {
      this.level = 'cell';
      this.cell = 0;
      this.show(1.5);
      return;
    }
    const key = this.level === 'row' ? r[0] : r[this.cell];
    this.paint([]);
    if (key) this.onActivate(key);
    // Let the screen re-render before reading rows again.
    clearTimeout(this.timer);
    this.timer = window.setTimeout(() => this.restart(), 50);
  }

  private restart() {
    this.level = 'row';
    this.row = 0;
    this.cell = 0;
    this.show(1.5);
  }

  private rows(): HTMLElement[][] {
    const root = document.querySelector('[data-scan-root]');
    if (!root) return [];
    return Array.from(root.querySelectorAll<HTMLElement>('[data-scan-row]'))
      .sort((a, b) => Number(a.dataset.scanRow) - Number(b.dataset.scanRow))
      .map((row) =>
        Array.from(row.querySelectorAll<HTMLElement>('[data-key]')).filter(
          (k) => k.getAttribute('aria-disabled') !== 'true' && !k.dataset.hold,
        ),
      )
      .filter((keys) => keys.length > 0);
  }

  private show(factor = 1) {
    clearTimeout(this.timer);
    if (!this.running) return;
    const rows = this.rows();
    if (rows.length) {
      this.row %= rows.length;
      const r = rows[this.row];
      this.paint(this.level === 'row' ? r : [r[this.cell]]);
    } else {
      this.paint([]);
    }
    this.timer = window.setTimeout(() => this.step(), this.getMs() * factor);
  }

  private step() {
    const rows = this.rows();
    if (this.level === 'row') {
      this.row = (this.row + 1) % Math.max(rows.length, 1);
    } else if (++this.cell >= (rows[this.row]?.length ?? 0)) {
      // No choice after one pass: go back to rows, starting with this one.
      this.level = 'row';
    }
    this.show();
  }

  private paint(keys: HTMLElement[]) {
    for (const k of this.lit) k.removeAttribute('data-scan-on');
    for (const k of keys) k.setAttribute('data-scan-on', '');
    this.lit = keys;
  }
}
