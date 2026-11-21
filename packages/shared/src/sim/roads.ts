// Roads: a strip of floor laid through the points it's given, straight from each to the next and
// round a bend at each one between, with what stands on it where it's raised. The floor under a
// road is flat like all the floor (ground.ts), so a road's height is its bank, structures stood on
// that floor: a wedge under each stretch that climbs or drops, a block under each that runs level
// up off the floor, or where it's `open` a deck with room under it, for another road to pass
// beneath; a bend up off the floor is a level bank round it, or a deck the same. A deck has no
// floor of its own: under it is whatever other road's floor it goes over, or nothing. A gap is a
// stretch with neither floor nor bank, there to be jumped: a climb up
// to it one side and a drop away from it the other are a ramp each way. A stretch with a `pad` has
// a boost pad lying along it: to the sim a thin hidden piece whose surface boosts a kart
// (surfaces.ts `boost`), which the client draws as a panel (render/BoostPads.ts).
//
// A bank looks one of two ways. Under a padded stretch that climbs it's a ramp built on the floor,
// of stone. Anywhere else it's the floor itself risen: its pieces are hidden, and the client draws
// the road there with the floor's own look (`Raised`, render/RaisedGround.ts), a pad lying on it
// where a level stretch up off the floor has one.
//
// A road is authored as runs (the world's are in outline.ts): each a straight to its point, cut
// into stretches end to end, and the bend it takes round that point into the next. `layRoad`
// turns one into its floor for the outline, its bank for the structures and its marks for the
// maps.
import type { Bend, WorldPart } from './ground';
import { ramp, type Box, type Structure, type StructureMaterial } from './structures';

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
  // Up off the floor: a deck with nothing under it, not even floor, where a bank would wall off
  // what passes beneath, as thick where it climbs as where it runs level.
  open?: boolean;
  pad?: boolean; // a boost pad lies along it
  // The side of it, as the road runs, that another deck at its height runs along, where a road
  // splits in two or its two strands come together: the two are one surface there, so it has no
  // wall and no kerb's line down that side.
  bare?: Bare;
  split?: Split; // the road is two strands along it, which fork at its start and come together at its end
}

// How a road splits in two along a stretch of deck: its strands swing `out` metres to either side
// over `fork` metres of the way, run on side by side, and swing back over as far to come together
// at the stretch's end. Once clear of each other the left one climbs `rise` and the right one
// drops `fall`, each over `climb` metres, and they come back to the road's height before they
// meet again; with `pad`, each has a boost pad halfway.
export interface Split {
  out: number;
  fork: number;
  rise: number;
  fall: number;
  climb: number;
  pad?: boolean;
}

export type Bare = 'left' | 'right' | 'both';

export interface Run {
  to: Point; // where the run is headed: the corner the road turns at, or its end
  // Metres, along the road's middle, of the bend round that corner into the next run; left out,
  // the two runs just meet there, as they do in the middle of a disc that covers the corner.
  radius?: number;
  open?: boolean; // that bend, up off the floor, is a deck with nothing under it
  pads?: number[]; // boost pads lying along that bend, each by how far round it it is, 0 to 1
  stretches?: Stretch[]; // the straight, end to end; left out, level the whole way
}

export interface RoadSpec {
  name: string; // for what's thrown when it can't be laid
  from: Point;
  width: number;
  runs: Run[];
  // The height it starts at and the height it ends at, where that end is up on another road's deck:
  // a strand of a road that splits, or the road either side of the split. Its deck runs on into
  // the other's there, with no shoulder left. An end left out is on the floor.
  joins?: { from?: number; to?: number };
}

// A length of a road the maps mark, from one end to the other along its middle, with the height
// of its top at each.
interface Strip {
  ax: number;
  ay: number;
  az: number;
  bx: number;
  by: number;
  bz: number;
  halfWidth: number;
}
// A stretch that climbs, from its foot to its top.
export interface Slope extends Strip {
  kind: 'slope';
}
// A boost pad, from the end its arrows point from to the one they point at (up a climb, and along
// a level stretch the way the road runs).
export interface Pad extends Strip {
  kind: 'pad';
}
// A deck something can pass under, with the side of it another deck runs along, if one does.
export interface Span extends Strip {
  kind: 'span';
  bare?: Bare;
}
// A deck round a bend: a strip round (x, z) from one bearing on to another (radians, from +x toward
// +z), its top at height y.
export interface Sweep {
  kind: 'sweep';
  x: number;
  y: number;
  z: number;
  r: number;
  from: number;
  to: number;
  halfWidth: number;
}
export type RoadMark = Slope | Pad | Span | Sweep;

// A length of a road up off the floor that's drawn as the floor risen, a hair wider than the
// floor under it (PROUD): a
// straight from a to b with the height of its top at each, or a level bend, a strip round (x, z)
// from one bearing to another (radians, from +x toward +z) at height y; either with how far down
// it goes (`deep`: a deck's thickness, its underside as far under its top all along, or for a bank,
// which stands on the floor, Infinity).
export type Raised =
  | {
      kind: 'straight';
      ax: number;
      ay: number;
      az: number;
      bx: number;
      by: number;
      bz: number;
      deep: number;
      halfWidth: number;
      bare?: Bare; // the side another deck at its height runs along: no wall or line there
      caps: Caps;
    }
  | {
      kind: 'bend';
      x: number;
      z: number;
      r: number;
      from: number;
      to: number;
      y: number;
      deep: number;
      halfWidth: number;
      caps: Caps;
    };
// The height the wall across each end of a risen length hangs from, the end it starts at and the
// end it stops at (a bend's, at its `from` and its `to`): its top where the road stops or breaks
// off there, the underside of a deck that carries on from a bank, and null where what carries on
// covers the whole end, so there's no wall to draw.
export type Caps = [number | null, number | null];

export interface Road {
  floor: WorldPart[];
  bank: Structure[]; // with its boost pads' pieces
  marks: RoadMark[];
  raised: Raised[];
}

export const level = (length?: number): Stretch => ({ length });
export const climb = (length: number, rise: number): Stretch => ({ length, rise });
export const gap = (length: number): Stretch => ({ length, gap: true });
export const span = (length?: number): Stretch => ({ length, open: true });
export const padded = (stretch: Stretch): Stretch => ({ ...stretch, pad: true });
export const split = (length: number, shape: Split): Stretch => ({ length, open: true, split: shape });
const GRADE = 4; // metres of road to one flat length of a graded climb
// A climb of `rise` over `length` (a drop, negative) that eases in and out: level at both its ends
// and steepest in its middle, half again as steep there as a straight climb would be, laid as a run
// of short lengths along that S. `deck`, each is a length of deck.
export const grade = (length: number, rise: number, deck = false): Stretch[] => {
  if (rise === 0) return [deck ? span(length) : level(length)];
  const lengths = Math.max(2, Math.round(length / GRADE));
  const eased = (u: number) => u * u * (3 - 2 * u);
  return Array.from({ length: lengths }, (_, k) => ({
    length: length / lengths,
    rise: rise * (eased((k + 1) / lengths) - eased(k / lengths)),
    ...(deck && { open: true }),
  }));
};
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
// Metres past the floor's edge under it, each side, that a risen road is drawn out to: its walls
// stand a hair proud of the drop's face there and cover the kerb along it, so a risen road's side
// is one grey wall up from the drop, with none of the kerb's green along its foot.
const PROUD = 0.02;
// Metres each piece of the bank runs on into the next, so no seam between two is a gap.
const LAP = 0.05;
// Metres a length of the floor runs on, at each end, into the leg it joins there. The ground's
// distance to its edge is each part's own (ground.ts), so where two only just meet, the joint
// itself is nearly an edge to it; lapped this far, it's as deep in the floor there as the lap,
// further than the kerb the client draws in from an edge (Floor.ts), which would leave a slit.
const FLOOR_LAP = 1;
const SLICE = 6; // metres of a bend, along its middle, under one block of its bank
const DECK = 1.4; // metres through an open stretch's deck
// Metres a deck's bank may be thicker than the deck where it climbs: its pieces are wedges, flat
// underneath, so a climb is a run of them short enough to keep within this of an even thickness.
const STEP = 0.5;
// A split's strands: metres along the middle of the bend each takes out of the fork and into the
// meeting, and the metres past where their inner sides part that they still count as one surface.
const STRAND = { radius: 60, spare: 2 };
const HEADROOM = 4; // metres clear under a deck, at the least: a kart, its driver and the eye that follows them
// A boost pad: its share of the road's width, the metres it stops short of its stretch's ends, and
// the metres its top lies over the road's, so the two share no plane.
// One on a bend is a straight length of its own, `round` metres, lying along the bend there.
const PAD = { across: 0.8, inset: 1, lift: 0.04, round: 10 };

// A road cut into the pieces it's laid as, in order, each with the height the road has there.
type Leg =
  | {
      kind: 'straight';
      run: number;
      a: Point;
      b: Point;
      from: number;
      to: number;
      open: boolean;
      pad: boolean;
      bare?: Bare;
    }
  | {
      kind: 'bend';
      x: number;
      z: number;
      r: number;
      start: number;
      turn: number;
      height: number;
      open: boolean;
      pads: number[];
    }
  | { kind: 'split'; a: Point; b: Point; height: number; shape: Split; open: true }
  | { kind: 'gap' };

export function layRoad(spec: RoadSpec): Road {
  const legs = legsOf(spec);
  const half = spec.width / 2;
  const road: Road = { floor: [], bank: [], marks: [], raised: [] };
  let floorFrom: Point | null = null; // where the floor being laid began: one part for a run's stretches with no gap between
  // A level boost pad from `from` to `to` on the road at height `y`: a sliver lying on it there, in
  // from its sides, hidden, the panel drawn there being the client's.
  const lie = (from: Point, to: Point, y: number) => {
    const across = spec.width * PAD.across;
    const top = y + PAD.lift;
    road.bank.push({ ...block(from, to, across, PAD.lift), y, hidden: true, surface: 'boost' });
    road.marks.push({
      kind: 'pad',
      ax: from.x,
      ay: top,
      az: from.z,
      bx: to.x,
      by: top,
      bz: to.z,
      halfWidth: across / 2,
    });
  };
  legs.forEach((leg, i) => {
    if (leg.kind === 'gap') return;
    if (leg.kind === 'split') {
      // Each strand is a road of its own from the fork to the meeting, laid as part of this one.
      for (const strand of strandsOf(spec, leg)) {
        const laid = layRoad(strand);
        road.bank.push(...laid.bank);
        road.marks.push(...laid.marks);
        road.raised.push(...laid.raised);
      }
      return;
    }
    const joins = (other: Leg | undefined) => other !== undefined && other.kind !== 'gap';
    // An end up on another road's deck joins that deck, as a leg joins the next.
    const [first, last] = [
      i === 0 && spec.joins?.from !== undefined,
      i === legs.length - 1 && spec.joins?.to !== undefined,
    ];
    const [before, after] = [first || joins(legs[i - 1]), last || joins(legs[i + 1])];
    // The height the wall across an end of this leg hangs from (Caps), `top` its own there: all of
    // it where nothing joins it, and where something does, only what a deck leaves bare of a bank.
    // An end up on another road's deck has that deck carrying on from it.
    const hang = (joined: boolean, other: Leg | undefined, top: number, open: boolean): number | null => {
      if (!joined) return top;
      const deck = other === undefined || (other.kind !== 'gap' && other.open);
      return deck && !open ? top - DECK : null;
    };
    // Floor is laid under every leg but a gap and a deck, which is over whatever's there already:
    // another road's floor, or nothing.
    const floored = (other: Leg | undefined) => joins(other) && !other.open;
    const [floorBefore, floorAfter] = [floored(legs[i - 1]), floored(legs[i + 1])];
    if (leg.kind === 'bend') {
      const lap = LAP / leg.r;
      if (!leg.open)
        road.floor.push(bendPart(leg, floorBefore ? FLOOR_LAP / leg.r : 0, floorAfter ? FLOOR_LAP / leg.r : 0, half));
      if (leg.height > 0) {
        const { x, z, r, start, turn, height: y } = leg;
        const under = leg.open ? y - DECK : 0; // what its bank stands on: the floor, or for a deck its own underside
        const [from, to] = turn > 0 ? [start, start + turn] : [start + turn, start];
        road.bank.push(...bendBank(leg, half - SHOULDER, lap, under).map(risen));
        const deep = leg.open ? DECK : Infinity;
        const ends: Caps = [hang(before, legs[i - 1], y, leg.open), hang(after, legs[i + 1], y, leg.open)];
        const caps: Caps = turn > 0 ? ends : [ends[1], ends[0]];
        road.raised.push({ kind: 'bend', x, z, r, from, to, y, deep, halfWidth: half + PROUD, caps });
        if (leg.open) road.marks.push({ kind: 'sweep', x, y, z, r, from, to, halfWidth: half });
      }
      // Its pads, each lying along the bend where it's that far round, the way the road runs.
      for (const share of leg.pads) {
        const [a, way] = [leg.start + leg.turn * share, Math.sign(leg.turn)];
        const [mx, mz] = [leg.x + leg.r * Math.cos(a), leg.z + leg.r * Math.sin(a)];
        const [tx, tz] = [(-Math.sin(a) * way * PAD.round) / 2, (Math.cos(a) * way * PAD.round) / 2];
        lie({ x: mx - tx, z: mz - tz }, { x: mx + tx, z: mz + tz }, leg.height);
      }
      return;
    }
    const along = unit(leg.a, leg.b);
    const moved = (p: Point, by: number): Point => ({ x: p.x + along.x * by, z: p.z + along.z * by });
    if (!leg.open) {
      floorFrom ??= moved(leg.a, floorBefore ? -FLOOR_LAP : 0);
      const next = legs[i + 1];
      if (next?.kind !== 'straight' || next.run !== leg.run || next.open) {
        const end = moved(leg.b, floorAfter ? FLOOR_LAP : 0);
        const [ax, az, bx, bz] = [floorFrom.x, floorFrom.z, end.x, end.z];
        road.floor.push({ kind: 'bridge', ax, az, bx, bz, halfWidth: half, square: true });
        floorFrom = null;
      }
    }
    // The bank stops short of a gap and of the road's own ends, and laps into a leg it joins.
    const a = moved(leg.a, before ? 0 : SHOULDER);
    const b = moved(leg.b, after ? 0 : -SHOULDER);
    const width = spec.width - 2 * SHOULDER;
    const low = Math.min(leg.from, leg.to);
    const rise = Math.abs(leg.to - leg.from);
    // Its low end and its high one; a level stretch's are the way the road runs.
    const [foot, top] = leg.from <= leg.to ? [a, b] : [b, a];
    // A padded climb's bank is a ramp built there; any other is the floor risen.
    const built = leg.pad && rise > 0;
    const looked = built ? (piece: Structure) => piece : risen;
    // Its bank: a block up to its low end, a deck's only DECK through, and on that the wedge of
    // its climb; a deck that climbs, as a run of those.
    const lengths = leg.open ? Math.max(1, Math.ceil(rise / STEP)) : 1;
    for (let k = 0; k < lengths; k++) {
      const at = (share: number): [Point, number] => [
        { x: a.x + (b.x - a.x) * share, z: a.z + (b.z - a.z) * share },
        leg.from + (leg.to - leg.from) * share,
      ];
      const [[p, hp], [q, hq]] = [at(k / lengths), at((k + 1) / lengths)];
      const bottom = Math.min(hp, hq);
      if (bottom > 0) {
        const lapped = block(
          moved(p, k > 0 || before ? -LAP : 0),
          moved(q, k < lengths - 1 || after ? LAP : 0),
          width,
          bottom,
        );
        road.bank.push(looked(leg.open ? { ...lapped, h: DECK, y: bottom - DECK } : lapped));
      }
      if (rise > 0) {
        const [lower, higher] = hp <= hq ? [p, q] : [q, p];
        road.bank.push(looked({ ...ramp(lower, higher, rise / lengths, width, bottom), material: BANK }));
      }
    }
    if (rise > 0) {
      const [ax, az, bx, bz] = [foot.x, foot.z, top.x, top.z];
      road.marks.push({ kind: 'slope', ax, ay: low, az, bx, by: low + rise, bz, halfWidth: half });
    }
    // What's drawn of it, and marked where it's a deck: one length, but for the few metres next to
    // a split, where the strands' outer sides run out from inside its own and it's bare both sides,
    // the sides drawn there being theirs.
    const reach = distance(a, b);
    const [head, tail] = [legs[i - 1], legs[i + 1]].map((other) =>
      other?.kind === 'split' ? Math.min(reach / 2, merged(spec.width, other.shape)) : 0,
    );
    const cuts = [...new Set([0, head, reach - tail, reach])];
    for (let k = 0; k + 1 < cuts.length; k++) {
      const [from, to] = [cuts[k], cuts[k + 1]];
      const [p, q] = [moved(a, from), moved(b, to - reach)];
      const [ay, by] = [from, to].map((d) => leg.from + ((leg.to - leg.from) * d) / reach);
      const bare = (k === 0 && head > 0) || (k === cuts.length - 2 && tail > 0) ? 'both' : leg.bare;
      const [ax, az, bx, bz] = [p.x, p.z, q.x, q.z];
      if (leg.open) road.marks.push({ kind: 'span', ax, ay, az, bx, by, bz, halfWidth: half, bare });
      if (built || low + rise === 0) continue;
      const caps: Caps = [
        k === 0 ? hang(before, legs[i - 1], ay, leg.open) : null,
        k === cuts.length - 2 ? hang(after, legs[i + 1], by, leg.open) : null,
      ];
      const deep = leg.open ? DECK : Infinity;
      road.raised.push({ kind: 'straight', ax, ay, az, bx, by, bz, deep, halfWidth: half + PROUD, bare, caps });
    }
    if (!leg.pad) return;
    // The pad lies on the stretch, in from its ends: level with it, or up a climb a sliver of the
    // climb's own shape.
    const length = distance(foot, top);
    const way = unit(foot, top);
    const from = { x: foot.x + way.x * PAD.inset, z: foot.z + way.z * PAD.inset };
    const to = { x: top.x - way.x * PAD.inset, z: top.z - way.z * PAD.inset };
    if (rise === 0) return lie(from, to, low);
    const across = spec.width * PAD.across;
    const under = low + (rise * PAD.inset) / length; // the road's height where the pad begins
    const climbs = rise * (1 - (2 * PAD.inset) / length); // and what it climbs under the pad
    road.bank.push({ ...ramp(from, to, climbs, across, under + PAD.lift), hidden: true, surface: 'boost' });
    const [ay, by] = [under + PAD.lift, under + PAD.lift + climbs];
    road.marks.push({ kind: 'pad', ax: from.x, ay, az: from.z, bx: to.x, by, bz: to.z, halfWidth: across / 2 });
  });
  road.marks = joined(road.marks);
  return road;
}

// The marks with every slope that carries straight on into the next, the same way up, made one
// with it: a climb laid as many short lengths (`grade`) is one slope to the maps, foot to top.
function joined(marks: RoadMark[]): RoadMark[] {
  const out: RoadMark[] = [];
  let last = -1; // the slope last kept
  const meet = (ax: number, ay: number, az: number, bx: number, by: number, bz: number) =>
    Math.hypot(ax - bx, ay - by, az - bz) < 1e-6;
  for (const mark of marks) {
    const before = out[last];
    if (mark.kind === 'slope' && before?.kind === 'slope') {
      if (meet(before.bx, before.by, before.bz, mark.ax, mark.ay, mark.az)) {
        out[last] = { ...before, bx: mark.bx, by: mark.by, bz: mark.bz };
        continue;
      }
      if (meet(mark.bx, mark.by, mark.bz, before.ax, before.ay, before.az)) {
        out[last] = { ...before, ax: mark.ax, ay: mark.ay, az: mark.az };
        continue;
      }
    }
    if (mark.kind === 'slope') last = out.length;
    out.push(mark);
  }
  return out;
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
  let height = spec.joins?.from ?? 0;
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
      } else if (s.split) {
        if (s.rise) throw bad(`a split in run ${i} has a rise`);
        if (height - s.split.fall < DECK + HEADROOM)
          throw bad(`a split in run ${i} hasn't ${HEADROOM} m clear under it`);
        legs.push({ kind: 'split', a: point(at), b: point(at + d), height, shape: s.split, open: true });
      } else {
        const to = snapped(height + (s.rise ?? 0));
        if (to < 0) throw bad(`run ${i} drops below the floor`);
        if (s.open && Math.min(height, to) < DECK + HEADROOM)
          throw bad(`a deck in run ${i} hasn't ${HEADROOM} m clear under it`);
        const [open, pad] = [s.open ?? false, s.pad ?? false];
        if (s.bare && (!open || to !== height))
          throw bad(`a stretch in run ${i} is bare along a side and no level deck`);
        legs.push({
          kind: 'straight',
          run: i,
          a: point(at),
          b: point(at + d),
          from: height,
          to,
          open,
          pad,
          bare: s.bare,
        });
        height = to;
      }
      at += d;
    }
    const corner = corners[i];
    const open = run.open ?? false;
    if (open && (!corner || height < DECK + HEADROOM))
      throw bad(`run ${i}'s bend is no deck: there's none, or not ${HEADROOM} m clear under it`);
    if (run.pads?.length && !corner) throw bad(`run ${i} has pads for a bend it hasn't got`);
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
      open,
      pads: run.pads ?? [],
    });
  });
  const end = spec.joins?.to ?? 0;
  if (height !== end) throw bad(`ends ${height} m up, not ${end}`);
  return legs;
}

// The two strands of a split, each as a road from the fork to the meeting, up on the road's deck
// at both ends: out round a bend to its own side, along beside the other, and back round a bend.
// From the fork until their inner sides part, and again into the meeting, the two are one level
// surface, bare along the side they share; and for the first few metres from the fork, and the
// last into the meeting, each one's outer side is still inside the road's own, so it's bare there
// too.
function strandsOf(spec: RoadSpec, leg: Extract<Leg, { kind: 'split' }>): RoadSpec[] {
  const { out, fork, rise, fall, climb, pad } = leg.shape;
  const along = unit(leg.a, leg.b);
  const length = distance(leg.a, leg.b);
  const shared = spec.width / 2 / Math.tan(Math.atan2(out, fork)) + STRAND.spare;
  const inside = merged(spec.width, leg.shape);
  return ([1, -1] as const).map((side) => {
    // `d` metres along the stretch and `out` to this strand's side of it: the left's is +1.
    const corner = (d: number): Point => ({
      x: leg.a.x + along.x * d - along.z * out * side,
      z: leg.a.z + along.z * d + along.x * out * side,
    });
    const bare = side > 0 ? 'right' : 'left';
    const one: Stretch[] = [
      { ...span(inside), bare: 'both' },
      { ...span(shared - inside), bare },
    ];
    const change = side > 0 ? rise : -fall;
    const middle = pad ? [span(), padded(span(PAD.round)), span()] : [span()];
    return {
      name: `${spec.name}, the ${side > 0 ? 'left' : 'right'} strand`,
      from: leg.a,
      width: spec.width,
      joins: { from: leg.height, to: leg.height },
      runs: [
        { to: corner(fork), radius: STRAND.radius, open: true, stretches: [...one, span()] },
        {
          to: corner(length - fork),
          radius: STRAND.radius,
          open: true,
          stretches: [{ ...span(climb), rise: change }, ...middle, { ...span(climb), rise: -change }],
        },
        { to: leg.b, stretches: [span(), ...[...one].reverse()] },
      ],
    };
  });
}

// How far along a road from where it splits, or along a strand from the fork, the strand's outer
// side is still inside the road's own: the two sides cross that far back from the fork.
function merged(width: number, shape: Split): number {
  return (width / 2) * Math.tan(Math.atan2(shape.out, shape.fork) / 2);
}

// A piece of the bank where it's the floor risen: collided with, and drawn by the client as that.
function risen(piece: Structure): Structure {
  return { ...piece, hidden: true };
}

// A height with the rounding of summed rises taken off, so a road that comes back down is on the floor.
function snapped(height: number): number {
  return Math.abs(height) < 1e-9 ? 0 : height;
}

// A bend's floor, run `back` radians before its start and `on` radians past its end.
function bendPart(leg: Extract<Leg, { kind: 'bend' }>, back: number, on: number, halfWidth: number): Bend {
  const { start, turn } = leg;
  const [from, to] = turn > 0 ? [start - back, start + turn + on] : [start + turn - on, start + back];
  return { kind: 'bend', x: leg.x, z: leg.z, r: leg.r, from, to, halfWidth };
}

// A level bank round a bend, standing on `under`: blocks across the road, each over a slice of the
// bend and wide enough along its outer side to meet the next, the first and last lapping into the
// legs it joins.
function bendBank(leg: Extract<Leg, { kind: 'bend' }>, halfWidth: number, lap: number, under: number): Box[] {
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
      h: leg.height - under,
      y: under,
      yaw: -a, // its length along the road, which runs square to the bearing from the bend's middle
      material: BANK,
    };
  });
}

// A block of the bank from a to b, `width` across, from the floor up to `height`.
function block(a: Point, b: Point, width: number, height: number): Box {
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
