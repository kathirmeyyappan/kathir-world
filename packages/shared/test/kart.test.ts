import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  Ground,
  KARTS,
  PAD,
  SPARKS,
  Structures,
  TICK_DT,
  TRICK,
  TURBO,
  createKart,
  ramp,
  stepKart,
  wall,
  type KartControls,
  type KartState,
  type Structure,
} from '../src/index';

// Open floor a kilometre round, with whatever stands on it.
function world(...pieces: Structure[]): Structures {
  return new Structures(pieces, new Ground([{ kind: 'disc', x: 0, z: 0, r: 1000 }]));
}

function drive(k: KartState, c: KartControls, seconds: number, structures: Structures): number {
  let impact = 0;
  for (let t = 0; t < seconds - 1e-9; t += TICK_DT)
    impact = Math.max(impact, stepKart(k, c, TICK_DT, structures).impact);
  return impact;
}

const speed = (k: KartState) => Math.hypot(k.vel.x, k.vel.z);

// A block 6 m high, 20 m square (its near edge at z 10, its far one at z 30), off to one side of the open floor.
const platform: Structure & { h: number } = { kind: 'box', x: 100, z: 20, w: 20, d: 20, h: 6 };

test('a kart drifts, sparks blue, yellow and purple by its mini-turbo time, and boosts by the spark let go on', () => {
  const structures = world();
  const spec = KARTS.standard;
  const k = createKart('standard', 1, { x: 0, y: 0, z: 0 }, 0);
  const gas = { gas: 1, steer: 0, drift: false };
  drive(k, gas, spec.acceleration, structures);
  assert.ok(Math.abs(speed(k) - spec.speed) < 0.5, `flat out after its acceleration: ${speed(k)}`);
  // A press hops it, and with the key held on the ground the wheel going over begins a drift that way.
  drive(k, { gas: 1, steer: 0, drift: true }, 0.6, structures);
  assert.deepEqual([k.grounded, k.drift], [true, null], 'landed, the wheel straight');
  drive(k, { gas: 1, steer: 1, drift: true }, TICK_DT, structures);
  assert.equal(k.drift?.way, 1);
  // Held on through a yellow spark and let go short of purple.
  const [, yellow] = SPARKS;
  drive(k, { gas: 1, steer: 0.5, drift: true }, yellow.after * spec.miniTurboTime, structures);
  drive(k, gas, TICK_DT, structures);
  assert.equal(k.drift, null);
  assert.equal(k.turbo?.hold, yellow.hold);
  drive(k, gas, TURBO.rise, structures);
  assert.ok(speed(k) > TURBO.boost * spec.speed - 0.5, `boosted after its rise: ${speed(k)}`);
  drive(k, gas, yellow.hold - 0.1, structures);
  assert.ok(speed(k) > TURBO.boost * spec.speed - 0.5, `held through a yellow spark's: ${speed(k)}`);
  drive(k, gas, TURBO.fall + 0.2, structures);
  assert.equal(k.turbo, null);
  assert.ok(speed(k) < spec.speed + 0.5, `back at its own speed once it's let down: ${speed(k)}`);
});

test('a press in the air tricks a kart the way its wheel is held, again once that trick is through, and boosts it once as it lands, a moment early or late too, but not in its own hop', () => {
  // The platform, and a jump along +z: up 5 m over 14 m, 8 m of nothing, and back down.
  const structures = world(
    platform,
    ramp({ x: 0, z: 40 }, { x: 0, z: 54 }, 5, 9),
    ramp({ x: 0, z: 76 }, { x: 0, z: 62 }, 5, 9),
  );
  const k = createKart('standard', 1, { x: 0, y: 16, z: 0 }, 0);
  const gas = { gas: 1, steer: 0, drift: false };
  const press = (steer: number) => drive(k, { gas: 1, steer, drift: true }, TICK_DT, structures);
  press(-1);
  assert.equal(k.trick?.way, -1);
  // Another press early in it is nothing; one after it's through is the next trick.
  drive(k, gas, TRICK.seconds / 4, structures);
  press(1);
  assert.equal(k.trick?.way, -1);
  drive(k, gas, TRICK.seconds, structures);
  press(1);
  assert.equal(k.trick?.way, 1);
  assert.ok(k.trick.t < 2 * TICK_DT, `begun afresh: ${k.trick.t}`);
  drive(k, gas, 1, structures);
  assert.equal(k.trick, null);
  assert.equal(k.turbo?.hold, TRICK.hold);
  drive(k, gas, TURBO.rise + TRICK.hold + TURBO.fall + 0.2, structures);
  // A press hops it, and another in the hop is no trick.
  press(0);
  drive(k, gas, TICK_DT, structures);
  press(0);
  assert.equal(k.trick, null);
  drive(k, gas, 1, structures);
  assert.equal(k.turbo, null);
  // Up a jump's ramp flat out, a press well short of the lip waits for it, and is the trick off it.
  const early = createKart('standard', 1, { x: 0, y: 0, z: 0 }, 0);
  while (early.pos.z < 46) drive(early, gas, TICK_DT, structures);
  drive(early, { gas: 1, steer: 0, drift: true }, TICK_DT, structures);
  assert.ok(early.grounded && !early.hop, 'no hop up the ramp');
  while (early.grounded) drive(early, gas, TICK_DT, structures);
  drive(early, gas, TICK_DT, structures);
  assert.ok(early.trick, 'a trick off the lip');
  // And one a moment after landing from a flight with no trick in it is that trick, late.
  const late = createKart('standard', 1, { x: 0, y: 0, z: 0 }, 0);
  while (late.pos.z < 58 || !late.grounded) drive(late, gas, TICK_DT, structures);
  drive(late, gas, 0.1, structures);
  drive(late, { gas: 1, steer: 0, drift: true }, TICK_DT, structures);
  assert.ok(late.trick && late.grounded && !late.hop, 'a late trick, no hop');
  assert.equal(late.turbo?.hold, TRICK.hold);
  // Hopped off the platform's edge, it's off a ledge once it's falling faster than a hop comes down.
  const off = createKart('standard', 1, { x: 100, y: platform.h, z: 12 }, 0);
  while (off.pos.z < 28) drive(off, gas, TICK_DT, structures);
  drive(off, { gas: 1, steer: 0, drift: true }, TICK_DT, structures);
  assert.ok(off.hop && off.pos.y > platform.h, 'hopped, short of the edge');
  drive(off, gas, 0.6, structures);
  assert.ok(!off.grounded && off.pos.y < platform.h, `past the edge and falling: ${off.pos.y}`);
  drive(off, { gas: 1, steer: 0, drift: true }, TICK_DT, structures);
  assert.ok(off.trick, 'a trick, past its hop');
});

test('a boost pad drives a kart rolling over it up to its boosted speed with no gas and holds the boost on past it, and leaves one parked on it alone', () => {
  // A pad 40 m long across the kart's way, from 10 m ahead of it.
  const structures = world({ kind: 'box', x: 0, z: 30, w: 10, d: 40, h: 0.04, surface: 'boost' });
  const boosted = TURBO.boost * KARTS.standard.speed;
  const gas = { gas: 1, steer: 0, drift: false };
  const none = { gas: 0, steer: 0, drift: false };
  const k = createKart('standard', 1, { x: 0, y: 0, z: 0 }, 0);
  while (k.pos.z < 11) drive(k, gas, TICK_DT, structures);
  while (k.pos.z < 49) drive(k, none, TICK_DT, structures);
  assert.ok(speed(k) > boosted - 0.5, `boosted along the pad with the gas let go: ${speed(k)}`);
  drive(k, gas, PAD.hold - 0.1, structures);
  assert.ok(speed(k) > boosted - 0.5, `held for the pad's hold past it: ${speed(k)}`);
  drive(k, gas, TURBO.fall + 0.3, structures);
  assert.equal(k.turbo, null);
  const parked = createKart('standard', 2, { x: 0, y: 0.04, z: 30 }, 0);
  drive(parked, none, 1, structures);
  assert.equal(speed(parked), 0);
});

test('a kart driven into a wall stops at it and says how hard it hit', () => {
  const structures = world(wall({ x: -10, z: 30 }, { x: 10, z: 30 }, 3));
  const k = createKart('standard', 1, { x: 0, y: 0, z: 0 }, 0);
  const hit = drive(k, { gas: 1, steer: 0, drift: false }, 4, structures);
  assert.ok(hit > 15, `head on at about its speed: ${hit}`);
  assert.ok(k.pos.z < 30 - KARTS.standard.body.length / 2 + 0.1, `short of the wall: ${k.pos.z}`);
});

test('a kart flat out climbs a ramp rather than running into it, flies off its lip, and comes down on the ramp past the gap', () => {
  // Up 5 m over 14 m, 8 m of nothing, and back down, along +z.
  const structures = world(ramp({ x: 0, z: 40 }, { x: 0, z: 54 }, 5, 9), ramp({ x: 0, z: 76 }, { x: 0, z: 62 }, 5, 9));
  const k = createKart('standard', 1, { x: 0, y: 0, z: 0 }, 0);
  let impact = 0;
  let overGap = Infinity; // the lowest it was over the middle of the gap
  let landed = 0;
  for (let t = 0; k.pos.z < 80; t += TICK_DT) {
    const step = stepKart(k, { gas: 1, steer: 0, drift: false }, TICK_DT, structures);
    impact = Math.max(impact, step.impact);
    if (k.pos.z > 56 && k.pos.z < 60) overGap = Math.min(overGap, k.pos.y);
    if (step.landing > 0 && landed === 0) landed = k.pos.z;
  }
  assert.equal(impact, 0, 'nothing in its way');
  assert.ok(overGap > 5, `over the gap above the lips: ${overGap}`);
  assert.ok(landed > 62, `down past the gap: ${landed}`);
});
