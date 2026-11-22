// A dropdown in the game's look, standing in for the browser's own: the choice on a button, and
// under it a list like the chat's completions (each choice's name with a note dimmed beside it) on a
// scroll rail. Up and Down move along the list, Enter or a click picks, and Esc or a press anywhere
// else closes it. The list drops under the button, or stands over it where the window has more room
// above, as tall as its choices up to a height of its own, and shrinks to what room there is, so it
// never runs off the window.
import { railScroll } from '../ui/scrollRail';

const LIST_HEIGHT = 264; // px, the list at its tallest: more choices than fit are scrolled to
const MIN_LIST_HEIGHT = 120; // px, the least a list that tall or taller shrinks to (a few rows)
const EDGE = 8; // px kept clear between the list and the window's edge

export interface Choice {
  value: string;
  label: string;
  note: string; // dimmed beside the label: the chat command that does the same
}

export class Picker {
  private readonly button = document.createElement('button');
  private readonly box = document.createElement('div');
  private readonly list = document.createElement('ul');
  private readonly rows: HTMLLIElement[];
  private picked = 0;
  private lit = 0; // the row Up and Down have reached while the list is open

  // `onPick` hears of a choice the person makes, by its value; not of one set with `choose`.
  constructor(
    root: HTMLElement,
    private readonly choices: Choice[],
    private readonly onPick?: (value: string) => void,
  ) {
    this.button.type = 'button';
    this.button.className = 'picked';
    this.button.setAttribute('aria-haspopup', 'listbox');
    this.box.className = 'scroller options hidden';
    this.list.setAttribute('role', 'listbox');
    this.rows = choices.map((choice, i) => {
      const row = document.createElement('li');
      row.setAttribute('role', 'option');
      const label = Object.assign(document.createElement('span'), { className: 'label', textContent: choice.label });
      const note = Object.assign(document.createElement('span'), { className: 'note', textContent: choice.note });
      row.append(label, note);
      row.addEventListener('click', () => this.pick(i));
      row.addEventListener('pointermove', () => this.light(i, false));
      return row;
    });
    this.list.append(...this.rows);
    this.box.append(this.list);
    root.append(this.button, this.box);
    railScroll(this.list);

    this.button.addEventListener('click', () => (this.isOpen ? this.close() : this.open()));
    this.button.addEventListener('keydown', (e) => this.key(e));
    document.addEventListener('pointerdown', (e) => {
      if (this.isOpen && !root.contains(e.target as Node)) this.close();
    });
    window.addEventListener('resize', () => {
      if (this.isOpen) this.fit();
    });
    this.show();
  }

  get value(): string {
    return this.choices[this.picked].value;
  }

  // Picks the choice with `value`, or the first where there's no such choice.
  choose(value: string): void {
    this.picked = Math.max(
      0,
      this.choices.findIndex((c) => c.value === value),
    );
    this.show();
  }

  private get isOpen(): boolean {
    return !this.box.classList.contains('hidden');
  }

  private open(): void {
    this.box.classList.remove('hidden');
    this.fit();
    this.button.setAttribute('aria-expanded', 'true');
    this.light(this.picked, true);
  }

  private fit(): void {
    const { top, bottom } = this.button.getBoundingClientRect();
    const below = window.innerHeight - bottom - EDGE;
    const above = top - EDGE;
    const frame = this.box.offsetHeight - this.list.clientHeight; // the box's own padding and border, over and under the list
    const full = Math.min(LIST_HEIGHT, this.list.scrollHeight + frame);
    const up = below < full && above > below;
    this.box.classList.toggle('up', up);
    this.box.style.height = `${Math.max(Math.min(MIN_LIST_HEIGHT, full), Math.min(full, up ? above : below))}px`;
  }

  private close(): void {
    this.box.classList.add('hidden');
    this.button.setAttribute('aria-expanded', 'false');
  }

  private key(e: KeyboardEvent): void {
    if (e.key === 'Tab') return this.close(); // and on to the next field
    const step = e.key === 'ArrowDown' ? 1 : e.key === 'ArrowUp' ? -1 : 0;
    if (!this.isOpen) {
      if (step === 0 && e.key !== 'Enter' && e.key !== ' ') return;
      this.open();
    } else if (step !== 0) this.light(Math.min(this.rows.length - 1, Math.max(0, this.lit + step)), true);
    else if (e.key === 'Enter' || e.key === ' ') this.pick(this.lit);
    else if (e.key === 'Escape') this.close();
    else return;
    // Handled here, not as the button's own click on Enter or Space.
    e.preventDefault();
    e.stopPropagation();
  }

  private light(i: number, scroll: boolean): void {
    this.rows[this.lit].classList.remove('lit');
    this.lit = i;
    this.rows[i].classList.add('lit');
    if (scroll) this.rows[i].scrollIntoView({ block: 'nearest' });
  }

  private pick(i: number): void {
    this.picked = i;
    this.show();
    this.close();
    this.button.focus();
    this.onPick?.(this.value);
  }

  private show(): void {
    this.button.textContent = this.choices[this.picked].label;
    this.rows.forEach((row, i) => row.setAttribute('aria-selected', String(i === this.picked)));
  }
}
