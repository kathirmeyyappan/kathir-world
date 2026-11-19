// Snapshot buffer for everything the server owns: remote players, cubes, pickups and karts. Renders a
// few ticks behind the newest snapshot and lerps between the two that bracket that time.
import {
  INTERP_DELAY_TICKS,
  TICK_RATE,
  type Vec3,
  type CubeSnapshot,
  type PickupSnapshot,
  type PlayerState,
  type ItemId,
  type GearId,
  type AvatarId,
  type DragonState,
  type Kart,
} from '@world/shared';

interface Snapshot {
  tick: number;
  players: Map<string, PlayerState>;
  cubes: Map<string, CubeSnapshot>;
  pickups: Map<string, PickupSnapshot>;
  karts: Map<string, Kart>;
}

// What was sampled: everyone else, the cubes, the pickups and the karts.
export interface Sampled {
  players: RemotePlayer[];
  cubes: CubeSnapshot[];
  pickups: PickupSnapshot[];
  karts: Kart[];
}

export interface RemotePlayer {
  id: string;
  name: string;
  color: string;
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  reading: string | null;
  item: ItemId | null;
  firing: boolean;
  gear: GearId | null;
  thrusting: boolean;
  walk: number; // how fast their feet are walking, m/s (sim/types.ts): paces their legs and footsteps
  leap: boolean; // in a long jump (sim/avatars.ts `Leap`)
  hop: number; // which jump of a chain of them the last was (sim/avatars.ts `Chain`), from 1; 0 with none
  pound: 'twirl' | 'drop' | 'land' | null; // the stage of its ground pound (sim/avatars.ts `Pound`), if it's in one
  poundHeight: number; // metres its eyes are under where that ground pound began; 0 out of one
  crouch: boolean; // crouched on the ground (sim/avatars.ts `Crouch`)
  backflip: boolean; // in the jump taken out of a crouch
  strike: number | null; // seconds into a strike (sim/avatars.ts `Strike`); null out of one
  floating: boolean; // holding a fall (sim/avatars.ts `Float`)
  climb: { piece: number; side: 1 | -1; way: 1 | -1 } | null; // on a ladder (sim/types.ts): the piece, the face held, and the way round to it
  chilled: boolean; // slowed by an ice hit (sim/constants.ts): frosted over
  dead: boolean;
  avatar: AvatarId;
  dragon: DragonState | null; // a dragon's body, its spine drawn between snapshots like the head
  riding: string | null; // the kart they're driving (sim/vehicles/garage.ts), if any
  bot: boolean;
  // Standing on something (a floor, a stair, a deck): the sim zeroes vy whenever a walker is on the
  // ground, so this is the server's own answer rather than a guess from the drawn height. A dragon
  // flies, and a ground pound hangs still in the air before it drops.
  grounded: boolean;
}

const KEEP_TICKS = TICK_RATE * 2;

export class Interpolation {
  private buffer: Snapshot[] = [];
  private lastTick = 0;
  private lastAt = 0;
  // The server tick remote players were last drawn at; sent with input so shots are judged there.
  viewTick: number | undefined;

  // A welcome or snapshot message's world.
  push(
    {
      tick,
      players,
      cubes,
      pickups,
      karts,
    }: { tick: number; players: PlayerState[]; cubes: CubeSnapshot[]; pickups: PickupSnapshot[]; karts: Kart[] },
    now: number,
  ): void {
    if (this.buffer.length && tick <= this.buffer[this.buffer.length - 1].tick) return;
    this.buffer.push({
      tick,
      players: new Map(players.map((p) => [p.id, p])),
      cubes: new Map(cubes.map((c) => [c.id, c])),
      pickups: new Map(pickups.map((p) => [p.id, p])),
      karts: new Map(karts.map((k) => [k.id, k])),
    });
    this.lastTick = tick;
    this.lastAt = now;
    while (this.buffer.length > 1 && this.buffer[0].tick < tick - KEEP_TICKS) this.buffer.shift();
  }

  sample(now: number, exclude: string): Sampled {
    if (this.buffer.length === 0) return { players: [], cubes: [], pickups: [], karts: [] };
    // Never behind the tick last drawn. Each snapshot resets the clock as it arrives, so a late one
    // sets it back from where it had run to; drawn, that steps every body back along its path, which
    // a walker reads as turning round, so it holds until the clock catches up. Held to the tick
    // drawn, not the clock, which runs on past the newest snapshot with nothing to draw.
    const renderTick = Math.max(
      this.viewTick ?? -Infinity,
      this.lastTick + ((now - this.lastAt) / 1000) * TICK_RATE - INTERP_DELAY_TICKS,
    );

    let older = this.buffer[0];
    let newer = this.buffer[0];
    for (let i = 0; i < this.buffer.length; i++) {
      if (this.buffer[i].tick <= renderTick) older = this.buffer[i];
      if (this.buffer[i].tick >= renderTick) {
        newer = this.buffer[i];
        break;
      }
      newer = this.buffer[i];
    }
    const span = newer.tick - older.tick;
    const t = span > 0 ? Math.min(1, Math.max(0, (renderTick - older.tick) / span)) : 1;
    this.viewTick = older.tick + span * t;

    const players: RemotePlayer[] = [];
    for (const [id, b] of newer.players) {
      if (id === exclude) continue;
      const a = older.players.get(id) ?? b;
      players.push({
        id,
        name: b.name,
        color: b.color,
        x: lerp(a.pos.x, b.pos.x, t),
        y: lerp(a.pos.y, b.pos.y, t),
        z: lerp(a.pos.z, b.pos.z, t),
        yaw: lerpAngle(a.yaw, b.yaw, t),
        pitch: lerp(a.pitch, b.pitch, t),
        reading: b.reading,
        item: b.item?.id ?? null,
        firing: b.firing,
        gear: b.gear?.id ?? null,
        thrusting: b.thrusting,
        walk: b.walk,
        leap: b.leap,
        hop: b.hop,
        pound: b.pound?.stage ?? null,
        poundHeight: b.pound ? b.pound.from - b.pos.y : 0,
        crouch: b.crouch,
        backflip: b.backflip,
        strike: b.strike,
        floating: b.floating,
        climb: b.climb,
        chilled: b.chilled > 0,
        dead: b.dead,
        avatar: b.avatar,
        dragon: b.dragon && {
          ...b.dragon,
          head: lerpUnit(a.dragon?.head, b.dragon.head, t),
          spine: lerpSpine(a.dragon?.spine, b.dragon.spine, t),
        },
        riding: b.riding,
        bot: b.bot,
        grounded: b.vy === 0 && !b.dragon && !b.climb && (!b.pound || b.pound.stage === 'land'),
      });
    }
    const cubes: CubeSnapshot[] = [];
    for (const [id, b] of newer.cubes) {
      const a = older.cubes.get(id) ?? b;
      cubes.push({
        id,
        x: lerp(a.x, b.x, t),
        y: lerp(a.y, b.y, t),
        z: lerp(a.z, b.z, t),
        rx: lerp(a.rx, b.rx, t),
        ry: lerpAngle(a.ry, b.ry, t),
      });
    }
    const pickups: PickupSnapshot[] = [];
    for (const [id, b] of newer.pickups) {
      const a = older.pickups.get(id) ?? b;
      pickups.push({
        ...b,
        x: lerp(a.x, b.x, t),
        y: lerp(a.y, b.y, t),
        z: lerp(a.z, b.z, t),
        ry: lerpAngle(a.ry, b.ry, t),
      });
    }
    const karts: Kart[] = [];
    for (const [id, b] of newer.karts) {
      const a = older.karts.get(id) ?? b;
      karts.push({
        ...b,
        pos: { x: lerp(a.pos.x, b.pos.x, t), y: lerp(a.pos.y, b.pos.y, t), z: lerp(a.pos.z, b.pos.z, t) },
        yaw: lerpAngle(a.yaw, b.yaw, t),
        wheel: lerp(a.wheel, b.wheel, t),
      });
    }
    return { players, cubes, pickups, karts };
  }

  // The newest word on kart `id`, if there is one.
  latestKart(id: string): Kart | undefined {
    return this.buffer[this.buffer.length - 1]?.karts.get(id);
  }
}

// Between two spines point for point; the newer one alone when they aren't the same body.
function lerpSpine(a: number[] | undefined, b: number[], t: number): number[] {
  return a && a.length === b.length ? b.map((v, i) => lerp(a[i], v, t)) : b;
}

function lerpUnit(a: Vec3 | undefined, b: Vec3, t: number): Vec3 {
  if (!a) return b;
  const x = lerp(a.x, b.x, t);
  const y = lerp(a.y, b.y, t);
  const z = lerp(a.z, b.z, t);
  const len = Math.hypot(x, y, z);
  return len > 1e-6 ? { x: x / len, y: y / len, z: z / len } : b;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function lerpAngle(a: number, b: number, t: number): number {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}
