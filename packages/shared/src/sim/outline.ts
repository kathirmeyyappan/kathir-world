// The world's outline: the parts of the floor (ground.ts), in a module of their own so content can
// place things relative to them without importing the structures, which import the content.
import { Ground, type Bridge, type Disc, type Sector, type WorldPart } from './ground';
import {
  climb,
  grade,
  jump,
  layRoad,
  level,
  padded,
  span,
  split,
  type Point,
  type Road,
  type Split,
  type Stretch,
} from './roads';

export const MAIN_DISC: Disc = { kind: 'disc', x: 0, z: 0, r: 50 }; // the cubes' home
export const ANNEX: Disc = { kind: 'disc', x: 112, z: 0, r: 30 }; // Tung Tung Tower's grounds
export const FLOOR_BRIDGE: Bridge = { kind: 'bridge', ax: 40, az: 0, bx: 92, bz: 0, halfWidth: 8 };

// Buildings 1 to 4's grounds: discs the annex's size unless the building says otherwise, round the
// main disc's middle at each one's bearing (degrees from +x toward +z), round its far side from the
// tower, out at `out`. SpongeBob's house stands further out than the keeps, on wider grounds, so
// its dune sits on the floor with room round it. Buildings 2 and 3 stand either side of the Krusty
// Krab, which faces the tower from straight across the main disc: the five are a turn of SITE_TURN
// apart.
const KEEP_OUT = 100;
const SITE_TURN = 55;
const KRUSTY_KRAB_BEARING = 180;
const BUILDING_SITES: { bearing: number; out: number; r?: number }[] = [
  { bearing: KRUSTY_KRAB_BEARING - 2 * SITE_TURN, out: 124, r: 52 },
  { bearing: KRUSTY_KRAB_BEARING - SITE_TURN, out: KEEP_OUT },
  { bearing: KRUSTY_KRAB_BEARING + SITE_TURN, out: KEEP_OUT },
  { bearing: KRUSTY_KRAB_BEARING + 2 * SITE_TURN, out: KEEP_OUT },
];
const turned = (deg: number, x: number, z: number) => {
  const a = (deg * Math.PI) / 180;
  return { x: x * Math.cos(a) - z * Math.sin(a), z: x * Math.sin(a) + z * Math.cos(a) };
};
export const BUILDING_GROUNDS: Disc[] = BUILDING_SITES.map(({ bearing, out, r = ANNEX.r }) => ({
  kind: 'disc',
  ...turned(bearing, out, 0),
  r,
}));
// The Krusty Krab's grounds, on the fan's rim like the keeps': wide enough to walk all the way round
// the building (36 m by 24 m, content/krustyKrab.ts) with ten metres to spare at its corners.
export const KRUSTY_KRAB_GROUNDS: Disc = { kind: 'disc', ...turned(KRUSTY_KRAB_BEARING, KEEP_OUT, 0), r: 32 };
// A road straight out from behind the Krusty Krab, ROAD_WIDTH across and ROAD_LENGTH long past its
// grounds, to a round plateau at the floor's height at its end, the crossroads the roads beyond
// meet at. ROAD_WIDTH is every road's: wide enough to drift a kart round a bend on.
export const ROAD_WIDTH = 20;
const ROAD_LENGTH = 200;
const PLATEAU_R = 40;
const plateauOut = KEEP_OUT + KRUSTY_KRAB_GROUNDS.r + ROAD_LENGTH + PLATEAU_R;
export const ROAD_PLATEAU: Disc = { kind: 'disc', ...turned(KRUSTY_KRAB_BEARING, plateauOut, 0), r: PLATEAU_R };
export const KRUSTY_KRAB_ROAD: Bridge = {
  kind: 'bridge',
  ax: KRUSTY_KRAB_GROUNDS.x,
  az: KRUSTY_KRAB_GROUNDS.z,
  bx: ROAD_PLATEAU.x,
  bz: ROAD_PLATEAU.z,
  halfWidth: ROAD_WIDTH / 2,
};
// The open floor between them all: a slice of the main disc's middle out to the keeps' middles,
// from the first building's bearing round to the last's, so the only way out of it is the bridge to
// the tower.
export const BUILDING_FAN: Sector = {
  kind: 'sector',
  x: MAIN_DISC.x,
  z: MAIN_DISC.z,
  r: KEEP_OUT,
  from: (BUILDING_SITES[0].bearing * Math.PI) / 180,
  to: (BUILDING_SITES[BUILDING_SITES.length - 1].bearing * Math.PI) / 180,
};
// The fan's two straight sides, each held FAN_SIDE metres out and parallel to its end building's
// bearing by a strip of floor from the middle along it to the building's grounds, so the floor runs
// beside Building 4's terrace staircase, which climbs along that bearing, at an even width.
const FAN_SIDE = 10;
export const FAN_SIDES: Bridge[] = [BUILDING_GROUNDS[0], BUILDING_GROUNDS[BUILDING_GROUNDS.length - 1]].map(
  ({ x, z }) => ({ kind: 'bridge', ax: MAIN_DISC.x, az: MAIN_DISC.z, bx: x, bz: z, halfWidth: FAN_SIDE }),
);

// Out past the buildings, islands of floor with nothing on them yet, where the roads meet: the big
// ones each a site for a building to come, wide enough for a keep with room to drive round it, the
// small ones a place to pull off, or the end of a road out to the world's edge.
const island = (x: number, z: number, r: number): Disc => ({ kind: 'disc', x, z, r });
export const NORTH_ISLAND = island(-130, 350, 44);
export const NORTHWEST_ISLAND = island(-470, 370, 36);
export const WEST_ISLAND = island(-700, 0, 40);
export const SOUTHWEST_ISLAND = island(-470, -330, 36);
export const SOUTH_ISLAND = island(-150, -340, 44);
export const EAST_ISLAND = island(330, 0, 30);
const INNER_NORTH = island(-250, 200, 30);
const INNER_SOUTH = island(-250, -200, 30);
const NORTH_LOOKOUT = island(-560, 500, 22);
const SOUTH_LOOKOUT = island(-560, -470, 22);
const WORLDS_END = island(-860, 0, 24);
// The corners the circuit and the east road turn at, between islands.
const NORTH_BEND: Point = { x: -300, z: 430 };
const NORTHWEST_BEND: Point = { x: -660, z: 250 };
const SOUTHWEST_BEND: Point = { x: -660, z: -250 };
const SOUTH_BEND: Point = { x: -300, z: -420 };
const NORTHEAST_BEND: Point = { x: 190, z: 340 };
const SOUTHEAST_BEND: Point = { x: 190, z: -340 };
export const ISLANDS: Disc[] = [
  NORTH_ISLAND,
  NORTHWEST_ISLAND,
  WEST_ISLAND,
  SOUTHWEST_ISLAND,
  SOUTH_ISLAND,
  EAST_ISLAND,
  INNER_NORTH,
  INNER_SOUTH,
  NORTH_LOOKOUT,
  SOUTH_LOOKOUT,
  WORLDS_END,
];

// The roads, for karts (roads.ts). One main circuit runs round the west of the world, from
// Building 2's grounds by the north, northwest, west, southwest and south islands to Building 3's,
// closing across the floor between the keeps. Inside it a web: the Krusty Krab's road on west from
// the crossroads to the west island, a spoke from the crossroads to each of the northwest and
// southwest islands, and an inner ring from the north island by two small islands to the south
// one. Over those go three roads on decks, a triangle between the west island and the ring's two
// small ones, each up off the floor from one island's rim to the other's, with no floor of its own
// under its deck, and each split in two along its long straight: the skyway, from one small island
// to the other, over the Krusty Krab's road; the high road, from the west island east over the
// northwest spoke, north to a hairpin and down to the ring; and the flyover, from the west island
// in an S over the west road, the crossroads and the Krusty Krab's road to the ring. Outside it, a
// road out to a small island at each of three corners of the world. Round the east goes one road,
// from the north island by the east island to the south, with a way out to it from the tower, from
// SpongeBob's house and from Building 4.
//
// Every gap has a boost pad on the ramp either side, which drives a kart on however slow it came,
// so it's cleared either way; a kicker is a hill as steep with a pad up each side, flown off with
// floor under the whole flight. After each there's level road enough to come down on boosted.
const JUMP = { run: 14, rise: 5, across: 8 };
const hop = (): Stretch[] => jump(JUMP.run, JUMP.rise, JUMP.across).map((s) => (s.gap ? s : padded(s)));
const kicker = (): Stretch[] => [padded(climb(13, 5)), padded(climb(13, -5))];
// How a road on a deck splits, as Rainbow Road does: its two strands part over the first quarter of
// the split, run side by side 14 m apart, one climbing 3.6 m and the other dropping as far, with a
// pad each, and come together again over its last quarter. A kart off the high strand's inner
// side at speed comes down on the low one.
const SPLIT: Split = { out: 17, fork: 36, rise: 3.6, fall: 3.6, climb: 20, pad: true };
const parted = (): Stretch[] => [split(150, SPLIT)];
const [HOUSE_GROUNDS, KEEP_2_GROUNDS, KEEP_3_GROUNDS, KEEP_4_GROUNDS] = BUILDING_GROUNDS;
const road = (name: string, from: Point, runs: Parameters<typeof layRoad>[0]['runs']): Road =>
  layRoad({ name, from, width: ROAD_WIDTH, runs });

// A bend of a wound road: where it stands (a spot, or `at`, from 0 to 1 along the road's way
// between `LEAD` metres clear of the disc it leaves and as far short of the one it reaches, and
// `out` metres off that way to its left, or negative, its right), its `radius` along the road's
// middle, the `height` it's level at, whether a boost `pad` lies halfway round it, and what the
// straight into it `carries` in its middle (a jump, a pad, a split), which only a level straight
// can.
type Turn = (Point | { at: number; out: number }) & {
  radius: number;
  height: number;
  pad?: boolean;
  carries?: Stretch[];
};
const WINDING = { lead: 30, clear: 2, steep: 0.4, short: 8 };
// A road wound along `way` (the disc it leaves and any corners its way turns at) to the disc `to`,
// through `turns`: level round each at its height, and between them easing from one height to the
// next (roads.ts `grade`), from the floor at the rim of the disc it leaves and back to it at the
// rim of the one it reaches, so no climb of it is a flat ramp. `last` is what the straight into
// `to` carries, as a turn's `carries`. `decked`, it goes over other roads: a deck round every bend
// and along every straight between two, and up its first straight and down its last from as soon
// as there's room under it. It throws where a straight is too short for its climb.
const wound = (
  name: string,
  way: [Disc, ...Point[]],
  to: Disc,
  turns: Turn[],
  { last, decked = false }: { last?: Stretch[]; decked?: boolean } = {},
): Road => {
  const [from, ...via] = way;
  const base: Point[] = [from, ...via, to];
  const lengths = base.slice(1).map((p, i) => Math.hypot(p.x - base[i].x, p.z - base[i].z));
  const [start, end] = [from.r + WINDING.lead, lengths.reduce((sum, d) => sum + d, 0) - to.r - WINDING.lead];
  const corners = turns.map((turn): Point => {
    if (!('at' in turn)) return { x: turn.x, z: turn.z };
    // The spot that far along the way, and `out` to the left of the way it runs there.
    let [i, d] = [0, start + (end - start) * turn.at];
    while (i < lengths.length - 1 && d > lengths[i]) d -= lengths[i++];
    const [a, b] = [base[i], base[i + 1]];
    const [ux, uz] = [(b.x - a.x) / lengths[i], (b.z - a.z) / lengths[i]];
    return { x: a.x + ux * d - uz * turn.out, z: a.z + uz * d + ux * turn.out };
  });
  // How much of each straight a bend takes up, as roads.ts lays one: its radius by the tangent of half its turn.
  const points: Point[] = [from, ...corners, to];
  const takes = points.map((p, i) => {
    if (i === 0 || i === points.length - 1) return 0;
    const [a, b] = [points[i - 1], points[i + 1]];
    const [ix, iz, ox, oz] = [p.x - a.x, p.z - a.z, b.x - p.x, b.z - p.z];
    const turn = Math.atan2(ix * oz - iz * ox, ix * ox + iz * oz);
    return turns[i - 1].radius * Math.tan(Math.abs(turn) / 2);
  });
  const heights = [0, ...turns.map((turn) => turn.height), 0];
  const runs = points.slice(1).map((p, k) => {
    const turn: Turn | undefined = turns[k];
    const straight = Math.hypot(p.x - points[k].x, p.z - points[k].z) - takes[k] - takes[k + 1];
    const [rimFrom, rimTo] = [k === 0 ? from.r + WINDING.clear : 0, turn ? 0 : to.r + WINDING.clear];
    const [length, rise] = [straight - rimFrom - rimTo, heights[k + 1] - heights[k]];
    const carries = turn ? turn.carries : last;
    if (length < WINDING.short || (1.5 * Math.abs(rise)) / length > WINDING.steep || (carries && rise !== 0))
      throw new Error(`road ${name}: straight ${k} has ${length.toFixed(1)} m to climb ${rise} m in`);
    // Whether this straight is up between two bends of a decked road, with no end of it on the floor.
    const aloft = decked && k > 0 && turn !== undefined;
    const flat = aloft ? span : level;
    const stretches = [
      ...(rimFrom ? [level(rimFrom)] : []),
      ...(carries ? [flat(), ...carries, flat()] : grade(length, rise, aloft ? 'all' : decked ? 'clear' : 'none')),
      ...(rimTo ? [level(rimTo)] : []),
    ];
    const pads = turn?.pad ? [0.5] : undefined;
    return turn ? { to: p, radius: turn.radius, open: decked, pads, stretches } : { to: p, stretches };
  });
  return road(name, from, runs);
};

// The circuit: no two roads of it wind alike. From Building 2 two wide sweepers, low; from the
// north island a climb to a plateau 20 m up, held through two wide bends, and a plunge off it;
// then six quick chicanes along a level causeway; a double dip, 15 m, down to 3 and up to 17; a
// straight on the floor with a jump in it into a right-angle bend, and a climb round the next;
// and a long climb to a hairpin and a flick down to Building 3.
const CIRCUIT: Road[] = [
  wound('circuit north', [KEEP_2_GROUNDS, { x: -150, z: 180 }], NORTH_ISLAND, [
    { at: 0.3, out: 20, radius: 45, height: 5 },
    { at: 0.75, out: -28, radius: 36, height: 9, pad: true },
  ]),
  wound('circuit northwest', [NORTH_ISLAND, NORTH_BEND], NORTHWEST_ISLAND, [
    { at: 0.18, out: -22, radius: 34, height: 12 },
    { at: 0.47, out: 16, radius: 55, height: 20, pad: true },
    { at: 0.68, out: -6, radius: 60, height: 20 },
  ]),
  wound('circuit west, north', [NORTHWEST_ISLAND, NORTHWEST_BEND], WEST_ISLAND, [
    { at: 0.08, out: 16, radius: 22, height: 6 },
    { at: 0.25, out: -18, radius: 22, height: 6, pad: true },
    { at: 0.42, out: 18, radius: 24, height: 6 },
    { at: 0.58, out: -18, radius: 22, height: 6 },
    { at: 0.75, out: 18, radius: 24, height: 6, pad: true },
    { at: 0.92, out: -16, radius: 22, height: 6 },
  ]),
  wound('circuit west, south', [WEST_ISLAND, SOUTHWEST_BEND], SOUTHWEST_ISLAND, [
    { at: 0.12, out: 30, radius: 26, height: 15 },
    { at: 0.38, out: -26, radius: 30, height: 3, pad: true },
    { at: 0.62, out: 14, radius: 40, height: 13 },
    { at: 0.86, out: -30, radius: 26, height: 17 },
  ]),
  wound('circuit southwest', [SOUTHWEST_ISLAND, SOUTH_BEND], SOUTH_ISLAND, [
    { at: 0.56, out: -30, radius: 24, height: 0, carries: hop() },
    { at: 0.86, out: 34, radius: 26, height: 12, pad: true },
  ]),
  wound('circuit south', [SOUTH_ISLAND, { x: -30, z: -250 }], KEEP_3_GROUNDS, [
    { at: 0.28, out: 30, radius: 44, height: 10 },
    { at: 0.62, out: -26, radius: 28, height: 10, pad: true },
    { at: 0.9, out: 10, radius: 22, height: 6 },
  ]),
];
// The web. Its floor roads wind low where a deck goes over them and climb where none does: the west
// road an S that rises as it leaves the flyover behind; the northwest spoke an S under the high
// road, which it passes beneath three times; the southwest spoke over a hill 14 m up, round three
// sweepers; the ring's roads a bend or two each, the two with jumps on the floor. Over them go the
// three roads on decks, each up off the floor from one island's rim and back down to another's,
// with no floor of its own under its deck, and each split in two along one long straight: the
// skyway a C over the Krusty Krab's road; the high road east from the west island, then north up
// to a hairpin 22 m up over the northwest spoke and down to the ring; the flyover an S over the
// west road, the crossroads' north side and the Krusty Krab's road, with a kink on its way down.
const WEB: Road[] = [
  // Over the floor the home has there already (KRUSTY_KRAB_ROAD), laid for its pad: in the half
  // nearer the Krusty Krab, but far enough from it that a kart boosted its way is back at its own
  // speed before the building.
  road('krusty krab', KRUSTY_KRAB_GROUNDS, [{ to: ROAD_PLATEAU, stretches: [level(85), padded(level(10)), level()] }]),
  wound('west', [ROAD_PLATEAU], WEST_ISLAND, [
    { at: 0.22, out: -24, radius: 36, height: 2 },
    { at: 0.55, out: 20, radius: 36, height: 7, pad: true },
    { at: 0.85, out: -14, radius: 30, height: 5 },
  ]),
  wound('northwest spoke', [ROAD_PLATEAU], NORTHWEST_ISLAND, [
    { x: -410, z: 200, radius: 40, height: 3, pad: true },
    { x: -350, z: 290, radius: 30, height: 9 },
  ]),
  wound('southwest spoke', [ROAD_PLATEAU], SOUTHWEST_ISLAND, [
    { at: 0.2, out: -28, radius: 36, height: 6 },
    { at: 0.52, out: 30, radius: 40, height: 14, pad: true },
    { at: 0.82, out: -24, radius: 32, height: 7 },
  ]),
  wound('inner north', [NORTH_ISLAND], INNER_NORTH, [{ at: 0.5, out: -22, radius: 30, height: 7, pad: true }]),
  wound('inner northwest', [INNER_NORTH], ROAD_PLATEAU, [
    { at: 0.25, out: -18, radius: 28, height: 6 },
    { at: 0.75, out: 18, radius: 28, height: 3, pad: true },
  ]),
  wound('inner southwest', [ROAD_PLATEAU], INNER_SOUTH, [{ at: 0.2, out: -14, radius: 30, height: 0 }], {
    last: hop(),
  }),
  road('inner south', INNER_SOUTH, [{ to: SOUTH_ISLAND, stretches: [level(), ...kicker(), level()] }]),
  wound(
    'skyway',
    [INNER_NORTH],
    INNER_SOUTH,
    [
      { x: -170, z: 112, radius: 40, height: 12 },
      { x: -170, z: -112, radius: 40, height: 12, carries: parted() },
    ],
    { decked: true },
  ),
  wound(
    'high road',
    [WEST_ISLAND],
    INNER_NORTH,
    [
      { x: -590, z: 137, radius: 50, height: 13 },
      { x: -372, z: 158, radius: 32, height: 13, carries: parted() },
      { x: -395, z: 400, radius: 24, height: 22 },
    ],
    { decked: true },
  ),
  wound(
    'flyover',
    [WEST_ISLAND],
    INNER_SOUTH,
    [
      { x: -561, z: -80, radius: 45, height: 13 },
      { x: -350, z: 75, radius: 45, height: 13, carries: parted() },
      { x: -245, z: 40, radius: 32, height: 17 },
      { x: -222, z: -30, radius: 30, height: 10 },
      { x: -252, z: -90, radius: 30, height: 10, pad: true },
    ],
    { decked: true },
  ),
];
// The reaches: a jump on the way to the world's end, a hill with a kink in it up to the north
// lookout, and a gap before the south one, which only a kart crosses.
const REACHES: Road[] = [
  road("world's end", WEST_ISLAND, [{ to: WORLDS_END, stretches: [level(45), ...kicker(), level()] }]),
  wound('north lookout', [NORTHWEST_ISLAND], NORTH_LOOKOUT, [{ at: 0.5, out: 16, radius: 30, height: 9, pad: true }]),
  road('south lookout', SOUTHWEST_ISLAND, [{ to: SOUTH_LOOKOUT, stretches: [level(), ...hop(), level(34)] }]),
];
// Where Building 4's road meets the east road's last straight, which runs level past it.
const EAST_JUNCTION: Disc = island(KEEP_4_GROUNDS.x, SOUTH_ISLAND.z, ROAD_WIDTH / 2);
// Round the east: long sweepers over hills, north and south, the south road straightening onto
// the floor before Building 4's road meets it, with a jump beyond; and a way out to it from the
// tower, from SpongeBob's house and from Building 4, an S each. Their pads are well along from the
// building each leaves, so none drives a kart into one.
const EAST: Road[] = [
  wound('east, north', [NORTH_ISLAND, NORTHEAST_BEND], EAST_ISLAND, [
    { at: 0.12, out: -22, radius: 50, height: 6 },
    { at: 0.3, out: 24, radius: 50, height: 12, pad: true },
    { at: 0.47, out: 30, radius: 60, height: 12 },
    { at: 0.68, out: -26, radius: 45, height: 4 },
    { at: 0.86, out: 22, radius: 45, height: 10, pad: true },
  ]),
  wound(
    'east, south',
    [EAST_ISLAND, SOUTHEAST_BEND],
    SOUTH_ISLAND,
    [
      { at: 0.14, out: 24, radius: 50, height: 8 },
      { at: 0.34, out: -14, radius: 45, height: 14, pad: true },
      { at: 0.5, out: 28, radius: 40, height: 6 },
      { at: 0.72, out: 0, radius: 40, height: 0 },
    ],
    { last: [level(60), ...hop()] },
  ),
  wound('tower east', [ANNEX], EAST_ISLAND, [
    { at: 0.25, out: 18, radius: 30, height: 5 },
    { at: 0.75, out: -18, radius: 30, height: 9, pad: true },
  ]),
  wound('house north', [HOUSE_GROUNDS], NORTH_ISLAND, [
    { at: 0.2, out: 20, radius: 36, height: 4 },
    { at: 0.6, out: -24, radius: 36, height: 11, pad: true },
  ]),
  wound('keep 4 south', [KEEP_4_GROUNDS], EAST_JUNCTION, [
    { at: 0.3, out: -20, radius: 34, height: 5 },
    { at: 0.7, out: 12, radius: 34, height: 5, pad: true },
  ]),
];
export const ROADS: Road[] = [...CIRCUIT, ...WEB, ...REACHES, ...EAST];

// The floor the buildings stand on: where people are on foot, and all of the world the bots' map
// walks (botMap/ground.ts). The main disc first: it's the cubes' home (sim/cubes.ts).
export const BUILDINGS_OUTLINE: WorldPart[] = [
  MAIN_DISC,
  ANNEX,
  FLOOR_BRIDGE,
  ...BUILDING_GROUNDS,
  KRUSTY_KRAB_GROUNDS,
  BUILDING_FAN,
  ...FAN_SIDES,
];
// That floor with the Krusty Krab's road and the crossroads at its end: where people mostly are,
// which the sky's objects float round (the client's SkyObject.ts).
export const HOME_OUTLINE: WorldPart[] = [...BUILDINGS_OUTLINE, KRUSTY_KRAB_ROAD, ROAD_PLATEAU];
export const WORLD_OUTLINE: WorldPart[] = [...HOME_OUTLINE, ...ISLANDS, ...ROADS.flatMap((road) => road.floor)];

export const HOME_GROUND = new Ground(HOME_OUTLINE);
export const WORLD_GROUND = new Ground(WORLD_OUTLINE);
