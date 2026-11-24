// What every mode with a game shares (docs/game-modes.md), which freeplay has none of: its room
// master, the player who made the room, whose it is for as long as it lasts, the flow the master
// runs it through, and the bots it brings. A lobby, which is freeplay but for the game waiting to
// be started; the start, counted down; the game; and the lobby again.
import { RESPAWN_AREAS, SPAWN_AREAS } from '../content/regions';
import type { AvatarId } from '../sim/avatars';
import { TICK_RATE } from '../sim/constants';
import type { PlayerState } from '../sim/types';
import {
  BOT_LEVELS,
  BOT_LOOKS,
  BOT_WAIT,
  MOST_BOTS,
  botName,
  isBotsChange,
  type BotsChange,
  type GameBot,
  type Plays,
} from './bots';
import type { GameAction, GameState } from './index';
import { GameMode, type Joiner, type Joining } from './mode';
import { kindOf, type Allowed, type Dying, type Rules } from './rules';

// What everyone is told as the room closes behind its master.
export const MASTER_LEFT = 'the room master ended the room';
// Seconds from the master's START to the game, counted down for everyone.
export const START_SECONDS = 5;
// Seconds a game's results stand before everyone is back in the lobby.
export const RESULTS_SECONDS = 10;

// Where a game is: waiting in its lobby, counting down to its start, being played, or over, its
// results standing.
export type Phase = 'lobby' | 'starting' | 'playing' | 'results';

// What a mode says of its own game, where its answer is a value.
export interface Playing {
  // The commands it allows, from its start until its lobby is back. Its lobby is freeplay's, where
  // nothing is refused.
  allows: Allowed;
  // What no hearts means while it's played.
  dying: Dying;
}

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
    side: () => null,
    standings: () => [],
    sees: () => 'plain',
    track: () => null,
    seated: () => false,
    held: () => false,
  };
}

export abstract class Game extends GameMode {
  // The room master's id. Null until the player who made the room is in it: someone they told the
  // code to can be seated first, and isn't its master for that.
  private master: string | null = null;
  private phase: Phase = 'lobby';
  private until: number | null = null; // the tick the phase runs out at, where it's on a clock
  // The bots it brings (bots.ts), as set: the first is bot 1. And of those its last start asked
  // for, the ones that aren't here, each by the name it's to come as: still to come, or gone since.
  protected bots: GameBot[] = [];
  private readonly awaited = new Map<string, GameBot>();
  private givenUp = 0; // the tick from which the start no longer waits for them
  private keys = 0; // how many bots it has ever had, for the next one's key

  // The bot that plays its game.
  protected abstract readonly plays: Plays;

  override get state(): GameState {
    return {
      ...super.state,
      master: this.master,
      phase: this.phase,
      until: this.until,
      bots: this.bots.map((bot) => ({ ...bot })),
    };
  }

  // A game is those who were there as it began, and the bots it asked for itself, whenever each
  // comes until it's over: the lobby's bots die as it starts and no other is seated meanwhile, and
  // a person who comes once it has begun watches it as a ghost until the lobby is back. One of its
  // own bots that comes once it's over has missed the game it was asked for.
  override joining({ bot, name }: Joiner): Joining {
    const lobby = this.phase === 'lobby';
    if (!bot) return lobby || this.phase === 'starting' ? 'player' : 'ghost';
    if (this.awaits(name)) return lobby || this.phase === 'results' ? { away: 'its game is over' } : 'player';
    return lobby ? 'player' : { away: 'a game is on' };
  }

  // Whoever made the room is its master, and a bot the game asked for has come: into the game, if
  // that's begun without it.
  override joined(player: PlayerState, made: boolean): void {
    const bot = player.bot ? this.awaited.get(player.name) : undefined;
    if (bot) {
      this.awaited.delete(player.name);
      bot.id = player.id;
      if (this.playing) this.enter(player);
    } else if (made && this.master === null && !player.bot) this.master = player.id;
    else return;
    this.room.publish();
  }

  // The room is its master's: it goes when they do, however they went. A bot of the game's that
  // goes is still one of its bots: let back in for as long as the game lasts, and to come again
  // with the next.
  override left(player: PlayerState): void {
    const bot = this.botOf(player.id);
    if (bot) {
      bot.id = null;
      this.awaited.set(player.name, bot);
      this.room.publish();
    }
    if (player.id === this.master) this.room.close(MASTER_LEFT);
  }

  // A person always comes back from the dead, and so does a bot of the game's own from its start
  // until the lobby is back: it's in the game as anyone is.
  override revives(player: PlayerState): boolean {
    return super.revives(player) || (this.phase !== 'lobby' && this.botOf(player.id) !== undefined);
  }

  // The game is the master's to start, from its lobby once it's set up to, and to end, from
  // anywhere else.
  override asked(player: PlayerState, action: GameAction): void {
    if (player.id !== this.master) return;
    if (action === 'start' && this.phase === 'lobby' && this.ready() === null) this.start();
    else if (action === 'end' && this.phase !== 'lobby') this.toLobby();
  }

  // Its settings are the master's to change, in the lobby: its bots, as every game's are, and
  // its mode's own.
  override changed(player: PlayerState, change: unknown): void {
    if (player.id !== this.master || this.phase !== 'lobby') return;
    if (isBotsChange(change) ? this.setBots(change) : this.set(change)) this.room.publish();
  }

  // Why the game can't be started as it's set up, or null: its mode's rule (rules.ts `starts`).
  protected ready(): string | null {
    return null;
  }

  // Takes a change to the mode's own settings. False: it isn't one.
  protected set(_change: unknown): boolean {
    return false;
  }

  // One of its bots is added, at the level of the last there is and in a look of its own, or
  // taken away, or set to a level. False: nothing came of it.
  private setBots(change: BotsChange): boolean {
    if ('level' in change) {
      const bot = this.bots.at(change.bot);
      if (!bot || change.bot < 0) return false;
      bot.level = change.level;
    } else if (change.bots === 'more') {
      if (this.bots.length >= MOST_BOTS) return false;
      const bot = {
        key: `bot:${this.keys++}`,
        level: this.bots.at(-1)?.level ?? BOT_LEVELS.first,
        avatar: this.look(),
        id: null,
      };
      this.bots.push(bot);
      this.added(bot);
    } else {
      const bot = this.goes();
      if (!bot) return false;
      this.bots = this.bots.filter((other) => other !== bot);
      this.dropped(bot);
    }
    return true;
  }

  // A look for a bot joining the others: one that none of them wears and nobody here does, while
  // there's one, by the room's dice.
  private look(): AvatarId {
    const worn = new Set([...this.room.people(), ...this.bots].map((player) => player.avatar));
    const free = BOT_LOOKS.filter((look) => !worn.has(look));
    const from = free.length > 0 ? free : BOT_LOOKS;
    return from[Math.floor(this.room.random() * from.length)];
  }

  // A bot was added to those the game brings, or taken from them: its mode's to follow, where it
  // lists its bots among its players.
  protected added(_bot: GameBot): void {}
  protected dropped(_bot: GameBot): void {}

  // The bot that goes as one is taken away: the last added, unless its mode says another.
  protected goes(): GameBot | undefined {
    return this.bots.at(-1);
  }

  // The game's bot that the player `id` is, if they're one.
  protected botOf(id: string): GameBot | undefined {
    return this.bots.find((bot) => bot.id === id);
  }

  // Its bots are asked for as its start is counted down, each by the name it's to come as and in
  // its look; one still here from somewhere else isn't asked for again.
  private gather(): void {
    this.awaited.clear();
    this.bots.forEach((bot, i) => {
      bot.id = null;
      if (this.room.call(this.plays, botName(i), bot.avatar)) this.awaited.set(botName(i), bot);
    });
    this.givenUp = this.room.tick() + (START_SECONDS + BOT_WAIT) * TICK_RATE;
  }

  // Whether a bot called `name` is one the game asked for that isn't here.
  private awaits(name: string): boolean {
    return this.awaited.has(name);
  }

  // Whether every bot the game asked for has come, or been waited for long enough: its start
  // waits for them.
  private gathered(): boolean {
    return this.awaited.size === 0 || this.room.tick() >= this.givenUp;
  }

  // The clock a phase is on runs out: the countdown into the game, once whoever it waits for is
  // here (with no clock meanwhile); the game, where its mode gives it one, into its results; and
  // those back into the lobby.
  override step(): void {
    if (this.until !== null && this.room.tick() < this.until) return;
    if (this.phase === 'starting') {
      if (this.gathered()) this.begin();
      else if (this.until !== null) this.to('starting');
    } else if (this.until === null) return;
    else if (this.phase === 'playing') this.finish();
    else if (this.phase === 'results') this.toLobby();
  }

  // The game is over, by its clock or by its mode's own rule: its results stand before the lobby.
  protected finish(): void {
    this.to('results', this.room.tick() + RESULTS_SECONDS * TICK_RATE);
  }

  // Whether the game is being played: what comes of a death counts only while it is.
  protected get playing(): boolean {
    return this.phase === 'playing';
  }

  // Takes `player` into the game: in a new body where it starts them, their kills and deaths
  // counted from nothing. Returns them in it.
  protected enter(player: PlayerState): PlayerState {
    const body = this.place(player);
    body.kills = body.deaths = 0;
    return body;
  }

  // Puts `player` where they start the game, in a new body: where anyone comes in, unless the mode
  // has somewhere of its own. Returns them in it.
  protected place(player: PlayerState): PlayerState {
    return this.room.embody(player, SPAWN_AREAS);
  }

  // How many seconds the game runs before it's over, or null: until its room master ends it.
  protected runs(): number | null {
    return null;
  }

  private start(): void {
    this.room.dropBots();
    this.to('starting', this.room.tick() + START_SECONDS * TICK_RATE);
    this.gather();
  }

  // The game begins: on a world with nothing left on it from the lobby, with everyone here taken
  // into it. A bot of its own still to come is taken in as it does.
  protected begin(): void {
    this.room.clear();
    for (const player of this.room.everyone()) this.enter(player);
    const seconds = this.runs();
    this.to('playing', seconds === null ? null : this.room.tick() + seconds * TICK_RATE);
  }

  // Back to the lobby, as everyone comes back from the dead: a new body each, on a world with
  // nothing left on it from the game, its own bots gone with it. Those of them that never came
  // stay awaited, and are turned away if they come once it's over.
  protected toLobby(): void {
    for (const bot of this.bots) bot.id = null;
    this.room.dropBots();
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
