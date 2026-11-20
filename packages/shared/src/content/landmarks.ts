// What every map of the world draws on its floor (ui/MapCanvas.ts: the HUD's minimap, the menu's and
// the guide's), besides the outline (sim/outline.ts WORLD_OUTLINE): footprints filled in grey, so the big
// structures show on the map. Only what you'd navigate by belongs here: a keep, not the decks and
// rails around it. A disc can carry `rings`, circles drawn evenly inside it (Tung Tung Tower has one
// per floor above the ground, which marks it out from the one-storey buildings), or an `inner`
// radius it's open within, and a bridge can be `wood`, drawn brown under the grey. SpongeBob's house
// and the Krusty Krab are drawn as themselves (PineappleMark, KrustyKrabMark), and a road's marks
// (sim/roads.ts `RoadMark`) as what they are: a climb as arrowheads pointing up it, so a hill and
// the ramps either side of a gap read from the map, and a boost pad as a rainbow.
//
// Up past HIGH_UP the map greys in HIGH_LANDMARKS as well: the walkways up there, which would only
// clutter the map on the ground.
import type { Bridge, Disc } from '../sim/ground';
import { ROADS } from '../sim/outline';
import type { RoadMark } from '../sim/roads';
import { STANDING_KEEPS } from './buildings';
import { KRUSTY_KRAB_FOOTPRINT } from './krustyKrab';
import { PINEAPPLE_DECK, PINEAPPLE_FOOTPRINT } from './pineapple';
import { PINEAPPLE_PROFILE } from './pineappleProfile';
import { STAIRCASE_FOOTPRINTS, TERRACE_RING } from './terrace';
import { SKY_BRIDGE_FOOTPRINT, TUNG_TUNG_TOWER_FOOTPRINT, TUNG_TUNG_TOWER_ROOMS } from './tower';

// SpongeBob's house from above: the fruit (its widest ring, `r`), hatched, with its leaves in the
// middle, on the sand of its dune out to `sand`, the dune's foot.
export interface PineappleMark {
  kind: 'pineapple';
  x: number;
  z: number;
  r: number;
  sand: number;
}

// The Krusty Krab from above: its plinth, `w` along the building and `d` through it, turned by
// `yaw` (the door facing its own +z), with the barrel of its roof between the arches at its ends.
export interface KrustyKrabMark {
  kind: 'krusty-krab';
  x: number;
  z: number;
  w: number;
  d: number;
  yaw: number;
}

export type Landmark =
  | (Disc & { rings?: number; inner?: number })
  | (Bridge & { wood?: boolean })
  | PineappleMark
  | KrustyKrabMark
  | RoadMark;

// The roads' marks from the highest down, and at one height what lies on a deck before the deck:
// the order the maps draw them in, each going under the last, so a deck covers the road that
// passes under it with all that's on it, and what lies on the deck shows on it.
const top = (mark: RoadMark): number => (mark.kind === 'sweep' ? mark.y : Math.max(mark.ay, mark.by));
const deck = (mark: RoadMark): boolean => mark.kind === 'span' || mark.kind === 'sweep';
const ROAD_MARKS: RoadMark[] = ROADS.flatMap((road) => road.marks).sort(
  (a, b) => top(b) - top(a) || Number(deck(a)) - Number(deck(b)),
);

export const LANDMARKS: Landmark[] = [
  { ...TUNG_TUNG_TOWER_FOOTPRINT, rings: TUNG_TUNG_TOWER_ROOMS.length - 1 },
  ...STANDING_KEEPS.map((k) => k.footprint),
  { ...PINEAPPLE_FOOTPRINT, kind: 'pineapple', sand: PINEAPPLE_PROFILE.dune.foot },
  { ...KRUSTY_KRAB_FOOTPRINT, kind: 'krusty-krab' },
  ...ROAD_MARKS,
];

export const HIGH_UP = 35; // metres: the height of your feet past which the map shows HIGH_LANDMARKS
export const HIGH_LANDMARKS: Landmark[] = [
  { kind: 'disc', ...TERRACE_RING },
  SKY_BRIDGE_FOOTPRINT,
  ...STAIRCASE_FOOTPRINTS.map((s) => ({ ...s, wood: true })),
  PINEAPPLE_DECK,
];
