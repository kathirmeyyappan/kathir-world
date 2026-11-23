// A leaderboard standing over the view (docs/game-modes.md): a game's results, who won and every
// side with its points, the best first, until the lobby; or what a mode puts up while its game is
// played (a race's, between one race and the next: the client's `MODE_HUD`). Nothing on it is
// pressed: the world goes on under it.
import type { Standing } from '@world/shared';

export interface Leaderboard {
  title: string;
  colour: string | null; // the title's; null: the card's own
  // Each side with its points and what's noted beside them (what the last race gave it; '': nothing).
  lines: { name: string; colour: string; note: string; points: number; won: boolean }[];
  footer: string;
}

// A game's results as its standings give them (the shared package's `Rules.standings`), with
// `seconds` to go before the lobby.
export function resultsOf(standings: Standing[], seconds: number): Leaderboard {
  const winners = standings.filter((s) => s.won);
  return {
    title:
      winners.length === 1 ? `${winners[0].side.name} WINS!` : `A TIE: ${winners.map((s) => s.side.name).join(', ')}`,
    colour: winners.length === 1 ? winners[0].side.colour : null,
    lines: standings.map((s) => ({
      name: s.side.name,
      colour: s.side.colour,
      note: '',
      points: s.points,
      won: s.won,
    })),
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
        li.append(span('name', line.name), span('note', line.note), span('points', String(line.points)));
        return li;
      }),
    );
    this.count.textContent = board.footer;
  }
}
