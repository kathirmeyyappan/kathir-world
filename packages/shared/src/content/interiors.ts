// Every building with interiors (sim/interiors.ts): Tung Tung Tower, and the buildings round the main
// disc (content/buildings.ts), SpongeBob's house among them. The Krusty Krab has none: its glazed
// front shows the dining room from anywhere before it, so it's drawn whole.
import type { InteriorBuilding } from '../sim/interiors';
import { BUILDING_INTERIORS } from './buildings';
import { TUNG_TUNG_TOWER_INTERIORS } from './tower';

export const INTERIOR_BUILDINGS: InteriorBuilding[] = [TUNG_TUNG_TOWER_INTERIORS, ...BUILDING_INTERIORS];
