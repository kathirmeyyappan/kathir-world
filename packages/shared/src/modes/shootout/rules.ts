// Shootout's rules (docs/game-modes.md), which the Room enforces and the client shows.
import { gameRules } from '../game';
import { FREEPLAY_DYING, type Rules } from '../rules';
import { TEAMS, isShootout, memberOf, type ShootoutState } from './state';

export const SHOOTOUT_RULES: Rules = {
  // A fight on foot and in karts between teams in their own colours: nothing that flies over it or
  // steps out of it, no colour but the team's, and no bots but its own. Its dead come back as
  // freeplay's do.
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

  // Even teams, with someone on each: the game's bots count as anyone does.
  starts(game) {
    if (!isShootout(game)) return null;
    const sizes = game.teams.map((team) => team.length);
    if (sizes.some((n) => n === 0)) return 'every team needs a player';
    return sizes.every((n) => n === sizes[0]) ? null : 'every team needs the same number of players';
  },

  // A player's team is their side from the game's start until the lobby is back, where everyone is
  // their own again.
  side(game, player) {
    if (!isShootout(game) || !fought(game)) return null;
    const member = memberOf(game.bots, player);
    const team = game.teams.findIndex((members) => members.includes(member));
    return team < 0 ? null : TEAMS[team];
  },

  // The teams by their points, the most first: every team level on the most has won.
  standings(game) {
    if (!isShootout(game) || !fought(game)) return [];
    const most = Math.max(...game.points);
    return game.teams
      .map((_, team) => ({ side: TEAMS[team], points: game.points[team], won: game.points[team] === most }))
      .sort((a, b) => b.points - a.points);
  },

  // A team sees its own, and nothing of the others but their bodies. A ghost sees everyone, and is
  // seen by everyone as anyone is.
  sees(game, viewer, other) {
    const [mine, theirs] = [this.side(game, viewer.id), this.side(game, other)];
    if (viewer.ghost || mine === null || theirs === null) return 'plain';
    return mine === theirs ? 'side' : 'hidden';
  },
};

// Whether its game is being fought, or has just been: the teams are sides only then.
function fought(game: ShootoutState): boolean {
  return game.phase === 'playing' || game.phase === 'results';
}
