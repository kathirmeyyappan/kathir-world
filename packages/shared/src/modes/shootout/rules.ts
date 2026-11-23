// Shootout's rules (docs/game-modes.md), which the Room enforces and the client shows.
import { gameRules } from '../game';
import { FREEPLAY_DYING, type Rules } from '../rules';
import { TEAMS, isShootout, type ShootoutState } from './state';

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

  // A player's team is their side from the game's start until the lobby is back, where everyone is
  // their own again.
  side(game, player) {
    if (!isShootout(game) || !fought(game)) return null;
    const team = game.teams.findIndex((players) => players.includes(player));
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

  // Everyone is shown everyone, each in their team's colour: a teammate as one of the viewer's
  // side, and the rest plainly.
  sees(game, viewer, other) {
    const mine = this.side(game, viewer.id);
    return mine !== null && mine === this.side(game, other) ? 'side' : 'plain';
  },
};

// Whether its game is being fought, or has just been: the teams are sides only then.
function fought(game: ShootoutState): boolean {
  return game.phase === 'playing' || game.phase === 'results';
}
