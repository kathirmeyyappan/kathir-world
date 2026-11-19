// The key legend along the bottom, a cell to each key, read off what the player is doing: each class
// has a board of its own (the record makes a new class say what its keys are), and a board may
// change with the body's state, as a walker's does on a ladder, where A and D go round it. Driving a
// kart, whatever the body, the keys drive it.
import { classOf, moveKeys, type PlayerClass, type PlayerState } from '@world/shared';

export interface LegendCell {
  keys: string[];
  does: string;
}

const cell = (keys: string[], does: string): LegendCell => ({ keys, does });

// What every board ends with.
const COMMON: LegendCell[] = [
  cell([], 'Click select'),
  cell(['Z'], 'toggle perspective'),
  cell(['O'], 'fullscreen'),
  cell(['Esc'], 'mouse'),
];

// A look's own moves come after the jump; on a ladder, only those that work there.
const BOARDS: Record<PlayerClass, (p: PlayerState) => LegendCell[]> = {
  walker: (p) => {
    const moves = moveKeys(p.avatar)
      .filter((move) => !p.climb || move.climbing)
      .map(({ key, does }) => cell([key], does));
    return p.climb
      ? [cell(['W', 'S'], 'climb'), cell(['A', 'D'], 'swap side'), cell(['Space'], 'let go'), ...moves]
      : [cell(['WASD'], 'move'), cell(['Shift'], 'run'), cell(['Space'], 'jump'), ...moves];
  },
  'asian-dragon': () => [cell(['W'], 'fly forward'), cell(['A', 'S', 'D'], 'roar')],
};

// A driver's keys, whatever the body.
export const DRIVING: LegendCell[] = [
  cell(['W'], 'gas'),
  cell(['S'], 'brake'),
  cell(['A', 'D'], 'steer'),
  cell(['Space'], 'hop, hold to drift, trick in the air'),
  cell(['E'], 'get out'),
];

export function legendOf(p: PlayerState): LegendCell[] {
  return [...(p.riding ? DRIVING : BOARDS[classOf(p.avatar).id](p)), ...COMMON];
}
