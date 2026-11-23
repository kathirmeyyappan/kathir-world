// A room: the authoritative simulation for one set of players plus the cubes.
// Transport-agnostic so the Node server (WebSockets) and the browser's offline mode (a loopback)
// can both host one. Ticks on a fixed timestep and broadcasts a snapshot after every tick.
import { CUBE_IDS } from './content/cubes';
import { CORPSE_DROP, PICKUP_AREAS } from './content/pickups';
import { RESPAWN_AREAS, SPAWN_AREAS, type SpawnArea } from './content/regions';
import { FREEPLAY, makeMode, refusal, rulesOf, type Dying, type GameMode, type GameModeId } from './modes';
import {
  isClientMessage,
  type ClientMessage,
  type CubeSnapshot,
  type PickupSnapshot,
  type ServerMessage,
} from './protocol';
import {
  MAX_CHAT_LENGTH,
  EYE_HEIGHT,
  MAX_INPUTS_PER_TICK,
  MAX_INPUT_QUEUE,
  INPUT_WAIT_TICKS,
  MAX_NAME_LENGTH,
  MAX_BOTS,
  MAX_PLAYERS,
  RENAME_SECONDS,
  CHILL_SECONDS,
  NAMED_COLORS,
  SPEEDY_SECONDS,
  STEP_UP,
  TICK_DT,
  TICK_RATE,
} from './sim/constants';
import { TELEPORT_USAGE, parseCommand, type BotCallArgs, type Command } from './commands';
import { AVATARS, eyeOf, poundOf, poundPower, strikeOf, type AvatarId } from './sim/avatars';
import { classOf, heartsOf } from './sim/classes';
import { findStrikeHits, resolveFire, strikeCone } from './sim/combat';
import { frostDisc, sprayFrost } from './sim/frost';
import { PositionHistory, rewindTick } from './sim/rewind';
import {
  OUT_OF_BOUNDS_DAMAGE,
  OUT_OF_BOUNDS_SECONDS,
  REGEN_RATE,
  applyDamage,
  damageFor,
  fallDamage,
} from './sim/health';
import {
  BOTS,
  BOT_MAX_SECONDS,
  botArguments,
  botRequest,
  type BotId,
  type BotPlacement,
  type BotRequest,
} from './sim/bots';
import { defaultBotsFor } from './sim/defaultBots';
import { GEAR, createGear, gearHelp, type GearId } from './sim/gear';
import { ITEMS, createItem, itemHelp, type Element, type ItemAction, type ItemId, type ItemSpec } from './sim/items';
import { createCubes, stepCubes } from './sim/cubes';
import { onOutsideGround } from './sim/ground';
import { randomPointInRegion } from './sim/regions';
import {
  clearDrops,
  createPickups,
  dropPickup,
  stepPickups,
  takePickups,
  type PickupArea,
  type PickupField,
} from './sim/pickups';
import { becomeAvatar, createPlayer, stepPlayer } from './sim/player';
import { placeWalker, throwWalker } from './sim/walker';
import { createRng, type Rng } from './sim/rng';
import type { CubeState, InputFrame, PlayerState, Vec3 } from './sim/types';
import { Structures } from './sim/collision';
import { STRUCTURES } from './content/structures';
import { DOOR_DEBOUNCE_SECONDS, DOOR_REACH, lookVector } from './sim/doors';
import { Garage } from './sim/vehicles/garage';
import { courseOf, type Track } from './sim/tracks';
import { KARTS } from './sim/vehicles/karts';
import { CAPSULE_TOP } from './sim/health';

// Shared has no DOM or Node lib; both runtimes provide these.
declare function setInterval(cb: () => void, ms: number): unknown;
declare function clearInterval(handle: unknown): void;

const SPAWN_WALL_MARGIN = 3;
const SPAWN_MARGIN = 1; // metres a spawn keeps inside its area: more than a body's radius
// How long a dead bot lies where it fell before its seat is dropped: a bot is never brought back.
// A person is, when the room's game says (modes/rules.ts `Dying`).
const BOT_CORPSE_TICKS = 5 * TICK_RATE;
const OUT_OF_BOUNDS_STEPS = Math.round(OUT_OF_BOUNDS_SECONDS * TICK_RATE);
const SPAWN_CUBE_MARGIN = 4;
const POUND_HEIGHT = 1; // metres over or under where a ground pound lands that its reach goes: a jump clears it
const CALLED_BOT_RANGE = 50; // metres from the caller, across the floor, that a called bot spawns within
const SPECTATOR_DISTANCE = 10; // metres from someone in the game, across the floor, that a ghost comes in

export interface ClientLink {
  send(msg: ServerMessage): void;
  close?(reason: string): void; // the room is done with this client; the reason reaches it as the close reason
}

interface Seat {
  lastShotTick: number;
  lastActTick: number; // the class's own actions share one cooldown
  lastRenameTick: number;
  held: ItemAction[]; // last frame's actions, for the press edge of tap ones
  diedTick: number | null;
  outSteps: number; // steps taken stood on the ground past the edge, one heart lost every OUT_OF_BOUNDS_STEPS
  state: PlayerState;
  link: ClientLink;
  queue: InputFrame[];
  owed: number; // ticks held waiting for a late frame, not yet made up (INPUT_WAIT_TICKS)
}

export interface JoinOptions extends BotPlacement {
  bot?: boolean; // the client says it's a bot (the browser never does; the bot framework always does)
  room?: string; // the public room code the client asked for; bots called from here join it
  // A bot's spawn and avatar are honoured as given, its look fixed for the run. A person always
  // spawns at random, in the avatar if it's one on foot they could switch to by command.
  color?: string; // one of NAMED_COLORS' names, for the standard body; else one of them at random
  made?: boolean; // theirs is the join that made the room, as its host knows it
}

// Starts a bot for this room; the host wires it to Modal. Rejects with a message on failure.
export type BotSpawner = (request: BotRequest) => Promise<void>;

export interface RoomOptions {
  mode?: GameModeId; // the game it's created in (modes/); freeplay unless given
  seed?: number;
  structures?: Structures;
  onEmpty?: () => void;
  // The room ended itself (its game's doing: its master left), everyone in it told why. Its host
  // seats nobody in it again.
  onEnd?: (reason: string) => void;
  log?: (msg: string) => void;
  spawnBot?: BotSpawner; // absent: bots can't be called from this room
  pickupAreas?: PickupArea[]; // where pickups float; the world's own (content/pickups.ts) by default
}

export class Room {
  readonly id: string;
  readonly structures: Structures;
  readonly garage: Garage; // its karts
  tick = 0;

  private readonly seats = new Map<string, Seat>();
  private readonly history = new PositionHistory(); // where everyone was, for lag compensation
  private readonly cubes: CubeState[];
  private readonly pickups: PickupField;
  private readonly rng: Rng;
  private readonly mode: GameMode; // its game (modes/)
  private ended: string | null = null; // why it ended itself, once it has
  private readonly onEmpty?: () => void;
  private readonly onEnd?: (reason: string) => void;
  private readonly log: (msg: string) => void;
  private readonly spawnBot?: BotSpawner;
  private publicName: string | null = null; // the room code clients asked for, learnt at the first join
  private readonly doorSwung = new Map<string, number>(); // the tick each door last swung
  private timer: unknown = null;
  private nextPlayerId = 1;

  constructor(id: string, opts: RoomOptions = {}) {
    this.id = id;
    this.mode = makeMode(opts.mode ?? FREEPLAY, {
      tick: () => this.tick,
      random: () => this.rng(),
      publish: () => this.broadcast({ t: 'game', game: this.mode.state }),
      close: (reason) => this.end(reason),
      people: () => this.players.filter((p) => !p.bot),
      everyone: () => this.players.filter((p) => !p.bot || !p.dead),
      call: (bot, name, avatar) => {
        if (!this.spawnBot || !this.publicName) return false;
        const req: BotRequest = {
          bot,
          worker: 'dumb',
          room: this.publicName,
          seconds: BOT_MAX_SECONDS,
          caller: 'room',
          name,
          avatar,
        };
        this.spawnBot(req).catch((err: unknown) => {
          this.log(`the game's bot ${bot} for ${this.id}: ${err instanceof Error ? err.message : String(err)}`);
        });
        return true;
      },
      embody: (player, areas) => {
        const seat = this.seats.get(player.id)!;
        this.rebody(seat, this.spawnPoint(areas));
        return seat.state;
      },
      seat: (player, at, yaw) => {
        const seat = this.seats.get(player.id)!;
        this.rebody(seat, { x: at.x, y: at.y + EYE_HEIGHT, z: at.z });
        this.garage.park(seat.state, 'standard', at, yaw);
        return seat.state;
      },
      haunt: (player) => {
        const seat = this.seats.get(player.id)!;
        const at = { ...player.pos };
        this.garage.take(seat.state);
        this.rebody(seat, at);
        seat.state.ghost = true;
        return seat.state;
      },
      kartOf: (player) => this.garage.list.find((k) => k.id === player.riding) ?? null,
      dropBots: () => this.dropBots(),
      clear: () => this.clear(),
    });
    this.structures = opts.structures ?? new Structures(STRUCTURES); // its own: doors swing per room
    this.garage = new Garage(this.structures);
    this.rng = createRng(opts.seed ?? (Math.random() * 2 ** 32) >>> 0);
    this.cubes = createCubes(CUBE_IDS, this.rng);
    this.pickups = createPickups(opts.pickupAreas ?? PICKUP_AREAS, this.rng);
    this.onEmpty = opts.onEmpty;
    this.onEnd = opts.onEnd;
    this.log = opts.log ?? (() => {});
    this.spawnBot = opts.spawnBot;
  }

  get playerCount(): number {
    return this.seats.size;
  }

  // People, not bots. A room lives while it has one of these.
  get humanCount(): number {
    let n = 0;
    for (const seat of this.seats.values()) if (!seat.state.bot) n++;
    return n;
  }

  get botCount(): number {
    return this.seats.size - this.humanCount;
  }

  get players(): PlayerState[] {
    return [...this.seats.values()].map((s) => s.state);
  }

  // Everyone the world can touch: all but the ghosts, who are in the room and not in it.
  private get bodies(): PlayerState[] {
    return this.players.filter((p) => !p.ghost);
  }

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => this.step(), 1000 / TICK_RATE);
  }

  // Stops ticking and disconnects whoever is still seated, telling them why (bots, when the last
  // person left).
  stop(reason = 'room closed'): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    for (const seat of this.seats.values()) seat.link.close?.(reason);
    this.seats.clear();
  }

  // The room is over, by its own game's doing: everyone in it is told why and its host that it's
  // done with, and nobody is seated in it again.
  private end(reason: string): void {
    this.ended = reason;
    this.stop(reason);
    this.onEnd?.(reason);
  }

  // Seats a new player and sends them the world. Returns null (after an error message) when
  // the room is full, or when a bot would be alone: bots don't keep a room open, so one that
  // arrives after everyone left (a slow spawn) must not start a room that nothing would close.
  join(rawName: string, link: ClientLink, opts: JoinOptions = {}): string | null {
    if (this.ended !== null) {
      link.send({ t: 'error', message: this.ended });
      return null;
    }
    if (this.seats.size >= MAX_PLAYERS) {
      link.send({ t: 'error', message: 'room is full' });
      return null;
    }
    if (opts.bot && this.botCount >= MAX_BOTS) {
      link.send({ t: 'error', message: 'enough bots here' });
      return null;
    }
    if (opts.bot && this.humanCount === 0) {
      link.send({ t: 'error', message: 'no one here' });
      return null;
    }
    if (opts.bot && opts.avatar && !classOf(opts.avatar).bots) {
      link.send({ t: 'error', message: `bots can't be ${opts.avatar}` });
      return null;
    }
    const name = sanitizeName(rawName);
    const joining = this.mode.joining({ bot: !!opts.bot, name });
    if (typeof joining === 'object') {
      link.send({ t: 'error', message: joining.away });
      return null;
    }
    const ghost = joining === 'ghost';
    const id = `p${this.nextPlayerId++}`;
    const at =
      opts.bot && opts.spawn
        ? this.placedSpawn(opts.spawn)
        : ghost
          ? this.besideSomeone()
          : this.spawnPoint(SPAWN_AREAS);
    const names = Object.keys(NAMED_COLORS);
    const named =
      opts.color && Object.hasOwn(NAMED_COLORS, opts.color) ? opts.color : names[Math.floor(this.rng() * names.length)];
    const color = NAMED_COLORS[named];
    const state = this.newBody(id, name, color, at, !!opts.bot);
    state.ghost = ghost;
    if (opts.bot && opts.avatar) {
      becomeAvatar(state, opts.avatar);
      state.avatarLocked = true;
    }
    const look = !opts.bot && opts.avatar ? AVATARS[opts.avatar] : null;
    if (look && look.class === 'walker' && look.command !== null) becomeAvatar(state, look.id);
    if (opts.room && !this.publicName) this.publicName = opts.room;
    this.seats.set(id, {
      state,
      link,
      queue: [],
      owed: 0,
      lastShotTick: -Infinity,
      lastActTick: -Infinity,
      lastRenameTick: -Infinity,
      held: [],
      diedTick: null,
      outSteps: 0,
    });
    link.send({
      t: 'welcome',
      id,
      room: this.id,
      game: this.mode.state,
      tick: this.tick,
      players: this.players,
      cubes: this.cubeSnapshot(),
      pickups: this.pickupSnapshot(),
      doors: this.structures.doorIds.map((door) => ({ id: door, open: this.structures.isOpen(door) })),
      frost: this.structures.frost.list(),
      karts: this.garage.list,
    });
    this.broadcast({ t: 'join', p: state }, id);
    this.log(`${state.name} (${id}) joined ${this.id}${state.bot ? ' as a bot' : ''}, ${this.seats.size} online`);
    this.mode.joined(state, !!opts.made);
    if (!state.bot && this.humanCount === 1) this.addDefaultBots();
    return id;
  }

  // The room's starting bots (see sim/defaultBots.ts), spawned once, when the first person
  // arrives. Needs a host that can spawn and the room's public name, like callBot.
  private defaultBotsAdded = false;
  private addDefaultBots(): void {
    if (this.defaultBotsAdded || !this.spawnBot || !this.publicName) return;
    this.defaultBotsAdded = true;
    const bots = defaultBotsFor(this.publicName);
    if (bots.length === 0) return;
    this.broadcast({ t: 'system', text: `${botRollCall(bots.map((b) => BOTS[b.bot].playerName))} on the way` });
    for (const { bot, seconds, targets, ...placement } of bots) {
      const req = botRequest({ bot, room: this.publicName, seconds, caller: 'room', ...placement }, targets);
      this.spawnBot(req).catch((err: unknown) => {
        this.log(`default bot ${bot} for ${this.id}: ${err instanceof Error ? err.message : String(err)}`);
      });
    }
  }

  // The seat goes, its client gone or its bot dead long enough, and a dead one's body with it.
  leave(id: string): void {
    const seat = this.seats.get(id);
    if (!seat) return;
    this.seats.delete(id);
    this.garage.getOut(seat.state);
    if (seat.state.dead) this.buryBody(seat.state);
    this.broadcast({ t: 'leave', id, name: seat.state.name });
    this.log(`${seat.state.name} (${id}) left ${this.id}, ${this.seats.size} online`);
    this.mode.left(seat.state);
    if (this.ended === null && this.humanCount === 0) this.onEmpty?.(); // bots alone don't keep a room open
  }

  // A dead body goes, which every client sees as a poof, and leaves CORPSE_DROP on whatever it was
  // lying on (a long body, at points along it), each theirs to look at.
  private buryBody(body: PlayerState): void {
    const from = { avatar: body.avatar, color: body.color };
    for (const at of classOf(body.avatar).lies(body, this.structures))
      dropPickup(this.pickups, CORPSE_DROP, at, this.rng, from);
  }

  // Karts are held to the track in play, where the room's game has one: the garage is handed it as
  // a course whenever it changes.
  private track: Track | null = null;
  private holdToTrack(): void {
    const game = this.mode.state;
    const track = rulesOf(game).track(game);
    if (track === this.track) return;
    this.track = track;
    this.garage.course = track && courseOf(track);
  }

  // What no hearts means for a person as the room's game stands.
  private get dying(): Dying {
    const game = this.mode.state;
    return rulesOf(game).dying(game);
  }

  // A dead person comes back, in a new body somewhere in RESPAWN_AREAS, the one they left buried.
  private respawn(seat: Seat): void {
    this.buryBody(seat.state);
    this.rebody(seat, this.spawnPoint(RESPAWN_AREAS));
  }

  // A new body for whoever has a seat (a person, or a bot of the game's own) at `at`, its eye
  // point: the same seat, name, colour and score, and otherwise as whoever comes in is given (a full life, nothing held or worn, out of any kart),
  // in the look they had if it's one on foot. The frames still queued were the old body's, and
  // where that was is forgotten: nothing is judged against it.
  private rebody(seat: Seat, at: Vec3): void {
    const was = seat.state;
    this.garage.getOut(was);
    const body = this.newBody(was.id, was.name, was.color, at, was.bot);
    if (classOf(was.avatar).id === 'walker') becomeAvatar(body, was.avatar);
    body.kills = was.kills;
    body.deaths = was.deaths;
    body.lastSeq = was.lastSeq;
    body.body = was.body + 1;
    seat.state = body;
    seat.diedTick = null;
    seat.outSteps = 0;
    seat.held = [];
    seat.queue = [];
    this.history.forget(was.id);
  }

  // The world as a room starts with it: no karts, no frost, no hearts left lying, and no dead
  // bots, whose seats go at once.
  private clear(): void {
    for (const [id, seat] of [...this.seats]) {
      if (!seat.state.bot || !seat.state.dead) continue;
      this.leave(id);
      seat.link.close?.('dead');
    }
    for (const seat of this.seats.values()) this.garage.getOut(seat.state);
    this.garage.clear();
    const frost = this.structures.frost.list();
    for (const cell of frost) this.structures.frost.set(cell, false);
    if (frost.length) this.broadcast({ t: 'frost', on: [], off: frost });
    clearDrops(this.pickups);
  }

  // A body new to the world at `at`, facing any way, so no landmark greets every spawn.
  private newBody(id: string, name: string, color: string, at: Vec3, bot: boolean): PlayerState {
    const body = createPlayer(id, name, color, at, bot);
    body.yaw = body.facing = this.rng() * 2 * Math.PI;
    return body;
  }

  receive(id: string, raw: unknown): void {
    const seat = this.seats.get(id);
    if (!seat || !isClientMessage(raw)) return;
    const msg: ClientMessage = raw;
    switch (msg.t) {
      case 'input': {
        const newest = seat.queue.length ? seat.queue[seat.queue.length - 1].seq : seat.state.lastSeq;
        if (msg.f.seq <= newest) return;
        if (seat.queue.length >= MAX_INPUT_QUEUE) seat.queue.shift();
        seat.queue.push(msg.f);
        return;
      }
      case 'chat': {
        const text = msg.text
          .replace(/[\u0000-\u001f]/g, '')
          .trim()
          .slice(0, MAX_CHAT_LENGTH);
        if (!text) return;
        const command = parseCommand(text);
        if (command) this.runCommand(seat, command);
        else this.broadcast({ t: 'chat', id, name: seat.state.name, text });
        return;
      }
      case 'rename':
        this.rename(seat, msg.name);
        return;
      case 'respawn':
        if (seat.state.dead && !seat.state.bot && this.dying.screen) this.respawn(seat);
        return;
      case 'game':
        this.mode.asked(seat.state, msg.do);
        return;
      case 'settings':
        this.mode.changed(seat.state, msg.change);
        return;
      case 'ping':
        seat.link.send({ t: 'pong', at: msg.at });
        return;
    }
  }

  // A new name for a player, which every client sees in the next snapshot (names ride in every
  // PlayerState) and the room is told of. A name's tags (an avatar's, an item's) are read when a
  // player joins, so a rename changes what they're called, not what they are.
  private rename(seat: Seat, raw: string): void {
    const me = seat.state;
    const name = cleanName(raw);
    if (!name || name === me.name) return;
    if (this.tick - seat.lastRenameTick < RENAME_SECONDS * TICK_RATE) {
      this.refuse(seat, 'you can rename again in a few seconds');
      return;
    }
    seat.lastRenameTick = this.tick;
    this.broadcast({ t: 'system', text: `${me.name} is now called ${name}` });
    this.log(`${me.name} (${me.id}) is now called ${name} in ${this.id}`);
    me.name = name;
  }

  // The actions in one frame. The shoot action: a tap weapon fires on the press, a hold weapon fires
  // every cooldown while the sim says it's firing (held, scoped if needed, fuel left). The class's
  // own: announced on the press, one at a time.
  private applyActions(seat: Seat, frame: InputFrame): void {
    const me = seat.state;
    const pressed = (action: ItemAction) => frame.actions.includes(action) && !seat.held.includes(action);
    if (me.riding) {
      const game = this.mode.state;
      if (pressed('exit') && !this.garage.rescuing(me) && !rulesOf(game).seated(game, me.id)) this.garage.getOut(me);
      seat.held = frame.actions;
      return;
    }
    const cls = classOf(me.avatar);
    for (const action of Object.keys(cls.actions) as ItemAction[])
      if (pressed(action) && !me.dead && this.tick - seat.lastActTick >= cls.actionTicks) {
        seat.lastActTick = this.tick;
        this.broadcast({ t: 'action', id: me.id, action });
      }
    const shot = pressed('shoot');
    seat.held = frame.actions;
    const spec = me.item && ITEMS[me.item.id];
    const shoot = spec?.actions.shoot;
    if (!spec || !shoot || me.dead) return;
    const wants = shoot.mode === 'hold' ? me.firing : shot && (!spec.fireNeedsScope || me.scoped);
    if (!wants || this.tick - seat.lastShotTick < spec.cooldownTicks) return;
    seat.lastShotTick = this.tick;
    if (shoot.mode === 'tap') this.broadcast({ t: 'shot', id: me.id });
    if (me.ghost) return; // seen to fire, and nothing comes of it
    // Judge the shot where the targets were on the shooter's screen (rewind.ts); the shooter
    // fires from where they are now, which is what their own prediction showed them.
    const at = rewindTick(frame.view, this.tick);
    const targets = this.players.map((p) => {
      const was = this.history.at(p.id, at);
      return {
        id: p.id,
        dead: p.dead,
        ghost: p.ghost,
        avatar: p.avatar,
        pos: was?.pos ?? p.pos,
        dragon: was ? was.dragon : p.dragon,
        riding: p.riding,
        player: p,
      };
    });
    // A kart takes a bullet that reaches it first: one that would, stopped short of it, hits nobody
    // nearer. A spray washes over a kart, as over a dragon's crystal, and reaches whoever is past it.
    const eye = eyeOf(me);
    const aim = cls.aim(me);
    const kart =
      spec.fire.kind === 'cone'
        ? null
        : this.garage.at(eye, aim, Math.min(spec.range, this.structures.raycast(eye, aim, spec.range)));
    const hits = resolveFire(kart ? { ...spec, range: kart.t } : spec, me, targets, this.structures);
    if (kart && hits.length === 0) this.garage.shoot(kart.kart.id, damageFor(spec, false), me.id);
    // Ice chills from the last touch; fire thaws, as it thaws the frost it lands on.
    for (const hit of hits) {
      const victim = hit.target.player;
      const dealt = damageFor(spec, hit.headshot);
      const hearts = classOf(victim.avatar).hurt?.(victim, hit.part, dealt, spec) ?? dealt;
      if (hearts === 0) continue; // off a dragon's shell: nothing
      if (spec.element === 'ice') victim.chilled = CHILL_SECONDS;
      else if (spec.element === 'fire') victim.chilled = 0;
      this.damage(victim, hearts, { shooter: seat, headshot: hit.headshot });
    }
    if (spec.element && spec.fire.kind === 'cone') this.spray(me, spec.fire.halfAngle, spec.range, spec.element);
  }

  // What a spray lands on (sim/frost.ts): an ice one frosts it, for good, and a fire one melts it.
  // Everyone hears of every cell that turned, the oldest frost melting to make room past MAX_FROST.
  private spray(me: PlayerState, halfAngle: number, range: number, element: Element): void {
    const dir = classOf(me.avatar).aim(me);
    const ice = element === 'ice';
    const changed = sprayFrost(this.structures, eyeOf(me), dir, halfAngle, range, this.tick, ice);
    const on = ice ? changed : [];
    const off = ice ? this.structures.frost.trim() : changed;
    if (on.length || off.length) this.broadcast({ t: 'frost', on, off });
  }

  // A click on a door within reach swings it the other way, for everyone, a second click hard on
  // the first being the same click.
  private use(seat: Seat, id: string): void {
    const me = seat.state;
    if (me.dead || me.ghost || !this.structures.doorIds.includes(id)) return;
    if (this.tick - (this.doorSwung.get(id) ?? -Infinity) < DOOR_DEBOUNCE_SECONDS * TICK_RATE) return;
    if (this.structures.doorAt(me.pos, lookVector(me.yaw, me.pitch), DOOR_REACH) !== id) return;
    const open = !this.structures.isOpen(id);
    this.structures.setDoor(id, open);
    this.doorSwung.set(id, this.tick);
    this.broadcast({ t: 'door', id, open, by: me.id });
  }

  // Takes hearts off `victim`, for a shot by `by.shooter` (or their `move`: a ground pound, a
  // strike, a kart run into them, a kart blown up beside them) or, with no `by` or by their own
  // doing, a fall or the crash `death` says, and kills them at zero, out of any kart they drive. A
  // death is one structured message; clients word the announcement.
  private damage(
    victim: PlayerState,
    damage: number,
    by: { shooter: Seat; headshot: boolean; move?: 'pound' | 'strike' | 'kart' | 'explosion' } | null,
    death: 'fell' | 'out' | 'crashed' = 'fell',
  ): void {
    if (victim.ghost) return; // nothing hurts a ghost, whatever reached this far
    const killed = applyDamage(victim, damage);
    const shooter = by?.shooter.state ?? null;
    const headshot = by?.headshot ?? false;
    this.broadcast({
      t: 'hit',
      shooter: shooter?.id ?? null,
      victim: victim.id,
      damage,
      headshot,
      hearts: victim.hearts,
    });
    if (!killed) return;
    this.garage.getOut(victim);
    victim.deaths++;
    const seat = this.seats.get(victim.id);
    if (seat) seat.diedTick = this.tick;
    this.mode.died(victim, shooter === victim ? null : shooter);
    if (!shooter || shooter === victim) return this.broadcast({ t: death, victim: victim.id });
    shooter.kills++;
    const item = by?.move ?? shooter.item!.id;
    this.broadcast({ t: 'kill', shooter: shooter.id, victim: victim.id, item, headshot });
  }

  // What the end of a step does: a ground pound landing this tick goes off, then a landing at
  // `speed` m/s hurts by its speed, so a pound from high enough to kill its player still lands.
  private land(seat: Seat, speed: number): void {
    const me = seat.state;
    this.pound(seat);
    const damage = fallDamage(speed);
    if (damage > 0 && !me.dead) this.damage(me, damage, null);
    this.outOfBounds(seat);
  }

  // A body on foot stood on the ground past the edge (ground.ts) bleeds hearts there.
  private outOfBounds(seat: Seat): void {
    const me = seat.state;
    if (me.dead || classOf(me.avatar).id !== 'walker' || !onOutsideGround(me.pos.y - EYE_HEIGHT)) return;
    if (++seat.outSteps % OUT_OF_BOUNDS_STEPS === 0) this.damage(me, OUT_OF_BOUNDS_DAMAGE, null, 'out');
  }

  // A ground pound landing this tick (avatars.ts `Pound`) hurts everyone else on foot within its
  // reach across the floor, about level with it and in its sight, so not through a wall or a floor,
  // and throws them back from it, harder and further the higher it began (`poundPower`). A kart
  // within it takes the blow as wrenches, sheltering its driver.
  private pound(seat: Seat): void {
    const me = seat.state;
    const pound = poundOf(me.avatar);
    if (!pound || me.dead || me.pound?.stage !== 'land' || me.pound.t !== 0) return;
    const { damage: hurt, reach } = poundPower(pound, me.pound.from - me.pos.y);
    for (const p of this.bodies) {
      if (p === me || p.dead || p.riding || classOf(p.avatar).id !== 'walker') continue;
      if (Math.hypot(p.pos.x - me.pos.x, p.pos.z - me.pos.z) > reach) continue;
      if (Math.abs(p.pos.y - me.pos.y) > POUND_HEIGHT || !this.structures.clear(me.pos, p.pos)) continue;
      const dx = p.pos.x - me.pos.x;
      const dz = p.pos.z - me.pos.z;
      const flat = Math.hypot(dx, dz);
      const out = flat > 1e-6 ? { x: dx / flat, z: dz / flat } : { x: 1, z: 0 };
      const { speed, lift, grip } = pound.knock;
      throwWalker(p, { x: out.x * speed, y: lift, z: out.z * speed }, grip);
      this.damage(p, hurt, { shooter: seat, headshot: false, move: 'pound' });
    }
    const feet = me.pos.y - EYE_HEIGHT;
    for (const k of this.garage.within(me.pos, { x: 0, y: 0, z: 1 }, reach, Math.PI))
      if (Math.abs(k.pos.y - feet) <= POUND_HEIGHT) this.garage.shoot(k.id, hurt, me.id);
  }

  // A strike's blow (avatars.ts `Strike`), on the step its windup runs out in (`was` being how far
  // into it the step began): everyone it lands on is hurt, and a walker thrown back from the
  // striker. It breaks a dragon's crystal as a bullet does, and a kart it lands on takes it as
  // wrenches, sheltering its driver.
  private strike(seat: Seat, was: number | null): void {
    const me = seat.state;
    const strike = strikeOf(me.avatar);
    if (!strike || me.dead || was === null || me.strike === null) return;
    const due = strike.windup - 1e-9; // six ticks of a thirtieth come a hair short of a fifth
    if (was >= due || me.strike < due) return;
    for (const hit of findStrikeHits(me, this.players, strike, this.structures)) {
      const victim = hit.target;
      if (victim.riding) continue;
      const cls = classOf(victim.avatar);
      const hearts = cls.hurt?.(victim, hit.part, strike.damage, { shatters: true }) ?? strike.damage;
      if (hearts === 0) continue;
      if (cls.id === 'walker') {
        const dx = victim.pos.x - me.pos.x;
        const dz = victim.pos.z - me.pos.z;
        const flat = Math.hypot(dx, dz);
        const out = flat > 1e-6 ? { x: dx / flat, z: dz / flat } : { x: Math.sin(me.yaw), z: Math.cos(me.yaw) };
        const { speed, lift, grip } = strike.knock;
        throwWalker(victim, { x: out.x * speed, y: lift, z: out.z * speed }, grip);
      }
      this.damage(victim, hearts, { shooter: seat, headshot: false, move: 'strike' });
    }
    const { o, dir } = strikeCone(me);
    for (const k of this.garage.within(o, dir, strike.reach, strike.arc)) this.garage.shoot(k.id, strike.damage, me.id);
  }

  // One step of a seat's player, on `frame` or with none, and what comes of it: for a ghost,
  // nothing, however it lands and whatever it swings.
  private advance(seat: Seat, frame: InputFrame | null): void {
    if (seat.state.riding) {
      const game = this.mode.state;
      const held = rulesOf(game).held(game, seat.state.id, this.tick);
      return this.garage.drive(seat.state, frame, TICK_DT, held);
    }
    const struck = seat.state.strike;
    const landing = stepPlayer(seat.state, frame, TICK_DT, this.structures);
    if (seat.state.ghost) return;
    this.land(seat, landing);
    this.strike(seat, struck);
  }

  step(): void {
    this.mode.step();
    this.holdToTrack();
    const lies = Math.round(this.dying.seconds * TICK_RATE); // ticks a dead person's body lies
    for (const [id, seat] of this.seats) {
      const me = seat.state;
      const lain = seat.diedTick === null ? 0 : this.tick - seat.diedTick;
      if (me.bot && lain >= BOT_CORPSE_TICKS) {
        this.leave(id);
        seat.link.close?.('dead');
        continue;
      }
      if (!me.bot && lain >= lies) {
        this.respawn(seat);
        continue;
      }
      if (AVATARS[me.avatar].regen && !me.dead)
        me.hearts = Math.min(heartsOf(me.avatar), me.hearts + REGEN_RATE * TICK_DT);
      const n = Math.min(seat.queue.length, MAX_INPUTS_PER_TICK);
      if (n === 0) {
        if (seat.owed < INPUT_WAIT_TICKS) seat.owed++;
        else this.advance(seat, null);
        continue;
      }
      seat.owed = Math.max(0, seat.owed - (n - 1));
      for (let i = 0; i < n; i++) {
        this.advance(seat, seat.queue[i]);
        this.applyActions(seat, seat.queue[i]);
        const use = seat.queue[i].use;
        if (use) this.use(seat, use);
      }
      seat.queue.splice(0, n);
    }
    const { blows, booms } = this.garage.step(this.bodies);
    for (const blow of blows) {
      const victim = this.seats.get(blow.victim)?.state;
      const by = blow.by === null ? undefined : this.seats.get(blow.by);
      if (victim && !victim.dead)
        this.damage(victim, blow.hearts, by ? { shooter: by, headshot: false, move: blow.how } : null, 'crashed');
    }
    for (const at of booms) this.broadcast({ t: 'boom', at });
    stepCubes(this.cubes, TICK_DT, this.rng);
    stepPickups(this.pickups, TICK_DT, this.rng);
    for (const p of this.bodies) takePickups(this.pickups, p, EYE_HEIGHT);
    this.tick++;
    const players = this.players;
    this.broadcast({
      t: 'snap',
      tick: this.tick,
      players,
      cubes: this.cubeSnapshot(),
      pickups: this.pickupSnapshot(),
      karts: this.garage.list,
    });
    this.history.record(this.tick, players);
  }

  private broadcast(msg: ServerMessage, except?: string): void {
    for (const [id, seat] of this.seats) {
      if (id !== except) seat.link.send(msg);
    }
  }

  private pickupSnapshot(): PickupSnapshot[] {
    const r = (v: number) => Math.round(v * 100) / 100;
    return this.pickups.items.map((p) => ({
      id: p.id,
      kind: p.kind,
      ...(p.from && { from: p.from }),
      x: r(p.pos.x),
      y: r(p.pos.y),
      z: r(p.pos.z),
      ry: r(p.ry),
    }));
  }

  private cubeSnapshot(): CubeSnapshot[] {
    return this.cubes.map((c) => ({ id: c.id, x: c.pos.x, y: c.pos.y, z: c.pos.z, rx: c.rot.x, ry: c.rot.y }));
  }

  // Tells `seat` alone that what it asked for can't be done, and why.
  private refuse(seat: Seat, text: string): void {
    seat.link.send({ t: 'refused', text });
  }

  private runCommand(seat: Seat, command: Command): void {
    const me = seat.state;
    const refused = refusal(this.mode.state, me, command);
    if (refused !== null) return this.refuse(seat, refused);
    // A driver holds the wheel: no kit, no body that can't sit in a kart and no leaving their seat
    // for somewhere else, till they get out.
    const kit =
      command.name === 'speedy' || command.name === 'equip' || command.name === 'wear' || command.name === 'kart';
    const unseated =
      (command.name === 'avatar' && AVATARS[command.avatar].class !== 'walker') || command.name === 'teleport';
    if (me.riding && (kit || command.name === 'unequip' || unseated))
      return this.refuse(seat, "you're driving: get out first (E)");
    switch (command.name) {
      case 'speedy':
        if (!classOf(me.avatar).kit) return this.refuse(seat, `not as ${me.avatar}`);
        me.boost = SPEEDY_SECONDS;
        this.broadcast({ t: 'system', text: `${me.name} increased their movement speed for ${SPEEDY_SECONDS}s` });
        return;
      case 'equip':
        this.equip(seat, command.item);
        return;
      case 'wear':
        if (!classOf(me.avatar).kit) return this.refuse(seat, `not as ${me.avatar}`);
        this.wear(seat, command.gear);
        return;
      case 'unequip':
        this.unequip(seat);
        return;
      case 'avatar':
        if (this.become(seat, command.avatar))
          this.broadcast({ t: 'system', text: `${me.name} is now ${command.avatar}` });
        return;
      case 'color':
        // A colour is the standard body's, so it brings its wearer back to that body.
        if (!this.become(seat, 'standard', true)) return;
        me.color = NAMED_COLORS[command.color];
        this.broadcast({ t: 'system', text: `${me.name} is now ${command.color}` });
        return;
      case 'bot':
        this.callBot(seat, command.bot, command.call);
        return;
      case 'kill-bots':
        this.killBots(seat);
        return;
      case 'kart': {
        if (classOf(me.avatar).id !== 'walker') return this.refuse(seat, `not as ${me.avatar}`);
        const kart = this.garage.drop(me, command.kart, this.seats.size);
        if (typeof kart === 'string') return this.refuse(seat, kart);
        this.broadcast({ t: 'system', text: `${me.name} dropped a ${KARTS[command.kart].name}` });
        return;
      }
      case 'teleport':
        if (classOf(me.avatar).id !== 'walker') return this.refuse(seat, `not as ${me.avatar}`);
        if (!command.feet) return this.refuse(seat, TELEPORT_USAGE);
        placeWalker(me, { ...command.feet, y: command.feet.y + EYE_HEIGHT });
        return;
      case 'unknown':
        this.refuse(seat, `unknown command /${command.raw}`);
        return;
    }
  }

  // Switches `seat` to `avatar`, or tells them why not. `again` lets the look they have pass, for
  // a colour.
  private become(seat: Seat, avatar: AvatarId, again = false): boolean {
    const why = this.cantBecome(seat.state, avatar, again);
    if (why) {
      this.refuse(seat, why);
      return false;
    }
    becomeAvatar(seat.state, avatar);
    this.storm(seat);
    return true;
  }

  // A dragon that rises in a storm (its shape's `rising`): the floor under it ices over, and the
  // gale throws everyone on foot near it back and up, hurt, with the rider to thank for it.
  private storm(seat: Seat): void {
    const me = seat.state;
    const look = AVATARS[me.avatar];
    const rising = look.class === 'asian-dragon' ? look.dragon.rising : null;
    if (!rising) return;
    const feet = me.pos.y - EYE_HEIGHT;
    if (Math.abs(feet) < 0.01) {
      const on = frostDisc(this.structures, me.pos.x, me.pos.z, rising.ice);
      const off = this.structures.frost.trim();
      if (on.length || off.length) this.broadcast({ t: 'frost', on, off });
    }
    const { reach, speed, lift, damage, grip } = rising.blast;
    for (const p of this.bodies) {
      if (p === me || p.dead || classOf(p.avatar).id !== 'walker') continue;
      const dx = p.pos.x - me.pos.x;
      const dz = p.pos.z - me.pos.z;
      const flat = Math.hypot(dx, dz);
      if (flat > reach || Math.abs(p.pos.y - me.pos.y) > reach) continue;
      const out = flat > 1e-6 ? { x: dx / flat, z: dz / flat } : { x: 1, z: 0 };
      throwWalker(p, { x: out.x * speed, y: lift, z: out.z * speed }, grip);
      this.damage(p, damage, { shooter: seat, headshot: false });
    }
  }

  // A bot's look can't be changed, the dead stay what they died as, and a new class needs room
  // for its body.
  private cantBecome(me: PlayerState, avatar: AvatarId, again: boolean): string | null {
    if (me.avatarLocked) return `you're ${me.avatar} for good`;
    if (me.avatar === avatar && !again) return `you're already ${avatar}`;
    const to = classOf(avatar);
    if (to === classOf(me.avatar)) return null;
    if (me.dead) return "not while you're dead";
    if (!to.fits(avatar, me.pos, this.structures)) return `no room for ${avatar} here`;
    return null;
  }

  // "/circle-bot -t 60 -n bob" or "/sniper-bot -s tung --target kat": ask the host to start a bot
  // in this room, under its own name and look or the ones given, hunting `targets` if it's a combat
  // bot.
  // People only, and only where the host can reach Modal. There is no bot cap beyond the room's
  // 32 seats.
  private callBot(seat: Seat, id: BotId, call: BotCallArgs | null): void {
    const me = seat.state;
    const bot = BOTS[id];
    if (call === null) return this.refuse(seat, `usage: /${bot.playerName} ${botArguments(id)}`);
    const { seconds, targets } = call;
    const name = call.botName === null ? undefined : sanitizeName(call.botName);
    if (me.bot) return this.refuse(seat, "bots can't call bots");
    if (!this.spawnBot || !this.publicName) return this.refuse(seat, "bots can't be called in this room");
    if (this.seats.size >= MAX_PLAYERS) return this.refuse(seat, 'this room is full');
    if (this.botCount >= MAX_BOTS) return this.refuse(seat, 'this room has enough bots');
    if (call.avatar && !classOf(call.avatar).bots) return this.refuse(seat, `bots can't be ${call.avatar}`);

    const who = name === undefined ? bot.playerName : `${name} (${bot.playerName})`;
    const after = targets.length > 0 ? ` after ${targets.join(', ')}` : '';
    this.broadcast({ t: 'system', text: `${me.name} called ${who} for ${seconds}s${after}` });
    const spawn = this.standingSpot(() => this.pointNear(me.pos, 0, CALLED_BOT_RANGE), me.pos.y - EYE_HEIGHT);
    const named = name === undefined ? {} : { name };
    const dressed = call.avatar === null ? {} : { avatar: call.avatar };
    const req = botRequest(
      { bot: id, room: this.publicName, seconds, caller: me.name, spawn, ...named, ...dressed },
      targets,
    );
    this.spawnBot(req).catch((err: unknown) => {
      this.log(`bot ${id} for ${this.id}: ${err instanceof Error ? err.message : String(err)}`);
      this.refuse(seat, `couldn't call ${bot.playerName}`);
    });
  }

  // "/kill-bots": every living bot drops dead. People only.
  private killBots(seat: Seat): void {
    if (seat.state.bot) return this.refuse(seat, "bots can't kill bots");
    const bots = this.dropBots();
    if (bots.length === 0) return this.refuse(seat, 'no bots here');
    this.broadcast({ t: 'system', text: `${seat.state.name} killed ${botRollCall(bots.map((b) => b.name))}` });
  }

  // Every living bot drops dead where it stands, as if shot, so each lies as a corpse until its seat
  // is dropped; a bot's run ends when the room closes its connection. Returns them.
  private dropBots(): PlayerState[] {
    const bots = [...this.seats.values()].filter((s) => s.state.bot && !s.state.dead);
    for (const bot of bots) {
      bot.state.hearts = 0;
      bot.state.dead = true;
      bot.state.deaths++;
      bot.diedTick = this.tick;
    }
    return bots.map((b) => b.state);
  }

  // Gear goes on beside whatever weapon they hold; wearing it again restarts its timer and tank.
  private wear(seat: Seat, id: GearId): void {
    const me = seat.state;
    me.gear = createGear(id);
    seat.link.send({ t: 'system', text: `you put on a ${id} for ${GEAR[id].seconds}s. ${gearHelp(id)}.` });
    this.broadcast({ t: 'system', text: `${me.name} put on a ${id}` }, me.id);
  }

  // One item at a time. A locked holder can't swap; anyone else can.
  private equip(seat: Seat, id: ItemId): void {
    const me = seat.state;
    const held = me.item;
    if (held?.locked) {
      this.refuse(seat, held.id === id ? `you already have a ${id}` : `you can't put down your ${held.id}`);
      return;
    }
    const spec = ITEMS[id];
    me.item = createItem(id, false);
    seat.link.send({ t: 'system', text: `you drew a ${id}. ${howTo(spec)}.` });
    this.broadcast(
      {
        t: 'system',
        text: held && held.id !== id ? `${me.name} swapped their ${held.id} for a ${id}` : `${me.name} drew a ${id}`,
      },
      me.id,
    );
  }

  // Puts down the weapon and takes off the gear. A locked item is the look's own and stays.
  private unequip(seat: Seat): void {
    const me = seat.state;
    const held = me.item && !me.item.locked ? me.item.id : null;
    const worn = me.gear?.id ?? null;
    if (!held && !worn) {
      this.refuse(seat, 'nothing to unequip');
      return;
    }
    if (held) me.item = null;
    me.gear = null;
    const what = [held, worn].filter((id) => id !== null).join(' and ');
    seat.link.send({ t: 'system', text: `you put away your ${what}` });
    this.broadcast({ t: 'system', text: `${me.name} put away their ${what}` }, me.id);
  }

  // A bot's chosen spot (feet at `feet`), kept inside the world, on whatever is within a step of
  // those feet: a spot asked for on a floor lands on it, and one in the air falls from there.
  private placedSpawn(feet: Vec3): Vec3 {
    const p = { ...feet };
    this.structures.ground.clamp(p, SPAWN_WALL_MARGIN);
    return { x: p.x, y: this.standAt(p.x, p.z, feet.y) + EYE_HEIGHT, z: p.z };
  }

  // Somewhere in one of `areas`, by their weights, on its floor (or anything within a step of it):
  // inside a building's ground floor, never on a roof. Returns the eye position.
  private spawnPoint(areas: SpawnArea[]): Vec3 {
    let pick = this.rng() * areas.reduce((sum, a) => sum + a.weight, 0);
    const { region } = areas.find((a) => (pick -= a.weight) < 0) ?? areas[areas.length - 1];
    const feet = this.standingSpot(() => randomPointInRegion(region, SPAWN_MARGIN, this.rng), region.y);
    return { ...feet, y: feet.y + EYE_HEIGHT };
  }

  // The first of twenty spots from `pick` where a body fits with its feet at `height` (on whatever
  // is within a step of it there, or in the air), never inside a wall and not on top of a cube;
  // the last one tried if none does. Returns the feet.
  private standingSpot(pick: () => { x: number; z: number }, height: number): Vec3 {
    let spot: Vec3 = { x: 0, y: height, z: 0 };
    for (let i = 0; i < 20; i++) {
      const { x, z } = pick();
      spot = { x, y: this.standAt(x, z, height), z };
      const offCubes = this.cubes.every((c) => Math.hypot(c.pos.x - x, c.pos.z - z) >= SPAWN_CUBE_MARGIN);
      if (offCubes && this.structures.fits(x, z, spot.y, EYE_HEIGHT + CAPSULE_TOP)) break;
    }
    return spot;
  }

  // Where feet put down at `height` over (x, z) come to rest at first: on the highest surface within
  // a step of them, or still at `height`, in the air, if there's none.
  private standAt(x: number, z: number, height: number): number {
    return Math.max(height, this.structures.groundAt(x, z, height + STEP_UP));
  }

  // A random point `from` to `to` metres from `near` across the floor and SPAWN_WALL_MARGIN inside
  // the world; `near` itself if twenty tries all land outside (at the world's edge, over half the
  // circle can).
  private pointNear(near: Vec3, from: number, to: number): { x: number; z: number } {
    const around = { kind: 'ring' as const, x: near.x, y: near.y, z: near.z, inner: from, r: to };
    for (let i = 0; i < 20; i++) {
      const p = randomPointInRegion(around, 0, this.rng);
      if (this.structures.ground.edge(p.x, p.z) <= -SPAWN_WALL_MARGIN) return p;
    }
    return { x: near.x, z: near.z };
  }

  // Where a ghost comes in (its eye point): SPECTATOR_DISTANCE from someone in the game, picked at
  // random, at their height, on whatever is within a step of it there or in the air to fall from.
  // With nobody to stand by, where anyone comes in.
  private besideSomeone(): Vec3 {
    const playing = this.bodies.filter((p) => !p.dead);
    if (playing.length === 0) return this.spawnPoint(SPAWN_AREAS);
    const near = playing[Math.floor(this.rng() * playing.length)].pos;
    const pick = () => this.pointNear(near, SPECTATOR_DISTANCE, SPECTATOR_DISTANCE);
    const feet = this.standingSpot(pick, near.y - EYE_HEIGHT);
    return { ...feet, y: feet.y + EYE_HEIGHT };
  }
}

// "circle-bot x2, stalker-bot x3": names in first-seen order, repeats counted.
function botRollCall(names: string[]): string {
  const counts = new Map<string, number>();
  for (const n of names) counts.set(n, (counts.get(n) ?? 0) + 1);
  return [...counts].map(([n, k]) => (k > 1 ? `${n} x${k}` : n)).join(', ');
}

function howTo(spec: ItemSpec): string {
  const help = itemHelp(spec.id);
  if (spec.fireNeedsScope) return `${help}. it only fires while scoped`;
  if (spec.fuelSeconds !== null) return `${help}. ${spec.fuelSeconds}s of fuel, refills while you don't`;
  return help;
}

// A typed name made fit to show: no control characters, trimmed, at most MAX_NAME_LENGTH long; ''
// when nothing is left.
export function cleanName(raw: string): string {
  return raw
    .replace(/[\u0000-\u001f]/g, '')
    .trim()
    .slice(0, MAX_NAME_LENGTH);
}

// The name a player joins with: their cleaned one, or 'guest'.
export function sanitizeName(raw: string): string {
  return cleanName(raw) || 'guest';
}

export function isValidRoomId(id: string): boolean {
  return /^[a-z0-9][a-z0-9-]{0,23}$/.test(id);
}
