// How a game stands while it's played, in the top right of the view (docs/game-modes.md): the one
// thing the player has to know, huge, where the game has one (a racer's place); every side with its
// points, the best first; and the clock, where the game is on one. What's on it is the mode's to say
// (the client's `MODE_HUD`).
import type { Standing } from '@world/shared';
import { clockFace } from './clock';

export interface Tally {
  headline: string | null; // drawn huge over the rest
  caption: string | null; // a small line under it: what it's of, or which part of the game this is
  standings: Standing[];
  seconds: number | null; // left on the clock; null: it has none
  urgent: boolean; // the clock's last seconds: it flashes
}

export class Scores {
  private readonly root = document.getElementById('scores')!;
  private readonly headline = this.root.querySelector<HTMLElement>('.headline')!;
  private readonly caption = this.root.querySelector<HTMLElement>('.caption')!;
  private readonly list = this.root.querySelector<HTMLElement>('ul')!;
  private readonly clock = this.root.querySelector<HTMLElement>('.clock')!;
  private shown = ''; // what's drawn, to draw only on a change

  // Null: away.
  set(tally: Tally | null): void {
    const now = tally === null ? '' : JSON.stringify(tally);
    if (now === this.shown) return;
    this.shown = now;
    this.root.classList.toggle('hidden', tally === null);
    if (tally === null) return;
    this.headline.textContent = tally.headline ?? '';
    this.caption.textContent = tally.caption ?? '';
    this.list.replaceChildren(
      ...tally.standings.map((s) => {
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
    this.clock.hidden = tally.seconds === null;
    this.clock.classList.toggle('urgent', tally.urgent);
    if (tally.seconds !== null) this.clock.textContent = clockFace(tally.seconds);
  }
}
