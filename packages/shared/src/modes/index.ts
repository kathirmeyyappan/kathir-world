// The game modes a room can be created in (docs/game-modes.md). Freeplay is the game with no
// rules of its own: what a room is unless it's created as another, and what the room everyone
// shares always is. The rest are games, each with its own rules over the same world.
import type { GameBot } from './bots';
import type { Phase } from './game';
import { GameMode, type ModeRoom } from './mode';
import type { Command } from '../commands';
import { FREEPLAY_RULES, GHOST_ALLOWS, kindOf, type Rules } from './rules';
import { Racing } from './racing/referee';
import { RACING_RULES } from './racing/rules';
import { Shootout } from './shootout/referee';
import { SHOOTOUT_RULES } from './shootout/rules';

export * from './bots';
export { MASTER_LEFT, RESULTS_SECONDS, START_SECONDS, type Phase } from './game';
export type { GameMode, Joining, ModeRoom } from './mode';
export { FREEPLAY_DYING } from './rules';
export type { Dying, Rules, Side, Sight, Standing } from './rules';
export * from './racing/state';
export * from './shootout/state';

export const GAME_MODE_IDS = ['freeplay', 'racing', 'shootout'] as const;
export type GameModeId = (typeof GAME_MODE_IDS)[number];
export const FREEPLAY: GameModeId = 'freeplay';

export interface GameModeSpec {
  id: GameModeId;
  name: string; // what it's called wherever a mode is picked or named
  blurb: string; // the line under it where it's picked
}

export const GAME_MODES: Record<GameModeId, GameModeSpec> = {
  freeplay: {
    id: 'freeplay',
    name: 'Freeplay',
    blurb: 'No rules. Do whatever you want with friends!',
  },
  racing: {
    id: 'racing',
    name: 'Racing',
    blurb: 'Race against other players (and bots) across 1000+ unique routes on the map.',
  },
  shootout: {
    id: 'shootout',
    name: 'Shootout',
    blurb: 'Go head to head against players and AI bots in a team-based killing competition.',
  },
};

export function isGameModeId(v: unknown): v is GameModeId {
  return typeof v === 'string' && (GAME_MODE_IDS as readonly string[]).includes(v);
}

// What makes each mode's game, and its rules.
const GAMES: Record<GameModeId, new (id: GameModeId, room: ModeRoom) => GameMode> = {
  freeplay: GameMode,
  racing: Racing,
  shootout: Shootout,
};
const RULES: Record<GameModeId, Rules> = {
  freeplay: FREEPLAY_RULES,
  racing: RACING_RULES,
  shootout: SHOOTOUT_RULES,
};

// A room's game in mode `id`.
export function makeMode(id: GameModeId, room: ModeRoom): GameMode {
  return new GAMES[id](id, room);
}

// The rules of the mode a game is in, which the Room enforces and the client shows: each is asked
// of the game as it stands, `rulesOf(game).dying(game)`.
export function rulesOf(game: GameState): Rules {
  return RULES[game.mode];
}

// Why `command` is refused of `player` as `game` stands, or null: a ghost's by its own limits, which
// stand in for the game's since it isn't playing, and anyone else's by the game's rules. What the
// Room enforces and the client greys by.
export function refusal(game: GameState, player: { ghost: boolean }, command: Command): string | null {
  if (!player.ghost) return rulesOf(game).refuses(game, command);
  const kind = kindOf(command);
  return kind !== null && !GHOST_ALLOWS[kind] ? 'not as a ghost' : null;
}

// A room's game as everyone in it is told of it.
export interface GameState {
  mode: GameModeId; // set as the room is created, for good
  // The room master's id (game.ts). Null in freeplay, which has none, and in a room whose maker
  // isn't in it yet.
  master: string | null;
  phase: Phase | null; // where the game is (game.ts); null in freeplay, which has no game to be anywhere in
  until: number | null; // the tick the phase's clock runs out at, where it has one: the start's countdown
  bots: GameBot[]; // the bots its game brings (bots.ts), as set: the first is bot 1. None in freeplay
}

// What a player asks of the game (a `game` message): its master's to ask, starting it and ending it.
export const GAME_ACTIONS = ['start', 'end'] as const;
export type GameAction = (typeof GAME_ACTIONS)[number];

export function isGameAction(v: unknown): v is GameAction {
  return typeof v === 'string' && (GAME_ACTIONS as readonly string[]).includes(v);
}
