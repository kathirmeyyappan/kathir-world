// What a shootout has on the HUD while it's played (docs/game-modes.md): every team's points and
// the clock, in the top right.
import { rulesOf, type GameState } from '@world/shared';
import { secondsUntil } from '../../ui/clock';
import type { Moment, Showing } from '../index';

export function shootoutHud(game: GameState, at: Moment): Showing {
  return {
    line: null,
    board: null,
    preview: null,
    starter: null,
    scores: {
      headline: null,
      caption: null,
      standings: rulesOf(game).standings(game),
      seconds: game.until === null ? null : secondsUntil(game.until, at.tick),
      urgent: false,
    },
  };
}
