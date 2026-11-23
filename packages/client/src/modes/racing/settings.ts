// Racing's settings in the menu's GAME tab (docs/game-modes.md): how many races a game is, the
// bots it brings and how good each is, and who's to race.
import {
  BOT_LEVELS,
  MOST_BOTS,
  RACES,
  botName,
  isRacing,
  type RaceBot,
  type Racer,
  type RacingState,
} from '@world/shared';
import type { Entry, Row } from '../../ui/menu/rows';
import type { ModeHooks } from '../index';

const RACERS_COLOUR = '#7dff9a'; // the racers' column: the green a track is followed by
// The colour a bot still to come is listed in: its look's livery is its own whatever it's given.
const UNPAINTED = '#ffffff';
// What stands in before the room's game is known to be one of these: never shown.
const NONE: Pick<RacingState, 'races' | 'bots' | 'racers' | 'round'> = {
  races: RACES.count,
  bots: [],
  racers: [],
  round: null,
};

function levelOf(bot: RaceBot): string {
  return `LV ${bot.level}`;
}

export function racingSettings(hooks: ModeHooks): Row[] {
  const game = () => {
    const told = hooks.game();
    return isRacing(told) ? told : NONE;
  };
  const mine = () => hooks.master() && hooks.game().phase === 'lobby';
  const levels = () => game().bots.map((bot) => bot.level);
  // A bot is added at the level of the last one there is.
  const added = () => levels().at(-1) ?? BOT_LEVELS.first;
  const within = (level: number) => level >= BOT_LEVELS.least && level <= BOT_LEVELS.most;
  // A bot as the board lists it before it has come: by the name it will come as, in its look.
  const toCome = (bot: RaceBot, i: number): Entry => ({
    id: `bot:${i}`,
    name: botName(i),
    appearance: { avatar: bot.avatar, color: UNPAINTED },
    set: {
      value: levelOf(bot),
      step: (by) => hooks.set({ bots: levels().map((level, k) => (k === i ? level + by : level)) }),
      can: (by) => mine() && within(bot.level + by),
    },
  });
  // Someone racing, a bot of the game's with its level.
  const racing = (racer: Racer): Entry => {
    const bot = racer.rating === null ? undefined : game().bots.find((_, i) => botName(i) === racer.name);
    return { ...hooks.listed(racer.id), ...(bot && { set: { value: levelOf(bot) } }) };
  };
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
      step: (by) => hooks.set({ bots: by > 0 ? [...levels(), added()] : levels().slice(0, -1) }),
      can: (by) => mine() && (by > 0 ? game().bots.length < MOST_BOTS : game().bots.length > 0),
    },
    {
      kind: 'board',
      columns: () => [
        {
          name: 'RACERS',
          colour: RACERS_COLOUR,
          // Until a game begins its bots are still to come, and stand under whoever is here; in
          // one, those that came are racers like anyone.
          players: [...game().racers.map(racing), ...(game().round ? [] : game().bots.map(toCome))],
        },
      ],
      can: () => false,
      move: () => {},
    },
  ];
}
