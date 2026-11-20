// The world's outline: the parts of the floor (ground.ts), in a module of their own so content can
// place things relative to them without importing the structures, which import the content.
import { Ground, type Bridge, type Disc, type Sector, type WorldPart } from './ground';
import { climb, jump, layRoad, level, padded, type Road, type Stretch } from './roads';

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
// grounds, to a round plateau at the floor's height at its end. ROAD_WIDTH is every road's: wide
// enough to drift a kart round a bend on.
const ROAD_WIDTH = 20;
const ROAD_LENGTH = 200;
const PLATEAU_R = 34;
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

// Out past the buildings, islands of floor with nothing on them yet, each a site for a building
// to come, wide enough for a keep with room to drive round it.
const ISLAND_R = 36;
const island = (x: number, z: number): Disc => ({ kind: 'disc', x, z, r: ISLAND_R });
export const NORTH_ISLAND = island(-130, 350);
export const SOUTHWEST_ISLAND = island(-410, -270);
export const SOUTH_ISLAND = island(-150, -340);
export const ISLANDS: Disc[] = [NORTH_ISLAND, SOUTHWEST_ISLAND, SOUTH_ISLAND];

// The roads out to the islands and round the west of the world, for karts (roads.ts): two arms from
// the plateau at the Krusty Krab road's end, each back to a keep's grounds, so with that road and
// the floor between the keeps they're one lap. Every gap has a ramp either side with a boost pad
// on it, which drives a kart on however slow it came, so the gap is cleared either way; the banks
// between are hills, the steeper sides of them drops a kart flies off.
// A gap the Standard Kart clears from four fifths of its speed up, off a ramp it leaves a third as
// fast upward as along.
const JUMP = { run: 14, rise: 5, across: 8 };
const hop = (): Stretch[] => jump(JUMP.run, JUMP.rise, JUMP.across).map((s) => (s.gap ? s : padded(s)));
// A hill short and steep enough to leave the ground over.
const hump = (rise: number) => [climb(rise * 4, rise), climb(rise * 4, -rise)];
const [, KEEP_2_GROUNDS, KEEP_3_GROUNDS] = BUILDING_GROUNDS;
// From Building 2's grounds north over a hill to the north island, then west across a gap and
// round, south over a hump and a ridge, to the plateau.
const NORTH_ROAD = layRoad({
  name: 'north',
  from: KEEP_2_GROUNDS,
  width: ROAD_WIDTH,
  runs: [
    { to: { x: -150, z: 180 }, radius: 70, stretches: [level(45), climb(45, 6), level()] },
    { to: NORTH_ISLAND, stretches: [level(30), climb(28, -6), level()] },
    { to: { x: -390, z: 390 }, radius: 100, stretches: [level(), ...hop(), level()] },
    { to: { x: -470, z: 210 }, radius: 100, stretches: [level(), ...hump(4), level()] },
    { to: ROAD_PLATEAU, stretches: [level(20), climb(70, 9), level(), climb(45, -9), level(35)] },
  ],
});
// From the plateau south over a ridge to the southwest island, east over a raised gap to the
// south island, and round over a hump and a hill to Building 3's grounds.
const SOUTH_ROAD = layRoad({
  name: 'south',
  from: ROAD_PLATEAU,
  width: ROAD_WIDTH,
  runs: [
    { to: SOUTHWEST_ISLAND, stretches: [level(40), climb(60, 7), level(), climb(35, -7), level(60)] },
    { to: SOUTH_ISLAND, stretches: [level(), climb(40, 4), level(12), ...hop(), level(12), climb(40, -4), level()] },
    { to: { x: -30, z: -250 }, radius: 60, stretches: [level(), ...hump(3.5), level(15)] },
    { to: KEEP_3_GROUNDS, stretches: [level(10), climb(40, 5), level(), climb(25, -5), level(40)] },
  ],
});
export const ROADS: Road[] = [NORTH_ROAD, SOUTH_ROAD];

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
