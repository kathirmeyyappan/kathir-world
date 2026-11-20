// What stands on the roads (sim/outline.ts ROADS): each one's bank, the wedges and blocks under it
// where it's raised, with its boost pads' pieces, laid with its floor (sim/roads.ts); and the pads
// themselves, for the client to draw.
import { ROADS } from '../sim/outline';
import type { Pad } from '../sim/roads';
import type { Structure } from '../sim/structures';

export const ROAD_BANKS: Structure[] = ROADS.flatMap((road) => road.bank);
export const ROAD_PADS: Pad[] = ROADS.flatMap((road) => road.marks).filter((mark): mark is Pad => mark.kind === 'pad');
