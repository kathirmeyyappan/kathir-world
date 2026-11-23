// What every game's settings have for the bots it brings (the shared package's modes/bots.ts): how
// many, and each one as a board lists it among its players, with its level to step.
import { BOT_LEVELS, MOST_BOTS, botName, type GameBot } from '@world/shared';
import type { Entry, Row } from '../ui/menu/rows';
import type { ModeHooks } from './index';

// The colour a bot still to come is listed in: its look's livery is its own whatever it's given.
const UNPAINTED = '#ffffff';

// What the guide gives of a game's bots, whichever mode's.
export const BOT_FACTS = [
  { label: 'Bots', value: `0 to ${MOST_BOTS}` },
  { label: 'Bot levels', value: `${BOT_LEVELS.least} to ${BOT_LEVELS.most}` },
];

// Whether the game's settings are the player's to change: its room master's, in its lobby.
export function settable(hooks: ModeHooks): boolean {
  return hooks.master() && hooks.game().phase === 'lobby';
}

// How many bots the game brings, one more or one fewer at a press.
export function botsRow(hooks: ModeHooks): Row {
  const count = () => hooks.game().bots.length;
  return {
    kind: 'stepper',
    label: 'BOTS',
    value: () => String(count()),
    step: (by) => hooks.set({ bots: by > 0 ? 'more' : 'fewer' }),
    can: (by) => settable(hooks) && (by > 0 ? count() < MOST_BOTS : count() > 0),
  };
}

// One of the game's bots as a board lists it: until it has come, by its key and the name it will
// come as, in its look, and once it has as the player it is; with its level after it, to step
// while the settings are the player's to change.
export function botEntry(hooks: ModeHooks, bot: GameBot): Entry {
  const place = hooks.game().bots.findIndex((other) => other.key === bot.key);
  const listed =
    bot.id === null
      ? { id: bot.key, name: botName(place), appearance: { avatar: bot.avatar, color: UNPAINTED } }
      : hooks.listed(bot.id);
  return {
    ...listed,
    set: {
      value: `LV ${bot.level}`,
      step: (by) => hooks.set({ bot: place, level: bot.level + by }),
      can: (by) => settable(hooks) && bot.level + by >= BOT_LEVELS.least && bot.level + by <= BOT_LEVELS.most,
    },
  };
}
