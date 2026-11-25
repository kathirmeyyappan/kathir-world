// A leaderboard standing over the view (docs/game-modes.md): a game's results, every side with its
// points, the best first, until the lobby; or what a mode puts up while its game is played (a
// race's, between one race and the next: the client's `MODE_HUD`). Whoever won stands
// big at the top with a crown, apart from everyone else, small under them in their order. Nothing
// on it is pressed: the world goes on under it.
import type { Appearance, Side, Standing } from '@world/shared';
import { nameColour } from '../render/liveries';
import { named } from './emblem';
import { CROWN, pixelSvg } from './pixelIcons';

export interface Leaderboard {
  title: string;
  colour: string | null; // the title's; null: the card's own
  // Each side with its points and what's noted beside them (what the last race gave it; '': nothing),
  // and where the side is one player, how they appear, for their emblem before their name.
  lines: { name: string; colour: string; emblem: Appearance | null; note: string; points: number; won: boolean }[];
  footer: string;
}

// A game's results as its standings give them (the shared package's `Rules.standings`), with
// `seconds` to go before the lobby. To someone on a team (`mine`, their side; null: none) it's whether
// they won, tied for the win or lost; to anyone else it's the winner's by name.
export function resultsOf(standings: Standing[], mine: Side | null, seconds: number): Leaderboard {
  const lines = standings.map((s) => {
    const who = s.side.avatar ? { avatar: s.side.avatar, color: s.side.colour } : null;
    return {
      name: s.side.name,
      colour: who ? nameColour(who) : s.side.colour,
      emblem: who,
      note: '',
      points: s.points,
      won: s.won,
    };
  });
  const winners = lines.filter((line) => line.won);
  const team = mine && !mine.avatar ? mine.name : null;
  const tie = winners.length !== 1;
  const theirs = winners.some((line) => line.name === team);
  const named = tie ? "IT'S A TIE!" : `${winners[0].name} WINS!`;
  return {
    title: team === null ? named : !theirs ? 'YOU LOSE!' : tie ? 'YOU TIED!' : 'YOU WIN!',
    colour: winners.length === 1 ? winners[0].colour : null,
    lines,
    footer: `back to the lobby in ${seconds}`,
  };
}

export class Results {
  private readonly root = document.getElementById('results')!;
  private readonly title = this.root.querySelector<HTMLElement>('h1')!;
  private readonly list = this.root.querySelector<HTMLElement>('ul')!;
  private readonly count = this.root.querySelector<HTMLElement>('.count')!;
  private shown = ''; // what's drawn, to draw only on a change

  // Null: away.
  set(board: Leaderboard | null): void {
    const now = board === null ? '' : JSON.stringify(board);
    if (now === this.shown) return;
    this.shown = now;
    this.root.classList.toggle('hidden', board === null);
    if (board === null) return;
    this.title.textContent = board.title;
    this.title.style.color = board.colour ?? '';
    this.list.replaceChildren(
      ...board.lines.map((line) => {
        const li = document.createElement('li');
        li.classList.toggle('won', line.won);
        li.style.setProperty('--side', line.colour);
        const span = (className: string, textContent: string) =>
          Object.assign(document.createElement('span'), { className, textContent });
        const name = span('name', '');
        if (line.won) name.append(pixelSvg(CROWN, 'crown'));
        name.append(...named(line.name, line.emblem));
        li.append(name, span('note', line.note), span('points', String(line.points)));
        return li;
      }),
    );
    this.count.textContent = board.footer;
  }
}
