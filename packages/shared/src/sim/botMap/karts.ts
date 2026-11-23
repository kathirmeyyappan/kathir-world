// The bots' map of the karts there are: what a bot driving one goes by (modal-bots/common/map/
// karts.py), from the karts' rows (sim/vehicles/karts.ts) and what every kart drives by
// (sim/vehicles/kart.ts). Built at once.
import { GRAVITY } from '../constants';
import { AIR_STEER, DRIFT_FROM, DRIFT_TURN, HOP, LIFT, SPARKS, TRACTION, TURBO } from '../vehicles/kart';
import { KART_IDS, KARTS, type KartId } from '../vehicles/karts';
import { stamped } from './stage';

// How a kart drives, as much of it as a driver plans by.
export interface Driven {
  speed: number; // m/s flat out on the gas
  boosted: number; // and at the full of a boost
  turn: number; // metres: the radius of its turn with the wheel full over, at any speed
  airTurn: number; // of that turn, what it has in the air
  grip: number; // m/s² its tires hold across it: a turn that asks more slides wide
  lift: number; // m/s faster upward than the ground past a crest carries it, at which it leaves the ground
  hop: number; // seconds the hop a drift begins with is in the air
  // A drift: m/s, the least it begins or carries on at; the share of its full turn it turns at
  // with the wheel held out of its way, let be, and held into it; and the seconds of it on the
  // ground to each spark.
  drift: { from: number; wide: number; neutral: number; tight: number; sparks: number[] };
}

export interface KartsMap {
  source: number;
  karts: Record<string, Driven>; // by kart id
}

function drivenOf(id: KartId): Driven {
  const { speed, handling, miniTurboTime } = KARTS[id];
  return {
    speed,
    boosted: speed * TURBO.boost,
    turn: handling / 2,
    airTurn: AIR_STEER,
    grip: TRACTION,
    lift: LIFT,
    hop: (2 * HOP) / GRAVITY,
    drift: { from: DRIFT_FROM * speed, ...DRIFT_TURN, sparks: SPARKS.map((spark) => spark.after * miniTurboTime) },
  };
}

export function buildKartsMap(): KartsMap {
  return stamped({ karts: Object.fromEntries(KART_IDS.map((id) => [id, drivenOf(id)])) });
}
