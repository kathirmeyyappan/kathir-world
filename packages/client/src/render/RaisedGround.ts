// The lengths of road drawn as the floor itself risen (sim/roads.ts `Raised`; their bank's pieces
// are hidden): the road's top, a wall down each side of it and across each end to what it stands
// on (the floor, or for a deck its own underside, drawn too), all in the floor's look (shaders.ts,
// the risen side). What faces up is the
// floor's grid carried on up, with the bold line of a kerb along each side, and the walls are the
// drop's face, a bold line along their top, so the road's border reads all the way over a hill.
import type { Raised } from '@world/shared';
import type { Circle } from './Loader';
import { Quads, cross, flipped, minus, unit, type Vec } from './Quads';

// What the ground's shader draws these meshes as (its `sideOf`).
export const RISEN_SIDE = 3;
// A vertex's uv says how far it is from the edge a bold line runs along, as two numbers the
// shader multiplies back together between vertices: metres = (1 - |u|) * v. Across a top, u runs
// from -1 at one side to 1 at the other and v is half its width, so the line runs down both
// sides; down a wall, the line is along the top.
const across = (side: -1 | 0 | 1, half: number): [number, number] => [side, half];
const DEEP = 64; // metres: more than twice as far down as any wall goes
const down = (depth: number): [number, number] => [1 - (2 * depth) / DEEP, DEEP];
const UNLIT = down(DEEP / 2); // nowhere near such an edge
const SLICE = 3; // metres of a bend's outer side to one flat length of it

// The road's top edge across it at one spot: its left and its right, as the road runs.
interface Section {
  left: Vec;
  right: Vec;
}

// A length's quads, added to those of whatever it's drawn in one mesh with: its top, its sides and
// a deck's underside, and across each end the wall its `caps` call for, if any.
export function raisedGround(raised: Raised, quads = new Quads()): Quads {
  const sections = raised.kind === 'straight' ? straight(raised) : bend(raised);
  const half = raised.halfWidth;
  // What a spot of the top stands on: the floor, or for a deck its own underside, `deep` below it.
  const under = ([x, y, z]: Vec): Vec => [x, Math.max(0, y - raised.deep), z];
  // A side another deck runs along has no line and no wall: the top's uv is measured from its
  // other side alone, across the whole width.
  const bare = raised.kind === 'straight' ? raised.bare : undefined;
  const lined = (side: 'left' | 'right') => bare !== side && bare !== 'both';
  const [left, right] = bare
    ? [across(lined('left') ? -1 : 0, 2 * half), across(lined('right') ? 1 : 0, 2 * half)]
    : [across(-1, half), across(1, half)];
  for (let k = 0; k + 1 < sections.length; k++) {
    const [a, b] = [sections[k], sections[k + 1]];
    const up = unit(cross(minus(b.left, a.left), minus(a.right, a.left)));
    quads.add([a.left, a.right, b.right, b.left], up[1] < 0 ? flipped(up) : up, { uvs: [left, right, right, left] });
    const out = unit(minus(a.left, a.right));
    if (lined('left')) wall(quads, a.left, b.left, out, under);
    if (lined('right')) wall(quads, a.right, b.right, flipped(out), under);
    if (Number.isFinite(raised.deep))
      quads.add([a.left, a.right, b.right, b.left].map(under), [0, -1, 0], { uvs: [UNLIT, UNLIT, UNLIT, UNLIT] });
  }
  // The wall across an end, from the height its cap gives down to what the length stands on.
  const cap = (end: Section, inward: Section, from: number | null) => {
    if (from === null) return;
    const hung = ([x, y, z]: Vec): Vec => [x, Math.min(y, from), z];
    wall(quads, hung(end.left), hung(end.right), flat(minus(end.left, inward.left)), under);
  };
  cap(sections[0], sections[1], raised.caps[0]);
  cap(sections[sections.length - 1], sections[sections.length - 2], raised.caps[1]);
  return quads;
}

// The circle a length stands over: round the middle of its run, out to its ends and its sides.
export function over(raised: Raised): Circle {
  if (raised.kind === 'straight')
    return {
      x: (raised.ax + raised.bx) / 2,
      z: (raised.az + raised.bz) / 2,
      r: Math.hypot(raised.bx - raised.ax, raised.bz - raised.az) / 2 + raised.halfWidth,
    };
  const [middle, turn] = [(raised.from + raised.to) / 2, Math.min(Math.abs(raised.to - raised.from), 2 * Math.PI)];
  return {
    x: raised.x + raised.r * Math.cos(middle),
    z: raised.z + raised.r * Math.sin(middle),
    r: 2 * raised.r * Math.sin(turn / 4) + raised.halfWidth,
  };
}

// A wall from the top edge p to q straight down to what each stands on, facing `out`; none where
// the edge is down there already.
function wall(quads: Quads, p: Vec, q: Vec, out: Vec, under: (top: Vec) => Vec): void {
  const [below, beyond] = [under(p), under(q)];
  if (p[1] <= below[1] && q[1] <= beyond[1]) return;
  quads.add([p, q, beyond, below], out, {
    uvs: [down(0), down(0), down(q[1] - beyond[1]), down(p[1] - below[1])],
  });
}

// The level way a vector points.
function flat(v: Vec): Vec {
  return unit([v[0], 0, v[2]]);
}

function straight(r: Extract<Raised, { kind: 'straight' }>): Section[] {
  const length = Math.hypot(r.bx - r.ax, r.bz - r.az);
  // To the left of the way it runs.
  const [lx, lz] = [(-(r.bz - r.az) / length) * r.halfWidth, ((r.bx - r.ax) / length) * r.halfWidth];
  return [
    { left: [r.ax + lx, r.ay, r.az + lz], right: [r.ax - lx, r.ay, r.az - lz] },
    { left: [r.bx + lx, r.by, r.bz + lz], right: [r.bx - lx, r.by, r.bz - lz] },
  ];
}

function bend(r: Extract<Raised, { kind: 'bend' }>): Section[] {
  const slices = Math.max(1, Math.ceil(((r.r + r.halfWidth) * Math.abs(r.to - r.from)) / SLICE));
  return Array.from({ length: slices + 1 }, (_, k) => {
    const angle = r.from + ((r.to - r.from) * k) / slices;
    const at = (radius: number): Vec => [r.x + radius * Math.cos(angle), r.y, r.z + radius * Math.sin(angle)];
    return { left: at(r.r - r.halfWidth), right: at(r.r + r.halfWidth) };
  });
}
