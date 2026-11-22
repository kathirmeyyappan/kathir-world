// A game's results (docs/game-modes.md), standing over the view while they do: who won, every side
// with its points, the best first, and how long until the lobby. Its lines are the mode's standings
// (the shared package's `Rules.standings`), so every mode fills in the one screen. Nothing on it is
// pressed: the world goes on under it.
import type { Standing } from '@world/shared';

export class Results {
  private readonly root = document.getElementById('results')!;
  private readonly title = this.root.querySelector<HTMLElement>('h1')!;
  private readonly list = this.root.querySelector<HTMLElement>('ul')!;
  private readonly count = this.root.querySelector<HTMLElement>('.count')!;
  private shown = ''; // what's drawn, to draw only on a change

  // Up with `standings` and `seconds` to go before the lobby, or with null, away.
  set(standings: Standing[] | null, seconds = 0): void {
    const now = standings === null ? '' : JSON.stringify([standings, seconds]);
    if (now === this.shown) return;
    this.shown = now;
    this.root.classList.toggle('hidden', standings === null);
    if (standings === null) return;
    const winners = standings.filter((s) => s.won);
    this.title.textContent =
      winners.length === 1 ? `${winners[0].side.name} WINS!` : `A TIE: ${winners.map((s) => s.side.name).join(', ')}`;
    this.title.style.color = winners.length === 1 ? winners[0].side.colour : '';
    this.list.replaceChildren(
      ...standings.map((s) => {
        const li = document.createElement('li');
        li.classList.toggle('won', s.won);
        li.style.setProperty('--side', s.side.colour);
        const name = Object.assign(document.createElement('span'), { className: 'name', textContent: s.side.name });
        const points = Object.assign(document.createElement('span'), {
          className: 'points',
          textContent: String(s.points),
        });
        li.append(name, points);
        return li;
      }),
    );
    this.count.textContent = `back to the lobby in ${seconds}`;
  }
}
