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

  // Lines over the standing one, each for a moment in turn, in its `colour` if it has one of its own;
  // whatever was being said is cut short.
  say(...lines: Said[]): void {
    clearTimeout(this.timer);
    const [first, ...rest] = lines;
    this.said.textContent = first?.text ?? '';
    this.said.style.color = first?.colour ?? '';
    this.timer = window.setTimeout(() => this.say(...rest), SAID_MS);
  }
}

// A line said over the standing one.
export interface Said {
  text: string;
  colour?: string;
}
