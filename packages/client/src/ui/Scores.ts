// How a game stands while it's played, in the top right of the view (docs/game-modes.md): every
// side with its points, the best first, and the clock, where the game is on one. Its lines are the
// mode's standings (the shared package's `Rules.standings`); a game with none shows nothing.
import type { Standing } from '@world/shared';

export class Scores {
  private readonly root = document.getElementById('scores')!;
  private readonly list = this.root.querySelector<HTMLElement>('ul')!;
  private readonly clock = this.root.querySelector<HTMLElement>('.clock')!;
  private shown = ''; // what's drawn, to draw only on a change

  // `standings` with `seconds` left on the game's clock (null: it has none), or with null, away.
  set(standings: Standing[] | null, seconds: number | null = null): void {
    const now = standings === null ? '' : JSON.stringify([standings, seconds]);
    if (now === this.shown) return;
    this.shown = now;
    this.root.classList.toggle('hidden', standings === null);
    if (standings === null) return;
    this.list.replaceChildren(
      ...standings.map((s) => {
        const li = document.createElement('li');
        li.style.color = s.side.colour;
        const name = Object.assign(document.createElement('span'), { textContent: s.side.name });
        const points = Object.assign(document.createElement('span'), {
          className: 'points',
          textContent: String(s.points),
        });
        li.append(name, points);
        return li;
      }),
    );
    this.clock.hidden = seconds === null;
    if (seconds !== null)
      this.clock.textContent = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  }
}
