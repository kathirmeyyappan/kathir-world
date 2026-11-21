// A kart down on the ground past the world's edge is fished back by Lakitu (the client draws him,
// render/lakitu/): once its driver has sat there RESCUE.wait he comes, hoists it RESCUE.height,
// carries it, while its driver's view is closed, to the middle of the track where it left the
// world, and lowers it there. To the sim that's a kart held wherever the seconds into its rescue
// put it (`carried`, which stepKart hands a kart in one to, so the Room and its driver's own
// prediction agree) and nothing else: its wrenches and its driver's hearts are as they were. Where
// a kart left the world only the Room knows (`Watch`), so it's the Room that begins one.
import type { Structures } from '../collision';
import { STEP_UP } from '../constants';
import { onOutsideGround } from '../ground';
import { ROAD_WIDTH } from '../outline';
import type { Vec3 } from '../types';
import type { KartState, KartStep } from './kart';

// A rescue's parts, in seconds: the driver stranded before he comes; then, one after the next, him
// coming down over the kart, the kart hoisted `height` metres, the driver's view closing to a
// circle on them, the view shut as the kart is carried across, and the kart lowered onto the
// track; with the view opening again from the moment the lowering begins.
export const RESCUE = { wait: 2, come: 0.7, lift: 1, close: 0.5, dark: 0.2, lower: 1.4, open: 0.5, height: 2 };

// The seconds into a rescue each part after the first begins at, and it ends.
const LIFT_AT = RESCUE.come;
const CLOSE_AT = LIFT_AT + RESCUE.lift;
const DARK_AT = CLOSE_AT + RESCUE.close;
const LOWER_AT = DARK_AT + RESCUE.dark;
const OVER_AT = LOWER_AT + RESCUE.lower;

// A kart's rescue: the seconds into it, where it was picked up, and where it's set down and the
// way its nose points there. Replaced whole each tick, never changed in place, so a copy of the
// kart can share it.
export interface Rescue {
  t: number;
  from: Vec3;
  to: Vec3;
  yaw: number;
}

// Whether kart `k` is down on the ground past the world's edge (ground.ts), with no way back up
// onto the floor but Lakitu's: a driver who gets out there is on that ground on foot, which is the
// end of them (room.ts `land`).
export function stranded(k: KartState): boolean {
  return k.grounded && onOutsideGround(k.pos.y);
}

// How far shut the view of a driver `t` seconds into a rescue is: 0 open to 1 shut.
export function shutAt(t: number): number {
  return Math.min(unit((t - CLOSE_AT) / RESCUE.close), 1 - unit((t - LOWER_AT) / RESCUE.open));
}

// One tick of kart `k` in a rescue: held still where the seconds into it put it, over where it was
// picked up until its driver's view is shut and over where it's set down after, and let go on the
// ground there once it's over.
export function carried(k: KartState, rescue: Rescue, dt: number): KartStep {
  const t = rescue.t + dt;
  const across = t >= DARK_AT;
  const over = across ? rescue.to : rescue.from;
  const up = across ? 1 - eased((t - LOWER_AT) / RESCUE.lower) : eased((t - LIFT_AT) / RESCUE.lift);
  k.pos.x = over.x;
  k.pos.y = over.y + RESCUE.height * up;
  k.pos.z = over.z;
  if (across) k.yaw = rescue.yaw;
  k.vel.x = k.vel.y = k.vel.z = 0;
  k.rescue = t < OVER_AT ? { ...rescue, t } : undefined;
  return { impact: 0, landing: 0 };
}

// What the Room keeps of a driven kart to rescue it by: where it last stood on the world and the
// way its nose pointed there, and the seconds it has now been stranded.
export interface Watch {
  safe: Vec3;
  yaw: number;
  stranded: number;
}

// A watch over a kart that has yet to stand anywhere, dropped by someone standing at `feet` and
// facing `yaw`.
export function watchFrom(feet: Vec3, yaw: number): Watch {
  return { safe: { ...feet }, yaw, stranded: 0 };
}

// One tick of the watch over driven kart `k`: where it stands is kept while it's on the world, and
// once it has been stranded RESCUE.wait in all since (a hop off the ground past the edge is no way
// off it) its rescue begins, whatever it was doing stopped.
export function watch(w: Watch, k: KartState, dt: number, structures: Structures): void {
  if (k.rescue || !k.grounded) return;
  if (!stranded(k)) {
    w.stranded = 0;
    w.safe.x = k.pos.x;
    w.safe.y = k.pos.y;
    w.safe.z = k.pos.z;
    w.yaw = k.yaw;
    return;
  }
  if ((w.stranded += dt) < RESCUE.wait) return;
  w.stranded = 0;
  k.wheel = k.gas = k.reel = 0;
  k.grounded = k.hop = k.pad = false;
  k.drift = k.trick = k.turbo = k.press = k.down = null;
  k.rescue = { t: 0, from: { ...k.pos }, ...backOnTrack(w, structures) };
}

interface Flat {
  x: number;
  z: number;
}

// The ways round a spot its nearest edge is looked for.
const WAYS: Flat[] = Array.from({ length: 16 }, (_, i) => ({
  x: Math.sin((i / 16) * 2 * Math.PI),
  z: Math.cos((i / 16) * 2 * Math.PI),
}));
const PROBE = 1; // metres between looks at the ground along a line: under what rises a kerb's height on a road's steepest
const FINE = 4; // times that's then halved, to find the edge within it
const SLACK = 2; // metres either way of a road's width that what's stood on is across, to be a track
const BESIDE = 6; // metres either way along a track its edge is found again, for the way it runs

// Where a kart that left the world at `w.safe`, its nose pointing `w.yaw`, is set down, and the
// way its nose points there: in the middle of the track it left, turned along it the way it was
// pointing; where what it left is no track (wider than a road: an island, a road left over its
// end), half a road in from the edge it left over, as it pointed; and with no edge within a
// road's width, or as near on every side, where it was.
function backOnTrack(w: Watch, structures: Structures): { to: Vec3; yaw: number } {
  // The way out over the nearest edge: the middle of the ways that reach an edge within a metre
  // of the soonest, since right at an edge every way out over it reaches it as soon.
  let nearest = ROAD_WIDTH;
  const reached = WAYS.map((way) => {
    const { far } = walk(structures, w.safe, way, nearest + 1);
    nearest = Math.min(nearest, far);
    return far;
  });
  const sum = { x: 0, z: 0 };
  WAYS.forEach((way, i) => {
    if (reached[i] >= nearest + 1) return;
    sum.x += way.x;
    sum.z += way.z;
  });
  const size = Math.hypot(sum.x, sum.z);
  if (nearest >= ROAD_WIDTH || size < 1e-6) return { to: { ...w.safe }, yaw: w.yaw };
  const out = { x: sum.x / size, z: sum.z / size };
  const inward = { x: -out.x, z: -out.z };
  const near = walk(structures, w.safe, out, ROAD_WIDTH).far;
  const { far } = walk(structures, w.safe, inward, ROAD_WIDTH + SLACK);
  const track = Math.abs(near + far - ROAD_WIDTH) < SLACK;
  const to = walk(structures, w.safe, inward, track ? (far - near) / 2 : Math.max(0, ROAD_WIDTH / 2 - near)).at;
  if (!track) return { to, yaw: w.yaw };
  // The way the track runs: along the edge it left over, from a spot on it to one side of here to
  // a spot on it to the other.
  const [a, b] = [-1, 1].map((side) => {
    const beside = walk(structures, to, { x: inward.z * side, z: -inward.x * side }, BESIDE).at;
    return walk(structures, beside, out, ROAD_WIDTH).at;
  });
  const way = { x: b.x - a.x, z: b.z - a.z };
  if (Math.hypot(way.x, way.z) < 1e-6) return { to, yaw: w.yaw };
  const sense = way.x * Math.sin(w.yaw) + way.z * Math.cos(w.yaw) < 0 ? -1 : 1;
  return { to, yaw: Math.atan2(way.x * sense, way.z * sense) };
}

// Walks the ground from `at` along unit `way`, a PROBE at a time, for as long as each step is
// within a kerb's height of the last, to `limit` at the most: how far it carries on (its edge
// found within the last PROBE), and the spot on the ground there.
function walk(structures: Structures, at: Vec3, way: Flat, limit: number): { far: number; at: Vec3 } {
  let far = 0;
  let y = at.y;
  const reaches = (to: number): boolean => {
    const ground = structures.groundAt(at.x + way.x * to, at.z + way.z * to, y + STEP_UP);
    if (Math.abs(ground - y) > STEP_UP) return false;
    y = ground;
    return true;
  };
  let whole = true;
  while (far < limit && (whole = reaches(Math.min(limit, far + PROBE)))) far = Math.min(limit, far + PROBE);
  if (!whole)
    for (let step = PROBE / 2, i = 0; i < FINE; i++, step /= 2)
      if (far + step <= limit && reaches(far + step)) far += step;
  return { far, at: { x: at.x + way.x * far, y, z: at.z + way.z * far } };
}

// `u` kept within 0 to 1.
function unit(u: number): number {
  return Math.max(0, Math.min(1, u));
}

// From 0 to 1 as `u` goes from 0 to 1, starting and stopping gently.
function eased(u: number): number {
  const c = unit(u);
  return c * c * (3 - 2 * c);
}
