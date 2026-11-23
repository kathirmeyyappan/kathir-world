// Racing's rules (docs/game-modes.md), which the Room enforces and the client shows.
import { trackOf } from '../../sim/tracks';
import { gameRules } from '../game';
import type { Rules } from '../rules';
import { MIN_RACERS, isRacing, type RacingState } from './state';

export const RACING_RULES: Rules = {
  // Everyone in a kart of their own from the grid to the line: a look on foot can be changed, and
  // nothing else asked for. No one dies in a race; what no hearts means is the lobby's.
  ...gameRules({
    allows: {
      speedy: false,
      weapon: false,
      gear: false,
      unequip: false,
      look: true,
      dragon: false,
      colour: false,
      bot: false,
      'kill-bots': false,
      kart: false,
      teleport: false,
    },
    dying: { seconds: 3, screen: false },
  }),

  starts(game) {
    if (!isRacing(game) || game.racers.length + game.bots.length >= MIN_RACERS) return null;
    return `a race needs ${MIN_RACERS} racers`;
  },

  // The racers by their points, the most first: everyone level on the most is winning, or has won.
  standings(game) {
    if (!isRacing(game) || !raced(game)) return [];
    const most = Math.max(...game.points);
    return game.racers
      .map((racer, i) => ({
        side: { name: racer.name, colour: racer.colour, avatar: racer.avatar },
        points: game.points[i],
        won: game.points[i] === most,
      }))
      .sort((a, b) => b.points - a.points);
  },

  // The track of the race being run is all the floor there is to a kart.
  track(game) {
    return isRacing(game) && game.phase === 'playing' && game.round ? trackOf(game.round.track) : null;
  },

  // A racer is in their kart from the grid until they're out of the race.
  seated(game, player) {
    return isRacing(game) && game.phase === 'playing' && game.racers.some((r) => r.id === player);
  },

  // Held on the grid until the race is let go, again once over the line, and when it's run.
  held(game, player, tick) {
    if (!isRacing(game) || game.phase !== 'playing' || !game.round) return false;
    const { go, finished, over } = game.round;
    return tick < go || over !== null || finished.includes(player);
  },
};

// Whether its game is being raced, or has just been: the points stand only then.
function raced(game: RacingState): boolean {
  return game.phase === 'playing' || game.phase === 'results';
}
