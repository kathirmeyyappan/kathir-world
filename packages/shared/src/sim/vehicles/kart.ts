// How a kart drives (its stats are its row in karts.ts): the gas and the brake along it, the
// wheel turning it, the wheels taking back a slide sideways, a drift and the mini-turbo it gives,
// rolling up kerbs and ramps and flying off them, and walls in the way. The Room steps every kart
// with its driver's keys, and the driver's client steps its own the same way to predict it.
//
// A drift: a press of the drift key hops the kart; landing with the key still held and the wheel
// over, at speed, it drifts that way, turning tighter or wider as the wheel is held into the turn
// or out of it. Every `miniTurboTime` of it on the ground is a spark, blue, then yellow, then
// purple, and letting go of the key on one is a mini-turbo: its top speed raised by half over
// TURBO.rise, held for TURBO.holds by the spark, and let down over TURBO.fall.
//
// A trick: a press of the drift key in the air (off a ramp or a ledge; not its own hop's) tricks
// it left or right, the way the wheel is held or, with it held neither way, either, and landing
// after one is a boost like a mini-turbo's held for TRICK.hold.
import type { Structures } from '../collision';
import { EYE_HEIGHT, GRAVITY } from '../constants';
import { takeLook } from '../player';
import { SURFACES } from '../surfaces';
import type { InputFrame, PlayerState, Vec3 } from '../types';
import { KARTS, type KartBody, type KartId, type KartSpec } from './karts';

// What a kart's driver asks of it this tick: the gas (1, W) or the brake (-1, S, which backs it up
// once it's stopped), the wheel (-1 full left, A, to 1 full right, D) and the drift key (Space).
export interface KartControls {
  gas: number;
  steer: number;
  drift: boolean;
}

export const IDLE: KartControls = { gas: 0, steer: 0, drift: false };

export type Spark = 1 | 2 | 3; // blue, yellow, purple

export interface KartState {
  kart: KartId;
  size: number; // how many times its model's size it's built at, to seat its driver (karts.ts `sizeFor`)
  pos: Vec3; // the middle of its underside
  yaw: number; // the way its nose points: 0 along +z, turning right as it grows, as a look does
  vel: Vec3; // m/s
  wheel: number; // how far over the wheel is, -1 full left to 1 full right: it follows the keys
  grounded: boolean;
  held: boolean; // the drift key was down last tick, so a press is the tick it goes down
  hop: boolean; // in the hop a press gives, until it lands
  drift: { way: 1 | -1; t: number } | null; // its way (1 right) and the seconds of it on the ground
  trick: { way: 1 | -1; t: number } | null; // in the air: its way (1 right) and the seconds since it began
  turbo: { hold: number; t: number } | null; // a boost: the seconds it holds at full, and the seconds into it
}

// What came of a tick: how fast it was going into what it ran into, square to it (0 for nothing),
// and how fast it came down onto the ground if it landed.
export interface KartStep {
  impact: number;
  landing: number;
}

export const TURBO = { boost: 1.5, rise: 0.2, holds: [1, 2, 3], fall: 0.5 };
export const TRICK = { hold: 0.8 }; // seconds a trick's boost holds at full, rising and falling as a mini-turbo's

// What a knock does, by how fast the two close on each other square to where they touch, m/s:
// nothing under `least`, then `at20` at 20 m/s and on in step. In hearts off a player a kart runs
// into, or wrenches off a kart from a wall, a kart, or the ground it lands on.
export const IMPACT = { least: 10, at20: 5 };

export function impactDamage(closing: number): number {
  return closing < IMPACT.least ? 0 : (IMPACT.at20 * closing) / 20;
}

// The share of how fast a kart comes down onto the ground that counts as a knock (IMPACT): landing
// on its tires it's worn only from a 10 m drop (20 m/s), and a 40 m one (40 m/s) takes every
// wrench a kart has, so it comes down whole from a trick off anything short of a cliff.
export const LANDING = 0.5;

export function landingDamage(speed: number): number {
  return impactDamage(LANDING * speed);
}
export const DRIFT_FROM = 0.4; // of its speed: the least a drift begins or carries on at

// m/s²: how fast the wheels take back a slide sideways, every kart alike: past what turning full
// over or drifting tight at its speed asks of them, so only a boosted turn, or ice, slides.
const TRACTION = 40;
const REVERSE = 0.35; // of its speed: flat out backing up
const BRAKING = 2.5; // times its acceleration: braking while still rolling forward
const COAST = 0.4; // times its acceleration: slowing with no key held, or down from past its top speed
const WHEEL_RATE = 5; // per second: how fast the wheel follows the keys, full over in a fifth of a second
const STEP = 0.4; // metres: a kerb or a ramp's lip it rolls up onto rather than running into
const HOP = 3.5; // m/s up: a press of the drift key
const DRIFT_HOLD = 0.3; // of the wheel: held over as a hop lands, the way the drift goes
// In a drift, how tight it turns, as a share of its turn with the wheel full over: held out of the
// drift's way to held into it.
const DRIFT_WIDE = 0.45;
const DRIFT_TIGHT = 1.25;
const AIR_STEER = 0.3; // of its turn, in the air
const BOUNCE = 0.3; // of the speed it ran into a wall at, back off it

export function createKart(kart: KartId, size: number, pos: Vec3, yaw: number): KartState {
  return {
    kart,
    size,
    pos: { ...pos },
    yaw,
    vel: { x: 0, y: 0, z: 0 },
    wheel: 0,
    grounded: false,
    held: false,
    hop: false,
    drift: null,
    trick: null,
    turbo: null,
  };
}

// The keys a driver's frame holds (none: let go): the gas on W and S, the wheel on A and D, the
// drift on Space.
export function controlsOf(frame: InputFrame | null): KartControls {
  if (!frame) return IDLE;
  const unit = (v: number) => Math.max(-1, Math.min(1, v));
  return { gas: unit(frame.my), steer: unit(frame.mx), drift: frame.actions.includes('drift') };
}

// One step of the kart `p` drives, by their frame, and them sat in it after: what the Room runs and
// the driver's own client predicts with.
export function ride(
  p: PlayerState,
  k: KartState,
  frame: InputFrame | null,
  dt: number,
  structures: Structures,
): KartStep {
  if (frame) takeLook(p, frame);
  const step = stepKart(k, controlsOf(frame), dt, structures);
  seat(p, k);
  return step;
}

// The box kart `k` drives as, at the size it's built at.
export function bodyOf(k: KartState): KartBody {
  const { width, length, height, seat } = KARTS[k.kart].body;
  const s = k.size;
  return { width: width * s, length: length * s, height: height * s, seat: { y: seat.y * s, z: seat.z * s } };
}

// Sits `p` in kart `k`'s seat, their feet on it, moving with it.
export function seat(p: PlayerState, k: KartState): void {
  const { seat: at } = bodyOf(k);
  const f = noseOf(k.yaw);
  p.pos = { x: k.pos.x + f.x * at.z, y: k.pos.y + at.y + EYE_HEIGHT, z: k.pos.z + f.z * at.z };
  p.vx = k.vel.x;
  p.vy = k.vel.y;
  p.vz = k.vel.z;
  p.walk = 0;
}

export function stepKart(k: KartState, c: KartControls, dt: number, structures: Structures): KartStep {
  const spec = KARTS[k.kart];
  const steer = Math.max(-1, Math.min(1, c.steer));
  k.wheel += Math.max(-WHEEL_RATE * dt, Math.min(WHEEL_RATE * dt, steer - k.wheel));
  const pressed = c.drift && !k.held;
  k.held = c.drift;
  if (pressed && k.grounded && !k.drift) {
    k.vel.y = HOP;
    k.grounded = false;
    k.hop = true;
  } else if (pressed && !k.grounded && !k.hop && !k.trick) k.trick = { way: trickWay(k, steer), t: 0 };
  if (k.trick) k.trick.t += dt;
  const speed = forwardSpeed(k);
  if (k.drift && (!c.drift || speed < DRIFT_FROM * spec.speed)) {
    const spark = c.drift ? null : sparkOf(k.drift.t, spec);
    if (spark) k.turbo = { hold: TURBO.holds[spark - 1], t: 0 };
    k.drift = null;
  }
  k.yaw += turnRate(k, spec, speed) * dt;
  if (k.grounded) drive(k, spec, c.gas, dt, structures);
  const impact = move(k, dt, structures);
  const landing = settle(k, dt, structures);
  if (landing > 0 && k.trick) {
    k.turbo = { hold: TRICK.hold, t: 0 };
    k.trick = null;
  }
  if (landing > 0 && k.hop) {
    k.hop = false;
    if (c.drift && Math.abs(steer) >= DRIFT_HOLD && forwardSpeed(k) >= DRIFT_FROM * spec.speed)
      k.drift = { way: steer > 0 ? 1 : -1, t: 0 };
  }
  if (k.drift && k.grounded) k.drift.t += dt;
  if (k.turbo) {
    k.turbo.t += dt;
    if (turboShare(k.turbo) === 1 && k.turbo.t > TURBO.rise) k.turbo = null;
  }
  return { impact, landing };
}

// The spark a drift has got to after `t` seconds on the ground, or null short of the first.
export function sparkOf(t: number, spec: KartSpec): Spark | null {
  const sparks = Math.min(3, Math.floor(t / spec.miniTurboTime));
  return sparks === 0 ? null : (sparks as Spark);
}

// The way a trick goes: the wheel's, held over, else either, by where the kart is: as good as a
// coin's toss to the driver, and the same on the server and on their client predicting it.
function trickWay(k: KartState, steer: number): 1 | -1 {
  if (Math.abs(steer) >= DRIFT_HOLD) return steer > 0 ? 1 : -1;
  return Math.floor(Math.abs(k.pos.x + k.pos.z) * 100) % 2 ? 1 : -1;
}

// How many times its speed a kart's top speed is through a boost: 1 out of one.
export function turboShare(turbo: KartState['turbo']): number {
  if (!turbo) return 1;
  const { boost, rise, fall } = TURBO;
  const { hold, t } = turbo;
  if (t < rise) return 1 + ((boost - 1) * t) / rise;
  if (t < rise + hold) return boost;
  return 1 + (boost - 1) * Math.max(0, 1 - (t - rise - hold) / fall);
}

// The unit way its nose points, and the unit way to its right, across the ground.
export function noseOf(yaw: number): { x: number; z: number } {
  return { x: Math.sin(yaw), z: Math.cos(yaw) };
}

function rightOf(yaw: number): { x: number; z: number } {
  return { x: Math.cos(yaw), z: -Math.sin(yaw) };
}

function forwardSpeed(k: KartState): number {
  const f = noseOf(k.yaw);
  return k.vel.x * f.x + k.vel.z * f.z;
}

// Radians a second it turns: the wheel's share of its full turn, which at any speed is a circle
// `handling` across, so slower is no tighter; backing up turns it the other way, as a car does.
function turnRate(k: KartState, spec: KartSpec, speed: number): number {
  const lock = k.drift
    ? k.drift.way * (DRIFT_WIDE + ((DRIFT_TIGHT - DRIFT_WIDE) * (1 + k.drift.way * k.wheel)) / 2)
    : k.wheel;
  return ((lock * speed) / (spec.handling / 2)) * (k.grounded ? 1 : AIR_STEER);
}

// The gas, the brake or neither along it, and the wheels taking back what slides across it.
function drive(k: KartState, spec: KartSpec, gas: number, dt: number, structures: Structures): void {
  const f = noseOf(k.yaw);
  const r = rightOf(k.yaw);
  let along = k.vel.x * f.x + k.vel.z * f.z;
  let across = k.vel.x * r.x + k.vel.z * r.z;
  const accel = spec.speed / spec.acceleration;
  const top = spec.speed * turboShare(k.turbo);
  // A mini-turbo pushes it up to its boosted speed over its rise, whatever its acceleration.
  const push = k.turbo ? Math.max(accel, ((TURBO.boost - 1) * spec.speed) / TURBO.rise) : accel;
  const toward = (target: number, rate: number) => (along += Math.max(-rate * dt, Math.min(rate * dt, target - along)));
  if (gas > 0) toward(top, along < top ? push * gas : COAST * accel);
  else if (gas < 0 && along > 0) toward(0, BRAKING * accel * -gas);
  else if (gas < 0) toward(-REVERSE * spec.speed, accel * -gas);
  else toward(0, COAST * accel);
  const footing = structures.footing(k.pos.x, k.pos.z, k.pos.y + STEP);
  const grip = Math.min(TRACTION, SURFACES[footing.surface].grip);
  across -= Math.sign(across) * Math.min(Math.abs(across), grip * dt);
  k.vel.x = f.x * along + r.x * across;
  k.vel.z = f.z * along + r.z * across;
  // Along the slope underfoot, so it carries on up off a ramp's end.
  k.vel.y = footing.slope.x * k.vel.x + footing.slope.z * k.vel.z;
}

// Across the ground by its velocity as two circles, at its nose and its tail, each as wide as it,
// pushed out of what's in the way: a corner hit turns it, and what it ran into takes the speed it
// had into it, square to it, all but a bounce. Returns that speed.
function move(k: KartState, dt: number, structures: Structures): number {
  const { width, length, height } = bodyOf(k);
  const f = noseOf(k.yaw);
  const half = (length - width) / 2;
  const body = { head: k.pos.y + height, reach: k.pos.y + STEP, radius: width / 2 };
  const dx = k.vel.x * dt;
  const dz = k.vel.z * dt;
  const nose = { x: k.pos.x + f.x * half, y: k.pos.y, z: k.pos.z + f.z * half };
  const tail = { x: k.pos.x - f.x * half, y: k.pos.y, z: k.pos.z - f.z * half };
  structures.move(nose, dx, dz, body);
  structures.move(tail, dx, dz, body);
  const push = { x: (nose.x + tail.x) / 2 - (k.pos.x + dx), z: (nose.z + tail.z) / 2 - (k.pos.z + dz) };
  k.pos.x += dx + push.x;
  k.pos.z += dz + push.z;
  if (Math.hypot(nose.x - tail.x, nose.z - tail.z) > 1e-6) k.yaw = Math.atan2(nose.x - tail.x, nose.z - tail.z);
  const pushed = Math.hypot(push.x, push.z);
  if (pushed < 1e-6) return 0;
  const n = { x: push.x / pushed, z: push.z / pushed };
  const into = -(k.vel.x * n.x + k.vel.z * n.z);
  if (into <= 0) return 0;
  k.vel.x += n.x * into * (1 + BOUNCE);
  k.vel.z += n.z * into * (1 + BOUNCE);
  return into;
}

// Onto the ground under its middle: followed while it's down, as long as it falls away no faster
// than a slope it's on would carry it, else left to fly and fall. Returns how fast it came down
// if it landed.
function settle(k: KartState, dt: number, structures: Structures): number {
  const ground = structures.groundAt(k.pos.x, k.pos.z, k.pos.y + STEP);
  if (k.grounded) {
    const follows = Math.max(STEP / 4, -k.vel.y * dt + STEP / 8);
    if (ground >= k.pos.y - follows) {
      k.pos.y = ground;
      return 0;
    }
    k.grounded = false;
  }
  k.vel.y -= GRAVITY * dt;
  k.pos.y += k.vel.y * dt;
  if (k.pos.y > ground) return 0;
  const landing = -k.vel.y;
  k.pos.y = ground;
  k.vel.y = 0;
  k.grounded = true;
  return Math.max(landing, 1e-6);
}
