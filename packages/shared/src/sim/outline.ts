// The world's outline: the parts of the floor (ground.ts), in a module of their own so content can
// place things relative to them without importing the structures, which import the content.
import { Ground, type Bridge, type Disc, type Sector, type WorldPart } from './ground';
import { climb, jump, layRoad, level, padded, span, type Point, type Road, type Stretch } from './roads';

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
const ROAD_WIDTH = 20;
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
// The corners the roads up on decks sweep round: the skyway's, a little out toward the Krusty
// Krab; the high road's, over the northwest spoke; and the flyover's, over the southwest one.
const SKYWAY_BEND: Point = { x: -205, z: 0 };
const HIGH_BEND: Point = { x: -440, z: 195 };
const FLYOVER_BEND: Point = { x: -440, z: -195 };
// A disc of floor beside a straight of road from a to b, lapping onto it: `along` of the way, `r`
// across, on the road's left (1) or its right (-1) as it runs. A place to pull off.
const layBy = (a: Point, b: Point, along: number, side: 1 | -1, r: number): Disc => {
  const d = Math.hypot(b.x - a.x, b.z - a.z);
  const out = (ROAD_WIDTH / 2 + r * 0.6) * side;
  const [x, z] = [a.x + (b.x - a.x) * along, a.z + (b.z - a.z) * along];
  return island(x - ((b.z - a.z) / d) * out, z + ((b.x - a.x) / d) * out, r);
};
const LAY_BYS: Disc[] = [
  layBy(NORTH_ISLAND, NORTH_BEND, 0.3, -1, 16),
  layBy(NORTHWEST_BEND, WEST_ISLAND, 0.25, -1, 18),
  layBy(WEST_ISLAND, SOUTHWEST_BEND, 0.35, 1, 16),
  layBy(ROAD_PLATEAU, WEST_ISLAND, 0.5, 1, 18),
  layBy(ROAD_PLATEAU, NORTHWEST_ISLAND, 0.8, 1, 16),
  layBy(ROAD_PLATEAU, SOUTHWEST_ISLAND, 0.42, -1, 16),
  layBy(SOUTHEAST_BEND, SOUTH_ISLAND, 0.2, -1, 18),
  layBy(NORTHEAST_BEND, EAST_ISLAND, 0.25, 1, 18),
];
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
  ...LAY_BYS,
];

// The roads, for karts (roads.ts). One main circuit runs round the west of the world, from
// Building 2's grounds by the north, northwest, west, southwest and south islands to Building 3's,
// closing across the floor between the keeps. Inside it a web: the Krusty Krab's road on west from
// the crossroads to the west island, a spoke from the crossroads to each of the northwest and
// southwest islands, and an inner ring from the north island by two small islands to the south
// one. Over those go three roads on decks, each a long sweep up off the floor, a triangle between
// the west island and the ring's two small ones: the skyway, an arc from one small island to the
// other, over the Krusty Krab's road; the high road, from the west island round over the
// northwest spoke to the ring; and the flyover, from the west island up at once and round over
// the southwest spoke to the ring, on its deck nearly all the way. Outside it, a road out
// to a small island at each of three corners of the world. Round the east goes one road, from the
// north island by the east island to the south, with a way out to it from the tower, from
// SpongeBob's house and from Building 4.
//
// Every gap has a boost pad on the ramp either side, which drives a kart on however slow it came,
// so it's cleared either way; a kicker is a hill as steep with a pad up each side, flown off with
// floor under the whole flight; a hump is a hill a kart leaves the ground over at speed. After
// each there's level road enough to come down on boosted.
const JUMP = { run: 14, rise: 5, across: 8 };
const hop = (): Stretch[] => jump(JUMP.run, JUMP.rise, JUMP.across).map((s) => (s.gap ? s : padded(s)));
const kicker = (): Stretch[] => [padded(climb(13, 5)), padded(climb(13, -5))];
// A level straight with a boost pad lying across its middle, pointing the way the road runs.
const dash = (): Stretch[] => [level(), padded(level(10)), level()];
const hump = (rise: number): Stretch[] => [climb(rise * 4, rise), climb(rise * 4, -rise)];
const hill = (up: number, rise: number, down: number, top?: number): Stretch[] => [
  climb(up, rise),
  level(top),
  climb(down, -rise),
];
// The start of a straight out of an island: clear of the island and its way in, then a boost pad,
// so a kart is boosted along the straight and at its own speed again by the turn at its end.
const early = (from: Disc): Stretch[] => [level(from.r + 30), padded(level(10)), level()];
// A hill with a boost pad across the middle of its top.
const crest = (up: number, rise: number, down: number, top?: number): Stretch[] => {
  const side = top === undefined ? undefined : (top - 10) / 2;
  return [climb(up, rise), level(side), padded(level(10)), level(side), climb(down, -rise)];
};
// A road that goes over others is up on a deck for the whole sweep it crosses them in: a ramp up
// to the deck's height before its first bend and one down after its last, each with a few metres
// of level bank at its top for the deck to land on.
const DECK = { rise: 9, ramp: 60, landing: 6 };
const up = (): Stretch[] => [climb(DECK.ramp, DECK.rise), level(DECK.landing)];
const down = (): Stretch[] => [level(DECK.landing), climb(DECK.ramp, -DECK.rise)];
const [HOUSE_GROUNDS, KEEP_2_GROUNDS, KEEP_3_GROUNDS, KEEP_4_GROUNDS] = BUILDING_GROUNDS;
const road = (name: string, from: Point, runs: Parameters<typeof layRoad>[0]['runs']): Road =>
  layRoad({ name, from, width: ROAD_WIDTH, runs });

const CIRCUIT: Road[] = [
  road('circuit north', KEEP_2_GROUNDS, [
    { to: { x: -150, z: 180 }, radius: 70, stretches: [level(45), climb(45, 6), level()] },
    { to: NORTH_ISLAND, stretches: [level(20), padded(level(10)), climb(28, -6), level()] },
  ]),
  road('circuit northwest', NORTH_ISLAND, [
    { to: NORTH_BEND, radius: 120, stretches: [level(), ...kicker(), ...dash()] },
    { to: NORTHWEST_ISLAND, stretches: [level(), ...hop(), ...dash()] },
  ]),
  road('circuit west, north', NORTHWEST_ISLAND, [
    { to: NORTHWEST_BEND, radius: 110, stretches: [...early(NORTHWEST_ISLAND), ...hump(4), level()] },
    { to: WEST_ISLAND, stretches: [level(30), ...crest(60, 8, 40), level(40)] },
  ]),
  road('circuit west, south', WEST_ISLAND, [
    { to: SOUTHWEST_BEND, radius: 110, stretches: [level(), ...kicker(), ...dash()] },
    { to: SOUTHWEST_ISLAND, stretches: [...dash(), ...hump(3.5), level()] },
  ]),
  road('circuit southwest', SOUTHWEST_ISLAND, [
    { to: SOUTH_BEND, radius: 120, stretches: [level(), ...hop(), ...dash()] },
    { to: SOUTH_ISLAND, stretches: dash() },
  ]),
  road('circuit south', SOUTH_ISLAND, [
    {
      to: { x: -30, z: -250 },
      radius: 60,
      stretches: [level(60), padded(level(10)), level(), ...hump(3.5), level(15)],
    },
    { to: KEEP_3_GROUNDS, stretches: [level(10), ...hill(40, 5, 25), level(40)] },
  ]),
];
const WEB: Road[] = [
  // Over the floor the home has there already (KRUSTY_KRAB_ROAD), laid for its pad: in the half
  // nearer the Krusty Krab, but far enough from it that a kart boosted its way is back at its own
  // speed before the building.
  road('krusty krab', KRUSTY_KRAB_GROUNDS, [{ to: ROAD_PLATEAU, stretches: [level(85), padded(level(10)), level()] }]),
  road('west', ROAD_PLATEAU, [
    { to: WEST_ISLAND, stretches: [level(60), ...kicker(), ...dash(), ...crest(45, 7, 45, 30), level(60)] },
  ]),
  // Level where the high road's deck crosses over it, its hill beyond.
  road('northwest spoke', ROAD_PLATEAU, [
    { to: NORTHWEST_ISLAND, stretches: [level(95), padded(level(10)), level(120), ...crest(40, 5, 40, 30), level()] },
  ]),
  // Its kicker well short of where the flyover's deck crosses over it, so nothing flown off it
  // comes up under the deck.
  road('southwest spoke', ROAD_PLATEAU, [
    {
      to: SOUTHWEST_ISLAND,
      stretches: [level(60), ...kicker(), level(40), padded(level(10)), level(110), padded(level(10)), level()],
    },
  ]),
  road('inner north', NORTH_ISLAND, [{ to: INNER_NORTH, stretches: [...early(NORTH_ISLAND), ...hump(3), level()] }]),
  road('inner northwest', INNER_NORTH, [
    { to: ROAD_PLATEAU, stretches: [...early(INNER_NORTH), ...hill(40, 6, 40), level()] },
  ]),
  road('inner southwest', ROAD_PLATEAU, [{ to: INNER_SOUTH, stretches: [level(), ...hop(), level()] }]),
  road('inner south', INNER_SOUTH, [{ to: SOUTH_ISLAND, stretches: [level(), ...kicker(), level()] }]),
  road('skyway', INNER_NORTH, [
    { to: SKYWAY_BEND, radius: 400, open: true, pads: [0.25, 0.75], stretches: [level(), ...up()] },
    { to: INNER_SOUTH, stretches: [...down(), level()] },
  ]),
  road('high road', WEST_ISLAND, [
    { to: HIGH_BEND, radius: 240, open: true, pads: [0.3, 0.8], stretches: [...dash(), ...up()] },
    { to: INNER_NORTH, stretches: [...down(), level()] },
  ]),
  road('flyover', WEST_ISLAND, [
    {
      to: FLYOVER_BEND,
      radius: 240,
      open: true,
      pads: [0.3, 0.8],
      stretches: [level(45), ...up(), span(20), padded(span(10)), span()],
    },
    { to: INNER_SOUTH, stretches: [...down(), level()] },
  ]),
];
const REACHES: Road[] = [
  road("world's end", WEST_ISLAND, [{ to: WORLDS_END, stretches: [level(45), ...kicker(), level()] }]),
  road('north lookout', NORTHWEST_ISLAND, [
    { to: NORTH_LOOKOUT, stretches: [level(), ...crest(35, 6, 35, 20), level()] },
  ]),
  road('south lookout', SOUTHWEST_ISLAND, [{ to: SOUTH_LOOKOUT, stretches: [level(), ...hop(), level(34)] }]),
];
const EAST: Road[] = [
  road('east, north', NORTH_ISLAND, [
    { to: NORTHEAST_BEND, radius: 150, stretches: [...dash(), ...hump(4), ...dash()] },
    { to: EAST_ISLAND, stretches: [...dash(), ...crest(60, 8, 60, 40), level(60)] },
  ]),
  road('east, south', EAST_ISLAND, [
    { to: SOUTHEAST_BEND, radius: 150, stretches: [level(), ...kicker(), ...dash()] },
    { to: SOUTH_ISLAND, stretches: [level(20), padded(level(10)), level(), ...hop(), ...dash()] },
  ]),
  // Their pads well along from the building each leaves, so none drives a kart into one.
  road('tower east', ANNEX, [{ to: EAST_ISLAND, stretches: [level(45), ...crest(40, 5, 40), level(45)] }]),
  road('house north', HOUSE_GROUNDS, [{ to: NORTH_ISLAND, stretches: [level(85), ...crest(40, 6, 40), level(60)] }]),
  road('keep 4 south', KEEP_4_GROUNDS, [
    { to: { x: KEEP_4_GROUNDS.x, z: SOUTH_ISLAND.z }, stretches: [level(60), ...hump(3), ...dash()] },
  ]),
];
export const ROADS: Road[] = [...CIRCUIT, ...WEB, ...REACHES, ...EAST];

// The floor the buildings stand on, with the Krusty Krab's road: where people mostly are, which
// the sky's objects float round (the client's SkyObject.ts). The main disc first: it's the cubes'
// home (sim/cubes.ts).
export const HOME_OUTLINE: WorldPart[] = [
  MAIN_DISC,
  ANNEX,
  FLOOR_BRIDGE,
  ...BUILDING_GROUNDS,
  KRUSTY_KRAB_GROUNDS,
  KRUSTY_KRAB_ROAD,
  ROAD_PLATEAU,
  BUILDING_FAN,
  ...FAN_SIDES,
];
export const WORLD_OUTLINE: WorldPart[] = [...HOME_OUTLINE, ...ISLANDS, ...ROADS.flatMap((road) => road.floor)];

export const HOME_GROUND = new Ground(HOME_OUTLINE);
export const WORLD_GROUND = new Ground(WORLD_OUTLINE);
