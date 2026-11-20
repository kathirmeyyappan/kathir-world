// Roads: a strip of floor laid through the points it's given, straight from each to the next and
// round a bend at each one between, with what stands on it where it's raised. The floor under a
// road is flat like all the floor (ground.ts), so a road's height is its bank, structures stood on
// that floor: a wedge under each stretch that climbs or drops, a block under each that runs level
// up off the floor. A gap is a stretch with neither floor nor bank, there to be jumped: a climb up
// to it one side and a drop away from it the other are a ramp each way. A stretch with a `pad` has
// a boost pad lying along it: to the sim a thin hidden piece whose surface boosts a kart
// (surfaces.ts `boost`), which the client draws as a panel (render/BoostPads.ts).
//
// A bank looks one of two ways. Under a padded stretch it's a ramp built on the floor, of stone.
// Anywhere else it's the floor itself risen: its pieces are hidden, and the client draws the road
// there with the floor's own look (`Raised`, render/RaisedGround.ts).
//
// A road is authored as runs (the world's are in outline.ts): each a straight to its point, cut
// into stretches end to end, and the bend it takes round that point into the next. `layRoad`
// turns one into its floor for the outline, its bank for the structures and its marks for the
// maps.
import type { Bend, WorldPart } from './ground';
import { ramp, type Structure, type StructureMaterial } from './structures';

export interface Point {
  x: number;
  z: number;
}

// A length of a run's straight. The road keeps the height it has from one stretch into the next,
// from the floor where it starts, and has to be back on the floor where it ends.
export interface Stretch {
  length?: number; // metres; left out, an even share of what the run's other stretches leave of it
  rise?: number; // metres the road climbs along it, or drops (negative); none, it runs level
  gap?: boolean; // no floor and no bank: the road carries on past it at the height it left at
  pad?: boolean; // a boost pad lies along it
}

export interface Run {
  to: Point; // where the run is headed: the corner the road turns at, or its end
  // Metres, along the road's middle, of the bend round that corner into the next run; left out,
  // the two runs just meet there, as they do in the middle of a disc that covers the corner.
  radius?: number;
  stretches?: Stretch[]; // the straight, end to end; left out, level the whole way
}

export interface RoadSpec {
  name: string; // for what's thrown when it can't be laid
  from: Point;
  width: number;
  runs: Run[];
}

// A length of a road the maps mark, from one end to the other along its middle.
interface Strip {
  ax: number;
  az: number;
  bx: number;
  bz: number;
  halfWidth: number;
}
// A stretch that climbs, from its foot to its top.
export interface Slope extends Strip {
  kind: 'slope';
}
// A boost pad, from the end its arrows point from to the one they point at (up a climb, and along
// a level stretch the way the road runs), with the height of its top at each.
export interface Pad extends Strip {
  kind: 'pad';
  ay: number;
  by: number;
}
export type RoadMark = Slope | Pad;

// A length of a road up off the floor that's drawn as the floor risen, as wide as its bank: a
// straight from a to b with the height of its top at each, or a level bend, a strip round (x, z)
// from one bearing to another (radians, from +x toward +z).
export type Raised =
  | { kind: 'straight'; ax: number; ay: number; az: number; bx: number; by: number; bz: number; halfWidth: number }
  | { kind: 'bend'; x: number; z: number; r: number; from: number; to: number; y: number; halfWidth: number };

export interface Road {
  floor: WorldPart[];
  bank: Structure[]; // with its boost pads' pieces
  marks: RoadMark[];
  raised: Raised[];
}

export const level = (length?: number): Stretch => ({ length });
export const climb = (length: number, rise: number): Stretch => ({ length, rise });
export const gap = (length: number): Stretch => ({ length, gap: true });
export const padded = (stretch: Stretch): Stretch => ({ ...stretch, pad: true });
// A gap with a ramp either side of it, `run` long and `rise` high, so it's jumped both ways.
export const jump = (run: number, rise: number, across: number): Stretch[] => [
  climb(run, rise),
  gap(across),
  climb(run, -rise),
];

const BANK: StructureMaterial = 'flagstone';
// Metres a bank stands in from the floor's edge, along the road's sides and at a gap, so its faces
// rise out of the kerb drawn there (the client's Floor.ts) and none lies in the plane of the drop.
const SHOULDER = 0.25;
// Metres each piece runs on into the next, floor and bank alike, so no seam between two is a gap.
const LAP = 0.05;
const SLICE = 6; // metres of a bend, along its middle, under one block of its bank
// A boost pad: its share of the road's width, the metres it stops short of its stretch's ends, and
// the metres its top lies over the road's, so the two share no plane.
const PAD = { across: 0.8, inset: 1, lift: 0.04 };

// A road cut into the pieces it's laid as, in order, each with the height the road has there.
type Leg =
  | { kind: 'straight'; run: number; a: Point; b: Point; from: number; to: number; pad: boolean }
  | { kind: 'bend'; x: number; z: number; r: number; start: number; turn: number; height: number }
  | { kind: 'gap' };

export function layRoad(spec: RoadSpec): Road {
  const legs = legsOf(spec);
  const half = spec.width / 2;
  const road: Road = { floor: [], bank: [], marks: [], raised: [] };
  let floorFrom: Point | null = null; // where the floor being laid began: one part for a run's stretches with no gap between
  legs.forEach((leg, i) => {
    if (leg.kind === 'gap') return;
    const joins = (other: Leg | undefined) => other !== undefined && other.kind !== 'gap';
    const [before, after] = [joins(legs[i - 1]), joins(legs[i + 1])];
    if (leg.kind === 'bend') {
      const lap = LAP / leg.r;
      road.floor.push(bendPart(leg, after ? lap : 0, half));
      if (leg.height > 0) {
        const { x, z, r, start, turn, height: y } = leg;
        road.bank.push(...bendBank(leg, half - SHOULDER, lap).map(risen));
        road.raised.push({ kind: 'bend', x, z, r, from: start, to: start + turn, y, halfWidth: half - SHOULDER });
      }
      return;
    }
    const along = unit(leg.a, leg.b);
    const moved = (p: Point, by: number): Point => ({ x: p.x + along.x * by, z: p.z + along.z * by });
    floorFrom ??= leg.a;
    const next = legs[i + 1];
    if (next?.kind !== 'straight' || next.run !== leg.run) {
      const end = moved(leg.b, after ? LAP : 0);
      const [ax, az, bx, bz] = [floorFrom.x, floorFrom.z, end.x, end.z];
      road.floor.push({ kind: 'bridge', ax, az, bx, bz, halfWidth: half, square: true });
      floorFrom = null;
    }
    // The bank stops short of a gap and of the road's own ends, and laps into a leg it joins.
    const a = moved(leg.a, before ? 0 : SHOULDER);
    const b = moved(leg.b, after ? 0 : -SHOULDER);
    const width = spec.width - 2 * SHOULDER;
    const low = Math.min(leg.from, leg.to);
    const rise = Math.abs(leg.to - leg.from);
    // Its low end and its high one; a level stretch's are the way the road runs.
    const [foot, top] = leg.from <= leg.to ? [a, b] : [b, a];
    // A padded stretch's bank is a ramp built there; any other is the floor risen.
    const looked = leg.pad ? (piece: Structure) => piece : risen;
    if (low > 0) road.bank.push(looked(block(moved(a, before ? -LAP : 0), moved(b, after ? LAP : 0), width, low)));
    if (rise > 0) {
      road.bank.push(looked({ ...ramp(foot, top, rise, width, low), material: BANK }));
      road.marks.push({ kind: 'slope', ax: foot.x, az: foot.z, bx: top.x, bz: top.z, halfWidth: half });
    }
    if (!leg.pad && low + rise > 0) {
      const [ay, by] = [leg.from, leg.to];
      road.raised.push({ kind: 'straight', ax: a.x, ay, az: a.z, bx: b.x, by, bz: b.z, halfWidth: width / 2 });
    }
    if (!leg.pad) return;
    // The pad: a sliver of the stretch's own shape lying on it, in from its ends and its sides,
    // hidden, the panel drawn there being the client's.
    const length = distance(foot, top);
    const way = unit(foot, top);
    const from = { x: foot.x + way.x * PAD.inset, z: foot.z + way.z * PAD.inset };
    const to = { x: top.x - way.x * PAD.inset, z: top.z - way.z * PAD.inset };
    const across = spec.width * PAD.across;
    const under = low + (rise * PAD.inset) / length; // the road's height where the pad begins
    const climbs = rise * (1 - (2 * PAD.inset) / length); // and what it climbs under the pad
    const pad =
      rise > 0 ? ramp(from, to, climbs, across, under + PAD.lift) : { ...block(from, to, across, PAD.lift), y: under };
    road.bank.push({ ...pad, hidden: true, surface: 'boost' });
    const [ay, by] = [under + PAD.lift, under + PAD.lift + climbs];
    road.marks.push({ kind: 'pad', ax: from.x, ay, az: from.z, bx: to.x, by, bz: to.z, halfWidth: across / 2 });
  });
  return road;
}

// The road's runs as legs: each run's straight between the bends at its ends, cut into its
// stretches, then the bend round its corner. Throws, naming the road, on one that can't be laid.
function legsOf(spec: RoadSpec): Leg[] {
  const bad = (why: string) => new Error(`road ${spec.name}: ${why}`);
  const points = [spec.from, ...spec.runs.map((r) => r.to)];
  // Each corner's bend, by the point it rounds: how far back along either run it takes up.
  const corners = spec.runs.slice(0, -1).map((run, i) => {
    const [into, out] = [unit(points[i], points[i + 1]), unit(points[i + 1], points[i + 2])];
    const turn = Math.atan2(into.x * out.z - into.z * out.x, into.x * out.x + into.z * out.z); // toward +z from +x
    if (run.radius === undefined || Math.abs(turn) < 1e-6) return null;
    if (run.radius <= spec.width / 2) throw bad(`the bend at run ${i}'s end is tighter than half the road's width`);
    return { radius: run.radius, turn, takes: run.radius * Math.tan(Math.abs(turn) / 2) };
  });
  const legs: Leg[] = [];
  let height = 0;
  spec.runs.forEach((run, i) => {
    const along = unit(points[i], points[i + 1]);
    const [before, after] = [corners[i - 1]?.takes ?? 0, corners[i]?.takes ?? 0];
    const length = distance(points[i], points[i + 1]) - before - after;
    const stretches = run.stretches ?? [level()];
    const given = stretches.reduce((sum, s) => sum + (s.length ?? 0), 0);
    const shared = stretches.filter((s) => s.length === undefined).length;
    if (given > length + 1e-9 || (shared === 0 && given < length - 1e-9))
      throw bad(`run ${i}'s stretches come to ${given} m of its ${length.toFixed(2)} m`);
    let at = before;
    const point = (d: number): Point => ({ x: points[i].x + along.x * d, z: points[i].z + along.z * d });
    for (const s of stretches) {
      const d = s.length ?? (length - given) / shared;
      if (s.gap) {
        if (s.rise) throw bad(`a gap in run ${i} has a rise`);
        legs.push({ kind: 'gap' });
      } else {
        const to = snapped(height + (s.rise ?? 0));
        if (to < 0) throw bad(`run ${i} drops below the floor`);
        legs.push({ kind: 'straight', run: i, a: point(at), b: point(at + d), from: height, to, pad: s.pad ?? false });
        height = to;
      }
      at += d;
    }
    const corner = corners[i];
    if (!corner) return;
    // Round the corner from where the straight stopped: the bend's middle is a radius off to the
    // side it turns to.
    const side = Math.sign(corner.turn);
    const start = point(at);
    const x = start.x - along.z * side * corner.radius;
    const z = start.z + along.x * side * corner.radius;
    legs.push({
      kind: 'bend',
      x,
      z,
      r: corner.radius,
      start: Math.atan2(start.z - z, start.x - x),
      turn: corner.turn,
      height,
    });
  });
  if (height !== 0) throw bad(`ends ${height} m up`);
  return legs;
}

// A piece of the bank where it's the floor risen: collided with, and drawn by the client as that.
function risen(piece: Structure): Structure {
  return { ...piece, hidden: true };
}

// A height with the rounding of summed rises taken off, so a road that comes back down is on the floor.
function snapped(height: number): number {
  return Math.abs(height) < 1e-9 ? 0 : height;
}

// A bend's floor, run on by `lap` radians past its end.
function bendPart(leg: Extract<Leg, { kind: 'bend' }>, lap: number, halfWidth: number): Bend {
  const [from, to] = leg.turn > 0 ? [leg.start, leg.start + leg.turn + lap] : [leg.start + leg.turn - lap, leg.start];
  return { kind: 'bend', x: leg.x, z: leg.z, r: leg.r, from, to, halfWidth };
}

// A level bank round a bend: blocks across the road, each over a slice of the bend and wide
// enough along its outer side to meet the next, the first and last lapping into the legs it joins.
function bendBank(leg: Extract<Leg, { kind: 'bend' }>, halfWidth: number, lap: number): Structure[] {
  const slices = Math.ceil((leg.r * Math.abs(leg.turn)) / SLICE);
  const slice = leg.turn / slices;
  const depth = 2 * (leg.r + halfWidth) * Math.tan(Math.abs(slice) / 2 + lap);
  return Array.from({ length: slices }, (_, k) => {
    const a = leg.start + slice * (k + 0.5);
    return {
      kind: 'box',
      x: leg.x + leg.r * Math.cos(a),
      z: leg.z + leg.r * Math.sin(a),
      w: 2 * halfWidth,
      d: depth,
      h: leg.height,
      yaw: -a, // its length along the road, which runs square to the bearing from the bend's middle
      material: BANK,
    };
  });
}

// A block of the bank from a to b, `width` across, from the floor up to `height`.
function block(a: Point, b: Point, width: number, height: number): Structure {
  return {
    kind: 'box',
    x: (a.x + b.x) / 2,
    z: (a.z + b.z) / 2,
    w: width,
    d: distance(a, b),
    h: height,
    yaw: Math.atan2(b.x - a.x, b.z - a.z),
    material: BANK,
  };
}

function distance(a: Point, b: Point): number {
  return Math.hypot(b.x - a.x, b.z - a.z);
}

function unit(a: Point, b: Point): Point {
  const d = distance(a, b);
  return { x: (b.x - a.x) / d, z: (b.z - a.z) / d };
}
