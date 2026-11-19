// The world's ground: the floor the outline draws (discs, straight bridges and pie slices, all
// unioned, authored in outline.ts), and past its edge the ground OUTSIDE_HEIGHT down. Everything
// that cares where the floor ends asks this: the sim (server and client alike, through
// Structures.ground), the renderers, the sky objects, the bots' map and every map.
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

// A straight corridor between two points. Its ends should sit inside the discs it joins.
export interface Bridge {
  kind: 'bridge';
  ax: number;
  az: number;
  bx: number;
  bz: number;
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

export type WorldPart = Disc | Bridge | Sector;

export interface Bounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

// Metres the ground past the world's edge stands above the floor: below it, so the edge drops to it
// and where you can't go reads from afar (render/Environment.ts).
export const OUTSIDE_HEIGHT = -10;

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

  constructor(readonly parts: readonly WorldPart[]) {
    this.bounds = { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity };
    let reach = 0;
    for (const part of parts) {
      const b = partBounds(part);
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

  // The parts of the floor that reach into the box, each once.
  partsIn(box: Bounds): WorldPart[] {
    const found = new Set<WorldPart>();
    for (let cx = chunkOf(box.minX); cx <= chunkOf(box.maxX); cx++)
      for (let cz = chunkOf(box.minZ); cz <= chunkOf(box.maxZ); cz++)
        for (const part of this.chunks.get(chunkKey(cx, cz)) ?? []) {
          const b = partBounds(part);
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
  const q = closestOnSegment(x, z, part);
  return Math.hypot(x - q.x, z - q.z) - part.halfWidth;
}

function chunkOf(v: number): number {
  return Math.floor(v / CHUNK);
}

// Chunks within 2^15 of the origin either way, each axis in 16 bits: 1,500 km across.
function chunkKey(cx: number, cz: number): number {
  return (cx + 32768) * 65536 + (cz + 32768);
}

function partBounds(part: WorldPart): Bounds {
  if (part.kind === 'disc')
    return { minX: part.x - part.r, maxX: part.x + part.r, minZ: part.z - part.r, maxZ: part.z + part.r };
  if (part.kind === 'bridge')
    return {
      minX: Math.min(part.ax, part.bx) - part.halfWidth,
      maxX: Math.max(part.ax, part.bx) + part.halfWidth,
      minZ: Math.min(part.az, part.bz) - part.halfWidth,
      maxZ: Math.max(part.az, part.bz) + part.halfWidth,
    };
  // A slice's middle, and its round side sampled: close enough to cover it.
  const b = { minX: part.x, maxX: part.x, minZ: part.z, maxZ: part.z };
  for (let i = 0; i <= 64; i++) {
    const a = part.from + ((part.to - part.from) * i) / 64;
    const [x, z] = [part.x + part.r * Math.cos(a), part.z + part.r * Math.sin(a)];
    [b.minX, b.maxX, b.minZ, b.maxZ] = [
      Math.min(b.minX, x),
      Math.max(b.maxX, x),
      Math.min(b.minZ, z),
      Math.max(b.maxZ, z),
    ];
  }
  return b;
}

function partReach(part: WorldPart): number {
  if (part.kind === 'bridge')
    return Math.max(Math.hypot(part.ax, part.az), Math.hypot(part.bx, part.bz)) + part.halfWidth;
  return Math.hypot(part.x, part.z) + part.r;
}

// Whether (x, z)'s bearing from the slice's middle is between its sides.
function withinSpan(x: number, z: number, s: Sector): boolean {
  const round = (((Math.atan2(z - s.z, x - s.x) - s.from) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI); // from `from`
  return round <= s.to - s.from;
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
