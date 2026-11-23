// Racing's settings in the menu's GAME tab (docs/game-modes.md): how many races a game is, and
// who's to race.
import { RACES, isRacing, type RacingState } from '@world/shared';
import type { Row } from '../../ui/menu/rows';
import { BOTS_TO_COME } from '../bots';
import type { ModeHooks } from '../index';

const RACERS_COLOUR = '#7dff9a'; // the racers' column: the green a track is followed by
// What stands in before the room's game is known to be one of these: never shown.
const NONE: Pick<RacingState, 'races' | 'racers'> = { races: RACES.count, racers: [] };

export function racingSettings(hooks: ModeHooks): Row[] {
  const game = () => {
    const told = hooks.game();
    return isRacing(told) ? told : NONE;
  };
  const mine = () => hooks.master() && hooks.game().phase === 'lobby';
  return [
    {
      kind: 'stepper',
      label: 'RACES',
      value: () => String(game().races),
      step: (by) => hooks.set({ races: game().races + by }),
      can: (by) => mine() && game().races + by >= RACES.min && game().races + by <= RACES.max,
    },
    BOTS_TO_COME,
    {
      kind: 'board',
      columns: () => [
        {
          name: 'RACERS',
          colour: RACERS_COLOUR,
          players: game().racers.map((racer) => hooks.listed(racer.id)),
        },
      ],
      can: () => false,
      move: () => {},
    },
  ];
}
