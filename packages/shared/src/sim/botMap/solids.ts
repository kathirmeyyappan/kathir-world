// The bots' map of what's solid: the floor's parts and every structure on it, as the sim collides
// with them, for a bot's line of sight and for where there's ground to stand on, anywhere in the
// world (modal-bots/common/map/solids.py). Built at once. The Python side works sight and ground
// out for itself from these shapes, so the map carries the sim's own answers to a few questions of
// each (`sightChecks`, `groundChecks`), which its tests hold it to.
import { STRUCTURES } from '../../content/structures';
import { Structures } from '../collision';
import { EYE_HEIGHT, PLAYER_RADIUS, STEP_UP } from '../constants';
import type { WorldPart } from '../ground';
import { CAPSULE_TOP } from '../health';
import { WORLD_OUTLINE } from '../outline';
import { createRng } from '../rng';
import { ladderRun, surfaceOf, type Structure } from '../structures';
import type { Vec3 } from '../types';
import { stamped } from './stage';

const CHECKS = 66; // of each kind
const ROUND = 6; // metres round a structure that a check's spots are drawn from
const APART = 40; // metres along x and z, at most, between the two ends of a sight check
const WALL_CLEARANCE = 0.05; // metres a body may be pushed by a wall where an end of a sight check stands

export interface SolidsMap {
  source: number;
  floor: WorldPart[]; // the floor's parts (sim/ground.ts), as outline.ts lists them
  structures: Structure[]; // as content/structures.ts lists them, without their looks or doors
  // Segments the sim answered for (a x, y, z, b x, y, z, 1 when nothing stands between).
  sightChecks: number[][];
  // Spots the sim answered for (x, z, the height feet there reach up to, the ground under them:
  // Structures.groundAt), a third of them on a structure, a third on the floor and a third past
  // its edge.
  groundChecks: number[][];
}

// A structure without its looks, which no bot's map depends on; a leaning ladder as the wedge
// under its rails, a ramp over its footprint (collision.ts), since the Python side knows no lean.
export function shapeOf({ material: _m, color: _c, ...shape }: Structure): Structure {
  if (shape.kind !== 'ladder' || !shape.lean) return shape;
  const { lean: _l, ...rest } = shape;
  const run = ladderRun(shape);
  const yaw = shape.yaw ?? 0;
  return {
    ...rest,
    kind: 'ramp',
    x: shape.x + (Math.sin(yaw) * run) / 2,
    z: shape.z + (Math.cos(yaw) * run) / 2,
    d: shape.d + run,
  };
}

// The world without its doors: sight passes a doorway whichever way its door is swung.
export function buildSolidsMap(): SolidsMap {
  const standing = STRUCTURES.filter((s) => !s.door);
  const sim = new Structures(standing);
  const rng = createRng(1);
  const cm = (v: number) => Math.round(v * 100) / 100;
  // A spot round one of the structures, and a height from its foot to a little over its top.
  const spot = () => {
    const s = standing[Math.floor(rng() * standing.length)];
    const reach = Math.hypot(s.w, s.d) / 2 + ROUND;
    return {
      x: cm(s.x + (2 * rng() - 1) * reach),
      z: cm(s.z + (2 * rng() - 1) * reach),
      reach: cm((s.y ?? 0) + rng() * (surfaceOf(s).height + 2 * STEP_UP)),
    };
  };
  // The eyes of a body standing at (x, z) on whatever its feet reach there, or null where none
  // stands: past the floor's edge, under something too low, or in or against a wall.
  const eyes = (x: number, z: number, reach: number): Vec3 | null => {
    const y = sim.groundAt(x, z, reach);
    if (y < 0 || sim.ceilingAt(x, z, y + 1e-6) < y + EYE_HEIGHT + CAPSULE_TOP) return null;
    const pos = { x, y: y + EYE_HEIGHT, z };
    sim.move(pos, 0, 0, { head: pos.y + CAPSULE_TOP, reach: y + STEP_UP, radius: PLAYER_RADIUS });
    return Math.hypot(pos.x - x, pos.z - z) > WALL_CLEARANCE ? null : { x, y: cm(y + EYE_HEIGHT), z };
  };

  const groundChecks: number[][] = [];
  const grounds = [0, 0, 0]; // how many so far are on a structure, on the floor, and past its edge
  while (groundChecks.length < CHECKS) {
    const { x, z, reach } = spot();
    const y = sim.groundAt(x, z, reach);
    const kind = y > 0 ? 0 : y === 0 ? 1 : 2;
    if (grounds[kind]++ < CHECKS / 3) groundChecks.push([x, z, reach, y]);
  }

  const sightChecks: number[][] = [];
  const sights = [0, 0]; // how many so far are blocked, and clear
  while (sightChecks.length < CHECKS) {
    const a = spot();
    const from = eyes(a.x, a.z, a.reach);
    const to = eyes(cm(a.x + (2 * rng() - 1) * APART), cm(a.z + (2 * rng() - 1) * APART), a.reach);
    if (!from || !to) continue;
    const clear = sim.clear(from, to) ? 1 : 0;
    if (sights[clear]++ < CHECKS / 2) sightChecks.push([from.x, from.y, from.z, to.x, to.y, to.z, clear]);
  }

  return stamped({ floor: WORLD_OUTLINE, structures: standing.map(shapeOf), sightChecks, groundChecks });
}
