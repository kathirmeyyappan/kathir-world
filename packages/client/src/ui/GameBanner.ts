// What a game says to everyone over the view (docs/game-modes.md): a line that stands for as long
// as it's so, flashing (the lobby's waiting for its room master, the countdown to the start), and
// over it lines that come and go, one after another (the room master ended the game; your team, then
// the game's rules).
const SAID_MS = 5000; // how long each line said over the standing one stays

// A line that stands, and how it's said: `big` for one read at a glance (a count, GO!), its first
// line of text the big one; `urgent` for time running out.
export interface BannerLine {
  text: string;
  tone?: 'big' | 'urgent';
}

export class GameBanner {
  private readonly root = document.getElementById('game-banner')!;
  private readonly said = this.root.querySelector<HTMLElement>('.said')!;
  private readonly line = this.root.querySelector<HTMLElement>('.line')!;
  private timer = 0;

  // The line that stands; null: none.
  set(line: BannerLine | null): void {
    if (this.line.textContent !== (line?.text ?? '')) this.line.textContent = line?.text ?? '';
    this.line.classList.toggle('big', line?.tone === 'big');
    this.line.classList.toggle('urgent', line?.tone === 'urgent');
  }

  // Things over the standing line, each for a moment in turn; whatever was being said is cut short.
  say(...said: Said[]): void {
    clearTimeout(this.timer);
    const [first, ...rest] = said;
    this.said.replaceChildren(...(first?.rows ?? []).map(row));
    this.said.style.color = first?.colour ?? '';
    this.said.classList.toggle('compact', first?.compact ?? false);
    this.timer = window.setTimeout(() => this.say(...rest), SAID_MS);
  }
}

// Something said over the standing line: its rows, one under another, in its `colour` if it has one
// of its own; `compact`, in the narrow font, for a few rows to read (a game's rules) rather than a
// line to catch at a glance.
export interface Said {
  rows: Span[][];
  colour?: string;
  compact?: boolean;
}

// Words in a row, plain or in a tone: a gain in green, a loss in red.
export type Span = string | { text: string; tone: 'gain' | 'loss' };

export const gain = (text: string): Span => ({ text, tone: 'gain' });
export const loss = (text: string): Span => ({ text, tone: 'loss' });

// One row of plain words, in `colour` if given: the most that's said.
export function saying(text: string, colour?: string): Said {
  return { rows: [[text]], colour };
}

function row(spans: Span[]): HTMLElement {
  const el = document.createElement('div');
  for (const span of spans) {
    if (typeof span === 'string') el.append(span);
    else {
      const toned = document.createElement('span');
      toned.className = span.tone;
      toned.textContent = span.text;
      el.append(toned);
    }
  }
  return el;
}
