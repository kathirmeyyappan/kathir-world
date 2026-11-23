// Race tracks (docs/game-modes.md): ways through the roads for a race to be run along. The roads
// are a graph, each one a leg between the two discs it's laid from and to (an island, a building's
// grounds, a crossroads), and a route is a run of legs from an island to somewhere the road ends:
// an island no other road leaves, or the floor the buildings stand on, which a track runs onto and
// never through. Every route there is is listed once, in an order that's the same wherever this
// runs, so a race names its track by its place in that list and nothing else of it is sent: the
// track itself (its middle, its lines, its grid) is worked out from the roads as they're laid.
import type { Disc } from './ground';
import { BUILDINGS_OUTLINE, ISLANDS, ROADS, ROAD_WIDTH, WORLD_OUTLINE } from './outline';
import type { Trace } from './roads';
import type { Vec3 } from './types';
import type { Course } from './vehicles/rescue';

// Metres from a track's start line to its finish: a minute or two in a kart.
export const TRACK_LENGTH = { min: 1200, max: 2400 };
const SPACING = 4; // metres between the spots a track's middle is kept as
// The finish line stands this far short of the rim of the disc a track ends on, so what crosses it
// flat out has the rest of the road and the disc to stop in.
const FINISH_SHORT = 15;
// The grid: metres from the start line back to its first row, between rows, and between the karts
// of a row; and how many stand in a row, for a grid of up to `few` and for a bigger one.
const GRID = { back: 4, rows: 6, across: 5, few: 8, columns: [2, 3] };
const MEET = 2; // metres from a disc's middle that a road's end is at it
const LEVELS = 4; // metres over or under a spot of the middle that a body is still on that stretch of road

// One of the discs the roads run between, and what a track can do there: start (an island), end (an
// island no other road leaves, or the buildings' floor), or only pass through (a crossroads).
interface Place {
  disc: Disc;
  island: boolean;
  floor: boolean;
}

// A road as a leg of the graph: the places it's laid from and to, and its length along its middle.
interface Leg {
  road: number; // its place in ROADS
  from: number;
  to: number;
  length: number;
}

// A way through the roads: the legs it takes in turn, each the way it was laid or against it, the
// places it starts and ends at, and how long it is from the first one's middle to the last's.
export interface Route {
  legs: { road: number; forward: boolean }[];
  start: Disc;
  end: Disc;
  length: number;
}

// A spot on a track's middle: the road's top there, how far along the track it is from where its
// roads begin, and the way the track runs there (a yaw, 0 facing +z).
export interface TrackSpot extends Vec3 {
  at: number;
  yaw: number;
}

export interface Track {
  route: Route;
  // Its middle, a spot every SPACING metres or so, in the order they're driven. Where a road splits
  // in two, one strand's spots and then the other's, each at its distance along.
  spots: TrackSpot[];
  start: number; // how far along the start line is: the grid stands behind it
  finish: number; // and the finish line
}

// Where a body is against a track: how far along it (`at`), and how far off its middle across the
// road (`off`).
export interface OnTrack {
  at: number;
  off: number;
}

const lengthOf = (t: Trace): number =>
  t.kind === 'bend' ? t.r * Math.abs(t.turn) : Math.hypot(t.bx - t.ax, t.bz - t.az);

// A point `share` of the way along a length of a road's middle, and the way the road runs there.
function pointOn(t: Trace, share: number): Vec3 & { yaw: number } {
  if (t.kind === 'straight')
    return {
      x: t.ax + (t.bx - t.ax) * share,
      y: t.ay + (t.by - t.ay) * share,
      z: t.az + (t.bz - t.az) * share,
      yaw: Math.atan2(t.bx - t.ax, t.bz - t.az),
    };
  const a = t.start + t.turn * share;
  const way = a + Math.sign(t.turn) * (Math.PI / 2); // the bearing it runs along, from +x toward +z
  return {
    x: t.x + t.r * Math.cos(a),
    y: t.y,
    z: t.z + t.r * Math.sin(a),
    yaw: Math.atan2(Math.cos(way), Math.sin(way)),
  };
}

let graph: { places: Place[]; legs: Leg[] } | null = null;

// The roads as a graph, worked out once. A road whose end is at no disc (one that meets another
// part-way along it) is no leg of it.
function roadGraph(): { places: Place[]; legs: Leg[] } {
  if (graph) return graph;
  const discs = WORLD_OUTLINE.filter((part): part is Disc => part.kind === 'disc');
  const places: Place[] = [];
  const placeAt = (p: { x: number; z: number }): number | null => {
    const disc = discs.find((d) => Math.hypot(d.x - p.x, d.z - p.z) < MEET);
    if (!disc) return null;
    const known = places.findIndex((place) => place.disc === disc);
    if (known >= 0) return known;
    places.push({ disc, island: ISLANDS.includes(disc), floor: BUILDINGS_OUTLINE.includes(disc) });
    return places.length - 1;
  };
  const legs: Leg[] = [];
  ROADS.forEach((road, i) => {
    const runs = road.middle;
    const [first, last] = [runs[0][0], runs[runs.length - 1].at(-1)!];
    const [from, to] = [placeAt(pointOn(first, 0)), placeAt(pointOn(last, 1))];
    if (from === null || to === null) return;
    legs.push({ road: i, from, to, length: runsOf(runs).reduce((sum, run) => sum + run.length, 0) });
  });
  return (graph = { places, legs });
}

// A road's middle as the runs a kart drives one after another, each with its length: the road end
// to end, or for one that splits in two, the run up to the fork, the split (its two strands side
// by side, as long as the first), and the run on from where they come together.
function runsOf(runs: Trace[][]): { strands: Trace[][]; length: number }[] {
  const measured = (strands: Trace[][]) => ({
    strands,
    length: strands[0].reduce((sum, t) => sum + lengthOf(t), 0),
  });
  return runs.length === 4
    ? [measured([runs[0]]), measured([runs[1], runs[2]]), measured([runs[3]])]
    : runs.map((run) => measured([run]));
}

let listed: Route[] | null = null;

// Every route there is, worked out once: from each island, every way along the roads that takes
// no road and passes no place twice, and comes to an end between TRACK_LENGTH's bounds.
export function routes(): Route[] {
  if (listed) return listed;
  const { places, legs } = roadGraph();
  const leaving = places.map((_, place) => legs.filter((leg) => leg.from === place || leg.to === place));
  const ends = (place: number) => places[place].floor || (places[place].island && leaving[place].length === 1);
  const found: Route[] = [];
  const walk = (at: number, taken: Route['legs'], seen: number[], length: number) => {
    if (taken.length > 0 && ends(at)) {
      if (length >= TRACK_LENGTH.min && length <= TRACK_LENGTH.max)
        found.push({ legs: taken, start: places[seen[0]].disc, end: places[at].disc, length });
      return;
    }
    if (length > TRACK_LENGTH.max) return;
    for (const leg of leaving[at]) {
      const next = leg.from === at ? leg.to : leg.from;
      if (seen.includes(next)) continue;
      walk(next, [...taken, { road: leg.road, forward: leg.from === at }], [...seen, next], length + leg.length);
    }
  };
  places.forEach((place, i) => place.island && walk(i, [], [i], 0));
  return (listed = found);
}

// The track along a route.
export function layTrack(route: Route): Track {
  const spots: TrackSpot[] = [];
  let along = 0;
  for (const { road, forward } of route.legs) {
    const runs = runsOf(ROADS[road].middle);
    for (const run of forward ? runs : [...runs].reverse()) {
      for (const strand of run.strands) {
        // Each strand of a split is spread over the run's length, so both come to the same spot.
        const stretch = run.length / strand.reduce((sum, t) => sum + lengthOf(t), 0);
        let from = along;
        for (const trace of forward ? strand : [...strand].reverse()) {
          const length = lengthOf(trace);
          const steps = Math.max(1, Math.ceil(length / SPACING));
          for (let k = 0; k <= steps; k++) {
            const share = k / steps;
            const p = pointOn(trace, forward ? share : 1 - share);
            spots.push({
              x: p.x,
              y: p.y,
              z: p.z,
              at: from + length * share * stretch,
              yaw: forward ? p.yaw : p.yaw + Math.PI,
            });
          }
          from += length * stretch;
        }
      }
      along += run.length;
    }
  }
  return { route, spots, start: route.start.r, finish: route.length - route.end.r - FINISH_SHORT };
}

// Where `pos` is against `track`, by the spot of its middle nearest it on the road `pos` is on (a
// deck and the road under it are told apart by their heights): how far along the track that is, and
// how far off its middle. Somewhere on no level of it (in the air over it, in Lakitu's hands) is as
// far off as can be, and as far along as the spot nearest it of them all.
export function onTrack(track: Track, pos: Vec3): OnTrack {
  let [nearest, distance] = [track.spots[0], Infinity];
  let [nearestOfAll, straight] = [track.spots[0], Infinity];
  for (const s of track.spots) {
    const d = Math.hypot(pos.x - s.x, pos.z - s.z);
    const through = Math.hypot(d, pos.y - s.y);
    if (through < straight) [nearestOfAll, straight] = [s, through];
    if (Math.abs(pos.y - s.y) <= LEVELS && d < distance) [nearest, distance] = [s, d];
  }
  if (distance === Infinity) return { at: nearestOfAll.at, off: Infinity };
  // Along the way the track runs there, and across it.
  const [fx, fz] = [Math.sin(nearest.yaw), Math.cos(nearest.yaw)];
  const [dx, dz] = [pos.x - nearest.x, pos.z - nearest.z];
  return { at: nearest.at + dx * fx + dz * fz, off: Math.abs(dx * fz - dz * fx) };
}

// Whether somewhere `off` the middle of a track is still on it: within the road's width.
export function withinTrack(on: OnTrack): boolean {
  return on.off <= ROAD_WIDTH / 2;
}

// The spot of a track's middle `at` metres along it (on a split, on its first strand).
export function spotAt(track: Track, at: number): TrackSpot {
  return track.spots.find((s) => s.at >= at) ?? track.spots[track.spots.length - 1];
}

// Where `count` karts stand on a track's grid: in rows behind its start line, the first of them
// nearest it, each a spot on the road with the way it faces.
export function gridOf(track: Track, count: number): (Vec3 & { yaw: number })[] {
  const columns = GRID.columns[count <= GRID.few ? 0 : 1];
  return Array.from({ length: count }, (_, k) => {
    const [row, column] = [Math.floor(k / columns), k % columns];
    const s = spotAt(track, Math.max(1, track.start - GRID.back - row * GRID.rows));
    const across = (column - (columns - 1) / 2) * GRID.across;
    // To the right of the way the track runs, for a positive `across`.
    return { x: s.x + Math.cos(s.yaw) * across, y: s.y, z: s.z - Math.sin(s.yaw) * across, yaw: s.yaw };
  });
}

// A track as the course its karts are held to (vehicles/rescue.ts): left by one off the side of its
// road or past either end of it, which is set down again on its middle where it left, nose along
// the way the track runs.
export function courseOf(track: Track): Course {
  return {
    left(pos) {
      const on = onTrack(track, pos);
      return !withinTrack(on) || on.at < 0 || on.at > track.route.length;
    },
    back(safe) {
      const s = spotAt(track, Math.max(0, Math.min(track.route.length, onTrack(track, safe).at)));
      return { to: { x: s.x, y: s.y, z: s.z }, yaw: s.yaw };
    },
  };
}

const laid = new Map<number, Track>();

// The track along the route at `index` of `routes()`, laid once.
export function trackOf(index: number): Track {
  let track = laid.get(index);
  if (!track) laid.set(index, (track = layTrack(routes()[index])));
  return track;
}
