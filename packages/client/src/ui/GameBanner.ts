// What a game says to everyone over the view (docs/game-modes.md): a line that stands for as long
// as it's so, flashing (the lobby's waiting for its room master, the countdown to the start), and
// over it a line that comes and goes (the room master ended the game).
const SAID_MS = 5000; // how long a line said over the standing one stays

export class GameBanner {
  private readonly root = document.getElementById('game-banner')!;
  private readonly said = this.root.querySelector<HTMLElement>('.said')!;
  private readonly line = this.root.querySelector<HTMLElement>('.line')!;
  private timer = 0;

  // The line that stands; null: none.
  set(text: string | null): void {
    if (this.line.textContent !== (text ?? '')) this.line.textContent = text ?? '';
  }

  say(text: string): void {
    clearTimeout(this.timer);
    this.said.textContent = text;
    this.timer = window.setTimeout(() => (this.said.textContent = ''), SAID_MS);
  }
}
