// The game modes a room can be created in (docs/game-modes.md). Freeplay is the game with no
// rules of its own: what a room is unless it's created as another, and what the room everyone
// shares always is. The rest are games, each with its own rules over the same world.
import { Game } from './game';
import { GameMode, type ModeRoom } from './mode';

export { MASTER_LEFT } from './game';
export type { GameMode, ModeRoom } from './mode';

export const GAME_MODE_IDS = ['freeplay', 'racing', 'shootout'] as const;
export type GameModeId = (typeof GAME_MODE_IDS)[number];
export const FREEPLAY: GameModeId = 'freeplay';

export interface GameModeSpec {
  id: GameModeId;
  name: string; // what it's called wherever a mode is picked or named
  blurb: string; // the line under it where it's picked
  playable: boolean; // whether its game can be played: one that can't is offered in dev alone
}

export const GAME_MODES: Record<GameModeId, GameModeSpec> = {
  freeplay: {
    id: 'freeplay',
    name: 'Freeplay',
    blurb: 'No rules. Do whatever you want with friends!',
    playable: true,
  },
  racing: {
    id: 'racing',
    name: 'Racing',
    blurb: 'Race against other players in a 3 round competition.',
    playable: false,
  },
  shootout: {
    id: 'shootout',
    name: 'Shootout',
    blurb: 'Split up into even teams and get as many kills as you can. Team with the most kills wins.',
    playable: false,
  },
};

export function isGameModeId(v: unknown): v is GameModeId {
  return typeof v === 'string' && (GAME_MODE_IDS as readonly string[]).includes(v);
}

// What makes each mode's game. Racing and Shootout are what every game shares and no more, until
// their own are built.
const GAMES: Record<GameModeId, new (id: GameModeId, room: ModeRoom) => GameMode> = {
  freeplay: GameMode,
  racing: Game,
  shootout: Game,
};

// A room's game in mode `id`.
export function makeMode(id: GameModeId, room: ModeRoom): GameMode {
  return new GAMES[id](id, room);
}

// A room's game as everyone in it is told of it.
export interface GameState {
  mode: GameModeId; // set as the room is created, for good
  // The room master's id (game.ts). Null in freeplay, which has none, and in a room whose maker
  // isn't in it yet.
  master: string | null;
}
