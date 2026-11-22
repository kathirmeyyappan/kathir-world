// A room's game mode as its Room knows it (docs/game-modes.md): what the Room tells it of and asks
// it, with freeplay's answers. Freeplay is this class as it stands, the game with no rules of its
// own, and every other mode is it with some of these answered its own way. The Room never asks
// which mode it's in: it tells its mode what happened and takes its answers. What the client has
// to agree with isn't asked here: that's the mode's rules (rules.ts), read off the state it gives.
import type { SpawnArea } from '../content/regions';
import type { PlayerState } from '../sim/types';
import type { GameAction, GameModeId, GameState } from './index';

// What a mode can do to the room it's the game of.
export interface ModeRoom {
  tick(): number; // the room's tick as it stands
  random(): number; // the room's own dice, from 0 up to 1: a seeded room plays out the same
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

// What a join is made as the game stands: a player in it, a ghost (sim/types.ts `ghost`: in the
// room and not in the game), or nothing, turned away with why.
export type Joining = 'player' | 'ghost' | { away: string };

export class GameMode {
  constructor(
    readonly id: GameModeId,
    protected readonly room: ModeRoom,
  ) {}

  // The game as everyone in the room is told of it.
  get state(): GameState {
    return { mode: this.id, master: null, phase: null, until: null };
  }

  // What someone joining right now is. `bot`: it's a bot.
  joining(_bot: boolean): Joining {
    return 'player';
  }

  // Someone took a seat. `made`: theirs is the join that made the room.
  joined(_player: PlayerState, _made: boolean): void {}

  // Someone's seat went.
  left(_player: PlayerState): void {}

  // A player asked something of the game (a `game` message).
  asked(_player: PlayerState, _action: GameAction): void {}

  // A person or a bot died: by `killer`'s doing, or with null by their own or nobody's (a fall, the
  // ground past the edge, a crash).
  died(_victim: PlayerState, _killer: PlayerState | null): void {}

  // A player asked for a change to the game's settings (a `settings` message), which are its
  // mode's own to read.
  changed(_player: PlayerState, _change: unknown): void {}

  // A step of the room is beginning.
  step(): void {}
}
