// A room's game mode as its Room knows it (docs/game-modes.md): what the Room tells it of and asks
// it, with freeplay's answers. Freeplay is this class as it stands, the game with no rules of its
// own, and every other mode is it with some of these answered its own way. The Room never asks
// which mode it's in: it tells its mode what happened and takes its answers.
import type { PlayerState } from '../sim/types';
import type { GameModeId, GameState } from './index';

// What a mode can do to the room it's the game of.
export interface ModeRoom {
  publish(): void; // tells everyone in the room the game's state as it stands
  close(reason: string): void; // ends the room for everyone in it, who are told why
}

export class GameMode {
  constructor(
    readonly id: GameModeId,
    protected readonly room: ModeRoom,
  ) {}

  // The game as everyone in the room is told of it.
  get state(): GameState {
    return { mode: this.id, master: null };
  }

  // Someone took a seat. `made`: theirs is the join that made the room.
  joined(_player: PlayerState, _made: boolean): void {}

  // Someone's seat went.
  left(_player: PlayerState): void {}
}
