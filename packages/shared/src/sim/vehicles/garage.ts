// The karts in a room (karts.ts, kart.ts) and what becomes of them: dropped in front of whoever asks
// for one, got into with a click within reach and out of with E (what the driver held put away
// meanwhile and handed back), driven by the driver's keys and left to roll to a stop when empty,
// solid to everyone on foot, hurting whoever they run into or come down on, worn down by walls,
// the ground, other karts and shots, blown up when worn out, and taken away when left empty long
// enough. The Room keeps one, steps it, and does what it hands back: the hurts to players, with
// who's credited with each, and where karts blew up.
import { AVATARS, type Appearance } from '../avatars';
import { classOf } from '../classes';
import type { Structures } from '../collision';
import { EYE_HEIGHT, STEP_UP, TICK_RATE } from '../constants';
import type { GearState } from '../gear';
import type { ItemState } from '../items';
import { takeLook } from '../player';
import type { InputFrame, PlayerState, Vec3 } from '../types';
import { throwWalker } from '../walker';
import {
  IDLE,
  bodyOf,
  createKart,
  impactDamage,
  noseOf,
  ride,
  seat,
  stepKart,
  wearOf,
  type KartState,
  type KartStep,
} from './kart';
import { KARTS, sizeFor, type KartId } from './karts';
import { watch, watchFrom, type Watch } from './rescue';

// A kart in the room, as every client is sent it: its body, how whoever dropped it appeared then
// (whose livery it's painted in), its wrenches left, and who's driving it.
export interface Kart extends KartState {
  id: string;
  paint: Appearance;
  wrenches: number;
  driver: string | null;
}

// Hearts a kart took off a player, who's credited with it (null for nobody), and how: run over or
// come down on, or caught in an explosion.
export interface KartBlow {
  victim: string;
  hearts: number;
  by: string | null;
  how: 'kart' | 'explosion';
}

const DROP_AHEAD = 7; // metres in front of whoever asks for one that a kart drops
const DROP_HEIGHT = 2; // metres over their feet it drops from: landing under what wears it (LANDING)
const KARTS_PER_PLAYER = 2; // a room's karts at most, for each player in it
const IDLE_SECONDS = 120; // an empty kart is taken away after this long
const STRUCK_SECONDS = 0.5; // a kart hurts the same player again no sooner than this
// Steps a driven kart takes on the keys of its driver's last frame while their next is late, at
// the most (a third of a second): past them the driver is taken to be away and the keys let go.
const AHEAD_TICKS = 10;
const DROP_DAMAGE = 5; // hearts off someone a kart comes down on
const DROP_SPEED = 2; // m/s down: a kart coming down on someone, not resting on them
// The throw a run-over gives, Colgera's storm's (avatars.ts) and harder for a harder hit: away
// along the knock at a share of the speed the two closed at, and up.
const KNOCK = { least: 9, share: 0.6, lift: 5, grip: 6 };
// An explosion: hearts off everyone on foot within reach of it with nothing between, and the throw
// it gives them: `speed` away from it and `lift` up. Its own driver, at its middle, it throws high
// and back off its tail: they face the way the kart did, so the blast is before their eyes, and
// what the kart ran into beyond it.
export const BLAST = { reach: 6, damage: 3, speed: 9, lift: 6, grip: 6, driver: { speed: 6, lift: 14 } };
const BUMP = 0.3; // of the speed two karts closed at that they part at

// What only the Room keeps of a kart: who's credited with what it does (its driver, else whoever
// last drove or dropped it), the ticks it has stood empty, when it last hurt each player, what its
// driver put away to drive, who took its last wrench, its driver's last frame, whose keys it
// keeps to on a tick their frame is late for, how many steps it has taken that way, ahead of
// the frames they stood in for, who has got out of it and not stood clear of it since, whom
// touching it doesn't get back in, and the watch kept over it to fish it back if it's driven off
// the world (rescue.ts).
interface Keep {
  owner: string | null;
  empty: number;
  struck: Map<string, number>;
  left: Set<string>;
  stowed: { item: ItemState | null; gear: GearState | null };
  breaker: string | null;
  frame: InputFrame | null;
  ahead: number;
  watch: Watch;
}

export class Garage {
  private readonly karts = new Map<string, Kart>();
  private readonly keeps = new Map<string, Keep>();
  private next = 1;
  private tick = 0;

  constructor(private readonly structures: Structures) {}

  get list(): Kart[] {
    return [...this.karts.values()];
  }

  // Drops a kart in front of `p`, nose their way, built to seat them: DROP_AHEAD out, or short of a
  // wall in the way down to right over them, from DROP_HEIGHT over their feet or as high as the
  // ceiling lets it. Or says why not: with KARTS_PER_PLAYER for each of the room's `players` already.
  drop(p: PlayerState, kart: KartId, players: number): Kart | string {
    if (this.karts.size >= KARTS_PER_PLAYER * players)
      return `there are ${KARTS_PER_PLAYER} karts for every player: blow one up first`;
    const made = createKart(kart, sizeFor(p.avatar), p.pos, p.yaw);
    const { length, height } = bodyOf(made);
    const f = noseOf(p.yaw);
    const feet = p.pos.y - EYE_HEIGHT;
    const chest = { x: p.pos.x, y: feet + 1, z: p.pos.z };
    const clear = this.structures.raycast(chest, { x: f.x, y: 0, z: f.z }, DROP_AHEAD + length);
    const ahead = Math.max(0, Math.min(DROP_AHEAD, clear - length / 2 - 0.3));
    const x = p.pos.x + f.x * ahead;
    const z = p.pos.z + f.z * ahead;
    const y = Math.max(feet, Math.min(feet + DROP_HEIGHT, this.structures.ceilingAt(x, z, feet + 0.1) - height - 0.1));
    const k: Kart = {
      ...made,
      pos: { x, y, z },
      id: `kart-${this.next++}`,
      paint: { avatar: p.avatar, color: p.color },
      wrenches: KARTS[kart].wrenches,
      driver: null,
    };
    this.karts.set(k.id, k);
    this.keeps.set(k.id, {
      owner: p.id,
      empty: 0,
      struck: new Map(),
      left: new Set(),
      stowed: { item: null, gear: null },
      breaker: null,
      frame: null,
      ahead: 0,
      watch: watchFrom({ x: p.pos.x, y: feet, z: p.pos.z }, p.yaw, this.structures),
    });
    return k;
  }

  // Gets `p`, on foot and touching empty kart `k`, into it: what they hold is put away until they
  // get out, and whatever move they were in stopped.
  private getIn(p: PlayerState, k: Kart): void {
    const keep = this.keeps.get(k.id)!;
    classOf(p.avatar).exit(p);
    keep.stowed = { item: p.item, gear: p.gear };
    p.item = null;
    p.gear = null;
    p.scoped = p.firing = p.thrusting = false;
    p.thrown = null;
    p.riding = k.id;
    k.driver = p.id;
    keep.owner = p.id;
    keep.empty = 0;
    keep.frame = null;
    keep.ahead = 0;
    seat(p, k);
  }

  // Gets `p` out of the kart they drive, standing beside it (its left, its right, behind it or in
  // front, the first a body fits, else on top of it), with what they put away handed back. The kart
  // rolls on with no keys held, slowing to a stop, and any drift or trick it was in goes with its
  // driver, giving it no boost.
  getOut(p: PlayerState): void {
    const k = p.riding ? this.karts.get(p.riding) : undefined;
    const keep = p.riding ? this.keeps.get(p.riding) : undefined;
    p.riding = null;
    if (!k || !keep) return;
    k.driver = null;
    k.drift = k.trick = k.hop = null;
    k.held = false;
    k.press = k.down = null;
    p.item = keep.stowed.item;
    p.gear = keep.stowed.gear;
    keep.stowed = { item: null, gear: null };
    keep.left.add(p.id);
    const feet = this.beside(k, p);
    p.pos = { x: feet.x, y: feet.y + EYE_HEIGHT, z: feet.z };
    p.vx = p.vy = p.vz = 0;
  }

  // One step of `p`'s kart by their frame, built to seat them, them sat in it, it worn by what it
  // ran into, and watched for being stranded. With no frame (theirs is late) it steps on the keys
  // of their last, ahead of the frame that step stood in for, which is then taken for its look and
  // its keys alone: so a kart has stepped once for each of its driver's frames, as their client
  // predicted it, and late frames never run it on further than they would have in time. Past
  // AHEAD_TICKS of that its keys are let go, and it rolls to a stop.
  drive(p: PlayerState, frame: InputFrame | null, dt: number): void {
    const k = p.riding ? this.karts.get(p.riding) : undefined;
    const keep = p.riding ? this.keeps.get(p.riding) : undefined;
    if (!k || !keep) {
      p.riding = null;
      return;
    }
    if (frame) {
      keep.frame = frame;
      if (keep.ahead > 0) {
        keep.ahead--;
        takeLook(p, frame);
        return;
      }
    } else if (keep.ahead < AHEAD_TICKS) keep.ahead++;
    else keep.frame = null;
    k.size = sizeFor(p.avatar);
    this.worn(k, ride(p, k, keep.frame, dt, this.structures));
    watch(keep.watch, k, dt, this.structures);
  }

  // Whether the kart `p` drives is in Lakitu's hands (rescue.ts), which there's no getting out of.
  rescuing(p: PlayerState): boolean {
    return !!p.riding && !!this.karts.get(p.riding)?.rescue;
  }

  // The nearest kart a ray from `o` along unit `d` enters within `maxT`, and how far along it.
  at(o: Vec3, d: Vec3, maxT: number): { kart: Kart; t: number } | null {
    return kartAt(o, d, maxT, this.karts.values());
  }

  // Every kart with any of it within `range` of `o` and `halfAngle` of `d`, in sight: what a
  // blow's cone reaches (a strike's, or a ground pound's all round).
  within(o: Vec3, d: Vec3, range: number, halfAngle: number): Kart[] {
    return this.list.filter((k) => {
      const { length, height } = bodyOf(k);
      const mid = { x: k.pos.x - o.x, y: k.pos.y + height / 2 - o.y, z: k.pos.z - o.z };
      const dist = Math.hypot(mid.x, mid.y, mid.z);
      if (dist - length / 2 > range) return false;
      const cos = dist > 1e-6 ? (mid.x * d.x + mid.y * d.y + mid.z * d.z) / dist : 1;
      const angle = Math.acos(Math.max(-1, Math.min(1, cos)));
      const widen = Math.asin(Math.min(1, length / 2 / Math.max(dist, 1e-6)));
      return angle <= halfAngle + widen && this.structures.clear(o, { x: k.pos.x, y: o.y + mid.y, z: k.pos.z });
    });
  }

  // Wrenches off kart `id` from a shot or a blow by `by`.
  shoot(id: string, wrenches: number, by: string): void {
    const k = this.karts.get(id);
    if (k) this.wear(k, wrenches, by);
  }

  // The rest of a tick, once every driver's kart has been driven: the empty karts rolled, everyone on
  // foot pushed out of every kart and hurt by one that ran into them or came down on them, karts
  // that bumped parted and worn by it, karts worn out blown up, and karts left empty long enough
  // taken away. Hands back the hurts, and where karts blew up.
  step(players: PlayerState[]): { blows: KartBlow[]; booms: Vec3[] } {
    this.tick++;
    const karts = this.list;
    for (const k of karts) if (k.driver === null) this.worn(k, stepKart(k, IDLE, 1 / TICK_RATE, this.structures));
    const blows: KartBlow[] = [];
    for (const k of karts) for (const p of players) this.runInto(k, p, blows);
    for (let i = 0; i < karts.length; i++) for (let j = i + 1; j < karts.length; j++) this.bump(karts[i], karts[j]);
    const booms = karts.filter((k) => k.wrenches <= 0).map((k) => this.explode(k, players, blows));
    for (const k of this.karts.values()) {
      const keep = this.keeps.get(k.id)!;
      keep.empty = k.driver === null ? keep.empty + 1 : 0;
      if (keep.empty >= IDLE_SECONDS * TICK_RATE) this.forget(k);
    }
    return { blows, booms };
  }

  // Wrenches off `k` for what it ran into and came down on, credited to it.
  private worn(k: Kart, step: KartStep): void {
    this.wear(k, wearOf(step), this.credit(k));
  }

  private wear(k: Kart, wrenches: number, by: string | null): void {
    if (wrenches <= 0) return;
    k.wrenches = Math.max(0, k.wrenches - wrenches);
    this.keeps.get(k.id)!.breaker = by;
  }

  // Who's credited with what a kart does: its driver, else whoever last drove it or dropped it.
  private credit(k: Kart): string | null {
    return k.driver ?? this.keeps.get(k.id)?.owner ?? null;
  }

  // Where someone getting out of `k` stands: its left, its right, behind it or in front, the first
  // that's ground within a step of its own with room for their body, else on top of it.
  private beside(k: Kart, p: PlayerState): Vec3 {
    const { width, length, height } = bodyOf(k);
    const { radius, top } = AVATARS[p.avatar].hitbox;
    const f = noseOf(k.yaw);
    const side = width / 2 + radius + 0.2;
    const end = length / 2 + radius + 0.2;
    for (const [across, along] of [
      [-side, 0],
      [side, 0],
      [0, -end],
      [0, end],
    ]) {
      const x = k.pos.x + f.z * across + f.x * along;
      const z = k.pos.z - f.x * across + f.z * along;
      const feet = this.structures.groundAt(x, z, k.pos.y + STEP_UP);
      if (Math.abs(feet - k.pos.y) <= STEP_UP && this.structures.fits(x, z, feet, top, radius))
        return { x, y: feet, z };
    }
    return { x: k.pos.x, y: k.pos.y + height, z: k.pos.z };
  }

  // `p`, on foot, against kart `k`: pushed out of it, and hurt by how fast the two closed on each
  // other square to where they touch, or by its coming down on them; or, unhurt, a person against
  // an empty one, got into it: a kart is got into by walking or jumping into it.
  private runInto(k: Kart, p: PlayerState, blows: KartBlow[]): void {
    if (p.dead || p.riding || classOf(p.avatar).id !== 'walker') return;
    const keep = this.keeps.get(k.id)!;
    const touch = touching(k, p);
    if (!touch) {
      keep.left.delete(p.id);
      return;
    }
    const { n, depth, under } = touch;
    p.pos.x += n.x * depth;
    p.pos.z += n.z * depth;
    if (this.tick - (keep.struck.get(p.id) ?? -Infinity) < STRUCK_SECONDS * TICK_RATE) return;
    const closing = (k.vel.x - p.vx) * n.x + (k.vel.z - p.vz) * n.z;
    const hearts = Math.max(under && k.vel.y < -DROP_SPEED ? DROP_DAMAGE : 0, impactDamage(closing));
    if (hearts === 0) {
      if (k.driver === null && !p.bot && !keep.left.has(p.id)) this.getIn(p, k);
      return;
    }
    keep.struck.set(p.id, this.tick);
    const away = Math.max(KNOCK.least, closing * KNOCK.share);
    throwWalker(p, { x: n.x * away, y: KNOCK.lift, z: n.z * away }, KNOCK.grip);
    blows.push({ victim: p.id, hearts, by: this.credit(k), how: 'kart' });
  }

  // Two karts, each two circles as they meet walls (kart.ts): parted where they overlap (the
  // lighter the more), and where they were closing, sent apart by their weights and each worn by
  // how fast, credited to the other's driver.
  private bump(a: Kart, b: Kart): void {
    const sa = KARTS[a.kart];
    const sb = KARTS[b.kart];
    if (Math.abs(a.pos.y - b.pos.y) > Math.max(bodyOf(a).height, bodyOf(b).height)) return;
    let best: { n: { x: number; z: number }; overlap: number } | null = null;
    for (const ca of circles(a))
      for (const cb of circles(b)) {
        const dx = cb.x - ca.x;
        const dz = cb.z - ca.z;
        const dist = Math.hypot(dx, dz);
        const overlap = ca.r + cb.r - dist;
        if (overlap > 0 && (!best || overlap > best.overlap))
          best = { n: dist > 1e-6 ? { x: dx / dist, z: dz / dist } : { x: 1, z: 0 }, overlap };
      }
    if (!best) return;
    const { n, overlap } = best;
    const share = sb.weight / (sa.weight + sb.weight); // of the parting that's a's
    a.pos.x -= n.x * overlap * share;
    a.pos.z -= n.z * overlap * share;
    b.pos.x += n.x * overlap * (1 - share);
    b.pos.z += n.z * overlap * (1 - share);
    const closing = (a.vel.x - b.vel.x) * n.x + (a.vel.z - b.vel.z) * n.z;
    if (closing <= 0) return;
    const j = ((1 + BUMP) * closing) / (1 / sa.weight + 1 / sb.weight);
    a.vel.x -= (n.x * j) / sa.weight;
    a.vel.z -= (n.z * j) / sa.weight;
    b.vel.x += (n.x * j) / sb.weight;
    b.vel.z += (n.z * j) / sb.weight;
    const worn = wearOf({ impact: closing, landing: 0 });
    this.wear(a, worn, this.credit(b));
    this.wear(b, worn, this.credit(a));
  }

  // Kart `k` blown up: gone, its driver left where they sat, and everyone on foot within the
  // blast's reach with nothing between hurt and thrown away from it (its driver up and back off
  // its tail), credited to whoever took its last wrench. Returns where it blew up.
  private explode(k: Kart, players: PlayerState[], blows: KartBlow[]): Vec3 {
    const at = { x: k.pos.x, y: k.pos.y + bodyOf(k).height / 2, z: k.pos.z };
    const by = this.keeps.get(k.id)?.breaker ?? this.credit(k);
    const nose = noseOf(k.yaw);
    const driver = players.find((p) => p.id === k.driver);
    if (driver) {
      this.getOut(driver);
      // With the kart gone from under them they're where they sat, if their body fits there.
      const { top, radius } = AVATARS[driver.avatar].hitbox;
      if (this.structures.fits(k.pos.x, k.pos.z, k.pos.y, top, radius))
        driver.pos = { x: k.pos.x, y: k.pos.y + EYE_HEIGHT, z: k.pos.z };
    }
    this.forget(k);
    for (const p of players) {
      if (p.dead || p.riding || classOf(p.avatar).id !== 'walker') continue;
      const mid = { x: p.pos.x, y: p.pos.y - EYE_HEIGHT + AVATARS[p.avatar].hitbox.top / 2, z: p.pos.z };
      if (Math.hypot(mid.x - at.x, mid.y - at.y, mid.z - at.z) > BLAST.reach || !this.structures.clear(at, mid))
        continue;
      const flat = Math.hypot(mid.x - at.x, mid.z - at.z);
      const out =
        p === driver || flat < 1e-6
          ? { x: -nose.x, z: -nose.z }
          : { x: (mid.x - at.x) / flat, z: (mid.z - at.z) / flat };
      const { speed, lift } = p === driver ? BLAST.driver : BLAST;
      throwWalker(p, { x: out.x * speed, y: lift, z: out.z * speed }, BLAST.grip);
      blows.push({ victim: p.id, hearts: BLAST.damage, by, how: 'explosion' });
    }
    return at;
  }

  private forget(k: Kart): void {
    this.karts.delete(k.id);
    this.keeps.delete(k.id);
  }
}

// The nearest of `karts` a ray from `o` along unit `d` enters within `maxT`, and how far along it.
export function kartAt<K extends KartState>(
  o: Vec3,
  d: Vec3,
  maxT: number,
  karts: Iterable<K>,
): { kart: K; t: number } | null {
  let best: { kart: K; t: number } | null = null;
  for (const kart of karts) {
    const t = rayKart(o, d, kart, best?.t ?? maxT);
    if (t !== null) best = { kart, t };
  }
  return best;
}

// The circles a kart meets walls and other karts as: at its nose and its tail, each as wide as it.
function circles(k: KartState): { x: number; z: number; r: number }[] {
  const { width, length } = bodyOf(k);
  const f = noseOf(k.yaw);
  const half = (length - width) / 2;
  return [1, -1].map((s) => ({ x: k.pos.x + f.x * half * s, z: k.pos.z + f.z * half * s, r: width / 2 }));
}

// Where `p` overlaps kart `k`'s box, if they do: the way out of it across the ground, how far in
// they are, and whether the kart is over their middle (coming down on them, if it's falling).
function touching(k: KartState, p: PlayerState): { n: { x: number; z: number }; depth: number; under: boolean } | null {
  const { width, length, height } = bodyOf(k);
  const { radius, top } = AVATARS[p.avatar].hitbox;
  const feet = p.pos.y - EYE_HEIGHT;
  if (feet > k.pos.y + height || feet + top < k.pos.y) return null;
  const f = noseOf(k.yaw);
  const dx = p.pos.x - k.pos.x;
  const dz = p.pos.z - k.pos.z;
  const across = dx * f.z - dz * f.x; // along its right
  const along = dx * f.x + dz * f.z;
  let nx = across - Math.max(-width / 2, Math.min(width / 2, across));
  let nz = along - Math.max(-length / 2, Math.min(length / 2, along));
  let dist = Math.hypot(nx, nz);
  if (dist >= radius) return null;
  if (dist > 1e-6) {
    nx /= dist;
    nz /= dist;
  } else if (width / 2 - Math.abs(across) < length / 2 - Math.abs(along)) {
    nx = Math.sign(across) || 1;
    nz = 0;
    dist = -(width / 2 - Math.abs(across));
  } else {
    nx = 0;
    nz = Math.sign(along) || 1;
    dist = -(length / 2 - Math.abs(along));
  }
  return {
    n: { x: f.z * nx + f.x * nz, z: -f.x * nx + f.z * nz },
    depth: radius - dist,
    under: k.pos.y > feet + top / 2,
  };
}

// Distance along the unit ray (o, d) to where it enters kart `k`'s box within maxT, else null.
function rayKart(o: Vec3, d: Vec3, k: KartState, maxT: number): number | null {
  const { width, length, height } = bodyOf(k);
  const f = noseOf(k.yaw);
  const ox = o.x - k.pos.x;
  const oz = o.z - k.pos.z;
  const origin = [ox * f.z - oz * f.x, o.y - k.pos.y, ox * f.x + oz * f.z];
  const dir = [d.x * f.z - d.z * f.x, d.y, d.x * f.x + d.z * f.z];
  const box = [
    [-width / 2, width / 2],
    [0, height],
    [-length / 2, length / 2],
  ];
  let t0 = 0;
  let t1 = maxT;
  for (let i = 0; i < 3; i++) {
    if (Math.abs(dir[i]) < 1e-12) {
      if (origin[i] < box[i][0] || origin[i] > box[i][1]) return null;
      continue;
    }
    const a = (box[i][0] - origin[i]) / dir[i];
    const b = (box[i][1] - origin[i]) / dir[i];
    t0 = Math.max(t0, Math.min(a, b));
    t1 = Math.min(t1, Math.max(a, b));
    if (t0 > t1) return null;
  }
  return t0 < maxT ? t0 : null;
}
