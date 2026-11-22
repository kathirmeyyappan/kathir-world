// Shootout's rules (docs/game-modes.md), which the Room enforces and the client shows.
import { gameRules } from '../game';
import { FREEPLAY_DYING, type Rules } from '../rules';
import { isShootout } from './state';

export const SHOOTOUT_RULES: Rules = {
  // A fight on foot and in karts between teams in their own colours: nothing that flies over it or
  // steps out of it, no colour but the team's, and people alone. Its dead come back as freeplay's do.
  ...gameRules({
    allows: {
      speedy: true,
      weapon: true,
      gear: true,
      unequip: true,
      look: true,
      dragon: false,
      colour: false,
      bot: false,
      'kill-bots': false,
      kart: true,
      teleport: false,
    },
    dying: FREEPLAY_DYING,
  }),

  // Even teams, with someone on each.
  starts(game) {
    if (!isShootout(game)) return null;
    const sizes = game.teams.map((team) => team.length);
    if (sizes.some((n) => n === 0)) return 'every team needs a player';
    return sizes.every((n) => n === sizes[0]) ? null : 'every team needs the same number of players';
  },
};
