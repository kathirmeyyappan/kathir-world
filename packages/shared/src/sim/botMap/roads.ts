// The bots' map of the roads (modal-bots/common/map/roads.py): their middles as a sparse graph, a
// node every STEP metres or so with the road's height there, for finding a way along them out past
// the floor the ground's graph covers (ground.ts), on foot or in a kart. Built at once from the
// road layer's own account of each road (sim/roads.ts `Road.middle`), and held to the sim: where
// the ground it has under a node isn't the road's top, building it throws.
import { STEP_UP } from '../constants';
import { ROADS } from '../outline';
import type { Trace } from '../roads';
import { WALKED } from './ground';
import { solidWorld } from './solids';
import { stamped } from './stage';

const STEP = 20; // metres between nodes along a straight, at the most
const BEND_STEP = 10; // and round a bend, where the road strays from the line between two of them
const TRUE = 0.1; // metres the ground may be off a node's height: a boost pad lies a few centimetres proud
const MEET = 1; // metres from a stretch of another road that a road's end is on it

export interface RoadsMap {
  source: number;
  nodes: [number, number, number][]; // x, y, z of the road's top at its middle
  // Each stretch of road between two nodes, driven or walked either way. Roads that meet share the
  // node they meet at, and one that starts on the walked floor starts at that floor's rim.
  edges: [number, number][];
  // Each stretch with no road under it, there to be jumped at a kart's speed, either way.
  gaps: [number, number][];
}

// A spot on a road's middle: `along` metres from where its run began, `kept` where the graph has
// to have a node (an end of the run, of a bend or of a gap), and with a `gap` from it to the next.
interface Spot {
  x: number;
  y: number;
  z: number;
  along: number;
  kept: boolean;
  gap: boolean;
}

export function buildRoadsMap(): RoadsMap {
  const nodes: [number, number, number][] = [];
  const index = new Map<string, number>();
  const cm = (v: number) => Math.round(v * 100) / 100;
  const nodeAt = ({ x, y, z }: Spot): number => {
    const node: [number, number, number] = [cm(x), cm(y), cm(z)];
    const key = node.join(',');
    const known = index.get(key);
    if (known !== undefined) return known;
    index.set(key, nodes.length);
    nodes.push(node);
    return nodes.length - 1;
  };
  const [edges, gaps]: [number, number][][] = [[], []];
  const lips = new Set<number>(); // the nodes at a gap's ends, where the road stops just short
  for (const road of ROADS)
    for (const run of road.middle)
      for (const stretch of offWalked(spotsOf(run))) {
        const kept = thinned(stretch);
        kept.slice(0, -1).forEach((spot, k) => {
          const [a, b] = [nodeAt(spot), nodeAt(kept[k + 1])];
          (spot.gap ? gaps : edges).push([a, b]);
          if (spot.gap) (lips.add(a), lips.add(b));
        });
      }
  // A road that ends out along another, where a way off it meets it between two of its nodes, has
  // that stretch cut in two at its end.
  const ways = nodes.map(() => 0);
  for (const [a, b] of [...edges, ...gaps]) (ways[a]++, ways[b]++);
  nodes.forEach((end, e) => {
    if (ways[e] !== 1) return;
    const on = edges.findIndex(([a, b]) => a !== e && b !== e && offLine(end, nodes[a], nodes[b]) < MEET);
    if (on < 0) return;
    const [a, b] = edges[on];
    edges[on] = [a, e];
    edges.push([e, b]);
  });
  nodes.forEach(([x, y, z], i) => {
    const ground = solidWorld().groundAt(x, z, y + STEP_UP);
    if (!lips.has(i) && Math.abs(ground - y) > TRUE)
      throw new Error(`the roads' map has the road ${y} m up at (${x}, ${z}), where the ground is ${ground} m up`);
  });
  return stamped({ nodes, edges, gaps });
}

// Metres from a point to the line between two others, ends included.
function offLine(p: number[], a: number[], b: number[]): number {
  const [ab, ap] = [b.map((v, k) => v - a[k]), p.map((v, k) => v - a[k])];
  const along = Math.max(0, Math.min(1, dot(ap, ab) / dot(ab, ab)));
  return Math.hypot(...ap.map((v, k) => v - ab[k] * along));
}

function dot(a: number[], b: number[]): number {
  return a.reduce((sum, v, k) => sum + v * b[k], 0);
}

// Every spot along a run of a road's middle: the ends of each of its lengths, and spots between
// no further apart than a node may be.
function spotsOf(run: Trace[]): Spot[] {
  const spots: Spot[] = [];
  let along = 0;
  run.forEach((trace) => {
    const bend = trace.kind === 'bend';
    const gap = !bend && (trace.gap ?? false);
    const length = bend ? trace.r * Math.abs(trace.turn) : Math.hypot(trace.bx - trace.ax, trace.bz - trace.az);
    const steps = gap ? 1 : Math.max(1, Math.ceil(length / (bend ? BEND_STEP : STEP)));
    for (let k = 0; k <= steps; k++) {
      const share = k / steps;
      const end = k === 0 || k === steps;
      const at = bend
        ? {
            x: trace.x + trace.r * Math.cos(trace.start + trace.turn * share),
            y: trace.y,
            z: trace.z + trace.r * Math.sin(trace.start + trace.turn * share),
          }
        : {
            x: trace.ax + (trace.bx - trace.ax) * share,
            y: trace.ay + (trace.by - trace.ay) * share,
            z: trace.az + (trace.bz - trace.az) * share,
          };
      const kept = end && (bend || gap);
      // A length starts where the last one ended: that spot is both.
      const last = spots[spots.length - 1];
      if (k === 0 && last) [last.kept, last.gap] = [last.kept || kept, gap];
      else spots.push({ ...at, along: along + length * share, kept, gap: gap && k === 0 });
    }
    along += length;
  });
  spots[0].kept = spots[spots.length - 1].kept = true;
  return spots;
}

// The stretches of a run that are off the walked floor, each from where it leaves that floor's rim
// to where it comes back onto it: on it, the ground's graph is the way.
function offWalked(spots: Spot[]): Spot[][] {
  const on = (s: Spot) => WALKED.edge(s.x, s.z) < 0;
  // Where the line from a spot on the floor to one off it crosses the rim, halved down to it.
  const rim = (inside: Spot, outside: Spot): Spot => {
    let [a, b] = [inside, outside];
    for (let k = 0; k < 40; k++) {
      const mid = { ...a, x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2, along: (a.along + b.along) / 2 };
      if (on(mid)) a = mid;
      else b = mid;
    }
    return { ...b, kept: true, gap: false };
  };
  const stretches: Spot[][] = [];
  let stretch: Spot[] = [];
  spots.forEach((spot, k) => {
    const before = spots[k - 1];
    if (on(spot)) {
      if (before && !on(before)) stretches.push([...stretch, rim(spot, before)]);
      stretch = [];
    } else {
      if (before && on(before)) stretch.push(rim(before, spot));
      stretch.push(spot);
    }
  });
  if (stretch.length > 1) stretches.push(stretch);
  return stretches;
}

// A stretch's spots with only the ones a node is needed at: every one kept, and of the rest as few
// as leave no two nodes further apart along the road than STEP.
function thinned(spots: Spot[]): Spot[] {
  const out = [spots[0]];
  for (let k = 1; k < spots.length; k++) {
    const next = spots[k + 1];
    if (spots[k].kept || !next || next.along - out[out.length - 1].along > STEP) out.push(spots[k]);
  }
  return out;
}
