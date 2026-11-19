// What every map of the world draws on its floor (ui/MapCanvas.ts: the HUD's minimap, the menu's and
// the guide's), besides the outline (sim/outline.ts WORLD_OUTLINE): footprints filled in grey, so the big
// structures show on the map. Only what you'd navigate by belongs here: a keep, not the decks and
// rails around it. A disc can carry `rings`, circles drawn evenly inside it (Tung Tung Tower has one
// per floor above the ground, which marks it out from the one-storey buildings), or an `inner`
// radius it's open within, and a bridge can be `wood`, drawn brown under the grey. SpongeBob's house
// and the Krusty Krab are drawn as themselves (PineappleMark, KrustyKrabMark), and a road's climbs
// (sim/roads.ts `Slope`) as arrowheads pointing up them, so a hill and the ramps either side of a
// gap read from the map.
//
// Up past HIGH_UP the map greys in HIGH_LANDMARKS as well: the walkways up there, which would only
// clutter the map on the ground.
import type { Bridge, Disc } from '../sim/ground';
import { ROADS } from '../sim/outline';
import type { Slope } from '../sim/roads';
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
  (Disc & { rings?: number; inner?: number }) | (Bridge & { wood?: boolean }) | PineappleMark | KrustyKrabMark | Slope;

export const LANDMARKS: Landmark[] = [
  { ...TUNG_TUNG_TOWER_FOOTPRINT, rings: TUNG_TUNG_TOWER_ROOMS.length - 1 },
  ...STANDING_KEEPS.map((k) => k.footprint),
  { ...PINEAPPLE_FOOTPRINT, kind: 'pineapple', sand: PINEAPPLE_PROFILE.dune.foot },
  { ...KRUSTY_KRAB_FOOTPRINT, kind: 'krusty-krab' },
  ...ROADS.flatMap((road) => road.slopes),
];

export const HIGH_UP = 35; // metres: the height of your feet past which the map shows HIGH_LANDMARKS
export const HIGH_LANDMARKS: Landmark[] = [
  { kind: 'disc', ...TERRACE_RING },
  SKY_BRIDGE_FOOTPRINT,
  ...STAIRCASE_FOOTPRINTS.map((s) => ({ ...s, wood: true })),
  PINEAPPLE_DECK,
];
