// A room's game mode as its Room knows it (docs/game-modes.md): what the Room tells it of and asks
// it, with freeplay's answers. Freeplay is this class as it stands, the game with no rules of its
// own, and every other mode is it with some of these answered its own way. The Room never asks
// which mode it's in: it tells its mode what happened and takes its answers.
import type { SpawnArea } from '../content/regions';
import type { PlayerState } from '../sim/types';
import type { GameAction, GameModeId, GameState } from './index';

// What a mode can do to the room it's the game of.
export interface ModeRoom {
  tick(): number; // the room's tick as it stands
  publish(): void; // tells everyone in the room the game's state as it stands
  close(reason: string): void; // ends the room for everyone in it, who are told why
  people(): PlayerState[]; // everyone seated who isn't a bot
  // A new body for `player` somewhere in `areas`, as whoever comes in is given: a full life, nothing
  // held or worn, in the look they had if it's one on foot. Returns them in it.
  embody(player: PlayerState, areas: SpawnArea[]): PlayerState;
  dropBots(): void; // every living bot drops dead where it stands, as /kill-bots does
  // The world as a room starts with it: no karts, no frost, no hearts left lying, and no bots, the
  // dead ones going at once.
  clear(): void;
}

export class GameMode {
  constructor(
    readonly id: GameModeId,
    protected readonly room: ModeRoom,
  ) {}

  // The game as everyone in the room is told of it.
  get state(): GameState {
    return { mode: this.id, master: null, phase: null, until: null };
  }

  // Why a join is turned away right now, or null. `bot`: it's a bot's.
  turnsAway(_bot: boolean): string | null {
    return null;
  }

  // Someone took a seat. `made`: theirs is the join that made the room.
  joined(_player: PlayerState, _made: boolean): void {}

  // Someone's seat went.
  left(_player: PlayerState): void {}

  // A player asked something of the game (a `game` message).
  asked(_player: PlayerState, _action: GameAction): void {}

  // A step of the room is beginning.
  step(): void {}
}
