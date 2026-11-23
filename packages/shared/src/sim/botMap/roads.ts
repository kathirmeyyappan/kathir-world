// The bots' map of the roads (modal-bots/common/map/roads.py): their middles as a graph, for a
// kart to be driven by and a way along them to be found in. A node at every end of a length of
// road (a bend's, a gap's, each short length of a graded climb, so the nodes tell how the road's
// slope changes) and along one no further apart than STEP, with the road's height there; each
// stretch between two of them, and which of them have no road under them or a boost pad on them;
// each road end to end; and every race track (sim/tracks.ts) as the roads it takes. Built at once
// from the road layer's own account of each road (sim/roads.ts `Road.middle`), and held to the
// sim: where the ground it has under a node isn't the road's top, building it throws.
import { STEP_UP } from '../constants';
import { ROADS } from '../outline';
import type { Trace } from '../roads';
import { SURFACES } from '../surfaces';
import { lengthOf, pointOn, routes, runsOf, trackOf } from '../tracks';
import type { Vec3 } from '../types';
import { solidWorld } from './solids';
import { stamped } from './stage';

const STEP = 20; // metres between nodes along a straight length of road, at the most
const BEND_STEP = 8; // and round a bend, where the road strays from the line between two of them
const TRUE = 0.1; // metres the ground may be off a node's height: a boost pad lies a few centimetres proud
const MEET = 1; // metres from a stretch of another road that a road's end is on it
const CHECKED = [0, 0.5, 1]; // the tracks checked, as shares of the way down their list
const CHECK_EVERY = 40; // spots of a checked track's middle from one check to the next

type Pair = [number, number];

export interface RoadsMap {
  source: number;
  nodes: [number, number, number][]; // x, y, z of the road's top at its middle
  // Each stretch of road between two nodes, driven or walked either way. Roads that meet share the
  // node they meet at.
  edges: Pair[];
  // Each stretch with no road under it, there to be jumped at a kart's speed, either way.
  gaps: Pair[];
  pads: Pair[]; // each of the edges with a boost pad lying on it
  // Each road end to end, as its nodes in the order it's laid: by its first strand, for one that
  // splits in two.
  roads: number[][];
  // Every race track, in the order a race names them by (tracks.ts `routes`), as the roads it
  // takes in turn: n + 1 for road n the way it's laid, -(n + 1) for it taken the other way.
  tracks: number[][];
  // Spots on a few tracks' middles as the sim lays them (the track, then x, y, z): what a reading
  // of this map is held to.
  checks: [number, number, number, number][];
}

// A spot on a road's middle, with a `gap` from it to the next.
interface Spot extends Vec3 {
  gap: boolean;
}

export function buildRoadsMap(): RoadsMap {
  const sim = solidWorld();
  const nodes: [number, number, number][] = [];
  const index = new Map<string, number>();
  const cm = (v: number) => Math.round(v * 100) / 100;
  const nodeAt = ({ x, y, z }: Vec3): number => {
    const node: [number, number, number] = [cm(x), cm(y), cm(z)];
    const key = node.join(',');
    const known = index.get(key);
    if (known !== undefined) return known;
    index.set(key, nodes.length);
    nodes.push(node);
    return nodes.length - 1;
  };
  const padded = (a: Vec3, b: Vec3): boolean => {
    const footing = sim.footing((a.x + b.x) / 2, (a.z + b.z) / 2, (a.y + b.y) / 2 + STEP_UP);
    return SURFACES[footing.surface].boosts === true;
  };
  const [edges, gaps, pads]: Pair[][] = [[], [], []];
  const lips = new Set<number>(); // the nodes at a gap's ends, where the road stops just short
  const roads = ROADS.map((road) => {
    const through: number[] = [];
    for (const run of runsOf(road.middle))
      run.strands.forEach((strand, k) => {
        const spots = spotsOf(strand);
        const ids = spots.map(nodeAt);
        spots.slice(0, -1).forEach((spot, i) => {
          const pair: Pair = [ids[i], ids[i + 1]];
          (spot.gap ? gaps : edges).push(pair);
          if (spot.gap) (lips.add(pair[0]), lips.add(pair[1]));
          else if (padded(spot, spots[i + 1])) pads.push(pair);
        });
        // A run begins at the node the last one ended on.
        if (k === 0) through.push(...ids.slice(through[through.length - 1] === ids[0] ? 1 : 0));
      });
    return through;
  });
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
    const ground = sim.groundAt(x, z, y + STEP_UP);
    if (!lips.has(i) && Math.abs(ground - y) > TRUE)
      throw new Error(`the roads' map has the road ${y} m up at (${x}, ${z}), where the ground is ${ground} m up`);
  });
  const listed = routes();
  const tracks = listed.map((route) => route.legs.map(({ road, forward }) => (forward ? road + 1 : -(road + 1))));
  const checks = CHECKED.flatMap((share) => {
    const track = Math.round(share * (listed.length - 1));
    let far = -Infinity;
    // Its first strand through a split: the spots that carry on along it.
    const middle = trackOf(track).spots.filter((spot) => spot.at > far && ((far = spot.at), true));
    return middle
      .filter((_, k) => k % CHECK_EVERY === 0)
      .map((spot): [number, number, number, number] => [track, cm(spot.x), cm(spot.y), cm(spot.z)]);
  });
  return stamped({ nodes, edges, gaps, pads, roads, tracks, checks });
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
  for (const trace of run) {
    const bend = trace.kind === 'bend';
    const gap = !bend && (trace.gap ?? false);
    const steps = gap ? 1 : Math.max(1, Math.ceil(lengthOf(trace) / (bend ? BEND_STEP : STEP)));
    for (let k = 0; k <= steps; k++) {
      const { x, y, z } = pointOn(trace, k / steps);
      // A length starts where the last one ended: that spot is both.
      const last = spots[spots.length - 1];
      if (k === 0 && last) last.gap = gap;
      else spots.push({ x, y, z, gap: gap && k === 0 });
    }
  }
  return spots;
}
