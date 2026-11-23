import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { gunzipSync } from 'node:zlib';
import { MAP_SOURCES } from '../src/sim/botMap';
import { climb, gap, layRoad, level, padded, span, split } from '../src/sim/roads';
import {
  ISLANDS,
  ROADS,
  TRACK_LENGTH,
  gridOf,
  inPlay,
  layTrack,
  onTrack,
  routes,
  spotAt,
  withinTrack,
  doorPieces,
  CHILL_SECONDS,
  CHILLED_SPEED_MULTIPLIER,
  CLIMB_SHARE,
  EYE_HEIGHT,
  Ground,
  LADDER_GAP,
  LADDER_GIRTH,
  OUTSIDE_HEIGHT,
  PLAYER_RADIUS,
  GEAR,
  JUMP_VELOCITY,
  LEAP_REST,
  RUN_MULTIPLIER,
  SCOPED_SPEED_MULTIPLIER,
  SPEEDY_MULTIPLIER,
  SPEEDY_SECONDS,
  STEP_UP,
  TICK_DT,
  TICK_RATE,
  WORLD_GROUND,
  Structures,
  building,
  clonePlayer,
  createCubes,
  createGear,
  createPickups,
  type PlayerState,
  PICKUPS,
  PICKUP_AREAS,
  stepPickups,
  createItem,
  createPlayer,
  MAX_HEARTS,
  fallDamage,
  createRng,
  ladder,
  ramp,
  stairs,
  stepCubes,
  stepPlayer,
  type InputFrame,
  type Vec3,
  OFF_WALL,
  WALL_FRAMES,
  layoutWallFrame,
  DRAGON,
  HEAD_YAW,
  MAX_PITCH,
  MIN_ALTITUDE,
  becomeAvatar,
  bodyLength,
  dragonShape,
  wall,
  FLOOR,
  MOVE_SPEED,
  SURFACES,
  terrain,
  KRUSTY_KRAB_PLACEMENT,
  KRUSTY_KRAB_PROFILE,
  WORLD_STRUCTURES,
  isGrounded,
  type AvatarId,
  crouchOf,
  floatOf,
  walkSpeedOf,
  type ItemAction,
} from '@world/shared';
import { TUNG_TUNG_TOWER_ROOMS } from '../src/content/tower';

const frame = (seq: number, over: Partial<InputFrame> = {}): InputFrame => ({
  seq,
  mx: 0,
  my: 0,
  yaw: 0,
  pitch: 0,
  jump: false,
  reading: null,
  actions: [],
  ...over,
});

test('stepPlayer is deterministic: same inputs give identical state', () => {
  const a = createPlayer('a', 'a', '#fff', { x: 0, y: EYE_HEIGHT, z: 0 });
  const b = clonePlayer(a);
  for (let i = 1; i <= 100; i++) {
    const f = frame(i, { mx: Math.sin(i), my: Math.cos(i), yaw: i * 0.01, jump: i % 30 === 0 });
    stepPlayer(a, f, TICK_DT);
    stepPlayer(b, f, TICK_DT);
  }
  assert.deepEqual(a, b);
});

test('movement is yaw-relative, and walking off the edge falls to the ground past it', () => {
  const p = createPlayer('a', 'a', '#fff', { x: 0, y: EYE_HEIGHT, z: 0 });
  stepPlayer(p, frame(1, { my: 1, yaw: Math.PI / 2 }), 1);
  assert.ok(p.pos.x > 7.9 && Math.abs(p.pos.z) < 1e-9, 'yaw of pi/2 walks along +x');
  // Straight out across the fan, through the gap between the Krusty Krab's grounds and Building 2's
  // (the fan's round side at r 100): off its edge, down the drop, onto the ground past it.
  const out = (152.5 * Math.PI) / 180;
  const q = createPlayer('b', 'b', '#fff', { x: 60 * Math.cos(out), y: EYE_HEIGHT, z: 60 * Math.sin(out) });
  for (let i = 1; i < 300; i++) stepPlayer(q, frame(i, { my: 1, yaw: Math.PI / 2 - out }), TICK_DT);
  assert.ok(Math.hypot(q.pos.x, q.pos.z) > 100, 'past the edge');
  assert.equal(q.pos.y, OUTSIDE_HEIGHT + EYE_HEIGHT, 'on the ground below it');
});

test("a road's floor runs straight and round its bend, stops square at a gap, and keeps a spot clamped inside it", () => {
  // East 100 m with a 10 m gap from 40 to 50, round a bend of radius 30, then north.
  const road = layRoad({
    name: 'test',
    from: { x: 0, z: 0 },
    width: 10,
    runs: [{ to: { x: 130, z: 0 }, radius: 30, stretches: [level(40), gap(10), level()] }, { to: { x: 130, z: 100 } }],
  });
  const ground = new Ground(road.floor);
  const near = (a: number, b: number) => Math.abs(a - b) < 1e-6;
  assert.ok(near(ground.edge(20, 0), -5) && near(ground.edge(20, 7), 2), 'a straight, from its sides');
  assert.ok(near(ground.edge(39, 0), -1) && near(ground.edge(42, 0), 2), 'cut square at the gap');
  assert.ok(near(ground.edge(43, 9), Math.hypot(3, 4)), 'and from its corner');
  // The bend's middle is (100, 30): halfway round, 30 m out along the diagonal.
  const [mx, mz] = [100 + 30 * Math.SQRT1_2, 30 - 30 * Math.SQRT1_2];
  assert.ok(near(ground.edge(mx, mz), -5), 'the middle of the bend');
  assert.ok(near(ground.edge(100 + 37 * Math.SQRT1_2, 30 - 37 * Math.SQRT1_2), 2), 'past its outer side');
  assert.ok(ground.inside(130, 60) && !ground.inside(130, -1), 'on north, and not straight on past the corner');
  for (const spot of [
    { x: 44, y: 0, z: 9 },
    { x: 140, y: 0, z: -10 },
  ]) {
    ground.clamp(spot, 1);
    assert.ok(ground.edge(spot.x, spot.z) <= -1 + 1e-9, `clamped a metre inside: ${ground.edge(spot.x, spot.z)}`);
  }
});

test("a road's boost pad lies a hair over its stretch, level or climbing, short of its ends and its sides, and only a padded stretch's bank is built there, the rest the floor risen", () => {
  // North 100 m: level 20 m, up 6 m over 30 m, each with a pad, level and back down.
  const road = layRoad({
    name: 'test',
    from: { x: 0, z: 0 },
    width: 20,
    runs: [{ to: { x: 0, z: 100 }, stretches: [padded(level(20)), padded(climb(30, 6)), level(), climb(30, -6)] }],
  });
  const structures = new Structures(road.bank, new Ground(road.floor));
  // Along the middle: the pad's top over the road's own height there.
  for (const [z, height] of [
    [10, 0],
    [22, 0.4],
    [35, 3],
    [48, 5.6],
  ]) {
    const { surface, y } = structures.footing(0, z, 50);
    assert.equal(surface, 'boost', `on the pad at ${z}`);
    assert.ok(y > height && y < height + 0.05, `a hair over the road at ${z}: ${y}`);
  }
  for (const [x, z] of [
    [9, 35],
    [0, 20],
    [0, 60],
  ])
    assert.equal(structures.footing(x, z, 50).surface, 'hard', `off the pads at ${x}, ${z}`);
  assert.equal(road.marks.filter((mark) => mark.kind === 'pad').length, 2);
  // The padded climb's ramp is drawn as it stands; the level top and the way down are hidden, and
  // listed for the client to draw as the floor.
  assert.deepEqual(
    road.bank.filter((piece) => !piece.hidden).map((piece) => piece.kind),
    ['ramp'],
  );
  assert.deepEqual(
    road.raised.map((length) => length.kind === 'straight' && [length.ay, length.by]),
    [
      [6, 6],
      [6, 0],
    ],
  );
});

test("a road's open stretch or bend is a deck with nothing under it, and isn't laid without headroom", () => {
  // North 100 m: up `rise` over 30 m, 10 m of level deck and 10 m of deck climbing 2 m more, and
  // back down.
  const over = (rise: number) =>
    layRoad({
      name: 'test',
      from: { x: 0, z: 0 },
      width: 20,
      runs: [
        {
          to: { x: 0, z: 100 },
          stretches: [level(10), climb(30, rise), span(10), { ...span(10), rise: 2 }, climb(30, -rise - 2), level()],
        },
      ],
    });
  const road = over(8);
  const structures = new Structures(road.bank, new Ground(road.floor));
  assert.equal(structures.groundAt(0, 45, 50), 8, "the deck's top");
  assert.equal(structures.groundAt(0, 45, 6), OUTSIDE_HEIGHT, 'no floor of its own under it');
  assert.equal(structures.groundAt(0, 20, 0.5), 0, 'floor under the bank it climbs from');
  assert.ok(structures.fits(0, 45, 0, 4, 4), 'room for what passes beneath');
  assert.ok(structures.ceilingAt(0, 59, 1) > 7.8, 'a deck that climbs is no thicker toward its high end');
  assert.equal(road.marks.filter((mark) => mark.kind === 'span').length, 2);
  assert.throws(() => over(3), /deck/);
  // North and round a bend to the east, up `rise` before it and down after: the bend's the deck.
  const round = (rise: number) =>
    layRoad({
      name: 'test',
      from: { x: 0, z: 0 },
      width: 20,
      runs: [
        { to: { x: 0, z: 100 }, radius: 60, open: true, pads: [0.5], stretches: [level(10), climb(30, rise)] },
        { to: { x: 100, z: 100 }, stretches: [climb(30, -rise), level()] },
      ],
    });
  const swept = round(8);
  const under = new Structures(swept.bank, new Ground(swept.floor));
  // A quarter of the way round it, 60 m from the bend's middle at (60, 40), and halfway round,
  // where its pad lies.
  const at = (share: number): [number, number] => {
    const a = Math.PI - (Math.PI / 2) * share;
    return [60 + 60 * Math.cos(a), 40 + 60 * Math.sin(a)];
  };
  const [x, z] = at(0.25);
  assert.equal(under.groundAt(x, z, 50), 8, "the bend's deck's top");
  assert.equal(under.groundAt(x, z, 6), OUTSIDE_HEIGHT, 'no floor of its own under it');
  assert.ok(under.fits(x, z, 0, 4, 5), 'room for what passes beneath');
  assert.equal(swept.marks.filter((mark) => mark.kind === 'sweep').length, 1);
  assert.equal(under.footing(...at(0.5), 9).surface, 'boost', 'a pad lying along the bend, halfway round it');
  assert.throws(() => round(3), /deck/);
  // North 300 m: up 10 m, and 140 m of the deck split in two, its strands 17 m to either side at
  // their middle, the left (west) one 2 m higher there and the right one 2 m lower.
  const forked = layRoad({
    name: 'test',
    from: { x: 0, z: 0 },
    width: 20,
    runs: [
      {
        to: { x: 0, z: 300 },
        stretches: [
          level(10),
          climb(60, 10),
          span(),
          split(140, { out: 17, fork: 36, rise: 2, fall: 2, climb: 16 }),
          span(),
          climb(60, -10),
          level(10),
        ],
      },
    ],
  });
  const strands = new Structures(forked.bank, new Ground(forked.floor));
  assert.equal(strands.groundAt(0, 85, 50), 10, 'one surface where the road forks');
  assert.equal(strands.groundAt(-17, 150, 50), 12, 'the left strand, up');
  assert.equal(strands.groundAt(17, 150, 50), 8, 'the right strand, down');
  assert.equal(strands.groundAt(0, 150, 50), OUTSIDE_HEIGHT, 'nothing between them');
});

test('jump only from the ground, and gravity brings you back', () => {
  const p = createPlayer('a', 'a', '#fff', { x: 0, y: EYE_HEIGHT, z: 0 });
  stepPlayer(p, frame(1, { jump: true }), TICK_DT);
  assert.ok(p.vy > 0 && p.vy < JUMP_VELOCITY);
  stepPlayer(p, frame(2, { jump: true }), TICK_DT);
  assert.ok(p.vy < JUMP_VELOCITY - 2 * 20 * TICK_DT + 1e-9, 'mid-air jump ignored');
  for (let i = 3; i < 200; i++) stepPlayer(p, null, TICK_DT);
  assert.equal(p.pos.y, EYE_HEIGHT);
  assert.equal(p.vy, 0);
});

test("the drop's face is a wall to a body below the floor, and shots stop on the ground's slab", () => {
  // Down on the ground 10 m past the main disc's edge at a bearing of 340° (clear of the fan, its
  // sides and the bridge), walking straight in at it: held a body's width off the face, never
  // under the floor.
  const out = { x: Math.cos((340 * Math.PI) / 180), z: Math.sin((340 * Math.PI) / 180) };
  const p = createPlayer('a', 'a', '#fff', { x: out.x * 60, y: OUTSIDE_HEIGHT + EYE_HEIGHT, z: out.z * 60 });
  const yaw = Math.atan2(-out.x, -out.z);
  for (let i = 1; i < 120; i++) stepPlayer(p, frame(i, { my: 1, yaw }), TICK_DT);
  assert.ok(
    Math.abs(WORLD_GROUND.edge(p.pos.x, p.pos.z) - PLAYER_RADIUS) < 1e-3,
    `against the face: ${p.pos.x}, ${p.pos.z}`,
  );
  assert.equal(p.pos.y, OUTSIDE_HEIGHT + EYE_HEIGHT);
  // A shot from back on the floor down at the body below stops on the slab.
  const from = { x: out.x * 40, y: EYE_HEIGHT, z: out.z * 40 };
  const at = (to: Vec3) => {
    const d = Math.hypot(to.x - from.x, to.y - from.y, to.z - from.z);
    return WORLD_STRUCTURES.raycast(
      from,
      { x: (to.x - from.x) / d, y: (to.y - from.y) / d, z: (to.z - from.z) / d },
      d,
    );
  };
  assert.notEqual(at(p.pos), Infinity, 'the slab is in the way');
  assert.equal(WORLD_STRUCTURES.raycast(from, { x: 0, y: -1, z: 0 }, 20), EYE_HEIGHT, 'the floor stops a shot');
});

test('cubes spawn apart, all live in the main disc and cover it evenly', () => {
  const rng = createRng(7);
  const cubes = createCubes(['a', 'b', 'c', 'd', 'e', 'f'], rng);
  for (let i = 0; i < cubes.length; i++)
    for (let j = i + 1; j < cubes.length; j++)
      assert.ok(Math.hypot(cubes[i].pos.x - cubes[j].pos.x, cubes[i].pos.z - cubes[j].pos.z) >= 7.9);
  const quadrants = new Set<string>();
  for (let t = 0; t < 30 * 60 * 10; t++) {
    stepCubes(cubes, TICK_DT, rng);
    for (const c of cubes) {
      assert.ok(Math.hypot(c.pos.x, c.pos.z) <= 50 - 7.9, 'cube stays in the main disc');
      if (t % 30 === 0) quadrants.add(`${c.pos.x > 0}${c.pos.z > 0}${Math.hypot(c.pos.x, c.pos.z) > 25}`);
    }
  }
  assert.equal(quadrants.size, 8, 'over ten minutes the cubes visit every quadrant, inner and outer');
});

test("pickups drift about their own areas, never leaving them or crossing a ring's hole, at their height", () => {
  const rng = createRng(5);
  const field = createPickups(PICKUP_AREAS, rng);
  for (let t = 0; t < TICK_RATE * 60 * 5; t++) {
    stepPickups(field, TICK_DT, rng);
    for (const p of field.items) {
      assert.ok(p.area, `${p.id} belongs to an area`);
      const { region } = p.area;
      const out = Math.hypot(p.pos.x - region.x, p.pos.z - region.z);
      const inside =
        region.kind === 'disc'
          ? out <= region.r
          : region.kind === 'ring'
            ? out >= region.inner && out <= region.r
            : Math.abs(p.pos.x - region.x) <= region.w / 2 && Math.abs(p.pos.z - region.z) <= region.d / 2;
      assert.ok(inside, `${p.id} in its area (never over a ring's hole)`);
      assert.ok(Math.abs(p.pos.y - region.y - PICKUPS[p.kind].height) < 0.2, `${p.id} at its height`);
    }
  }
});

test('a jump at a run is a long jump for a look that has one: lower and further, over when it lands, and held into the next only after its feet have been down a moment', () => {
  // A running jump from the origin: how far it carries and how high the feet get.
  const flight = (avatar: AvatarId) => {
    const p = createPlayer('a', 'a', '#fff', { x: 0, y: EYE_HEIGHT, z: 0 });
    becomeAvatar(p, avatar);
    let peak = 0;
    let leapt = false;
    for (let i = 1; i < 200; i++) {
      stepPlayer(p, frame(i, { my: 1, jump: i === 1, actions: ['run'] }), TICK_DT);
      peak = Math.max(peak, p.pos.y - EYE_HEIGHT);
      leapt ||= p.leap;
      if (i > 1 && isGrounded(p)) break;
    }
    // Still holding the jump and the run: the ticks its feet stay down before it's off again.
    let down = 0;
    for (let i = 200; i < 260 && isGrounded(p); i++) {
      stepPlayer(p, frame(i, { my: 1, jump: true, actions: ['run'] }), TICK_DT);
      down++;
    }
    return { far: p.pos.z, peak, leapt, down, again: p.leap };
  };
  const plain = flight('sulley'); // a running jump of about Mario's power, and no long jump
  const long = flight('mario');
  assert.ok(!plain.leapt && long.leapt, 'only the look with a long jump leaps');
  assert.ok(long.again, 'and the long jump is over on landing, the next one taken with the keys still held');
  assert.ok(long.down >= Math.floor(LEAP_REST * TICK_RATE), `after ${long.down} ticks down`);
  assert.equal(plain.down, 1, 'a plain jump is off again at once');

  // Off ice it is still a long jump, but with nothing to launch from: it rises and floats where it stood.
  const rink = new Structures([{ kind: 'box', x: 0, z: 0, w: 20, d: 20, h: 0.3, surface: 'ice' }]);
  const p = createPlayer('b', 'b', '#fff', { x: 0, y: 0.3 + EYE_HEIGHT, z: 0 });
  becomeAvatar(p, 'mario');
  stepPlayer(p, frame(1, { my: 1, jump: true, actions: ['run'] }), TICK_DT, rink);
  assert.ok(p.leap && p.vy > 0 && p.vz < 1, `a long jump off ice, going ${p.vz.toFixed(2)} m/s across`);
  assert.ok(long.far > plain.far * 1.25, `further: ${long.far.toFixed(1)} m against ${plain.far.toFixed(1)} m`);
  assert.ok(long.peak < plain.peak * 0.75, `lower: ${long.peak.toFixed(2)} m against ${plain.peak.toFixed(2)} m`);
});

test('a chain of jumps: each taken as the last lands rises higher, the third the last, and a wait on the ground starts it over', () => {
  const p = createPlayer('a', 'a', '#fff', { x: 0, y: EYE_HEIGHT, z: 0 });
  becomeAvatar(p, 'mario');
  let seq = 0;
  // One jump, the key held from `wait` ticks after the last landing: how high it gets.
  const hop = (wait: number): number => {
    for (let i = 0; i < wait; i++) stepPlayer(p, frame(++seq, {}), TICK_DT);
    let peak = 0;
    do {
      stepPlayer(p, frame(++seq, { jump: true }), TICK_DT);
      peak = Math.max(peak, p.pos.y - EYE_HEIGHT);
    } while (!isGrounded(p));
    return peak;
  };
  const [first, second, third, again] = [hop(0), hop(0), hop(0), hop(0)];
  const about = (a: number, b: number) => Math.abs(a / b - 1) < 0.03;
  assert.ok(about(second, first * 1.2) && about(third, first * 1.44), `${first}, ${second}, ${third}`);
  assert.ok(about(again, first), 'the jump after the third is the first again');
  assert.ok(about(hop(0), second) && about(hop(10), first), 'and so is one taken after a wait on the ground');
});

test('a crouch: held on the ground it crawls, a jump out of it is a backflip higher than the jump or, crawling, a long jump, and held on into the air it is no ground pound', () => {
  const p = createPlayer('a', 'a', '#fff', { x: 0, y: EYE_HEIGHT, z: 0 });
  becomeAvatar(p, 'mario');
  const crouch = crouchOf('mario')!;
  let seq = 0;
  stepPlayer(p, frame(++seq, { my: 1, actions: ['crouch', 'run'] }), 1);
  assert.ok(p.crouch && Math.abs(p.pos.z - walkSpeedOf('mario') * crouch.crawl) < 1e-9, 'a crawl, whatever the run');
  // One jump with `actions` held throughout: how high it gets.
  const hop = (actions: ItemAction[]): number => {
    let peak = 0;
    do {
      stepPlayer(p, frame(++seq, { jump: peak === 0, actions }), TICK_DT);
      peak = Math.max(peak, p.pos.y - EYE_HEIGHT);
    } while (!isGrounded(p));
    return peak;
  };
  const flip = hop(['crouch']);
  assert.equal(p.pound, null, 'the key held from the ground starts no pound');
  for (let i = 0; i < TICK_RATE; i++) stepPlayer(p, frame(++seq, {}), TICK_DT);
  assert.ok(Math.abs(flip / hop([]) / crouch.flip - 1) < 0.03, 'the backflip rises that much higher');
  for (let i = 0; i < TICK_RATE; i++) stepPlayer(p, frame(++seq, {}), TICK_DT);
  stepPlayer(p, frame(++seq, { my: 1, jump: true, actions: ['crouch'] }), TICK_DT);
  assert.ok(p.leap && !p.backflip, 'a jump out of a crawl is a long jump');
});

test('a float: held coming down it sinks slowly for its seconds, then falls, and landing gives it back', () => {
  const p = createPlayer('a', 'a', '#fff', { x: 0, y: EYE_HEIGHT, z: 0 });
  becomeAvatar(p, 'peach');
  const float = floatOf('peach')!;
  let seq = 0;
  // A jump with the float held throughout: the seconds it floats, and how fast it sinks while it does.
  const flight = (): { floated: number; sink: number } => {
    let floated = 0;
    let sink = 0;
    stepPlayer(p, frame(++seq, { jump: true, actions: ['float'] }), TICK_DT);
    while (!isGrounded(p)) {
      const y = p.pos.y;
      stepPlayer(p, frame(++seq, { actions: ['float'] }), TICK_DT);
      if (!p.floating) continue;
      floated += TICK_DT;
      sink = Math.max(sink, (y - p.pos.y) / TICK_DT);
    }
    return { floated, sink };
  };
  // Out of the jump its float runs out well above the floor, and it falls the rest of the way.
  const first = flight();
  assert.ok(Math.abs(first.floated - float.seconds) < 2 * TICK_DT, 'it floats its seconds');
  assert.ok(first.sink <= float.sink + 1e-9, 'sinking no faster than a float does');
  assert.ok(Math.abs(flight().floated - float.seconds) < 2 * TICK_DT, 'and has them all again after landing');
});

test('/speedy boost multiplies movement and wears off; holding the run does too; a scope slows it and stops jumps; a chill halves it and wears off', () => {
  const p = createPlayer('a', 'a', '#fff', { x: 0, y: EYE_HEIGHT, z: 0 });
  p.boost = SPEEDY_SECONDS;
  stepPlayer(p, frame(1, { my: 1 }), 1);
  assert.ok(Math.abs(p.pos.z - 8 * SPEEDY_MULTIPLIER) < 1e-9, 'boosted for one second');
  stepPlayer(p, frame(1, { my: 1, actions: ['run'] }), 1);
  assert.ok(Math.abs(p.pos.z - 2 * 8 * SPEEDY_MULTIPLIER) < 1e-9, 'running adds nothing to a boost');
  for (let i = 2; i <= SPEEDY_SECONDS; i++) stepPlayer(p, frame(i, { my: 0 }), 1);
  assert.equal(p.boost, 0);
  const before = p.pos.z;
  stepPlayer(p, frame(99, { my: 1 }), 0.1);
  assert.ok(Math.abs(p.pos.z - before - 0.8) < 1e-9, 'back to normal speed');
  stepPlayer(p, frame(99, { my: 1, actions: ['run'] }), 0.1);
  assert.ok(Math.abs(p.pos.z - before - 0.8 - 0.8 * RUN_MULTIPLIER) < 1e-9, 'running');

  // Scoped: 30% of the walk whether or not the run is held, and the jump does nothing.
  p.item = createItem('sniper', false);
  const at = p.pos.z;
  stepPlayer(p, frame(100, { my: 1, jump: true, actions: ['scope', 'run'] }), 0.1);
  assert.ok(Math.abs(p.pos.z - at - 0.8 * SCOPED_SPEED_MULTIPLIER) < 1e-9, 'scoped walk');
  assert.equal(p.vy, 0, 'no jump while scoped');

  // Chilled (an ice hit): CHILL_SECONDS at half the walk.
  p.chilled = CHILL_SECONDS;
  const slow = p.pos.z;
  stepPlayer(p, frame(101, { my: 1 }), 1);
  assert.ok(Math.abs(p.pos.z - slow - 8 * CHILLED_SPEED_MULTIPLIER) < 1e-9, 'a chilled second of walking');
  for (let i = 102; i < 102 + CHILL_SECONDS - 1; i++) stepPlayer(p, frame(i, { my: 0 }), 1);
  assert.equal(p.chilled, 0, 'and it wears off');
});

test('a landing hurts by its speed: free under a 15 m drop, every heart at 80 m, linear between; a jetpack lifts and brakes', () => {
  const open = new Structures([]);
  // Dropped from rest with feet `feet` m up, holding the jetpack's thrust while the feet are between
  // `brake` heights and falling faster than 3 m/s. Returns the landing speed.
  const drop = (feet: number, brake: [number, number] = [0, 0]) => {
    const p = createPlayer('a', 'a', '#fff', { x: 0, y: feet + EYE_HEIGHT, z: 0 });
    p.gear = createGear('jetpack');
    for (let i = 1; i < 600; i++) {
      const y = p.pos.y - EYE_HEIGHT;
      const thrust = y > brake[0] && y < brake[1] && p.vy < -3;
      const speed = stepPlayer(p, frame(i, { actions: thrust ? ['thrust'] : [] }), TICK_DT, open);
      if (speed) return speed;
    }
    return 0;
  };
  assert.deepEqual(
    [14.9, 40, 80].map((m) => fallDamage(drop(m))),
    [0, 4.5, MAX_HEARTS],
  );
  assert.equal(fallDamage(drop(60, [12, 40])), 0, 'braked to a crawl, let go 12 m up: a soft landing');
  assert.equal(fallDamage(drop(80, [0, 25])), 0, 'an 80 m fall caught in its last 25 m');

  const p = createPlayer('b', 'b', '#fff', { x: 0, y: EYE_HEIGHT, z: 0 });
  p.gear = createGear('jetpack');
  const fly = (ticks: number) => {
    for (let i = 0; i < ticks; i++) stepPlayer(p, frame(p.lastSeq + 1, { actions: ['thrust'] }), TICK_DT, open);
  };
  fly(TICK_RATE);
  assert.ok(p.pos.y - EYE_HEIGHT > 5 && p.vy <= GEAR.jetpack.maxRise, `a second of thrust climbs: ${p.pos.y}`);
  fly(TICK_RATE * GEAR.jetpack.fuelSeconds);
  assert.equal(p.gear?.fuel, 0);
  assert.ok(!p.thrusting && p.vy < 0, 'an empty tank drops them');
});

// Structures: walk into a wall, up a ramp onto a platform, off its far end, and jump under a roof.
const walk = (p: ReturnType<typeof createPlayer>, yaw: number, ticks: number, world: Structures, jump = false) => {
  for (let i = 0; i < ticks; i++) stepPlayer(p, frame(p.lastSeq + 1, { my: 1, yaw, jump }), TICK_DT, world);
};

test('a wall stops a player, who slides along it', () => {
  const world = new Structures([{ kind: 'box', x: 0, z: 5, w: 20, d: 0.4, h: 3 }]);
  const p = createPlayer('a', 'a', '#fff', { x: 0, y: EYE_HEIGHT, z: 0 });
  walk(p, 0, 60, world);
  assert.ok(p.pos.z < 5 - 0.2 - 0.3, `stopped short of the wall, at z ${p.pos.z}`);
  assert.equal(p.walk, 0, 'the feet make no walk against it');
  walk(p, Math.PI / 4, 30, world);
  assert.ok(p.pos.x > 3 && p.pos.z < 4.5, 'walking into it at an angle slides along it');
});

test('a ramp carries a player up onto a platform, and they drop off its far edge', () => {
  const world = new Structures([
    ramp({ x: 0, z: 2 }, { x: 0, z: 10 }, 2, 3),
    { kind: 'box', x: 0, z: 12, w: 3, d: 4, h: 2 },
  ]);
  const p = createPlayer('a', 'a', '#fff', { x: 0, y: EYE_HEIGHT, z: 0 });
  walk(p, 0, 36, world); // about 9.6 m, most of the way up
  assert.ok(p.pos.y > EYE_HEIGHT + 1.5 && p.vy === 0, `standing on the slope at y ${p.pos.y}`);
  walk(p, 0, 12, world);
  assert.equal(p.pos.y, 2 + EYE_HEIGHT, 'on the platform');
  walk(p, 0, 30, world);
  assert.equal(p.pos.y, EYE_HEIGHT, 'off the end and back on the floor');
});

test('a roof stops a jump and a doorway lets a player in', () => {
  const world = new Structures(building({ x: 0, z: 0, w: 8, d: 8, h: 2.4, door: 2, doorHeight: 2.2 }));
  const p = createPlayer('a', 'a', '#fff', { x: 0, y: EYE_HEIGHT, z: 8 });
  walk(p, Math.PI, 45, world); // in through the door in the +z wall
  assert.ok(p.pos.z < 2, `inside, at z ${p.pos.z}`);
  let top = 0;
  for (let i = 0; i < 30; i++) {
    stepPlayer(p, frame(p.lastSeq + 1, { jump: i === 0 }), TICK_DT, world);
    top = Math.max(top, p.pos.y + 0.3);
  }
  assert.ok(top <= 2.4 + 1e-9, `head stopped at the roof, reached ${top}`);

  // A door shut across that doorway stops a player at it, and is no wall to a ghost.
  const front = { id: 'front', hinge: { x: -1, z: 4 }, y: 0, bearing: 0, reach: 2, height: 2.2, thickness: 0.2 };
  const shut = new Structures([
    ...building({ x: 0, z: 0, w: 8, d: 8, h: 2.4, door: 2, doorHeight: 2.2 }),
    ...doorPieces({ ...front, swing: Math.PI / 2 }),
  ]);
  const [stopped, ghost] = ['b', 'c'].map((id) => createPlayer(id, id, '#fff', { x: 0, y: EYE_HEIGHT, z: 8 }));
  ghost.ghost = true;
  for (const walker of [stopped, ghost]) walk(walker, Math.PI, 45, shut);
  assert.ok(stopped.pos.z > 4 && ghost.pos.z < 2, `outside at z ${stopped.pos.z}, and inside at z ${ghost.pos.z}`);
});

test("the Krusty Krab's roof has no seam to drop through: anywhere across it, some of it is under a body's middle", () => {
  // A body stands wherever its middle is, so a hair's gap between two of the roof's pieces is a
  // hole in it. Straight down on the barrel, every half centimetre across it, the first thing
  // under the sky is the roof (its walls top out at 11 m) and never what's in the room (under 10).
  const { x, z, yaw } = KRUSTY_KRAB_PLACEMENT;
  const { w, d } = KRUSTY_KRAB_PROFILE.size;
  for (const along of [-w / 3, 0, w / 3]) {
    for (let across = -0.39 * d; across <= 0.39 * d; across += 0.005) {
      const top = WORLD_STRUCTURES.groundAt(
        x + along * Math.cos(yaw) + across * Math.sin(yaw),
        z - along * Math.sin(yaw) + across * Math.cos(yaw),
        Infinity,
      );
      assert.ok(top > 10.5, `no roof ${across.toFixed(3)} m across it, ${along.toFixed(1)} m along: ${top} m`);
    }
  }
});

test("a slippery footing keeps the walk's momentum until the feet slow it, and gravity wins on its slope", () => {
  // A hard runway onto a sheet of ice at the same height.
  const rink = new Structures([
    { kind: 'box', x: 0, z: 0, w: 4, d: 10, h: 0.3 },
    { kind: 'box', x: 0, z: 15, w: 4, d: 20, h: 0.3, surface: 'ice' },
  ]);
  const p = createPlayer('a', 'a', '#fff', { x: 0, y: 0.3 + EYE_HEIGHT, z: -4 });
  walk(p, 0, 36, rink); // 1.2 s: 9.6 m, the last 1.6 of them on the ice, at full speed
  assert.ok(p.pos.z > 5 && Math.abs(p.vz - MOVE_SPEED) < 1e-9, `on the ice at the walk's speed: z ${p.pos.z}`);
  const letGo = p.pos.z;
  stepPlayer(p, frame(p.lastSeq + 1, {}), TICK_DT, rink);
  assert.ok(p.vz > 0 && p.walk === 0, 'sliding on with the keys let go, the feet stand still');
  for (let i = 0; i < 59; i++) stepPlayer(p, frame(p.lastSeq + 1, {}), TICK_DT, rink);
  const slid = p.pos.z - letGo;
  const reach = MOVE_SPEED ** 2 / (2 * SURFACES.ice.grip); // v² / 2a
  assert.ok(slid > reach - 0.5 && slid <= reach + 0.5, `slid ${slid.toFixed(2)} m after the keys let go`);
  assert.equal(p.vz, 0, 'and came to rest');
  // Keys held the other way bend it back: a turn, not a stop; the feet walk at the keys' full pace.
  walk(p, Math.PI, 15, rink);
  assert.ok(p.vz < 0 && p.vz > -MOVE_SPEED, `turned back at ${p.vz.toFixed(2)} m/s half a second in`);
  assert.equal(p.walk, MOVE_SPEED, "the feet walk at the keys' full pace however the body slides");

  // An icy 30° slope: standing still on it slides you down, and from the bottom there's no way up.
  const slope = new Structures([{ ...ramp({ x: 0, z: 0 }, { x: 0, z: 8 }, 4.62, 3), surface: 'ice' }]);
  const q = createPlayer('b', 'b', '#fff', { x: 0, y: 1 + EYE_HEIGHT, z: 1.73 });
  for (let i = 0; i < 60; i++) stepPlayer(q, frame(q.lastSeq + 1, {}), TICK_DT, slope);
  assert.ok(q.pos.z < 0 && q.pos.y === EYE_HEIGHT, `slid off the bottom to z ${q.pos.z.toFixed(2)}`);
  walk(q, 0, 90, slope);
  assert.ok(q.pos.y - EYE_HEIGHT < 0.5, `three seconds of trying gets ${(q.pos.y - EYE_HEIGHT).toFixed(2)} m up`);
  // Nor does hopping: the feet push off ice square to it, so a hop on the slope is thrown partly
  // downhill, and thrown, the keys bend the flight no faster than the ice let them. A running jump
  // off the stone below gets some way up, and no further.
  const h = createPlayer('c', 'c', '#fff', { x: 0, y: 3.46 + EYE_HEIGHT, z: 6 });
  stepPlayer(h, frame(1, { my: 1, jump: true }), TICK_DT, slope);
  assert.ok(
    h.vz < -JUMP_VELOCITY / 4 && h.vy > 0 && h.thrown === SURFACES.ice.grip,
    `thrown downhill: vz ${h.vz.toFixed(2)}`,
  );
  let furthest = h.pos.z;
  for (let i = 0; i < 90; i++) {
    stepPlayer(h, frame(h.lastSeq + 1, { my: 1, jump: true }), TICK_DT, slope);
    furthest = Math.max(furthest, h.pos.z);
  }
  assert.ok(furthest < 6 + 0.3 && h.pos.z < 6, `hopping up it only slips down: got to z ${furthest.toFixed(2)}`);
  // On the flat the push is straight up: a hop off the rink's ice keeps the slide it had, and off
  // the stone before it the keys steer the air as anywhere.
  const f = createPlayer('e', 'e', '#fff', { x: 0, y: 0.3 + EYE_HEIGHT, z: -4 });
  walk(f, 0, 36, rink);
  stepPlayer(f, frame(f.lastSeq + 1, { jump: true }), TICK_DT, rink);
  assert.ok(
    f.vy > 0 && Math.abs(f.vz - MOVE_SPEED) < 1e-9 && f.vx === 0,
    `up off the flat with its slide kept: vz ${f.vz}`,
  );
  const g = createPlayer('f', 'f', '#fff', { x: 0, y: 0.3 + EYE_HEIGHT, z: -4 });
  stepPlayer(g, frame(1, { jump: true }), TICK_DT, rink);
  stepPlayer(g, frame(2, { mx: 1 }), TICK_DT, rink);
  assert.ok(g.vy > 0 && g.thrown === null && g.vx === MOVE_SPEED, 'a jump off stone steers in the air at once');
  // Stepping off ice throws the walk too: over the edge of an icy ledge, the keys bend the fall
  // only at the ice's grip.
  const ledge = new Structures([{ kind: 'box', x: 0, z: 0, w: 4, d: 4, h: 2, surface: 'ice' }]);
  const s = createPlayer('g', 'g', '#fff', { x: 0, y: 2 + EYE_HEIGHT, z: -1 });
  walk(s, 0, 40, ledge); // 1.3 s: over the far edge at a slide's pace, still falling
  assert.ok(
    s.pos.z > 2 && s.pos.y < 2 + EYE_HEIGHT && s.thrown === SURFACES.ice.grip,
    `over the edge, thrown: z ${s.pos.z.toFixed(2)}`,
  );
  stepPlayer(s, frame(s.lastSeq + 1, { mx: 1 }), TICK_DT, ledge);
  assert.ok(s.vx > 0 && s.vx < 1, `the keys bend the fall, slowly: vx ${s.vx.toFixed(2)}`);
});

test('a ladder: forward at it takes hold and climbs, over its top onto what is beyond, off on a jump, round it on a swap', () => {
  // A 4 m ladder up the side of a 4 m block, standing just clear of it, and one in the open with a
  // floor over its far face, 3 m up.
  const world = new Structures([
    { kind: 'box', x: 0, z: 3, w: 6, d: 4, h: 4 },
    ladder({ x: 0, z: 0.55 }, 0, 4, 0),
    ladder({ x: 10, z: 0 }, 0, 4, 0),
    { kind: 'box', x: 10, z: 1.8, y: 3, w: 4, d: 3, h: 0.5 },
  ]);
  const face = (w: PlayerState) => w.climb?.side ?? null; // the face held, read afresh each time
  const p = createPlayer('a', 'a', '#fff', { x: 0, y: EYE_HEIGHT, z: -2 });
  walk(p, 0, 20, world); // two thirds of a second forward: up to the ladder, and up it
  assert.ok(face(p) === -1 && p.pos.y > EYE_HEIGHT + 1 && p.vy === 0, `took hold and climbed to ${p.pos.y}`);
  walk(p, 0, 20, world);
  assert.ok(
    !face(p) && p.pos.z > 1 && Math.abs(p.pos.y - 4 - EYE_HEIGHT) < 1e-6,
    `over the top onto the block at z ${p.pos.z}`,
  );
  // Backing onto it from the block, holding back while looking away, takes hold of its far face a
  // body's height under its top, and climbs down it to the ground.
  for (let i = 0; i < 30 && !face(p); i++) stepPlayer(p, frame(p.lastSeq + 1, { my: -1 }), TICK_DT, world);
  assert.ok(face(p) === -1 && p.pos.y < 4 + EYE_HEIGHT - 1.9, `backed onto it at ${p.pos.y}`);
  for (let i = 0; i < 90; i++) stepPlayer(p, frame(p.lastSeq + 1, { my: -1 }), TICK_DT, world);
  assert.ok(!face(p) && p.pos.z < 0 && Math.abs(p.pos.y - EYE_HEIGHT) < 1e-6, `backed down it to z ${p.pos.z}`);
  // A jump is straight up and off it; falling back past it holding forward takes hold again.
  const q = createPlayer('b', 'b', '#fff', { x: 0, y: EYE_HEIGHT, z: -0.3 });
  for (let i = 0; i < 8; i++) stepPlayer(q, frame(i + 1, { my: 1 }), TICK_DT, world);
  assert.ok(face(q), 'took hold from right in front of it');
  const { x, z } = q.pos;
  stepPlayer(q, frame(q.lastSeq + 1, { jump: true }), TICK_DT, world);
  assert.ok(!face(q) && q.vy === JUMP_VELOCITY && q.pos.x === x && q.pos.z === z, 'a jump is straight up and off');
  for (let i = 0; i < 15; i++) stepPlayer(q, frame(q.lastSeq + 1, { my: 1 }), TICK_DT, world);
  assert.ok(face(q) && q.pos.y > 3 + EYE_HEIGHT, `holding forward on the way down took hold again, at ${q.pos.y}`);
  // A swap goes round to the other face only where a body fits there: not into the block.
  stepPlayer(q, frame(q.lastSeq + 1, { actions: ['swap-left'] }), TICK_DT, world);
  assert.equal(face(q), -1, 'no swapping into the block');
  const r = createPlayer('c', 'c', '#fff', { x: 10, y: EYE_HEIGHT, z: -0.3 });
  stepPlayer(r, frame(1, { my: 1 }), TICK_DT, world);
  const before = r.pos.z;
  stepPlayer(r, frame(2, { actions: ['swap-right'] }), TICK_DT, world);
  assert.ok(
    face(r) === 1 && r.climb?.way === 1 && Math.abs(r.pos.z + before) < 1e-9,
    `round to the far face: z ${before} to ${r.pos.z}`,
  );
  // Under the floor the climb stops where the head (2 m up) meets its underside, and from the
  // other face there's no swapping into it; over the top is the way onto it.
  walk(r, 0, 60, world);
  const stalled = r.pos.y - EYE_HEIGHT;
  assert.ok(face(r) === 1 && stalled > 0.85 && stalled < 1 + 1e-6, `stopped under the floor at ${stalled}`);
  stepPlayer(r, frame(r.lastSeq + 1, { actions: ['swap-left'] }), TICK_DT, world);
  walk(r, 0, 10, world);
  assert.ok(face(r) === -1 && r.pos.y - EYE_HEIGHT > 2.5, `round and on up the open face to ${r.pos.y}`);
  stepPlayer(r, frame(r.lastSeq + 1, { actions: ['swap-right'] }), TICK_DT, world);
  assert.equal(face(r), -1, 'no swapping into the floor');
  walk(r, 0, 12, world);
  assert.ok(
    !face(r) && r.pos.y - EYE_HEIGHT > 3.5 - 1e-6 && r.pos.z > 0.3,
    `over the top onto the floor at z ${r.pos.z}`,
  );
  // A ladder leaning over toward +z is climbed on the face it leans away from, the body keeping to
  // the rails as it rises (slower straight up, over with the lean), with no room under it to swap
  // to, and over the top where the top has got to.
  const lean = 0.3;
  const leaning = new Structures([ladder({ x: 0, z: 0 }, 0, 4, 0, { lean })]);
  const t = createPlayer('d', 'd', '#fff', { x: 0, y: EYE_HEIGHT, z: -0.5 });
  walk(t, 0, 17, leaning);
  const up = t.pos.y - EYE_HEIGHT;
  const off = LADDER_GIRTH / 2 + PLAYER_RADIUS + LADDER_GAP;
  assert.ok(
    face(t) === -1 && Math.abs(up - 17 * MOVE_SPEED * CLIMB_SHARE * Math.cos(lean) * TICK_DT) < 1e-6,
    `up the rails to ${up}`,
  );
  assert.ok(Math.abs(t.pos.z - (up * Math.tan(lean) - off)) < 1e-6, `keeping to the rails: z ${t.pos.z}`);
  stepPlayer(t, frame(t.lastSeq + 1, { actions: ['swap-right'] }), TICK_DT, leaning);
  assert.equal(face(t), -1, 'no swapping under it');
  walk(t, 0, 20, leaning);
  assert.ok(!face(t) && t.pos.z > 4 * Math.tan(lean) + off - 1e-6, `over the top, where the top is: z ${t.pos.z}`);
});

test("what's underfoot: the material's surface, ice wherever a top is frosted, and the slope", () => {
  const world = new Structures([
    terrain({ x: 0, z: 0, w: 8, d: 8, material: 'sand', height: () => 0.5 }),
    { kind: 'box', x: 20, z: 0, w: 4, d: 4, h: 1, material: 'brick' },
    ramp({ x: 40, z: 0 }, { x: 40, z: 4 }, 1, 2),
    { kind: 'box', x: 0, z: 0, w: 2, d: 2, h: 0.5, hidden: true }, // a model's floor box, its top in the sand's plane
  ]);
  assert.equal(world.footing(0, 0, 1).surface, 'sand');
  assert.equal(world.footing(20, 0, 1.5).surface, 'hard');
  assert.equal(world.footing(50, 0, 1).surface, 'hard', 'the floor');
  const up = world.footing(40, 1, 2);
  assert.ok(Math.abs(up.slope.z - 0.25) < 1e-9 && Math.abs(up.slope.x) < 1e-9, 'rises a quarter per metre along z');
  assert.ok(Math.abs(world.footing(40, 3.9, 2).slope.z - 0.25) < 1e-9, 'and right up to its edge');
  // The box's top's first cell is its local corner, world x 18 to 18.5 and z -2 to -1.5.
  world.frost.set([1, 0, 0, 0], true);
  assert.equal(world.footing(18.25, -1.75, 1.5).surface, 'ice');
  assert.equal(world.footing(19, 0, 1.5).surface, 'hard', 'the rest of the top is as it was');
  assert.equal(world.footing(18.7, -1.75, 1.5).surface, 'hard', 'a spot just off the cell');
  assert.equal(world.footing(18.7, -1.75, 1.5, 0.35).surface, 'ice', 'but a body that wide stands on it');
  world.frost.set([FLOOR, 0, 100, 0], true); // the floor from x 50 to 50.5, z 0 to 0.5
  assert.equal(world.footing(50.2, 0.2, 1).surface, 'ice');
  assert.equal(world.footing(50.7, 0.2, 1).surface, 'hard');
  // Ice on the hidden box's top, which shares the sand's plane, is ice underfoot whichever of the
  // two the feet are counted as standing on.
  world.frost.set([3, 0, 0, 0], true); // the box's corner cell, x -1 to -0.5 and z -1 to -0.5
  assert.equal(world.footing(-0.75, -0.75, 1).surface, 'ice');
  assert.equal(world.footing(0.75, 0.75, 1).surface, 'sand', 'the rest of the box is still sand');
});

test('walking climbs stairs without a jump, and a taller step stops you', () => {
  const up = new Structures(stairs({ x: 0, z: 2 }, { x: 0, z: 5 }, 2, 2));
  const p = createPlayer('a', 'a', '#fff', { x: 0, y: EYE_HEIGHT, z: 0 });
  walk(p, 0, 18, up); // 4.8 m: onto the top step, which spans 4.63-5
  assert.equal(p.pos.y, 2 + EYE_HEIGHT);
  const tall = new Structures([{ kind: 'box', x: 0, z: 2, w: 2, d: 2, h: STEP_UP + 0.05 }]);
  const q = createPlayer('b', 'b', '#fff', { x: 0, y: EYE_HEIGHT, z: 0 });
  walk(q, 0, 17, tall);
  assert.ok(q.pos.y === EYE_HEIGHT && q.pos.z < 1, 'blocked at its edge');
  assert.throws(() => stairs({ x: 0, z: 0 }, { x: 0, z: 1 }, 2, 1, { steps: 2 }), /over/);
});

const LIGHT = dragonShape('light-dragon'); // 20 links, at its size: the shape the tests fly
const LINK = LIGHT.links[0];

test('a look with a life of its own comes in full, and a change of skin keeps the share of a life it had', () => {
  const p = createPlayer('g', 'g', '#fff', { x: 0, y: EYE_HEIGHT, z: 0 });
  becomeAvatar(p, 'gary');
  assert.equal(p.hearts, 5, 'gary comes in with his five');
  p.hearts = 2.5;
  becomeAvatar(p, 'standard');
  assert.equal(p.hearts, 5, 'half of five is half of ten: no heal');
  becomeAvatar(p, 'plankton');
  assert.equal(p.hearts, 1.5, 'and half of three');
  becomeAvatar(p, 'mario');
  assert.equal(p.hearts, 5, 'back to a walker at half');
  becomeAvatar(p, 'luigi');
  assert.equal(p.hearts, 5, 'the same life keeps its hearts');
});

test('a dragon climbs straight out of the ground, flies forward where it looks in arcs with its head turned as far as the neck lets it, keeps 5 m up, and is too big for a door', () => {
  const open = new Structures([]);
  const fly = (p: ReturnType<typeof createPlayer>, ticks: number, over: Partial<InputFrame>, world = open) => {
    for (let i = 0; i < ticks; i++) stepPlayer(p, frame(p.lastSeq + 1, over), TICK_DT, world);
  };
  const p = createPlayer('d', 'd', '#fff', { x: 0, y: EYE_HEIGHT, z: 0 });
  p.hearts = 7;
  becomeAvatar(p, 'light-dragon');
  assert.equal(p.hearts, 40, 'a dragon starts full');
  assert.deepEqual(p.item, { id: 'firebreath', locked: true, fuel: 7.5 });
  assert.equal(p.dragon?.spine.length, LIGHT.links.length * 3);
  assert.ok(p.dragon!.spine[LIGHT.links.length * 3 - 2] < 0, 'the body starts in the ground under the head');

  // The rise: straight up on its own, head up, whatever the keys and the look, until the whole
  // spine is out of the ground; then round toward the look.
  fly(p, 10, { my: -1, mx: 1, yaw: Math.PI / 2 });
  assert.ok(p.pos.x === 0 && p.pos.z === 0 && p.pos.y > EYE_HEIGHT && p.pos.y < MIN_ALTITUDE, 'rising');
  fly(p, 50, { my: -1, mx: 1, yaw: Math.PI / 2 });
  assert.ok(p.pos.y > MIN_ALTITUDE + 1 && p.pos.x === 0 && p.pos.z === 0 && !p.dragon!.risen, 'climbing straight up');
  assert.deepEqual(p.dragon!.head, { x: 0, y: 1, z: 0 }, 'looking straight up');
  fly(p, 120, { yaw: Math.PI / 2 });
  assert.ok(p.dragon!.risen && p.pos.y >= bodyLength(LIGHT), `out at ${p.pos.y.toFixed(1)} m`);
  fly(p, 120, { my: 1, yaw: Math.PI / 2 });
  assert.ok(p.pos.x > 15 && Math.abs(p.pos.z) < 1e-9, `came round to +x: ${p.pos.x.toFixed(1)}`);
  assert.ok(Math.abs(p.dragon!.speed - LIGHT.cruise) < 0.2, 'at cruise');
  fly(p, 120, { my: 0.5, yaw: Math.PI / 2 });
  assert.ok(Math.abs(p.dragon!.speed - LIGHT.cruise / 2) < 0.2, 'half the forward input is half cruise');
  const spine = p.dragon!.spine;
  for (let i = 0; i < spine.length; i += 3) {
    const [lx, ly, lz] = i === 0 ? [p.pos.x, p.pos.y, p.pos.z] : spine.slice(i - 3, i);
    assert.ok(Math.hypot(spine[i] - lx, spine[i + 1] - ly, spine[i + 2] - lz) <= LINK + 0.01, 'the body follows');
  }
  assert.ok(spine[0] < p.pos.x && spine[spine.length - 3] < spine[0], 'nearest first, tail last');

  // Looking straight back, it carries on and comes round in an arc rather than turning on the spot,
  // its head turned back only as far as the neck lets it.
  const turn = p.pos.x;
  fly(p, 15, { my: 1, yaw: -Math.PI / 2 });
  assert.ok(p.pos.x > turn + 3, 'still going +x half a second in');
  const { head, spine: neck } = p.dragon!;
  const along = Math.hypot(p.pos.x - neck[0], p.pos.y - neck[1], p.pos.z - neck[2]);
  const turned = Math.acos(
    (head.x * (p.pos.x - neck[0]) + head.y * (p.pos.y - neck[1]) + head.z * (p.pos.z - neck[2])) / along,
  );
  assert.ok(Math.abs(turned - HEAD_YAW) < 0.05, `the head is ${turned.toFixed(2)} rad round from the neck`);
  fly(p, 120, { my: 1, yaw: -Math.PI / 2 });
  const back = p.pos.x;
  fly(p, 1, { my: 1, yaw: -Math.PI / 2 });
  assert.ok(p.pos.x < back, 'and heading -x four seconds later');

  // Diving keeps the head MIN_ALTITUDE over the ground.
  fly(p, 300, { my: 1, yaw: -Math.PI / 2, pitch: MAX_PITCH });
  assert.equal(p.pos.y, MIN_ALTITUDE);

  // Let go: it glides to a stop and the body stays where it is.
  fly(p, 150, {});
  assert.equal(p.dragon!.speed, 0);
  const still = [...p.dragon!.spine];
  fly(p, 30, {});
  assert.deepEqual(p.dragon!.spine, still);

  // A doorway: two walls with a 2 m gap stop the head, which is 5 m across, well short.
  const door = new Structures([wall({ x: -10, z: 5 }, { x: -1, z: 5 }, 12), wall({ x: 1, z: 5 }, { x: 10, z: 5 }, 12)]);
  const q = createPlayer('e', 'e', '#fff', { x: 0, y: MIN_ALTITUDE, z: 0 });
  becomeAvatar(q, 'light-dragon');
  q.dragon!.risen = true;
  q.dragon!.dir = { x: 0, y: 0, z: 1 }; // flying level at it
  fly(q, 120, { my: 1, yaw: 0 }, door);
  const stop = 5 - LIGHT.headRadius; // the head's edge at the wall
  assert.ok(q.pos.z > stop - 0.5 && q.pos.z < stop + 0.01, `stopped at the door, z ${q.pos.z.toFixed(2)}`);
  assert.ok(!DRAGON.fits('light-dragon', { x: 0, y: EYE_HEIGHT, z: 4 }, door), 'no room to rise beside a wall');
  assert.ok(
    !DRAGON.fits(
      'light-dragon',
      { x: 0, y: EYE_HEIGHT, z: 0 },
      new Structures(building({ x: 0, z: 0, w: 8, d: 8, h: 3, doorHeight: 2.2 })),
    ),
  );
  assert.ok(DRAGON.fits('light-dragon', { x: 0, y: EYE_HEIGHT, z: 0 }, door));

  // Back on foot eye to eye, with the life kept up to a walker's full, and the fall from there is
  // the walker's.
  p.hearts = 20;
  const eyes = { ...p.pos };
  becomeAvatar(p, 'standard');
  assert.equal(p.hearts, 10);
  assert.equal(p.dragon, null);
  assert.equal(p.item, null);
  assert.deepEqual(p.pos, eyes);
  // Another skin on foot is the same life: no heal.
  p.hearts = 4;
  becomeAvatar(p, 'sulley');
  assert.equal(p.hearts, 4);
  becomeAvatar(p, 'standard');
  fly(p, 60, {});
  assert.equal(p.pos.y, EYE_HEIGHT, 'fell to the floor');

  // A dragon out over the void turning back into a walker stays where it was, and falls down the
  // drop to the ground past the edge.
  becomeAvatar(p, 'light-dragon');
  p.pos = { x: 60, y: 40, z: 60 };
  becomeAvatar(p, 'standard');
  assert.deepEqual(p.pos, { x: 60, y: 40, z: 60 });
  fly(p, 120, {});
  assert.equal(p.pos.y, OUTSIDE_HEIGHT + EYE_HEIGHT, 'on the ground past the edge');
});

test('a dead dragon drapes over an edge, its body a link apart, rather than stretching down to the ground', () => {
  // A ledge 20 m high under the head and the first two spine points; the rest of the body is out
  // over the void, 30 m up.
  const ledge = new Structures([{ kind: 'box', x: -20, z: 0, w: 50, d: 20, h: 20 }]);
  const p = createPlayer('f', 'f', '#fff', { x: 0, y: 30, z: 0 });
  becomeAvatar(p, 'light-dragon');
  p.dragon!.risen = true;
  p.dragon!.spine = Array.from({ length: LIGHT.links.length * 3 }, (_, k) =>
    k % 3 === 0 ? (k / 3 + 1) * LINK : k % 3 === 1 ? 30 : 0,
  );
  p.dead = true;
  for (let i = 0; i < 300; i++) stepPlayer(p, frame(p.lastSeq + 1, {}), TICK_DT, ledge);
  const spine = p.dragon!.spine;
  assert.equal(p.pos.y, 20 + LIGHT.underside.head, 'the head rests on the ledge');
  assert.equal(spine[1], 20 + LIGHT.underside.body, 'and so does the body over it');
  for (let i = 0; i < spine.length; i += 3) {
    const [lx, ly, lz] = i === 0 ? [p.pos.x, p.pos.y, p.pos.z] : spine.slice(i - 3, i);
    // The points are kept to the centimetre, so a link reads up to one long.
    assert.ok(Math.hypot(spine[i] - lx, spine[i + 1] - ly, spine[i + 2] - lz) <= LINK + 0.015, 'a link apart');
  }
  assert.equal(spine[spine.length - 2], LIGHT.underside.body, 'the tail lies on the ground');
  assert.ok(
    spine[10] > LIGHT.underside.body + 1 && spine[10] < 20,
    `the body hangs between: point 3 is ${spine[10]} m up`,
  );
});

test('the Python bots’ maps of the world are up to date (else run npm run bot-map)', () => {
  for (const [name, source] of Object.entries(MAP_SOURCES)) {
    const file = new URL(`../../../modal-bots/common/map/${name}.json.gz`, import.meta.url);
    const map = JSON.parse(gunzipSync(readFileSync(file)).toString()) as { source: number };
    assert.equal(map.source, source(), `the ${name}`);
  }
});

test('a wall frame is as wide as its picture, centred mid-storey, hugging the wall, and kept off doors and the stair', () => {
  const room = TUNG_TUNG_TOWER_ROOMS[0];
  const show = { kind: 'image', src: 'x.png', aspect: 2.5, line: '' } as const;
  const frame = layoutWallFrame({ room, angle: 225, height: 2, show });
  assert.ok(Math.abs(frame.width - 5) < 0.01, 'height times aspect');
  assert.ok(Math.abs((frame.bottom + frame.top) / 2 - room.middle) < 1e-9);
  assert.ok(frame.panels.length >= 2, 'wide enough to cross a segment edge');
  // Every corner is OFF_WALL in from its segment's face, measured along that segment's middle.
  const step = (2 * Math.PI) / room.wall.segments;
  const face = room.wall.r * Math.cos(step * 0.52) - room.wall.thickness / 2;
  for (const { corners } of frame.panels) {
    const mid = { x: (corners[0].x + corners[1].x) / 2 - room.x, z: (corners[0].z + corners[1].z) / 2 - room.z };
    const middle = Math.round(Math.atan2(mid.z, mid.x) / step) * step;
    for (const c of corners) {
      const out = (c.x - room.x) * Math.cos(middle) + (c.z - room.z) * Math.sin(middle);
      assert.ok(Math.abs(out - (face - OFF_WALL)) < 1e-9, 'on its segment');
    }
  }
  layoutWallFrame({ room, angle: 0, height: 2, show }); // well above the main door
  assert.throws(() => layoutWallFrame({ room, angle: 0, height: 16, show }), /doorway/);
  assert.throws(() => layoutWallFrame({ room, angle: 60, height: 2, show }), /stair/);
  assert.throws(() => layoutWallFrame({ room, angle: 225, height: 20, show }), /too tall/);
  for (const f of WALL_FRAMES) layoutWallFrame(f); // the listed ones all hang cleanly
});

test('race tracks: every route runs from an island along the roads to somewhere they end, a minute or two long; the track along one has a middle to be placed against, a grid behind its start line and a finish line short of its end', () => {
  const all = routes();
  assert.ok(all.length > 100, `${all.length} routes`);
  for (const route of all) {
    assert.ok(route.length >= TRACK_LENGTH.min && route.length <= TRACK_LENGTH.max, `${route.length} m`);
    assert.ok(ISLANDS.includes(route.start) && route.start !== route.end);
  }
  // One that takes a road that splits in two, and the first there is.
  const split = all.find((route) => route.legs.some((leg) => ROADS[leg.road].middle.length === 4))!;
  for (const route of [all[0], split]) {
    const track = layTrack(route);
    assert.ok(track.start < track.finish && track.finish < route.length);
    track.spots.forEach((spot, i) => {
      if (i % 25) return;
      const on = onTrack(track, spot);
      assert.ok(Math.abs(on.at - spot.at) < 1 && on.off < 0.5, `spot ${i} of ${route.length} m is on its own middle`);
    });
    const s = spotAt(track, track.finish);
    const beside = (across: number) => ({
      x: s.x + Math.cos(s.yaw) * across,
      y: s.y,
      z: s.z - Math.sin(s.yaw) * across,
    });
    assert.deepEqual(
      [8, 12].map((m) => withinTrack(onTrack(track, beside(m)))),
      [true, false],
      'a road wide',
    );
    assert.ok(!withinTrack(onTrack(track, { ...s, y: s.y + 20 })), 'and on the level it runs at');
    const last = track.spots[track.spots.length - 1];
    const aside = route.end.r - 2; // off its road, on the disc it ends on
    const corner = { x: last.x + Math.cos(last.yaw) * aside, y: last.y, z: last.z - Math.sin(last.yaw) * aside };
    assert.ok(inPlay(track, corner) && !withinTrack(onTrack(track, corner)), 'all of the disc it ends on is in play');
    const grid = gridOf(track, 8);
    for (const g of grid) {
      const on = onTrack(track, g);
      assert.ok(withinTrack(on) && on.at < track.start, 'on the road behind the line');
      assert.ok(Math.abs(WORLD_STRUCTURES.groundAt(g.x, g.z, g.y + STEP_UP) - g.y) < 0.1, 'standing on it');
    }
    assert.equal(new Set(grid.map((g) => `${g.x.toFixed(1)},${g.z.toFixed(1)}`)).size, 8, 'a place each');
  }
});
