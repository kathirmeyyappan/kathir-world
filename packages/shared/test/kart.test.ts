import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  Ground,
  KARTS,
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

test('a kart drifts, sparks blue, yellow and purple by its mini-turbo time, and boosts by the spark let go on', () => {
  const structures = world();
  const spec = KARTS.standard;
  const k = createKart('standard', 1, { x: 0, y: 0, z: 0 }, 0);
  const gas = { gas: 1, steer: 0, drift: false };
  drive(k, gas, spec.acceleration, structures);
  assert.ok(Math.abs(speed(k) - spec.speed) < 0.5, `flat out after its acceleration: ${speed(k)}`);
  // A press with the wheel over hops it, and it lands drifting that way.
  drive(k, { gas: 1, steer: 1, drift: true }, 0.5, structures);
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

test('a press in the air tricks a kart the way its wheel is held and boosts it as it lands, but not in its own hop', () => {
  const structures = world();
  const k = createKart('standard', 1, { x: 0, y: 3, z: 0 }, 0);
  const gas = { gas: 1, steer: 0, drift: false };
  drive(k, { gas: 1, steer: -1, drift: true }, TICK_DT, structures);
  assert.equal(k.trick?.way, -1);
  drive(k, gas, 1, structures);
  assert.equal(k.trick, null);
  assert.equal(k.turbo?.hold, TRICK.hold);
  drive(k, gas, TURBO.rise + TRICK.hold + TURBO.fall + 0.2, structures);
  // A press hops it, and another in the hop is no trick.
  drive(k, { gas: 1, steer: 0, drift: true }, TICK_DT, structures);
  drive(k, gas, TICK_DT, structures);
  drive(k, { gas: 1, steer: 0, drift: true }, TICK_DT, structures);
  assert.equal(k.trick, null);
  drive(k, gas, 1, structures);
  assert.equal(k.turbo, null);
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
