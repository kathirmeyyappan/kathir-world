// Wire format between client and room host. JSON for now; small enough that it doesn't matter yet.
import { isGameAction, type GameAction, type GameState } from './modes';
import type { FrostCell } from './sim/frost';
import type { Appearance } from './sim/avatars';
import { isItemAction, type ItemAction, type ItemId } from './sim/items';
import type { PickupKind } from './sim/pickups';
import type { InputFrame, PlayerState, Vec3 } from './sim/types';
import type { Kart } from './sim/vehicles/garage';

export interface CubeSnapshot {
  id: string;
  x: number;
  y: number;
  z: number;
  rx: number;
  ry: number;
}

// A pickup where it floats this tick (sim/pickups.ts); `ry` is its spin, and `from` whose body
// left it, on one a body did.
export interface PickupSnapshot {
  id: string;
  kind: PickupKind;
  from?: Appearance;
  x: number;
  y: number;
  z: number;
  ry: number;
}

// What a kill was done with: an item, or a move, or a kart.
export type KillItem = ItemId | 'pound' | 'strike' | 'kart' | 'explosion';

export type ClientMessage =
  | { t: 'input'; f: InputFrame }
  | { t: 'chat'; text: string }
  | { t: 'rename'; name: string } // what to be called from now on; everyone sees it in the next snapshot
  | { t: 'respawn' } // dead, and back now: the death screen's button (modes/rules.ts `Dying`)
  | { t: 'game'; do: GameAction } // asks something of the room's game (modes/), which says whose it is to ask
  | { t: 'ping'; at: number };

export type ServerMessage =
  | {
      t: 'welcome';
      id: string;
      room: string;
      game: GameState; // the room's game (modes/)
      tick: number;
      players: PlayerState[];
      cubes: CubeSnapshot[];
      pickups: PickupSnapshot[];
      doors: { id: string; open: boolean }[]; // every door (sim/doors.ts) and which way it stands
      frost: FrostCell[]; // every frosted cell (sim/frost.ts)
      karts: Kart[]; // every kart in the room (sim/vehicles/garage.ts)
    }
  | {
      t: 'snap';
      tick: number;
      players: PlayerState[];
      cubes: CubeSnapshot[];
      pickups: PickupSnapshot[];
      karts: Kart[];
    }
  | { t: 'game'; game: GameState } // the room's game changed (modes/): all of it, as it stands
  | { t: 'join'; p: PlayerState }
  | { t: 'leave'; id: string; name: string }
  | { t: 'chat'; id: string; name: string; text: string }
  | { t: 'system'; text: string } // greyed-out line: command results, notices
  | { t: 'refused'; text: string } // what this player asked for can't be done, and why
  | { t: 'shot'; id: string } // someone fired a tap weapon; clients play the effect
  | { t: 'action'; id: string; action: ItemAction } // someone did one of their class's actions (a dragon's roar); clients play it
  | { t: 'door'; id: string; open: boolean; by: string } // someone swung a door; clients swing theirs
  | { t: 'frost'; on: FrostCell[]; off: FrostCell[] } // a spray froze cells or melted them (sim/frost.ts); clients follow
  // Hearts came off: a shot landed, or with no shooter, a fall.
  | { t: 'hit'; shooter: string | null; victim: string; damage: number; headshot: boolean; hearts: number }
  // By an item, a ground pound, a strike, a kart that ran them over or one blown up beside them;
  // clients announce it.
  | { t: 'kill'; shooter: string; victim: string; item: KillItem; headshot: boolean }
  | { t: 'fell'; victim: string } // a fall killed them
  | { t: 'out'; victim: string } // they came down on the ground past the world's edge
  | { t: 'crashed'; victim: string } // their own kart killed them: driven into a wall, blown up under them
  | { t: 'boom'; at: Vec3 } // a kart blew up there
  | { t: 'pong'; at: number }
  | { t: 'error'; message: string };

export function isClientMessage(v: unknown): v is ClientMessage {
  if (!v || typeof v !== 'object') return false;
  const m = v as Record<string, unknown>;
  switch (m.t) {
    case 'input': {
      const f = m.f as Record<string, unknown> | undefined;
      return (
        !!f &&
        Number.isInteger(f.seq) &&
        isNum(f.mx) &&
        isNum(f.my) &&
        isNum(f.yaw) &&
        isNum(f.pitch) &&
        typeof f.jump === 'boolean' &&
        (f.reading === null || typeof f.reading === 'string') &&
        (f.use === undefined || f.use === null || typeof f.use === 'string') &&
        Array.isArray(f.actions) &&
        f.actions.every(isItemAction) &&
        (f.view === undefined || isNum(f.view))
      );
    }
    case 'chat':
      return typeof m.text === 'string';
    case 'rename':
      return typeof m.name === 'string';
    case 'respawn':
      return true;
    case 'game':
      return isGameAction(m.do);
    case 'ping':
      return isNum(m.at);
    default:
      return false;
  }
}

function isNum(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}
