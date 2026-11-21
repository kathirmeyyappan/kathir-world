// How a kart drives (its stats are its row in karts.ts): the gas and the brake along it, the
// wheel turning it, the wheels taking back a slide sideways, a drift and the mini-turbo it gives,
// rolling up kerbs and ramps and flying off them, and walls in the way. The Room steps every kart
// with its driver's keys, and the driver's client steps its own the same way to predict it.
//
// A drift: a press of the drift key hops the kart; landing with the key still held and the wheel
// over, at speed, it drifts that way, turning tighter or wider as the wheel is held into the turn
// or out of it. Drifting on the ground brings it to a spark, blue, then yellow, then purple
// (SPARKS), and letting go of the key on one is a mini-turbo: its top speed raised by half over
// TURBO.rise, held as long as the spark gives, and let down over TURBO.fall.
//
// A trick: a press of the drift key in the air (off a ramp or a ledge; not its own hop's) tricks
// it left or right, the way the wheel is held or, with it held neither way, either, and landing
// after one is a boost like a mini-turbo's held for TRICK.hold.
import type { Footing, Structures } from '../collision';
import { EYE_HEIGHT, GRAVITY } from '../constants';
import type { ActionSpec, ItemAction } from '../items';
import { takeLook } from '../player';
import { SURFACES } from '../surfaces';
import type { InputFrame, PlayerState, Vec3 } from '../types';
import { KARTS, type KartBody, type KartId, type KartSpec } from './karts';
import { carried, type Rescue } from './rescue';

// What a kart's driver asks of it this tick: the gas (1, W) or the brake (-1, S, which backs it up
// once it's stopped), the wheel (-1 full left, A, to 1 full right, D) and the drift key (Space).
export interface KartControls {
  gas: number;
  steer: number;
  drift: boolean;
}

export const IDLE: KartControls = { gas: 0, steer: 0, drift: false };

// A driver's keys besides the movement keys' (the gas and the wheel): the drift, held, and getting
// out, which is the Room's to do (garage.ts).
export const KART_ACTIONS = {
  drift: { key: 'Space', mode: 'hold' },
  exit: { key: 'KeyE', mode: 'tap' },
} satisfies Partial<Record<ItemAction, ActionSpec>>;

export type Spark = 1 | 2 | 3; // blue, yellow, purple

export interface KartState {
  kart: KartId;
  size: number; // how many times its model's size it's built at, to seat its driver (karts.ts `sizeFor`)
  pos: Vec3; // the middle of its underside
  yaw: number; // the way its nose points: 0 along +z, turning right as it grows, as a look does
  vel: Vec3; // m/s
  wheel: number; // how far over the wheel is, -1 full left to 1 full right: it follows the keys
  gas: number; // the pedal as its driver last held it: 1 the gas to -1 the brake, 0 let go
  grounded: boolean;
  held: boolean; // the drift key was down last tick, so a press is the tick it goes down
  // Seconds since the drift key went down, not counting those up a ramp, for as long as that
  // press can still be a trick (TRICK.early): none once it has been one, or is older.
  press: number | null;
  // Seconds since it came down from a flight it did no trick in, for as long as a press can
  // still be that trick (TRICK.late).
  down: number | null;
  hop: boolean; // it left the ground by the hop a press gives, until it lands
  // Its drift: its way (1 right), the seconds of it on the ground, and the share of its full turn
  // it was turning at as the drift began, which it eases from.
  drift: { way: 1 | -1; t: number; from: number } | null;
  // In the air: the way of its trick, or of its last where it has done several (1 right), and the
  // seconds since that one began.
  trick: { way: 1 | -1; t: number } | null;
  // A boost: the seconds it holds at full, the seconds into it, and the spark of the drift it came
  // of (none for a trick's).
  turbo: { hold: number; t: number; spark: Spark | null } | null;
  // How many boosts it has begun, a mini-turbo's, a trick's or a boost pad's: what tells one begun
  // while another still holds from the one held.
  boosts: number;
  // Rolling forward over a boost pad as of its last tick: rolling onto one is a boost begun.
  pad: boolean;
  // Seconds left of reeling from what it ran into (REEL), its tires doing nothing: 0 out of one.
  reel: number;
  // In Lakitu's hands, fished back from the ground past the world's edge (rescue.ts): there only
  // for as long as it is, and nothing drives it meanwhile.
  rescue?: Rescue;
}

// What came of a tick: how fast it was going into what it ran into, square to it (0 for nothing),
// and how fast it came down onto the ground if it landed.
export interface KartStep {
  impact: number;
  landing: number;
}

// A boost: how many times its speed a kart's top speed is at the full of one, and the seconds it
// takes to rise there and to fall back.
export const TURBO = { boost: 1.5, rise: 0.2, fall: 0.5 };
// A drift's sparks, blue, yellow and purple: how long drifting on the ground to each, in its kart's
// `miniTurboTime`s, and the seconds the mini-turbo it gives holds at full.
export const SPARKS = [
  { after: 1, hold: 1 },
  { after: 2.25, hold: 2 },
  { after: 3.5, hold: 3 },
];
// A trick: how long before the kart is in the air its press may come (shorter than a hop lasts,
// so the press that hopped it is forgotten by the time it's down; on a ramp carrying it up it
// keeps to the lip however long), the seconds it takes, through which another can't begin, and
// the seconds its boost holds at full, rising and falling as a mini-turbo's.
// A press may come late too: up to `late` seconds after landing, where it came down at `fall`
// m/s or more (a flight, not a kerb), it's the trick the flight didn't have, boosting at once.
export const TRICK = { early: 0.3, late: 0.25, fall: 2.5, seconds: 0.7, hold: 0.8 };
// A boost pad's boost (surfaces.ts `boost`): held at full for as long as the kart is on the pad,
// which drives it on as the gas would whatever its pedal, and for `hold` seconds after it leaves,
// unless the boost it came with has longer than that left.
export const PAD = { hold: 1.2 };

// What a knock costs, by how fast the two close on each other square to where they touch, m/s:
// nothing under `least`, then `at20` at 20 m/s and on in step, to the nearest quarter (of a heart,
// of a wrench).
interface Knock {
  least: number;
  at20: number;
}

function cost(knock: Knock, closing: number): number {
  return closing < knock.least ? 0 : Math.round((knock.at20 * closing) / 5) / 4;
}

// Hearts off a player on foot a kart runs into.
export const IMPACT: Knock = { least: 10, at20: 5 };
// Wrenches off a kart from what it runs into, a wall or another kart: few enough that it takes
// crash after crash flat out.
export const WEAR: Knock = { least: 10, at20: 2 };
// The share of how fast a kart comes down onto the ground that counts as running into it: landing
// on its tires it's worn only from a 10 m drop (20 m/s), and by a 40 m one (40 m/s) no more than by
// a wall at its speed, so it comes down from a trick off anything there is.
export const LANDING = 0.5;

export function impactDamage(closing: number): number {
  return cost(IMPACT, closing);
}

// Wrenches off a kart that ran into something at `impact` m/s and came down on the ground at `landing`.
export function wearOf({ impact, landing }: KartStep): number {
  return cost(WEAR, impact) + cost(WEAR, LANDING * landing);
}
export const DRIFT_FROM = 0.4; // of its speed: the least a drift begins or carries on at

// m/s²: how fast the wheels take back a slide sideways, every kart alike: past what turning full
// over or drifting tight at its speed asks of them, so only a boosted turn, or ice, slides.
const TRACTION = 40;
const REVERSE = 0.35; // of its speed: flat out backing up
const BRAKING = 2.5; // times its acceleration: braking while still rolling forward
const COAST = 1.5; // times its acceleration: slowing with no key held, so it stops soon after the gas is let go
const WHEEL_RATE = 8; // per second: how fast the wheel follows the keys, full over in an eighth of a second
const STEP = 0.4; // metres: a kerb or a ramp's lip it rolls up onto rather than running into
const ROLL = 0.25; // of its width: the most it moves between looks at the ground under it
// m/s: over a crest, how much faster upward it's going than the ground it comes onto would carry
// it, past which it leaves the ground: at its speed, a slope's top a sixth steeper than what follows.
const LIFT = 3;
const HOP = 4.2; // m/s up: a press of the drift key, 0.44 m up and 0.42 s to come down on the flat
const DRIFT_HOLD = 0.3; // of the wheel: held over with the drift key down on the ground, the way the drift goes
// In a drift, how tight it turns, as a share of its turn with the wheel full over: with the wheel
// held out of the drift's way (all but straight, so a drift can be carried round a long bend),
// let be, and held into it (tighter than any turn without one).
const DRIFT_TURN = { wide: 0.2, neutral: 0.6, tight: 1.25 };
// Seconds of a drift on the ground it takes to come round to that turn from the one it began
// with, eased, so a hop's slight turn doesn't snap into the drift's as it lands: `turn` with the
// wheel let be or held out of the drift's way, and up to `tight` with it held full into it, so the
// tightest turn there is comes on the most gently.
const DRIFT_EASE = { turn: 0.45, tight: 0.7 };
const AIR_STEER = 0.3; // of its turn, in the air
const BOUNCE = 0.3; // of the speed it ran into a wall at, back off it
// Run into at `from` m/s or more, square to what it hit, a kart reels for `seconds`: its tires do
// nothing, neither driving it nor slowing it, so it rolls back off the wall as it bounced and the
// gas, held, doesn't take the bounce back at once. A slower touch, or a scrape along a wall, is none.
const REEL = { from: 4, seconds: 0.25 };

export function createKart(kart: KartId, size: number, pos: Vec3, yaw: number): KartState {
  return {
    kart,
    size,
    pos: { ...pos },
    yaw,
    vel: { x: 0, y: 0, z: 0 },
    wheel: 0,
    gas: 0,
    grounded: false,
    held: false,
    press: null,
    down: null,
    hop: false,
    drift: null,
    trick: null,
    turbo: null,
    boosts: 0,
    pad: false,
    reel: 0,
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

// The eye point of a driver sat in kart `k`, their feet on its seat.
export function seatedAt(k: KartState): Vec3 {
  const { seat: at } = bodyOf(k);
  const f = noseOf(k.yaw);
  return { x: k.pos.x + f.x * at.z, y: k.pos.y + at.y + EYE_HEIGHT, z: k.pos.z + f.z * at.z };
}

// Sits `p` in kart `k`'s seat, moving with it.
export function seat(p: PlayerState, k: KartState): void {
  p.pos = seatedAt(k);
  p.vx = k.vel.x;
  p.vy = k.vel.y;
  p.vz = k.vel.z;
  p.walk = 0;
}

export function stepKart(k: KartState, c: KartControls, dt: number, structures: Structures): KartStep {
  if (k.rescue) return carried(k, k.rescue, dt);
  const spec = KARTS[k.kart];
  const steer = Math.max(-1, Math.min(1, c.steer));
  k.wheel += Math.max(-WHEEL_RATE * dt, Math.min(WHEEL_RATE * dt, steer - k.wheel));
  k.gas = Math.max(-1, Math.min(1, c.gas));
  const pressed = c.drift && !k.held;
  k.held = c.drift;
  // A trick on the ground is a late one, begun last tick and boosted already.
  if (k.trick && k.grounded) k.trick = null;
  if (k.down !== null && (k.down += dt) > TRICK.late) k.down = null;
  // Up a ramp as fast as a hop would lift it: there's no hop to make, and a press waits for the lip.
  const climbing = k.grounded && k.vel.y >= HOP;
  const hopped = hopping(k); // in its own hop as the tick begins, for whether a landing is a hop's
  if (pressed) k.press = 0;
  else if (k.press !== null && !climbing && (k.press += dt) > TRICK.early) k.press = null;
  if (pressed && k.grounded && k.down !== null) {
    // Just down from a flight with no trick in it: the press is that trick, late.
    k.trick = { way: trickWay(k, steer), t: 0 };
    boost(k, TRICK.hold);
    k.press = k.down = null;
  } else if (pressed && k.grounded && !k.drift && !climbing) {
    k.vel.y = HOP;
    k.grounded = false;
    k.hop = true;
  }
  // A press is a trick as soon as the kart is in the air (but for its own hop) with no trick
  // still running: at once up there, and off the lip for one that came a moment early.
  if (k.press !== null && !k.grounded && !hopping(k) && !(k.trick && k.trick.t < TRICK.seconds)) {
    k.trick = { way: trickWay(k, steer), t: 0 };
    k.press = null;
  }
  if (k.trick) k.trick.t += dt;
  const speed = forwardSpeed(k);
  if (k.drift && (!c.drift || speed < DRIFT_FROM * spec.speed)) {
    const spark = c.drift ? null : sparkOf(k.drift.t, spec);
    if (spark) boost(k, SPARKS[spark - 1].hold, spark);
    k.drift = null;
  }
  const lock = lockOf(k);
  k.yaw += ((lock * speed) / (spec.handling / 2)) * dt;
  if (k.grounded && k.reel === 0) drive(k, spec, c.gas, dt, structures);
  else k.pad = false;
  const { impact, footing } = move(k, dt, structures);
  k.reel = impact >= REEL.from ? REEL.seconds : Math.max(0, k.reel - dt);
  const landing = settle(k, dt, footing);
  if (landing > 0 && k.trick) {
    boost(k, TRICK.hold);
    k.trick = null;
  } else if (landing >= TRICK.fall && !hopped) k.down = 0;
  if (landing > 0) k.hop = false;
  // The drift key held on the ground at speed: the wheel over begins a drift that way, as the hop
  // lands or whenever it goes over after.
  if (k.grounded && !k.drift && c.drift && Math.abs(steer) >= DRIFT_HOLD && forwardSpeed(k) >= DRIFT_FROM * spec.speed)
    k.drift = { way: steer > 0 ? 1 : -1, t: 0, from: lock };
  if (k.drift && k.grounded) k.drift.t += dt;
  if (k.turbo) {
    k.turbo.t += dt;
    if (turboShare(k.turbo) === 1 && k.turbo.t > TURBO.rise) k.turbo = null;
  }
  return { impact, landing };
}

// Begins a boost that holds at full for `hold` seconds, a mini-turbo's of its drift's `spark` or a
// trick's of none.
function boost(k: KartState, hold: number, spark: Spark | null = null): void {
  k.turbo = { hold, t: 0, spark };
  k.boosts++;
}

// Whether it's in the hop a press gave it: up and back down to where it left the ground. Falling
// faster than a hop comes down, it has gone off something, and is in the air as off any ledge.
function hopping(k: KartState): boolean {
  return k.hop && k.vel.y >= -HOP;
}

// The spark a drift has got to after `t` seconds on the ground, or null short of the first.
export function sparkOf(t: number, spec: KartSpec): Spark | null {
  const sparks = SPARKS.filter((spark) => t >= spark.after * spec.miniTurboTime).length;
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

// How fast it's going along its nose, m/s: less than nothing backing up.
export function forwardSpeed(k: KartState): number {
  const f = noseOf(k.yaw);
  return k.vel.x * f.x + k.vel.z * f.z;
}

// The share of its full turn it's turning at, a circle `handling` across at any speed, so slower
// is no tighter, and backing up turns it the other way, as a car does: the wheel's, or in a drift
// the drift's, come round to from the turn it began with (DRIFT_EASE); less in the air.
function lockOf(k: KartState): number {
  const lock = k.drift ? eased(k.drift, k.drift.way * k.wheel) : k.wheel;
  return lock * (k.grounded ? 1 : AIR_STEER);
}

// A drift's turn with the wheel held `into` it (-1 full out of its way to 1 full into it), on its
// way from the turn it began with to the one that gives (driftTurn).
function eased({ way, t, from }: NonNullable<KartState['drift']>, into: number): number {
  const over = DRIFT_EASE.turn + (DRIFT_EASE.tight - DRIFT_EASE.turn) * Math.max(0, into);
  const through = Math.min(1, t / over);
  return from + (way * driftTurn(into) - from) * through * through * (3 - 2 * through);
}

// A drift's share of the full turn with the wheel held `into` it: -1 full out of its way, 0 let
// be, 1 full into it.
function driftTurn(into: number): number {
  const { wide, neutral, tight } = DRIFT_TURN;
  return neutral + (into < 0 ? neutral - wide : tight - neutral) * into;
}

// The gas, the brake or neither along it, and the wheels taking back what slides across it.
function drive(k: KartState, spec: KartSpec, gas: number, dt: number, structures: Structures): void {
  const f = noseOf(k.yaw);
  const r = rightOf(k.yaw);
  let along = k.vel.x * f.x + k.vel.z * f.z;
  let across = k.vel.x * r.x + k.vel.z * r.z;
  const footing = structures.footing(k.pos.x, k.pos.z, k.pos.y + STEP);
  const surface = SURFACES[footing.surface];
  // On a boost pad, rolling forward: the pad's push for its gas, and its boost, held at full. Rolling
  // onto it is a boost begun, whatever boost it comes with.
  const pad = surface.boosts === true && along > 0;
  if (pad) {
    gas = Math.max(gas, 1);
    const left = k.turbo ? TURBO.rise + k.turbo.hold - k.turbo.t : 0; // seconds its own boost stays at full
    if (left < PAD.hold) k.turbo = { hold: PAD.hold, t: Math.min(k.turbo?.t ?? 0, TURBO.rise), spark: null };
    if (!k.pad) k.boosts++;
  }
  k.pad = pad;
  const accel = spec.speed / spec.acceleration;
  const top = spec.speed * turboShare(k.turbo);
  // A boost pushes it up to its boosted speed over its rise and lets it down from there over its
  // fall, whatever its acceleration, so the boost is over when it says.
  const boosted = (TURBO.boost - 1) * spec.speed;
  const push = k.turbo ? Math.max(accel, boosted / TURBO.rise) : accel;
  const toward = (target: number, rate: number) => (along += Math.max(-rate * dt, Math.min(rate * dt, target - along)));
  if (gas > 0) toward(top, along < top ? push * gas : boosted / TURBO.fall);
  else if (gas < 0 && along > 0) toward(0, BRAKING * accel * -gas);
  else if (gas < 0) toward(-REVERSE * spec.speed, accel * -gas);
  else toward(0, COAST * accel);
  const grip = Math.min(TRACTION, surface.grip);
  across -= Math.sign(across) * Math.min(Math.abs(across), grip * dt);
  k.vel.x = f.x * along + r.x * across;
  k.vel.z = f.z * along + r.z * across;
  // Along the slope underfoot, so it carries on up off a ramp's end.
  k.vel.y = footing.slope.x * k.vel.x + footing.slope.z * k.vel.z;
}

// Across the ground by its velocity as two circles, at its nose and its tail, each as wide as it,
// pushed out of what's in the way: a corner hit turns it, and what it ran into takes the speed it
// had into it, square to it, all but a bounce. Each circle, and its middle, rolls along the ground
// under it, a ROLL at a time, up onto whatever is within a kerb's height of where it was, so a
// slope is climbed end by end however fast it's taken and only a face taller than a kerb is a
// wall. Returns the speed it ran into something at, and the ground its middle has rolled onto.
function move(k: KartState, dt: number, structures: Structures): { impact: number; footing: Footing } {
  const { width, length, height } = bodyOf(k);
  const f = noseOf(k.yaw);
  const half = (length - width) / 2;
  const dx = k.vel.x * dt;
  const dz = k.vel.z * dt;
  // The highest ground at a spot within a kerb's height of the ground it came from, or of its underside.
  const rolled = (x: number, z: number, from: number) => structures.footing(x, z, Math.max(from, k.pos.y) + STEP);
  const end = (side: 1 | -1) => {
    const [x, z] = [k.pos.x + side * f.x * half, k.pos.z + side * f.z * half];
    return { x, y: k.pos.y, z, ground: rolled(x, z, k.pos.y).y };
  };
  const nose = end(1);
  const tail = end(-1);
  let footing = rolled(k.pos.x, k.pos.z, k.pos.y);
  const steps = Math.max(1, Math.ceil(Math.hypot(dx, dz) / (width * ROLL)));
  for (let i = 0; i < steps; i++) {
    for (const e of [nose, tail]) {
      e.ground = rolled(e.x + dx / steps, e.z + dz / steps, e.ground).y;
      const under = Math.max(k.pos.y, e.ground);
      structures.move(e, dx / steps, dz / steps, { head: under + height, reach: under + STEP, radius: width / 2 });
    }
    footing = rolled((nose.x + tail.x) / 2, (nose.z + tail.z) / 2, footing.y);
  }
  const push = { x: (nose.x + tail.x) / 2 - (k.pos.x + dx), z: (nose.z + tail.z) / 2 - (k.pos.z + dz) };
  k.pos.x += dx + push.x;
  k.pos.z += dz + push.z;
  if (Math.hypot(nose.x - tail.x, nose.z - tail.z) > 1e-6) k.yaw = Math.atan2(nose.x - tail.x, nose.z - tail.z);
  const pushed = Math.hypot(push.x, push.z);
  if (pushed < 1e-6) return { impact: 0, footing };
  const n = { x: push.x / pushed, z: push.z / pushed };
  const into = -(k.vel.x * n.x + k.vel.z * n.z);
  if (into <= 0) return { impact: 0, footing };
  k.vel.x += n.x * into * (1 + BOUNCE);
  k.vel.z += n.z * into * (1 + BOUNCE);
  return { impact: into, footing };
}

// Onto the ground its middle has rolled onto: followed while it's down, as long as it falls away
// no faster than a slope it's on would carry it and doesn't turn down from under it over a crest
// (LIFT), else left to fly and fall. Returns how fast it came down if it landed.
function settle(k: KartState, dt: number, footing: Footing): number {
  const ground = footing.y;
  const along = footing.slope.x * k.vel.x + footing.slope.z * k.vel.z; // m/s up, kept to this ground
  if (k.grounded) {
    const follows = Math.max(STEP / 4, -k.vel.y * dt + STEP / 8);
    if (ground >= k.pos.y - follows && k.vel.y - along <= LIFT) {
      k.pos.y = ground;
      return 0;
    }
    k.grounded = false;
  }
  k.vel.y -= GRAVITY * dt;
  k.pos.y += k.vel.y * dt;
  if (k.pos.y > ground) return 0;
  k.pos.y = ground;
  if (k.vel.y > along) return 0; // going up faster than the ground under it: just off a crest, not down on it
  const landing = -k.vel.y;
  k.vel.y = 0;
  k.grounded = true;
  return Math.max(landing, 1e-6);
}
