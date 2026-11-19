// Every kart there is, a row each: what it's called, the command that drops one, its stats and
// the box it drives as. How every kart drives by them is kart.ts. A new kart is a row here and its
// model in the client.

export type KartId = 'standard';

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
  // The box it drives as, in metres: its width and length on the ground and its height from the
  // ground up, the middle of its underside its position; and the driver's seat, where the body
  // sits: up from the underside and forward of its middle.
  body: { width: number; length: number; height: number; seat: { y: number; z: number } };
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
    body: { width: 2.01, length: 2.6, height: 1.03, seat: { y: 0.41, z: -0.08 } }, // scripts/kart-model.py
  },
};

export const KART_IDS = Object.keys(KARTS) as KartId[];

// Of a body's height, what stands up out of a kart's seat: a driver's hit shape (walker.ts), from
// the seat up.
export const SEATED = 0.6;
