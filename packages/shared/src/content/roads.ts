// What stands on the roads (sim/outline.ts ROADS): each one's bank, the wedges and blocks under it
// where it's raised, laid with its floor (sim/roads.ts).
import { ROADS } from '../sim/outline';
import type { Structure } from '../sim/structures';

export const ROAD_BANKS: Structure[] = ROADS.flatMap((road) => road.bank);
