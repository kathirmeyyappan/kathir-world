// What every mode with a game shares (docs/game-modes.md), which freeplay has none of: so far its
// room master, the player who made the room, whose it is for as long as it lasts.
import type { PlayerState } from '../sim/types';
import type { GameState } from './index';
import { GameMode } from './mode';

// What everyone is told as the room closes behind its master.
export const MASTER_LEFT = 'the room master ended the room';

export class Game extends GameMode {
  // The room master's id. Null until the player who made the room is in it: someone they told the
  // code to can be seated first, and isn't its master for that.
  private master: string | null = null;

  override get state(): GameState {
    return { ...super.state, master: this.master };
  }

  override joined(player: PlayerState, made: boolean): void {
    if (!made || this.master !== null || player.bot) return;
    this.master = player.id;
    this.room.publish();
  }

  // The room is its master's: it goes when they do, however they went.
  override left(player: PlayerState): void {
    if (player.id === this.master) this.room.close(MASTER_LEFT);
  }
}
