// A kart's model, as scripts/kart-model.py writes it from a rip of Mario Kart 8 (<id>KartModel.ts):
// its folder of parts under /assets/models (`body`, `steer`, `emblem` and one `tire`, with their
// pictures), the steering wheel's middle, the axis it turns round and its rim's radius, the grips a
// driver's hands take as the wheel turns (left, then right), the seat a driver sits on, where their
// right foot rests (the left's across the middle from it), the tire's mesh as it's written and each
// tire it's drawn as (where it stands and how big round, the mesh sized to it), and each driver's
// paint: the two colours its body is painted in and its emblem. All in the kart's own frame: x to its right,
// y up, z ahead, the middle of its footprint on the ground at the origin.
import type { AvatarId, KartId } from '@world/shared';
import { STANDARD_KART } from './standardKartModel';

export type Point = [number, number, number];

export interface KartPaint {
  colours: [string, string];
  emblem: string;
}

export interface KartModel {
  folder: string;
  steer: { at: Point; axis: Point; radius: number };
  grips: [Point, Point];
  seat: Point;
  feet: Point;
  tire: { radius: number; width: number };
  tires: { at: Point; radius: number; front: boolean }[];
  paints: Partial<Record<AvatarId, KartPaint>> & { mario: KartPaint };
}

export const KART_MODELS: Record<KartId, KartModel> = { standard: STANDARD_KART };

// The paint a kart dropped by someone wearing `look` wears: their own, else Mario's.
export function paintOf(model: KartModel, look: AvatarId): KartPaint {
  return model.paints[look] ?? model.paints.mario;
}
