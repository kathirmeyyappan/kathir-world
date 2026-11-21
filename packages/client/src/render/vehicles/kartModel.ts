// A kart's model, as scripts/kart-model.py writes it from a rip of Mario Kart 8 (<id>KartModel.ts):
// its folder of parts under /assets/models (`body`, `steer`, `emblem` and one `tire`, with their
// pictures), the steering wheel's middle, the axis it turns round and its rim's radius, the grips a
// driver's hands take as the wheel turns (left, then right), the seat a driver sits on, where their
// right foot rests (the left's across the middle from it), its tires, where each of its exhaust
// pipes ends and the unit way it points out of it, all in the kart's own frame: x to its right, y
// up, z ahead, the middle of its footprint on the ground at the origin. And where a livery's emblem
// (render/liveries.ts) goes on its `emblem` part, a patch that reaches past the badge: the
// picture's corner and its size on the canvas the patch's texture coordinates run 0 to 1 over,
// the rest of it clear.
import type { KartId } from '@world/shared';
import { STANDARD_KART } from './standardKartModel';

export type Point = [number, number, number];

export interface KartModel {
  folder: string;
  steer: { at: Point; axis: Point; radius: number };
  grips: [Point, Point];
  seat: Point;
  feet: Point;
  tire: { radius: number; width: number };
  tires: { at: Point; front: boolean }[];
  exhausts: { at: Point; way: Point }[];
  emblem: { at: [number, number]; size: [number, number] };
}

export const KART_MODELS: Record<KartId, KartModel> = { standard: STANDARD_KART };
