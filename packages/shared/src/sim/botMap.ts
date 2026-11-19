// The world as the Python bots (modal-bots/) see it: the structures, for line of sight, and a graph
// of where a player can walk, for finding a way anywhere (up the tower's stair included). Bots run
// no sim of their own, so the graph is worked out here with the real one: every walkable spot on a
// 1 m grid is a node, and an edge joins two neighbouring nodes when stepPlayer, walking straight
// from one, arrives at the other; where only a running jump gets there (over the tower stair's
// rail onto a floor), that's a jump edge. With them come the lookouts (high spots with a view) and
// the place each is in, each avatar's hitbox, for aiming, and the buildings' insides (their floors,
// and every spot within their walls), where a sniper starts out and lies in wait.
//
// It's built in three stages, each its own file in modal-bots/common/map/ with a fingerprint of
// what it was built from (its `source`), so a change rebuilds only the stages it touches:
// - the ground (`GroundMap`): the structures, the nodes and walks between them, the standard
//   body's jumps, the lookouts and the insides, from the world and the standard body;
// - the moves (`MovesMap`): for every way a look on foot moves (its walk and jump power), its
//   jumps between the ground's nodes, each worked out once, so a look that moves as one already
//   there costs nothing, and one that moves its own way costs only its own jumps;
// - the bodies (`BodiesMap`): every avatar's hitbox, eyes, walk and which way it moves, from
//   their rows alone, built at once.
// A test fails when a stage's fingerprint no longer matches. The ground and the moves carry a hash
// of the sim code that built them as well (scripts/botMapCode.ts), which no test holds them to: a
// deploy builds either afresh when its source or its code is off (deploy.sh). world.py joins the
// three back into one map.
import {
  EYE_HEIGHT,
  GRAVITY,
  JUMP_VELOCITY,
  MOVE_SPEED,
  PLAYER_RADIUS,
  STEP_DOWN,
  STEP_UP,
  TICK_DT,
} from './constants';
import { BUILDING_FOOTPRINTS, STANDING_KEEPS } from '../content/buildings';
import { TUNG_TUNG_TOWER_FOOTPRINT, TUNG_TUNG_TOWER_LEVELS } from '../content/tower';
import { AVATAR_IDS, AVATARS, jumpVelocityOf, walkSpeedOf, type AvatarId, type Hitbox } from './avatars';
import { CAPSULE_TOP } from './health';
import { createPlayer, stepPlayer } from './player';
import { isGrounded } from './walker';
import type { Region } from './regions';
import { createRng, hashSeed } from './rng';
import { ladderRun, surfaceOf, type Structure } from './structures';
import type { Vec3 } from './types';
import { STRUCTURES } from '../content/structures';
import { Structures } from './collision';
import type { Disc } from './ground';
import { WORLD_GROUND, WORLD_OUTLINE } from './outline';

// The world without its doors (doors.ts): bots can't open them, so they walk as if every one stood open.
const MAP_STRUCTURES = new Structures(STRUCTURES.filter((s) => !s.door));

// Metres inside the floor's edge the map stands its nodes, so a route never takes a bot over it.
const EDGE_MARGIN = 1;
const SPACING = 1; // metres between grid columns: under a doorway's clear width (1.2 m less a body)
const WALL_CLEARANCE = 0.05; // metres a node's body may be pushed by a wall before it doesn't count
const MAX_RISE = 1.5; // metres between neighbouring nodes worth trying an edge across
const SIGHT_CHECKS = 64;
// A lookout stands this high or more, on floor (walks to at least LOOKOUT_FLOOR of its eight
// neighbours, so not along a rail or parapet top), and at eye level sees this far out along this many of a ring of level sight
// lines: the balconies and decks, not the floors inside the tower's wall.
const LOOKOUT_HEIGHT = 15;
const LOOKOUT_RANGE = 30;
const LOOKOUT_LINES = 16;
const LOOKOUT_OPEN = 7;
const LOOKOUT_FLOOR = 5;
const KEEP_REACH = 4; // metres past a keep's wall that are still its place: the tower's balconies are 3 m
// The buildings with an inside, the tower first: each one's footprint (its wall's outer face) and
// its levels, the floors inside the wall then the roof.
const BUILDINGS = [{ footprint: TUNG_TUNG_TOWER_FOOTPRINT, levels: TUNG_TUNG_TOWER_LEVELS }, ...STANDING_KEEPS];
const INSIDES: Region[] = BUILDINGS.flatMap((b) => b.levels.slice(0, -1));
const INDOORS_MARGIN = 0.5; // metres under a roof, or over a ground floor, that are still inside

// Where a lookout is, for a bot choosing where to perch: on the tower (its balconies and roof), on
// a building (its roof and the foot of its staircase), or elsewhere (the terrace and the bridges
// and staircases up to it).
export type LookoutPlace = 'tower' | 'building' | 'elsewhere';

// A stage the sim builds, slowly: what it was built from, and the code that built it.
interface Simulated {
  source: number;
  code: number;
}

export interface GroundMap extends Simulated {
  structures: Structure[]; // as content/structures.ts lists them, without their looks
  nodes: [number, number, number][]; // feet x, y, z
  edges: number[][]; // per node, the nodes a player walking straight from it reaches
  jumps: number[][]; // per node, the ones only the standard body's running jump toward them reaches
  lookouts: number[]; // nodes well up with a wide view out, all reachable on foot from the ground
  lookoutPlaces: LookoutPlace[]; // each lookout's place, in the same order
  insides: Region[]; // the floors indoors, inside the tower's wall and the keeps': where a sniper starts and lies in wait
  indoors: number[]; // every node inside a building's wall, the stairs between its floors included
  // Segments the sim answered for (a x, y, z, b x, y, z, 1 when nothing stands between): the
  // Python side's line of sight is checked against these.
  sightChecks: number[][];
}

export interface MovesMap extends Simulated {
  ground: number; // the source of the ground its jumps are between
  // By way of moving (`Move`), per node, the ones only a running jump reaches: a look's jump goes
  // as far as its walk and as high as its power take it.
  jumps: Record<Move, number[][]>;
}

export interface BodiesMap {
  source: number;
  hitboxes: Record<string, Hitbox>; // what a shot has to land in, by avatar id (sim/avatars.ts)
  eyes: Record<string, number>; // metres from the feet to each avatar's eyes, where its shots leave (sim/avatars.ts)
  walks: Record<string, number>; // how fast each avatar walks at full keys, m/s (sim/avatars.ts walkSpeedOf)
  moves: Record<string, Move>; // how each avatar moves, the moves' key to its jumps
}

// A way of moving on foot: a walk in m/s and a jump's velocity, as `${walk} ${jump}`. Every class
// but the walker moves as the standard body does here.
type Move = string;

function moveOf(id: AvatarId): Move {
  const as = AVATARS[id].class === 'walker' ? id : 'standard';
  return `${walkSpeedOf(as)} ${jumpVelocityOf(as)}`;
}

// Each way of moving there is, with the look that stands for it: the first to move that way, the
// standard body for its own.
function movers(): Map<Move, AvatarId> {
  const movers = new Map<Move, AvatarId>();
  for (const id of ['standard', ...AVATAR_IDS] as const) if (!movers.has(moveOf(id))) movers.set(moveOf(id), id);
  return movers;
}

// What the ground depends on: the world's outline and structures, the body and the standard body's
// movement constants, this file's own settings, and the buildings' insides.
export function groundMapSource(): number {
  const physics = [
    EYE_HEIGHT,
    CAPSULE_TOP,
    PLAYER_RADIUS,
    EDGE_MARGIN,
    STEP_UP,
    STEP_DOWN,
    MOVE_SPEED,
    GRAVITY,
    JUMP_VELOCITY,
  ];
  const settings = [
    SPACING,
    WALL_CLEARANCE,
    MAX_RISE,
    SIGHT_CHECKS,
    LOOKOUT_HEIGHT,
    LOOKOUT_RANGE,
    LOOKOUT_LINES,
    LOOKOUT_OPEN,
    LOOKOUT_FLOOR,
    KEEP_REACH,
  ];
  return hashSeed(JSON.stringify([WORLD_OUTLINE, shapes(), physics, settings, BUILDINGS]));
}

// What the moves depend on: the ground they're measured over, and the ways there are of moving.
export function movesMapSource(): number {
  return hashSeed(JSON.stringify([groundMapSource(), [...movers().keys()].sort()]));
}

// What the bodies depend on: nothing but what they are.
export function bodiesMapSource(): number {
  return hashSeed(JSON.stringify(bodies()));
}

// The structures without their looks, which nothing here depends on; a leaning ladder as the
// wedge under its rails, a ramp over its footprint (collision.ts), since world.py knows no lean.
function shapes(): Structure[] {
  return MAP_STRUCTURES.list.map(({ material: _m, color: _c, ...shape }) => {
    if (shape.kind !== 'ladder' || !shape.lean) return shape;
    const { lean: _l, ...rest } = shape;
    const run = ladderRun(shape);
    const yaw = shape.yaw ?? 0;
    return {
      ...rest,
      kind: 'ramp',
      x: shape.x + (Math.sin(yaw) * run) / 2,
      z: shape.z + (Math.cos(yaw) * run) / 2,
      d: shape.d + run,
    };
  });
}

export function buildGroundMap(code: number): GroundMap {
  const nodes = walkableNodes();
  const columns = columnsOf(nodes);
  const edges: number[][] = [];
  const jumps: number[][] = [];
  for (const a of nodes) {
    const walk: number[] = [];
    const jump: number[] = [];
    for (const j of neighbours(a, nodes, columns)) {
      if (reaches(a, nodes[j], false, 'standard')) walk.push(j);
      else if (reaches(a, nodes[j], true, 'standard')) jump.push(j);
    }
    edges.push(walk);
    jumps.push(jump);
  }
  const found = lookouts(nodes, edges, jumps);
  return {
    source: groundMapSource(),
    code,
    structures: shapes(),
    nodes: nodes.map((n) => [n.x, Math.round(n.y * 100) / 100, n.z]),
    edges,
    jumps,
    lookouts: found,
    lookoutPlaces: found.map((i) => placeOf(nodes[i])),
    insides: INSIDES,
    indoors: nodes.flatMap((n, i) => (indoors(n) ? [i] : [])),
    sightChecks: sightChecks(nodes),
  };
}

// For every way of moving, its jumps between the ground's neighbouring nodes that walking doesn't
// join: the standard body's the ground's own, and any `kept` from a build over the same ground by
// the same code taken as they are, so only a new way of moving is worked out.
export function buildMovesMap(ground: GroundMap, code: number, kept?: MovesMap): MovesMap {
  // Written to the centimetre: each node is the top within that of where it's written.
  const nodes = ground.nodes.map(([x, y, z]) => ({ x, y: MAP_STRUCTURES.groundAt(x, z, y + 0.01), z }));
  const columns = columnsOf(nodes);
  const known: Record<Move, number[][]> = { [moveOf('standard')]: ground.jumps };
  if (kept && kept.ground === ground.source && kept.code === code) Object.assign(known, kept.jumps);
  const jumps: Record<Move, number[][]> = {};
  for (const [move, avatar] of movers())
    jumps[move] =
      known[move] ??
      nodes.map((a, i) =>
        neighbours(a, nodes, columns).filter((j) => !ground.edges[i].includes(j) && reaches(a, nodes[j], true, avatar)),
      );
  return { source: movesMapSource(), code, ground: ground.source, jumps };
}

export function buildBodiesMap(): BodiesMap {
  return { source: bodiesMapSource(), ...bodies() };
}

function bodies(): Omit<BodiesMap, 'source'> {
  const each = <T>(f: (id: AvatarId) => T) => Object.fromEntries(AVATAR_IDS.map((id) => [id, f(id)]));
  return {
    hitboxes: each((id) => AVATARS[id].hitbox),
    eyes: each((id) => AVATARS[id].eye),
    walks: each(walkSpeedOf),
    moves: each(moveOf),
  };
}

function columnsOf(nodes: Vec3[]): Map<string, number[]> {
  const columns = new Map<string, number[]>();
  nodes.forEach((n, i) => {
    const key = columnKey(n.x, n.z);
    const list = columns.get(key);
    if (list) list.push(i);
    else columns.set(key, [i]);
  });
  return columns;
}

// The nodes in the eight columns round `a`'s near enough its height to try an edge to.
function neighbours(a: Vec3, nodes: Vec3[], columns: Map<string, number[]>): number[] {
  return NEIGHBOURS.flatMap(([di, dj]) =>
    (columns.get(columnKey(a.x + di * SPACING, a.z + dj * SPACING)) ?? []).filter(
      (j) => Math.abs(nodes[j].y - a.y) <= MAX_RISE,
    ),
  );
}

const NEIGHBOURS = [
  [1, 0],
  [1, 1],
  [0, 1],
  [-1, 1],
  [-1, 0],
  [-1, -1],
  [0, -1],
  [1, -1],
];

// Every grid column's standing heights: the floor and each top there that a player settles on
// (nothing higher within a step), with room for their head and not inside or against a wall.
function walkableNodes(): Vec3[] {
  const b = WORLD_GROUND.bounds;
  const nodes: Vec3[] = [];
  for (let x = Math.ceil(b.minX / SPACING) * SPACING; x <= b.maxX; x += SPACING) {
    for (let z = Math.ceil(b.minZ / SPACING) * SPACING; z <= b.maxZ; z += SPACING) {
      if (WORLD_GROUND.edge(x, z) > -EDGE_MARGIN) continue;
      const heights = new Set([0, ...MAP_STRUCTURES.list.flatMap((s) => topAt(s, x, z))]);
      for (const y of heights) {
        if (Math.abs(MAP_STRUCTURES.groundAt(x, z, y + STEP_UP) - y) > 1e-9) continue;
        const ceiling = MAP_STRUCTURES.ceilingAt(x, z, y + 1e-6);
        if (ceiling < y + EYE_HEIGHT + CAPSULE_TOP) continue;
        const pos = { x, y: y + EYE_HEIGHT, z };
        MAP_STRUCTURES.move(pos, 0, 0, { head: pos.y + CAPSULE_TOP, reach: y + STEP_UP, radius: PLAYER_RADIUS });
        if (Math.hypot(pos.x - x, pos.z - z) > WALL_CLEARANCE) continue;
        nodes.push({ x, y, z });
      }
    }
  }
  return nodes;
}

// The height of a structure's top over (x, z), if its footprint covers it.
function topAt(s: Structure, x: number, z: number): number[] {
  const dx = x - s.x;
  const dz = z - s.z;
  const r = (s.w + s.d) / 2; // over the half-diagonal, so a cheap test that rejects most
  if (Math.abs(dx) > r || Math.abs(dz) > r) return [];
  const yaw = s.yaw ?? 0;
  const lx = dx * Math.cos(yaw) - dz * Math.sin(yaw);
  const lz = dx * Math.sin(yaw) + dz * Math.cos(yaw);
  if (Math.abs(lx) > s.w / 2 || Math.abs(lz) > s.d / 2) return [];
  return [(s.y ?? 0) + surfaceOf(s).top(lx, lz)];
}

// Whether `avatar` heading straight for b from a at full speed (jumping as they set off, if
// `jump`) and letting go once past b's column comes to stand there: within a hand of its line, at
// its height, in about the time the walk and a jump take.
function reaches(a: Vec3, b: Vec3, jump: boolean, avatar: AvatarId): boolean {
  const p = createPlayer('map', 'map', '#000', { x: a.x, y: a.y + EYE_HEIGHT, z: a.z });
  p.avatar = avatar;
  const yaw = Math.atan2(b.x - a.x, b.z - a.z);
  const length = Math.hypot(b.x - a.x, b.z - a.z);
  const frame = (my: number, jumping: boolean) => ({
    seq: 0,
    mx: 0,
    my,
    yaw,
    pitch: 0,
    jump: jumping,
    reading: null,
    actions: [],
  });
  const ticks =
    2 * Math.ceil(length / (walkSpeedOf(avatar) * TICK_DT)) +
    (jump ? Math.ceil((2 * jumpVelocityOf(avatar)) / GRAVITY / TICK_DT) : 0);
  let along = 0;
  for (let tick = 0; tick < ticks; tick++) {
    stepPlayer(p, along < length ? frame(1, jump && tick === 0) : frame(0, false), TICK_DT);
    along = ((p.pos.x - a.x) * (b.x - a.x) + (p.pos.z - a.z) * (b.z - a.z)) / length;
    if (along < length || p.vy !== 0 || !isGrounded(p)) continue;
    const off = Math.abs((p.pos.x - a.x) * (b.z - a.z) - (p.pos.z - a.z) * (b.x - a.x)) / length;
    return off < 0.2 && along < length + 0.4 && Math.abs(p.pos.y - EYE_HEIGHT - b.y) < 0.3;
  }
  return false;
}

// The high spots with a view (LOOKOUT_*) that a walk from the middle of the world reaches.
function lookouts(nodes: Vec3[], edges: number[][], jumps: number[][]): number[] {
  const start = nodes.findIndex((n) => n.x === 0 && n.y === 0 && n.z === 0);
  const reached = new Set([start]);
  const queue = [start];
  for (let i = queue.pop(); i !== undefined; i = queue.pop())
    for (const j of [...edges[i], ...jumps[i]]) if (!reached.has(j)) (reached.add(j), queue.push(j));
  return nodes.flatMap((n, i) => {
    if (n.y < LOOKOUT_HEIGHT || edges[i].length < LOOKOUT_FLOOR || !reached.has(i)) return [];
    const eye = { x: n.x, y: n.y + EYE_HEIGHT, z: n.z };
    let open = 0;
    for (let k = 0; k < LOOKOUT_LINES; k++) {
      const a = (k / LOOKOUT_LINES) * 2 * Math.PI;
      if (MAP_STRUCTURES.raycast(eye, { x: Math.sin(a), y: 0, z: Math.cos(a) }, LOOKOUT_RANGE) === Infinity) open++;
    }
    return open >= LOOKOUT_OPEN ? [i] : [];
  });
}

// Whether a spot is inside a building: within its wall, between its ground floor and its roof.
function indoors(n: Vec3): boolean {
  return BUILDINGS.some(({ footprint, levels }) => {
    const ground = levels[0].y;
    const roof = levels[levels.length - 1].y;
    const inWall = Math.hypot(n.x - footprint.x, n.z - footprint.z) < footprint.r;
    return inWall && n.y >= ground - INDOORS_MARGIN && n.y < roof - INDOORS_MARGIN;
  });
}

function placeOf(n: Vec3): LookoutPlace {
  const near = (keep: Disc) => Math.hypot(n.x - keep.x, n.z - keep.z) <= keep.r + KEEP_REACH;
  return near(TUNG_TUNG_TOWER_FOOTPRINT) ? 'tower' : BUILDING_FOOTPRINTS.some(near) ? 'building' : 'elsewhere';
}

// Eye-to-eye segments between nodes on or around the structures, half of them blocked.
function sightChecks(nodes: Vec3[]): number[][] {
  const rng = createRng(1);
  const near = nodes.filter((n) => n.y > 0 || MAP_STRUCTURES.groundAt(n.x, n.z, Infinity) > 0);
  const checks: number[][] = [];
  const counts = [0, 0];
  while (checks.length < SIGHT_CHECKS) {
    const [a, b] = [0, 1].map(() => near[Math.floor(rng() * near.length)]);
    const from = { x: a.x, y: a.y + EYE_HEIGHT, z: a.z };
    const to = { x: b.x, y: b.y + EYE_HEIGHT, z: b.z };
    const clear = MAP_STRUCTURES.clear(from, to) ? 1 : 0;
    if (counts[clear] >= SIGHT_CHECKS / 2) continue;
    counts[clear]++;
    checks.push([from.x, from.y, from.z, to.x, to.y, to.z, clear]);
  }
  return checks;
}

function columnKey(x: number, z: number): string {
  return `${Math.round(x / SPACING)},${Math.round(z / SPACING)}`;
}
