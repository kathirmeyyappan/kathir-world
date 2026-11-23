// Racing's settings in the menu's GAME tab (docs/game-modes.md): how many races a game is, the
// bots it brings and how good each is, and who's to race.
import { BOT_LEVELS, MOST_BOTS, RACES, botName, isRacing, type RacingState } from '@world/shared';
import type { Row } from '../../ui/menu/rows';
import type { ModeHooks } from '../index';

const RACERS_COLOUR = '#7dff9a'; // the racers' column: the green a track is followed by
// What stands in before the room's game is known to be one of these: never shown.
const NONE: Pick<RacingState, 'races' | 'bots' | 'racers'> = { races: RACES.count, bots: [], racers: [] };

export function racingSettings(hooks: ModeHooks): Row[] {
  const game = () => {
    const told = hooks.game();
    return isRacing(told) ? told : NONE;
  };
  const mine = () => hooks.master() && hooks.game().phase === 'lobby';
  // A press of a bot's level steps it up, and round from the most to the least.
  const after = (level: number) => (level >= BOT_LEVELS.most ? BOT_LEVELS.least : level + 1);
  // A bot is added at the level of the last one there is.
  const added = () => game().bots.at(-1) ?? BOT_LEVELS.first;
  return [
    {
      kind: 'stepper',
      label: 'RACES',
      value: () => String(game().races),
      step: (by) => hooks.set({ races: game().races + by }),
      can: (by) => mine() && game().races + by >= RACES.min && game().races + by <= RACES.max,
    },
    {
      kind: 'stepper',
      label: 'BOTS',
      value: () => String(game().bots.length),
      step: (by) => hooks.set({ bots: by > 0 ? [...game().bots, added()] : game().bots.slice(0, -1) }),
      can: (by) => mine() && (by > 0 ? game().bots.length < MOST_BOTS : game().bots.length > 0),
    },
    {
      kind: 'toggles',
      items: () => game().bots.map((level, i) => ({ label: botName(i).toUpperCase(), value: `LV ${level}` })),
      press: (i) => hooks.set({ bots: game().bots.map((level, k) => (k === i ? after(level) : level)) }),
      can: mine,
    },
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
