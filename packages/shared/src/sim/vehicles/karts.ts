// Every kart there is, a row each: what it's called, the command that drops one, its stats and
// the box it drives as. How every kart drives by them is kart.ts. A new kart is a row here and its
// model in the client.
import { AVATARS, type AvatarId } from '../avatars';

export type KartId = 'standard';

// The box a kart drives as, in metres: its width and length on the ground and its height from the
// ground up, the middle of its underside its position; and the driver's seat, where the body sits:
// up from the underside and forward of its middle.
export interface KartBody {
  width: number;
  length: number;
  height: number;
  seat: { y: number; z: number };
}

export interface KartSpec {
  name: string;
  command: string; // `/<command>` drops one in front of you
  blurb: string;
  speed: number; // m/s flat out on the gas: S, which a mini-turbo raises by half
  acceleration: number; // seconds from standing to `speed`
  handling: number; // metres across the circle it turns at `speed` with the wheel full over
  weight: number; // how hard it shoves a kart it bumps, and how little it's shoved: the standard's 1
  miniTurboTime: number; // seconds of drifting to a blue spark: twice it yellow, three times purple
  wrenches: number; // its health: what a wall, a kart or a shot takes off it, and at none it explodes
  body: KartBody; // as its model is built
}

export const KARTS: Record<KartId, KartSpec> = {
  standard: {
    name: 'Standard Kart',
    command: 'kart',
    blurb: 'a go-kart to drive, drift and run people over in',
    speed: 20,
    acceleration: 2.5,
    handling: 30,
    weight: 1,
    miniTurboTime: 0.8,
    wrenches: 5,
    body: { width: 1.75, length: 2.86, height: 0.99, seat: { y: 0.31, z: -0.09 } }, // scripts/kart-model.py
  },
};

export const KART_IDS = Object.keys(KARTS) as KartId[];

// Of a body's height, what stands up out of a kart's seat: a driver's hit shape (walker.ts), from
// the seat up.
export const SEATED = 0.6;

// A kart is built at its model's size for a driver as big as `SEATS` (metres: the height a body
// stands, as its hitbox's top, and how wide it is, as its hitbox's radius) or smaller, and grown for
// a bigger one as many times as they're bigger, by up to `GROWTH`: enough to seat the biggest
// without anyone seeing karts come in sizes.
const SEATS = { top: 2.2, radius: 0.55 };
const GROWTH = 1.2;

// How many times its model's size a kart is built at to seat a driver wearing `avatar`.
export function sizeFor(avatar: AvatarId): number {
  const { top, radius } = AVATARS[avatar].hitbox;
  return Math.min(GROWTH, Math.max(1, top / SEATS.top, radius / SEATS.radius));
}
