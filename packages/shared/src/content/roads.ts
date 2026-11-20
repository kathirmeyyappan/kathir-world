// What stands on the roads (sim/outline.ts ROADS): each one's bank, the wedges and blocks under it
// where it's raised, with its boost pads' pieces, laid with its floor (sim/roads.ts); and what the
// client draws of them itself: the pads, and the lengths of road that are the floor risen.
import { ROADS } from '../sim/outline';
import type { Pad, Raised } from '../sim/roads';
import type { Structure } from '../sim/structures';

export const ROAD_BANKS: Structure[] = ROADS.flatMap((road) => road.bank);
export const ROAD_RAISED: Raised[] = ROADS.flatMap((road) => road.raised);
export const ROAD_PADS: Pad[] = ROADS.flatMap((road) => road.marks).filter((mark): mark is Pad => mark.kind === 'pad');
