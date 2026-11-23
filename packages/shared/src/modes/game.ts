// What every mode with a game shares (docs/game-modes.md), which freeplay has none of: its room
// master, the player who made the room, whose it is for as long as it lasts, and the flow the
// master runs it through. A lobby, which is freeplay but for the game waiting to be started; the
// start, counted down; the game; and the lobby again.
import { RESPAWN_AREAS, SPAWN_AREAS } from '../content/regions';
import { TICK_RATE } from '../sim/constants';
import type { PlayerState } from '../sim/types';
import type { GameAction, GameState } from './index';
import { GameMode, type Joining } from './mode';
import { FREEPLAY_DYING, kindOf, type Allowed, type Dying, type Rules } from './rules';

// What everyone is told as the room closes behind its master.
export const MASTER_LEFT = 'the room master ended the room';
// Seconds from the master's START to the game, counted down for everyone.
export const START_SECONDS = 5;

// Where a game is: waiting in its lobby, counting down to its start, or being played.
export type Phase = 'lobby' | 'starting' | 'playing';

// What a mode says of its own game, where its answer is a value.
export interface Playing {
  // The commands it allows, from its start until its lobby is back. Its lobby is freeplay's, where
  // nothing is refused.
  allows: Allowed;
  // What no hearts means while it's played.
  dying: Dying;
}

// What every game is unless its mode says otherwise: everything allowed but the bots' commands, a
// game being people alone, and no hearts what it is in freeplay.
export const ANY_GAME: Playing = {
  allows: {
    speedy: true,
    weapon: true,
    gear: true,
    unequip: true,
    look: true,
    dragon: true,
    colour: true,
    bot: false,
    'kill-bots': false,
    kart: true,
    teleport: true,
  },
  dying: FREEPLAY_DYING,
};

// What no hearts means in a game's lobby, which is somewhere to wait: a body lies long enough for
// its player to see it, and they're back with nothing put over the view.
const LOBBY_DYING: Dying = { seconds: 3, screen: false };

// A game's rules: its lobby's, the same for every game, and what its mode says of its `own` game.
export function gameRules(own: Playing): Rules {
  return {
    refuses(game, command) {
      if (game.phase === null || game.phase === 'lobby') return null;
      const kind = kindOf(command);
      return kind !== null && !own.allows[kind] ? 'not during a game' : null;
    },
    dying: (game) => (game.phase === 'playing' ? own.dying : LOBBY_DYING),
    starts: () => null,
  };
}

export class Game extends GameMode {
  // The room master's id. Null until the player who made the room is in it: someone they told the
  // code to can be seated first, and isn't its master for that.
  private master: string | null = null;
  private phase: Phase = 'lobby';
  private until: number | null = null; // the tick the start's countdown runs out at, while it runs

  override get state(): GameState {
    return { ...super.state, master: this.master, phase: this.phase, until: this.until };
  }

  // A game is people alone, and those who were there as it began: the lobby's bots die as it
  // starts and none is seated until it's over, and a person who comes once it's being played
  // watches it as a ghost until the lobby is back.
  override joining(bot: boolean): Joining {
    if (this.phase === 'lobby') return 'player';
    if (bot) return { away: 'a game is on' };
    return this.phase === 'playing' ? 'ghost' : 'player';
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

  // The game is the master's to start, from its lobby once it's set up to, and to end, from
  // anywhere else.
  override asked(player: PlayerState, action: GameAction): void {
    if (player.id !== this.master) return;
    if (action === 'start' && this.phase === 'lobby' && this.ready() === null) this.start();
    else if (action === 'end' && this.phase !== 'lobby') this.toLobby();
  }

  // Its settings are the master's to change, in the lobby.
  override changed(player: PlayerState, change: unknown): void {
    if (player.id !== this.master || this.phase !== 'lobby') return;
    if (this.set(change)) this.room.publish();
  }

  // Why the game can't be started as it's set up, or null: its mode's rule (rules.ts `starts`).
  protected ready(): string | null {
    return null;
  }

  // Takes a change to the mode's own settings. False: it isn't one.
  protected set(_change: unknown): boolean {
    return false;
  }

  override step(): void {
    if (this.phase === 'starting' && this.room.tick() >= this.until!) this.begin();
  }

  private start(): void {
    this.room.dropBots();
    this.to('starting', this.room.tick() + START_SECONDS * TICK_RATE);
  }

  // The game begins: on a world with nothing left on it from the lobby, everyone in a new body,
  // their kills and deaths counted from nothing.
  private begin(): void {
    this.room.clear();
    for (const player of this.room.people()) {
      const body = this.room.embody(player, SPAWN_AREAS);
      body.kills = body.deaths = 0;
    }
    this.to('playing');
  }

  // Back to the lobby, as everyone comes back from the dead: a new body each, on a world with
  // nothing left on it from the game.
  protected toLobby(): void {
    this.room.clear();
    for (const player of this.room.people()) this.room.embody(player, RESPAWN_AREAS);
    this.to('lobby');
  }

  private to(phase: Phase, until: number | null = null): void {
    this.phase = phase;
    this.until = until;
    this.room.publish();
  }
}
