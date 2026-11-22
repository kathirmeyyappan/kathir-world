// How the local player is shown everyone else, as the room's game has it (the shared package's
// `Rules.sees` and `Rules.side`): who's named over their head, pinned at the screen's edge and
// marked on the maps at all, and the colour each goes by. Freeplay shows everyone, each in the
// colour of their own look.
import { rulesOf, type Appearance, type GameState } from '@world/shared';
import { nameColour } from '../render/liveries';

export interface Sighted {
  colour: string; // the colour they go by
  pointer: boolean; // marked on the maps as big as the viewer's own mark: someone on their side
}

// The colour a player goes by as the game stands: their side's, where they're on one, else their
// own (liveries.ts `nameColour`).
export function colourOf(game: GameState, p: Appearance & { id: string }): string {
  return rulesOf(game).side(game, p.id)?.colour ?? nameColour(p);
}

// Those of `players` that `viewer` is shown, each with how.
export function shownTo<P extends Appearance & { id: string }>(
  game: GameState,
  viewer: { id: string; ghost: boolean },
  players: P[],
): (P & Sighted)[] {
  const rules = rulesOf(game);
  return players.flatMap((p) => {
    const sight = rules.sees(game, viewer, p.id);
    return sight === 'hidden' ? [] : [{ ...p, colour: colourOf(game, p), pointer: sight === 'side' }];
  });
}
