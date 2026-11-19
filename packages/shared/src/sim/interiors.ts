// Interiors: what's inside a building that only its openings show, so the client draws each only
// while it could be seen (client render/Interiors.ts). An interior is a building's storey or floor
// of rooms; a building lists its own (content/interiors.ts). Nothing about them reaches the sim or
// the wire.
import type { Vec3 } from './types';

// A flat rectangle an interior is seen through: its corners, the unit vector it faces out along (a
// camera on that side of it can see in), and the sim door that shuts it, if one does (sim/doors.ts).
export interface Opening {
  corners: readonly [Vec3, Vec3, Vec3, Vec3];
  out: Vec3;
  door?: string;
}

export interface Interior {
  id: string;
  openings: Opening[];
  // Its building's other interiors seen through it (a stair's hole, a see-through ceiling): drawn
  // whenever it is seen from outside.
  shows: string[];
}

// A building with interiors: the upright cylinder a camera is inside it within, from where all of
// them are drawn, and the interiors themselves.
export interface InteriorBuilding {
  x: number;
  z: number;
  r: number;
  bottom: number;
  top: number;
  interiors: Interior[];
}

// Metres an opening reaches past the gap it's made for, all round, so a sliver of the inside at its
// edge, seen at a glancing angle, never falls outside it.
const MARGIN = 0.5;

// The opening of a gap `width` radians wide round bearing `angle` (from +x toward +z) in a round
// wall whose outer face is `r` from (x, z), from height `bottom` to `top`: the chord across the gap's
// ends on that face, facing out from the middle.
export function wallOpening(
  x: number,
  z: number,
  r: number,
  angle: number,
  width: number,
  bottom: number,
  top: number,
  door?: string,
): Opening {
  const half = width / 2 + MARGIN / r;
  const at = (a: number, y: number): Vec3 => ({ x: x + r * Math.cos(a), y, z: z + r * Math.sin(a) });
  const [low, high] = [bottom - MARGIN, top + MARGIN];
  return {
    corners: [at(angle - half, low), at(angle + half, low), at(angle + half, high), at(angle - half, high)],
    out: { x: Math.cos(angle), y: 0, z: Math.sin(angle) },
    door,
  };
}

// The opening of a hole facing up, `half` metres either side of (x, z) at height y: a roof open in
// the middle, or a stair's hole through a deck.
export function roofOpening(x: number, z: number, half: number, y: number): Opening {
  const h = half + MARGIN;
  return {
    corners: [
      { x: x - h, y, z: z - h },
      { x: x + h, y, z: z - h },
      { x: x + h, y, z: z + h },
      { x: x - h, y, z: z + h },
    ],
    out: { x: 0, y: 1, z: 0 },
  };
}
