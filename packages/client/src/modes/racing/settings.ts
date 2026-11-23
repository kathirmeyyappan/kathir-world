// Racing's settings in the menu's GAME tab (docs/game-modes.md): how many races a game is, the
// bots it brings and how good each is, and who's to race.
import { RACES, isRacing, type RacingState } from '@world/shared';
import type { Entry, Row } from '../../ui/menu/rows';
import { botEntry, botsRow, settable } from '../bots';
import type { ModeHooks } from '../index';

const RACERS_COLOUR = '#7dff9a'; // the racers' column: the green a track is followed by
// What stands in before the room's game is known to be one of these: never shown.
const NONE: Pick<RacingState, 'races' | 'racers' | 'round'> = { races: RACES.count, racers: [], round: null };

export function racingSettings(hooks: ModeHooks): Row[] {
  const game = () => {
    const told = hooks.game();
    return isRacing(told) ? told : NONE;
  };
  const bots = () => hooks.game().bots;
  // Someone racing: one of the game's bots with its level.
  const racing = (id: string): Entry => {
    const bot = bots().find((b) => b.id === id);
    return bot ? botEntry(hooks, bot) : hooks.listed(id);
  };
  return [
    {
      kind: 'stepper',
      label: 'RACES',
      value: () => String(game().races),
      step: (by) => hooks.set({ races: game().races + by }),
      can: (by) => settable(hooks) && game().races + by >= RACES.min && game().races + by <= RACES.max,
    },
    botsRow(hooks),
    {
      kind: 'board',
      columns: () => [
        {
          name: 'RACERS',
          colour: RACERS_COLOUR,
          // Until a game begins its bots stand under whoever is here, come or still to; in one,
          // those that came are racers like anyone.
          players: [
            ...game().racers.map((racer) => racing(racer.id)),
            ...(game().round ? [] : bots().map((bot) => botEntry(hooks, bot))),
          ],
        },
      ],
      can: () => false,
      move: () => {},
    },
  ];
}
