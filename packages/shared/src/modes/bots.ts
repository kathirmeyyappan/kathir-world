// The bots a game brings of its own (docs/game-modes.md): set in its settings, each at a level and
// in a look the room draws for it as it's added, asked of the host as the game starts, playing in
// it as anyone does, and gone with it. Every game keeps and changes its bots the one way
// (game.ts), so every game's settings do too.
import { AVATARS, AVATAR_IDS, type AvatarId } from '../sim/avatars';
import type { BotWorker } from '../sim/bots';

// A bot's level: the least skilled there is and the most, and the one the first is added at.
export const BOT_LEVELS = { least: 1, most: 5, first: 3 };
export const MOST_BOTS = 8; // how many bots a game can be set to bring
// The looks a game's bots play in, one drawn for each as it's added: every look on foot a person
// can take but the standard body, which is nobody's.
export const BOT_LOOKS: readonly AvatarId[] = AVATAR_IDS.filter(
  (id) => id !== 'standard' && AVATARS[id].class === 'walker' && AVATARS[id].command !== null && !AVATARS[id].hidden,
);
// Seconds past its countdown that a game's start waits for the bots it asked for, before it begins
// without the ones that haven't come.
export const BOT_WAIT = 30;

// What a game's bots are called, the first of them bot 1.
export function botName(index: number): string {
  return `bot ${index + 1}`;
}

// The bot that plays a mode's game: the bots app's name for it (modal-bots/bots/), and the worker
// it runs on.
export interface Plays {
  bot: string;
  worker: BotWorker;
}

// One of the bots a game brings, as set.
export interface GameBot {
  key: string; // what it's known by wherever its mode lists it among its players, come or not
  level: number;
  avatar: AvatarId; // the look it plays in, which the room draws for it as it's added
  id: string | null; // the player it came as, while it's in the room
}

// A change its room master makes to a game's bots: one more, one fewer, or one of them, by its
// place among them, to a level.
export type BotsChange = { bots: 'more' | 'fewer' } | { bot: number; level: number };

export function isBotsChange(v: unknown): v is BotsChange {
  if (typeof v !== 'object' || v === null) return false;
  if ('bots' in v) return v.bots === 'more' || v.bots === 'fewer';
  if (!('bot' in v) || !('level' in v) || !Number.isInteger(v.bot) || !Number.isInteger(v.level)) return false;
  return Number(v.level) >= BOT_LEVELS.least && Number(v.level) <= BOT_LEVELS.most;
}
