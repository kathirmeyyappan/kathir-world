// The world's ground: a slab whose top is the floor the outline draws (discs, straight bridges,
// bends and pie slices, all unioned, authored in outline.ts), whose sides drop to the ground past
// the edge, OUTSIDE_HEIGHT down, and all of it solid. A body stands on the floor, walks off its
// edge, falls down the drop's face (a wall to anything below the floor) and lands on the ground
// beyond, which bleeds its hearts while it stands there (room.ts). Everything that cares where the
// floor ends asks this: the sim (server and client alike, through Structures.ground), the
// renderers, the sky objects, the bots' map and every map.
//
// The parts are indexed by CHUNK-metre square, each square listing every part within NEAR of it,
// so a question about a spot looks only at the few parts near it, however many the world has.
import type { Vec3 } from './types';

export interface Disc {
  kind: 'disc';
  x: number;
  z: number;
  r: number;
}

// A straight corridor between two points. Its ends are round, so they should sit inside the discs
// it joins, unless it's `square`: cut straight across at both points, as a road is where it stops
// at a gap or carries on into a bend.
export interface Bridge {
  kind: 'bridge';
  ax: number;
  az: number;
  bx: number;
  bz: number;
  halfWidth: number;
  square?: boolean;
}

// A corridor round a bend: everything within halfWidth of the arc of radius r about (x, z) from
// bearing `from` round to `to` (radians from +x toward +z, `to` past `from` by less than a whole
// turn), cut straight across at both ends. r is more than halfWidth.
export interface Bend {
  kind: 'bend';
  x: number;
  z: number;
  r: number;
  from: number;
  to: number;
  halfWidth: number;
}

// A pie slice: everything within r of (x, z) from bearing `from` round to `to` (radians from +x
// toward +z, `to` past `from`), its two straight sides running out from (x, z).
export interface Sector {
  kind: 'sector';
  x: number;
  z: number;
  r: number;
  from: number;
  to: number;
}

export type WorldPart = Disc | Bridge | Bend | Sector;

export interface Bounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

// Metres the ground past the world's edge stands above the floor: below it, so the edge drops to it
// and where the floor ends reads from afar (render/Environment.ts).
export const OUTSIDE_HEIGHT = -10;

// Whether feet at height `y` are down on the ground past the edge: out of bounds.
export function onOutsideGround(y: number): boolean {
  return y <= OUTSIDE_HEIGHT + 1e-6;
}

// Metres on a side of the squares the world is cut into: the ground's index, and the renderer's
// regions of merged structures (render/Structures.ts).
export const CHUNK = 48;

// Metres past a part's edge that its chunks still list it: `edge` measures exactly within this of
// the edge, and past it says only that a spot is at least this far in or out.
const NEAR = CHUNK;

export class Ground {
  readonly bounds: Bounds;
  // Metres from the origin to the furthest of the floor: a circle round all of it.
  readonly reach: number;
  private readonly chunks = new Map<number, WorldPart[]>();
  private readonly boxes = new Map<WorldPart, Bounds>(); // each part's, worked out once

  constructor(readonly parts: readonly WorldPart[]) {
    this.bounds = { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity };
    let reach = 0;
    for (const part of parts) {
      const b = partBounds(part);
      this.boxes.set(part, b);
      this.bounds.minX = Math.min(this.bounds.minX, b.minX);
      this.bounds.maxX = Math.max(this.bounds.maxX, b.maxX);
      this.bounds.minZ = Math.min(this.bounds.minZ, b.minZ);
      this.bounds.maxZ = Math.max(this.bounds.maxZ, b.maxZ);
      reach = Math.max(reach, partReach(part));
      for (let cx = chunkOf(b.minX - NEAR); cx <= chunkOf(b.maxX + NEAR); cx++)
        for (let cz = chunkOf(b.minZ - NEAR); cz <= chunkOf(b.maxZ + NEAR); cz++) {
          const key = chunkKey(cx, cz);
          const listed = this.chunks.get(key);
          if (listed) listed.push(part);
          else this.chunks.set(key, [part]);
        }
    }
    this.reach = reach;
  }

  // Signed metres from (x, z) to the floor's edge, negative inside: exact within NEAR of the edge,
  // and further off at least NEAR either way.
  edge(x: number, z: number): number {
    let d = NEAR;
    for (const part of this.near(x, z)) d = Math.min(d, partDistance(x, z, part));
    return d;
  }

  inside(x: number, z: number): boolean {
    return this.near(x, z).some((part) => partDistance(x, z, part) < 0);
  }

  // The height of the ground at (x, z): the floor inside the edge, the ground past it.
  height(x: number, z: number): number {
    return this.inside(x, z) ? 0 : OUTSIDE_HEIGHT;
  }

  // Keeps `pos` within the world's reach, `margin` short of it: the one barrier, a circle round
  // everything, the same for a walker and a dragon.
  keepWithin(pos: Vec3, margin: number): void {
    const reach = this.reach - margin;
    const out = Math.hypot(pos.x, pos.z);
    if (out <= reach) return;
    pos.x *= reach / out;
    pos.z *= reach / out;
  }

  // Pushes a circle of `radius` at `pos` out of the slab's footprint, as the drop's face is a wall
  // to a body below the floor: straight out from the nearest stretch of edge.
  pushOut(pos: Vec3, radius: number): void {
    const e = this.edge(pos.x, pos.z);
    if (e >= radius) return;
    const h = 0.01;
    const gx = this.edge(pos.x + h, pos.z) - this.edge(pos.x - h, pos.z);
    const gz = this.edge(pos.x, pos.z + h) - this.edge(pos.x, pos.z - h);
    const g = Math.hypot(gx, gz);
    if (g < 1e-9) return;
    pos.x += (gx / g) * (radius - e);
    pos.z += (gz / g) * (radius - e);
  }

  // Where the unit ray (o, d) first meets the slab within maxT: the floor where it comes down onto
  // it (`top`), the drop's face where it runs into it from past the edge, or the ground beyond;
  // null if it meets none of it. Below the floor, past the edge, it's traced across by the edge's
  // distance, which is never more than the way to the slab.
  slab(o: Vec3, d: Vec3, maxT: number): { t: number; top: boolean } | null {
    let t = 0;
    if (o.y >= 0) {
      if (d.y >= 0) return null;
      t = -o.y / d.y;
      if (t > maxT) return null;
      if (this.inside(o.x + d.x * t, o.z + d.z * t)) return { t, top: true };
    } else if (this.inside(o.x, o.z)) return { t: 0, top: false };
    const ground = d.y < 0 ? (OUTSIDE_HEIGHT - o.y) / d.y : Infinity;
    const up = d.y > 0 ? -o.y / d.y : Infinity; // back above the floor, past its edge
    const end = Math.min(maxT, ground, up);
    const flat = Math.hypot(d.x, d.z);
    while (flat > 1e-9 && t < end) {
      const e = this.edge(o.x + d.x * t, o.z + d.z * t);
      if (e <= 1e-3) return { t, top: false };
      t += Math.max(e, 0.05) / flat;
    }
    return ground <= Math.min(maxT, up) ? { t: ground, top: false } : null;
  }

  // The parts of the floor that reach into the box, each once.
  partsIn(box: Bounds): WorldPart[] {
    const found = new Set<WorldPart>();
    for (let cx = chunkOf(box.minX); cx <= chunkOf(box.maxX); cx++)
      for (let cz = chunkOf(box.minZ); cz <= chunkOf(box.maxZ); cz++)
        for (const part of this.chunks.get(chunkKey(cx, cz)) ?? []) {
          const b = this.boxes.get(part)!;
          if (b.maxX >= box.minX && b.minX <= box.maxX && b.maxZ >= box.minZ && b.minZ <= box.maxZ) found.add(part);
        }
    return [...found];
  }

  // Keeps `pos` at least `padding` inside the floor. Finds the part the point is deepest in (or
  // nearest to) and pushes the point back onto that part's inset edge, which slides along the edge
  // and passes from a disc into a bridge without a seam.
  clamp(pos: Vec3, padding: number): void {
    let best: WorldPart | null = null;
    let bestD = Infinity;
    // Off the index (a walker turned back from a dragon far out), the nearest of all of them.
    const near = this.near(pos.x, pos.z);
    for (const part of near.length > 0 ? near : this.parts) {
      const d = partDistance(pos.x, pos.z, part);
      if (d < bestD) {
        bestD = d;
        best = part;
      }
    }
    if (!best || bestD <= -padding) return;

    if (best.kind === 'sector') {
      // Onto the nearest point of its edge, then `padding` back in from it.
      const q = closestOnSectorEdge(pos.x, pos.z, best);
      const out = (inSector(pos.x, pos.z, best) ? -1 : 1) / Math.max(Math.hypot(pos.x - q.x, pos.z - q.z), 1e-9);
      pos.x = q.x - (pos.x - q.x) * out * padding;
      pos.z = q.z - (pos.z - q.z) * out * padding;
      return;
    }
    if (best.kind === 'bend') {
      // Round the bend's middle: its bearing kept `padding` short of each end, measured along the
      // inner side, where an angle is the least metres, and its distance out kept between the sides.
      const along = padding / (best.r - best.halfWidth);
      const a = best.from + clamped(roundFrom(pos.x, pos.z, best), along, best.to - best.from - along);
      const out =
        best.r +
        clamped(
          Math.hypot(pos.x - best.x, pos.z - best.z) - best.r,
          padding - best.halfWidth,
          best.halfWidth - padding,
        );
      pos.x = best.x + out * Math.cos(a);
      pos.z = best.z + out * Math.sin(a);
      return;
    }
    if (best.kind === 'bridge' && best.square) {
      // In the bridge's own frame: along it and across it, each kept `padding` inside.
      const f = frameOf(best);
      const [along, across] = f.local(pos.x, pos.z);
      const u = clamped(along, padding, f.length - padding);
      const v = clamped(across, padding - best.halfWidth, best.halfWidth - padding);
      pos.x = best.ax + f.ux * u - f.uz * v;
      pos.z = best.az + f.uz * u + f.ux * v;
      return;
    }
    let cx: number;
    let cz: number;
    let radius: number;
    if (best.kind === 'disc') {
      cx = best.x;
      cz = best.z;
      radius = best.r - padding;
    } else {
      const q = closestOnSegment(pos.x, pos.z, best);
      cx = q.x;
      cz = q.z;
      radius = best.halfWidth - padding;
    }
    const dx = pos.x - cx;
    const dz = pos.z - cz;
    const dist = Math.hypot(dx, dz);
    if (dist < 1e-9) return;
    pos.x = cx + (dx / dist) * radius;
    pos.z = cz + (dz / dist) * radius;
  }

  // The parts listed for the chunk (x, z) is in: every one within NEAR of it. Off the index, none,
  // so a spot far from the floor is as far out as `edge` measures.
  private near(x: number, z: number): readonly WorldPart[] {
    return this.chunks.get(chunkKey(chunkOf(x), chunkOf(z))) ?? [];
  }
}

// Signed distance from (x, z) to one part's edge: negative inside.
export function partDistance(x: number, z: number, part: WorldPart): number {
  if (part.kind === 'disc') return Math.hypot(x - part.x, z - part.z) - part.r;
  if (part.kind === 'sector') {
    const q = closestOnSectorEdge(x, z, part);
    return (inSector(x, z, part) ? -1 : 1) * Math.hypot(x - q.x, z - q.z);
  }
  if (part.kind === 'bend') return bendDistance(x, z, part);
  if (part.square) {
    // A rectangle's: outside, to its nearest side or corner; inside, to its nearest side.
    const f = frameOf(part);
    const [along, across] = f.local(x, z);
    const u = Math.abs(along - f.length / 2) - f.length / 2;
    const v = Math.abs(across) - part.halfWidth;
    return Math.hypot(Math.max(u, 0), Math.max(v, 0)) + Math.min(Math.max(u, v), 0);
  }
  const q = closestOnSegment(x, z, part);
  return Math.hypot(x - q.x, z - q.z) - part.halfWidth;
}

// A bend's: between its ends, to the nearer of its sides, or inside it of an end's cut if that's
// nearer; past an end, to that end's cut.
function bendDistance(x: number, z: number, b: Bend): number {
  const out = Math.hypot(x - b.x, z - b.z);
  const round = roundFrom(x, z, b);
  const span = b.to - b.from;
  if (round <= span) {
    const side = Math.abs(out - b.r) - b.halfWidth;
    // Square to the line of each end's cut: with r past halfWidth, never nearer than a side
    // wherever the cut itself is further than its line.
    const toCut = (turn: number) => out * Math.sin(Math.min(turn, Math.PI / 2));
    return Math.max(side, -Math.min(toCut(round), toCut(span - round)));
  }
  const cut = (a: number) => {
    const [ux, uz] = [Math.cos(a), Math.sin(a)];
    const q = closestOnSegment(x, z, {
      ax: b.x + ux * (b.r - b.halfWidth),
      az: b.z + uz * (b.r - b.halfWidth),
      bx: b.x + ux * (b.r + b.halfWidth),
      bz: b.z + uz * (b.r + b.halfWidth),
    });
    return Math.hypot(x - q.x, z - q.z);
  };
  return Math.min(cut(b.from), cut(b.to));
}

// A bridge's own frame: the unit way along it from a to b, its length, and a point's metres along
// it from a and across it (to the left of the way along).
function frameOf(b: Bridge): { ux: number; uz: number; length: number; local(x: number, z: number): [number, number] } {
  const length = Math.hypot(b.bx - b.ax, b.bz - b.az);
  const ux = (b.bx - b.ax) / length;
  const uz = (b.bz - b.az) / length;
  return {
    ux,
    uz,
    length,
    local: (x, z) => [(x - b.ax) * ux + (z - b.az) * uz, (z - b.az) * ux - (x - b.ax) * uz],
  };
}

function clamped(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function chunkOf(v: number): number {
  return Math.floor(v / CHUNK);
}

// Chunks within 2^15 of the origin either way, each axis in 16 bits: 1,500 km across.
function chunkKey(cx: number, cz: number): number {
  return (cx + 32768) * 65536 + (cz + 32768);
}

export function partBounds(part: WorldPart): Bounds {
  if (part.kind === 'disc')
    return { minX: part.x - part.r, maxX: part.x + part.r, minZ: part.z - part.r, maxZ: part.z + part.r };
  if (part.kind === 'bridge' && !part.square)
    return {
      minX: Math.min(part.ax, part.bx) - part.halfWidth,
      maxX: Math.max(part.ax, part.bx) + part.halfWidth,
      minZ: Math.min(part.az, part.bz) - part.halfWidth,
      maxZ: Math.max(part.az, part.bz) + part.halfWidth,
    };
  const b = { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity };
  for (const [x, z] of rimOf(part))
    [b.minX, b.maxX, b.minZ, b.maxZ] = [
      Math.min(b.minX, x),
      Math.max(b.maxX, x),
      Math.min(b.minZ, z),
      Math.max(b.maxZ, z),
    ];
  return b;
}

function partReach(part: WorldPart): number {
  if (part.kind === 'disc') return Math.hypot(part.x, part.z) + part.r;
  if (part.kind === 'bridge' && !part.square)
    return Math.max(Math.hypot(part.ax, part.az), Math.hypot(part.bx, part.bz)) + part.halfWidth;
  return Math.max(...rimOf(part).map(([x, z]) => Math.hypot(x, z)));
}

// Points round the edge of a part with corners: a square bridge's four, and a slice's or a bend's
// with its round sides sampled, close enough to cover it.
function rimOf(part: Bridge | Bend | Sector): [number, number][] {
  if (part.kind === 'bridge') {
    const f = frameOf(part);
    const w = part.halfWidth;
    return [
      [part.ax - f.uz * w, part.az + f.ux * w],
      [part.ax + f.uz * w, part.az - f.ux * w],
      [part.bx - f.uz * w, part.bz + f.ux * w],
      [part.bx + f.uz * w, part.bz - f.ux * w],
    ];
  }
  const radii = part.kind === 'bend' ? [part.r - part.halfWidth, part.r + part.halfWidth] : [0, part.r];
  const rim: [number, number][] = [];
  for (let i = 0; i <= 64; i++) {
    const a = part.from + ((part.to - part.from) * i) / 64;
    for (const r of radii) rim.push([part.x + r * Math.cos(a), part.z + r * Math.sin(a)]);
  }
  return rim;
}

// Radians round from a slice's or a bend's `from` to (x, z)'s bearing from its middle, up to a
// whole turn.
function roundFrom(x: number, z: number, s: Sector | Bend): number {
  return (((Math.atan2(z - s.z, x - s.x) - s.from) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
}

// Whether (x, z)'s bearing from the slice's middle is between its sides.
function withinSpan(x: number, z: number, s: Sector): boolean {
  return roundFrom(x, z, s) <= s.to - s.from;
}

function inSector(x: number, z: number, s: Sector): boolean {
  return Math.hypot(x - s.x, z - s.z) <= s.r && withinSpan(x, z, s);
}

// The nearest point to (x, z) on the slice's edge: its round side, or either straight one.
function closestOnSectorEdge(x: number, z: number, s: Sector): { x: number; z: number } {
  const side = (a: number) =>
    closestOnSegment(x, z, { ax: s.x, az: s.z, bx: s.x + s.r * Math.cos(a), bz: s.z + s.r * Math.sin(a) });
  const candidates = [side(s.from), side(s.to)];
  const d = Math.hypot(x - s.x, z - s.z);
  if (d > 1e-9 && withinSpan(x, z, s))
    candidates.push({ x: s.x + ((x - s.x) * s.r) / d, z: s.z + ((z - s.z) * s.r) / d });
  let best = candidates[0];
  for (const c of candidates) if (Math.hypot(x - c.x, z - c.z) < Math.hypot(x - best.x, z - best.z)) best = c;
  return best;
}

function closestOnSegment(x: number, z: number, b: Pick<Bridge, 'ax' | 'az' | 'bx' | 'bz'>): { x: number; z: number } {
  const vx = b.bx - b.ax;
  const vz = b.bz - b.az;
  const len2 = vx * vx + vz * vz;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((x - b.ax) * vx + (z - b.az) * vz) / len2));
  return { x: b.ax + vx * t, z: b.az + vz * t };
}
