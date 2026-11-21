import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  CHILL_SECONDS,
  CUBE_IDS,
  EYE_HEIGHT,
  TELEPORT_USAGE,
  OUTSIDE_HEIGHT,
  HEADSHOT_MULTIPLIER,
  INPUT_WAIT_TICKS,
  MAX_INPUTS_PER_TICK,
  ITEMS,
  MAX_HEARTS,
  poundOf,
  strikeOf,
  NAMED_COLORS,
  MAX_BOTS,
  MAX_PITCH,
  MAX_REWIND_TICKS,
  MOVE_SPEED,
  PICKUP_AREAS,
  RENAME_SECONDS,
  Room,
  RESPAWN_AREAS,
  SPAWN_AREAS,
  STEP_UP,
  Structures,
  TICK_DT,
  TICK_RATE,
  WORLD_GROUND,
  CIRCLE_LOOKS,
  DOOR_SWING_SECONDS,
  DUNE_HEIGHT,
  FLOOR,
  FROST_CELL,
  wall,
  dragonShape,
  PINEAPPLE_DOOR,
  PINEAPPLE_PLACEMENT,
  botRequest,
  defaultBotsFor,
  AVATARS,
  BLAST,
  KARTS,
  RESCUE,
  SEATED,
  stranded,
  type BotRequest,
  type InputFrame,
  type ItemAction,
  type Region,
  type ServerMessage,
  type Vec3,
} from '@world/shared';

function link() {
  const inbox: ServerMessage[] = [];
  return { inbox, send: (m: ServerMessage) => inbox.push(m) };
}

test('an ice spray frosts what it lands on, for everyone and whoever joins later, and a flame melts it', () => {
  // Alice stands in the middle facing +z, a wall 5 m in front of her, its near side her way.
  const room = new Room('frost', { seed: 1, structures: new Structures([wall({ x: -5, z: 5 }, { x: 5, z: 5 }, 4)]) });
  const a = link();
  const ida = room.join('alice', a)!;
  const alice = room.players.find((p) => p.id === ida)!;
  alice.pos = { x: 0, y: EYE_HEIGHT, z: 0 };
  room.receive(ida, { t: 'chat', text: '/ice-blower' });
  hold(room, ida, 30);
  const frosted = a.inbox.flatMap((m) => (m.t === 'frost' ? m.on : []));
  assert.ok(frosted.length > 0, 'cells froze');
  assert.ok(
    frosted.some(([piece, face]) => piece === 0 && face === 2),
    'on the near side of the wall (its local +x, with the wall running along world x)',
  );
  // A second's spray leaves the wall solid ice for 1.5 m round where she aims: on its near face,
  // (u, v) is (x + 5, height), so the aim is at (5, 1.7).
  for (let i = 7; i <= 12; i++)
    for (let j = 1; j <= 5; j++) {
      const [u, v] = [(i + 0.5) * FROST_CELL, (j + 0.5) * FROST_CELL];
      if (Math.hypot(u - 5, v - 1.7) <= 1.5)
        assert.ok(room.structures.frost.has(0, 2, i, j), `cell ${i},${j} of the wall's face is frosted`);
    }
  const floor = frosted.find(([piece, face]) => piece === FLOOR && face === 0);
  assert.ok(floor, 'and on the floor under the spray');
  const [, , i, j] = floor;
  assert.equal(room.structures.footing((i + 0.5) * FROST_CELL, (j + 0.5) * FROST_CELL, 1).surface, 'ice');
  assert.equal(a.inbox.filter((m) => m.t === 'frost' && m.off.length).length, 0, 'nothing melted');

  const b = link();
  room.join('bob', b);
  const welcome = b.inbox[0];
  assert.ok(welcome.t === 'welcome' && welcome.frost.length === room.structures.frost.size, 'bob gets all of it');

  room.receive(ida, { t: 'chat', text: '/flamethrower' });
  const was = room.structures.frost.size;
  const heard = b.inbox.length;
  hold(room, ida, 30);
  const melted = b.inbox.slice(heard).flatMap((m) => (m.t === 'frost' ? m.off : []));
  assert.ok(melted.length > 0 && room.structures.frost.size === was - melted.length, 'the flame melts it');
  assert.ok(
    b.inbox.slice(heard).every((m) => m.t !== 'frost' || m.on.length === 0),
    'and freezes nothing',
  );
});

let seq = 1000;
function frame(pitch: number, actions: ItemAction[], yaw = 0, use: string | null = null): InputFrame {
  return { seq: seq++, mx: 0, my: 0, yaw, pitch, jump: false, reading: null, use, actions };
}

// One press of the shoot action: a tick with it held, then a tick released.
function press(room: Room, id: string, pitch = 0, scoped = false, yaw = 0): void {
  room.receive(id, { t: 'input', f: frame(pitch, scoped ? ['scope', 'shoot'] : ['shoot'], yaw) });
  room.step();
  room.receive(id, { t: 'input', f: frame(pitch, scoped ? ['scope'] : [], yaw) });
  room.step();
}

// A tick with every player's client sending an idle frame on time, as a browser does.
function tick(room: Room): void {
  for (const p of room.players) room.receive(p.id, { t: 'input', f: frame(p.pitch, [], p.yaw) });
  room.step();
}

// Hold the shoot action for `ticks` ticks.
function hold(room: Room, id: string, ticks: number, on = true): void {
  for (let i = 0; i < ticks; i++) {
    room.receive(id, { t: 'input', f: frame(0, on ? ['shoot'] : []) });
    room.step();
  }
}

test('room seats players, applies inputs on step, and broadcasts', () => {
  const room = new Room('t', { seed: 1 });
  const a = link();
  const b = link();
  const ida = room.join('  alice ', a)!;
  const idb = room.join('', b)!;
  assert.equal(a.inbox[0].t, 'welcome');
  assert.equal(b.inbox[0].t === 'welcome' && b.inbox[0].players.length, 2);
  assert.equal(a.inbox[1].t === 'join' && a.inbox[1].p.name, 'guest');

  room.receive(ida, {
    t: 'input',
    f: { seq: 1, mx: 0, my: 1, yaw: 0, pitch: 0, jump: false, reading: 'aws', actions: [] },
  });
  room.receive(ida, {
    t: 'input',
    f: { seq: 1, mx: 0, my: 1, yaw: 0, pitch: 0, jump: false, reading: null, actions: [] },
  });
  room.receive(ida, { t: 'nonsense' });
  const before = room.players.find((p) => p.id === ida)!.pos.z;
  room.step();
  const snap = b.inbox.at(-1)!;
  assert.equal(snap.t, 'snap');
  if (snap.t !== 'snap') return;
  const alice = snap.players.find((p) => p.id === ida)!;
  assert.ok(alice.pos.z > before);
  assert.equal(alice.lastSeq, 1);
  assert.equal(alice.reading, 'aws');
  assert.equal(snap.cubes.length, CUBE_IDS.length);

  room.leave(idb);
  assert.equal(a.inbox.at(-1)?.t, 'leave');
  assert.equal(room.playerCount, 1);
});

test('a late frame is stepped in its own place, waiting up to INPUT_WAIT_TICKS for it; past that the body moves on', () => {
  const room = new Room('late', { seed: 1, structures: new Structures([]) });
  const [ida, idb, idc] = ['alice', 'bob', 'carol'].map((name) => room.join(name, link())!);
  const [alice, bob, carol] = [ida, idb, idc].map((id) => room.players.find((p) => p.id === id)!);
  const up = EYE_HEIGHT + 20;
  for (const p of [alice, bob, carol]) p.pos = { x: p.pos.x, y: up, z: p.pos.z };
  // Alice's frames come on time, falling; bob's first five come together on the sixth tick, after a
  // stall, and he ends where she does; carol sends none.
  const send = (id: string) => room.receive(id, { t: 'input', f: frame(0, []) });
  for (let i = 0; i < 9; i++) {
    send(ida);
    if (i === 5) for (let j = 0; j < 5; j++) send(idb);
    if (i >= 5) send(idb);
    room.step();
  }
  assert.ok(alice.pos.y < up);
  assert.equal(bob.pos.y, alice.pos.y);
  for (let i = 9; i < INPUT_WAIT_TICKS; i++) room.step();
  assert.equal(carol.pos.y, up, 'held for INPUT_WAIT_TICKS');
  room.step();
  assert.ok(carol.pos.y < up, 'then falls without her frames');
});

test('a rename is announced, shows in the next snapshot, and waits RENAME_SECONDS before another', () => {
  const room = new Room('names', { seed: 1 });
  const a = link();
  const b = link();
  const ida = room.join('alice', a)!;
  room.join('bob', b);
  const alice = () => room.players.find((p) => p.id === ida)!;
  room.receive(ida, { t: 'rename', name: '  ali  ' });
  assert.deepEqual(b.inbox.at(-1), { t: 'system', text: 'alice is now called ali' });
  room.step();
  const snap = b.inbox.at(-1)!;
  assert.ok(snap.t === 'snap' && snap.players.find((p) => p.id === ida)?.name === 'ali');

  room.receive(ida, { t: 'rename', name: 'al' });
  assert.deepEqual(a.inbox.at(-1), { t: 'refused', text: 'you can rename again in a few seconds' });
  assert.equal(alice().name, 'ali', 'too soon');

  for (let i = 0; i < RENAME_SECONDS * TICK_RATE; i++) room.step();
  room.receive(ida, { t: 'rename', name: ' \u0007 ' });
  assert.equal(alice().name, 'ali', 'nothing left of it');
  room.receive(ida, { t: 'rename', name: 'al' });
  assert.equal(alice().name, 'al');
});

test('room calls onEmpty when the last player leaves', () => {
  let empty = 0;
  const room = new Room('t', { onEmpty: () => empty++ });
  const id = room.join('x', link())!;
  room.leave(id);
  assert.equal(empty, 1);
});

test('players spawn at random spots in every spawn area, on its floor, and the dead come back in the respawn areas', () => {
  const room = new Room('spawn', { seed: 3 });
  const inside = (r: Region, p: Vec3) =>
    r.kind === 'disc'
      ? Math.hypot(p.x - r.x, p.z - r.z) <= r.r
      : r.kind === 'rect' && Math.abs(p.x - r.x) <= r.w / 2 && Math.abs(p.z - r.z) <= r.d / 2;
  for (const [areas, respawn, joins] of [
    [SPAWN_AREAS, false, 40],
    [RESPAWN_AREAS, true, 120],
  ] as const) {
    const used = new Set<number>();
    const spots = new Set<string>();
    for (let i = 0; i < joins; i++) {
      const l = link();
      const id = room.join(`p${i}`, l, { respawn })!;
      const me = l.inbox[0].t === 'welcome' ? l.inbox[0].players.find((p) => p.id === id)! : null;
      assert.ok(me);
      const area = areas.findIndex(({ region }) => inside(region, me.pos));
      assert.ok(area >= 0, 'in a spawn area');
      used.add(area);
      spots.add(`${me.pos.x.toFixed(1)},${me.pos.z.toFixed(1)}`);
      const floor = areas[area].region.y;
      assert.ok(me.pos.y - EYE_HEIGHT <= floor + STEP_UP + 1e-9, 'on the floor, or a step up from it');
      room.leave(id);
    }
    assert.equal(used.size, areas.length, 'every area gets some');
    assert.equal(spots.size, joins, 'all different');
  }
});

test('/speedy and /s boost the sender and tell everyone in grey', () => {
  const room = new Room('cmd', { seed: 1 });
  const a = link();
  const b = link();
  const ida = room.join('alice', a)!;
  room.join('bob', b);
  const alice = room.players.find((p) => p.id === ida)!;
  for (const command of ['/speedy', '/s']) {
    alice.boost = 0;
    room.receive(ida, { t: 'chat', text: command });
    assert.equal(alice.boost, 20);
  }
  const notice = b.inbox.at(-1)!;
  assert.deepEqual(notice, { t: 'system', text: 'alice increased their movement speed for 20s' });
  assert.ok(!b.inbox.some((m) => m.t === 'chat'), 'the command itself is not broadcast as chat');

  room.receive(ida, { t: 'chat', text: '/fly' });
  assert.deepEqual(a.inbox.at(-1), { t: 'refused', text: 'unknown command /fly' });
  assert.notDeepEqual(b.inbox.at(-1), { t: 'refused', text: 'unknown command /fly' }, 'only the sender is told');
});

test('/teleport stands the feet where asked, answers a bad one with its usage, and refuses a dragon', () => {
  const room = new Room('teleport', { seed: 1 });
  const a = link();
  const ida = room.join('alice', a)!;
  const alice = room.players.find((p) => p.id === ida)!;
  room.receive(ida, { t: 'chat', text: '/teleport 4000 30 -200' });
  assert.deepEqual(alice.pos, { x: 4000, y: 30 + EYE_HEIGHT, z: -200 });
  room.receive(ida, { t: 'chat', text: '/teleport 1 2' });
  assert.deepEqual(a.inbox.at(-1), { t: 'refused', text: TELEPORT_USAGE });

  room.receive(ida, { t: 'chat', text: '/light-dragon' });
  const at = { ...alice.pos };
  room.receive(ida, { t: 'chat', text: '/teleport 4100 30 -200' });
  assert.equal(a.inbox.at(-1)?.t, 'refused');
  assert.deepEqual(alice.pos, at);
});

test('/gun then shoot: the server resolves the hit, kills the target, and the dead stop moving', () => {
  const room = new Room('gun', { seed: 5 });
  const a = link();
  const b = link();
  const ida = room.join('alice', a)!;
  const idb = room.join('bob', b)!;
  const alice = room.players.find((p) => p.id === ida)!;
  const bob = room.players.find((p) => p.id === idb)!;
  bob.pos = { x: alice.pos.x, y: alice.pos.y, z: alice.pos.z + 8 };

  press(room, ida, 0, false);
  assert.ok(!bob.dead, 'nothing to shoot with yet');
  room.receive(ida, { t: 'chat', text: '/gun' });
  assert.deepEqual(alice.item, { id: 'gun', locked: false, fuel: null });
  const chest = Math.atan2(0.8, 8);
  press(room, ida, chest, false);
  assert.equal(bob.hearts, MAX_HEARTS - ITEMS.gun.damage, "a body shot takes the gun's damage");
  assert.ok(!bob.dead, 'bob is directly ahead but not dead yet');
  assert.ok(
    b.inbox.some(
      (m) => m.t === 'hit' && m.victim === idb && m.shooter === ida && m.damage === 2 && !m.headshot && m.hearts === 8,
    ),
  );
  while (!bob.dead) {
    for (let i = 0; i < ITEMS.gun.cooldownTicks; i++) room.step();
    press(room, ida, chest, false);
  }
  assert.equal(bob.hearts, 0);
  assert.equal(b.inbox.filter((m) => m.t === 'hit').length, 5, 'ten hearts, two a shot');
  assert.ok(b.inbox.some((m) => m.t === 'kill' && m.victim === idb && m.shooter === ida));
  assert.ok(
    b.inbox.some((m) => m.t === 'kill' && m.item === 'gun' && !m.headshot),
    'the kill says what did it',
  );
  assert.equal(alice.kills, 1, 'and counts for the shooter');
  assert.equal(bob.kills, 0);

  const before = { ...bob.pos };
  room.receive(idb, {
    t: 'input',
    f: { seq: 1, mx: 0, my: 1, yaw: 0, pitch: 0, jump: true, reading: null, actions: [] },
  });
  room.step();
  assert.deepEqual(bob.pos, before, 'dead players cannot move or jump');

  const c = link();
  room.join('carol', c);
  const welcome = c.inbox[0];
  assert.ok(welcome.t === 'welcome' && welcome.players.find((p) => p.id === idb)!.dead, 'late joiners see who is dead');
});

test("lag compensation: a shot is judged where the target was on the shooter's screen", () => {
  const room = new Room('rewind', { seed: 5 });
  const ida = room.join('alice', link())!;
  const idb = room.join('bob', link())!;
  const alice = room.players.find((p) => p.id === ida)!;
  const bob = room.players.find((p) => p.id === idb)!;
  room.receive(ida, { t: 'chat', text: '/gun' });
  const chest = Math.atan2(0.8, 8);
  const shoot = (view?: number) => {
    room.receive(ida, { t: 'input', f: { ...frame(chest, ['shoot']), view } });
    room.step();
    room.receive(ida, { t: 'input', f: frame(chest, []) });
    for (let i = 0; i < ITEMS.gun.cooldownTicks; i++) room.step();
  };

  // Bob is dead ahead at tick `seen`, then strafes 6 ticks at run speed: 1.6 m to the side.
  bob.pos = { x: alice.pos.x, y: alice.pos.y, z: alice.pos.z + 8 };
  room.step();
  const seen = room.tick;
  for (let i = 0; i < 6; i++) {
    bob.pos = { ...bob.pos, x: bob.pos.x + MOVE_SPEED * TICK_DT };
    room.step();
  }

  shoot(seen);
  assert.equal(bob.hearts, MAX_HEARTS - ITEMS.gun.damage, 'alice saw bob dead ahead: a hit');
  shoot();
  assert.equal(bob.hearts, MAX_HEARTS - ITEMS.gun.damage, 'no view: judged against now, and bob has moved on');
  assert.ok(room.tick - seen > MAX_REWIND_TICKS);
  shoot(seen);
  assert.equal(bob.hearts, MAX_HEARTS - ITEMS.gun.damage, 'too far back to rewind: clamped, so it misses');
});

test('hearts: walking into one heals 3 up to full, a full player leaves it, and it comes back 30 s later', () => {
  const welcome = link();
  new Room('default-hearts', { seed: 1 }).join('a', welcome);
  const listed = PICKUP_AREAS.reduce((n, a) => n + a.count, 0);
  assert.equal(welcome.inbox[0].t === 'welcome' && welcome.inbox[0].pickups.length, listed, 'every area starts full');

  const area = {
    region: { kind: 'disc', x: 0, z: 0, r: 4, y: 0 },
    kind: 'heart',
    count: 1,
    respawnSeconds: 30,
  } as const;
  const room = new Room('hearts', { seed: 2, structures: new Structures([]), pickupAreas: [area] });
  const a = link();
  const id = room.join('alice', a)!;
  const alice = room.players.find((p) => p.id === id)!;
  const hearts = () => {
    const snap = [...a.inbox].reverse().find((m) => m.t === 'snap');
    return snap?.t === 'snap' ? snap.pickups : [];
  };
  room.step();
  const [heart] = hearts();
  Object.assign(alice.pos, { x: heart.x, z: heart.z });
  room.step();
  assert.equal(hearts().length, 1, 'full health: left where it is');
  alice.hearts = 8.5;
  room.step();
  assert.equal(alice.hearts, MAX_HEARTS, 'healed, capped at full');
  assert.equal(hearts().length, 0);
  for (let i = 0; i < TICK_RATE * 30; i++) room.step();
  assert.equal(hearts().length, 1, 'another 30 s later');
});

test("a dead player's body leaves a big heart that stays where it lay, heals 10, and goes for good", () => {
  const room = new Room('corpse', { seed: 4, structures: new Structures([]), pickupAreas: [] });
  const a = link();
  const ida = room.join('alice', a)!;
  const idb = room.join('bob', link())!;
  const alice = room.players.find((p) => p.id === ida)!;
  const bob = room.players.find((p) => p.id === idb)!;
  bob.dead = true;
  room.leave(idb);
  for (let i = 0; i < TICK_RATE * 5; i++) room.step(); // it bobs and spins, but stays put
  const pickups = () => {
    const snap = [...a.inbox].reverse().find((m) => m.t === 'snap');
    return snap?.t === 'snap' ? snap.pickups : [];
  };
  const [drop] = pickups();
  assert.equal(drop?.kind, 'big-heart');
  assert.deepEqual(drop.from, { avatar: bob.avatar, color: bob.color }, 'his to look at');
  assert.ok(Math.hypot(drop.x - bob.pos.x, drop.z - bob.pos.z) < 0.01, 'where the body was');
  alice.hearts = 1;
  Object.assign(alice.pos, { x: drop.x, z: drop.z });
  room.step();
  assert.equal(alice.hearts, MAX_HEARTS, 'back to full');
  for (let i = 0; i < TICK_RATE * 60; i++) room.step();
  assert.equal(pickups().length, 0, 'and it never comes back');
});

test('a hard landing hurts like a shot with no shooter, a fatal one is announced as a fall, and the ground past the edge bleeds a heart a half second', () => {
  const room = new Room('falls', { seed: 3, structures: new Structures([]) });
  const a = link();
  const id = room.join('alice', a)!;
  const alice = room.players.find((p) => p.id === id)!;
  const fall = (feet: number) => {
    alice.pos.y = feet + EYE_HEIGHT;
    for (let i = 0; i < TICK_RATE * 3; i++) room.step();
  };
  fall(41);
  assert.deepEqual(
    a.inbox.find((m) => m.t === 'hit'),
    { t: 'hit', shooter: null, victim: id, damage: 5, headshot: false, hearts: MAX_HEARTS - 5 },
  );
  fall(14);
  assert.equal(alice.hearts, MAX_HEARTS - 5, 'under 15 m is free');
  fall(70);
  assert.ok(alice.dead);
  assert.ok(a.inbox.some((m) => m.t === 'fell' && m.victim === id));

  // A step down onto the ground past the edge (at a bearing of 340°, clear of the fan and the
  // bridge) hurts nothing as a fall, then a heart every half second it stays down there.
  const b = link();
  const bobId = room.join('bob', b)!;
  const bob = room.players.find((p) => p.id === bobId)!;
  bob.pos = {
    x: 60 * Math.cos((340 * Math.PI) / 180),
    y: OUTSIDE_HEIGHT + 1 + EYE_HEIGHT,
    z: 60 * Math.sin((340 * Math.PI) / 180),
  };
  for (let i = 0; i < TICK_RATE * 2; i++) room.step();
  assert.ok(!bob.dead && bob.hearts < MAX_HEARTS, `${bob.hearts} hearts`);
  for (let i = 0; i < TICK_RATE * 5; i++) room.step();
  assert.ok(bob.dead);
  assert.ok(b.inbox.some((m) => m.t === 'out' && m.victim === bobId));
});

test('commands and their shortcuts swap items freely, gear goes on beside, items stay, and the gun only reaches 20 m', () => {
  const room = new Room('items', { seed: 6 });
  const a = link();
  const b = link();
  const ida = room.join('alice', a)!;
  const idb = room.join('bob', b)!;
  const alice = room.players.find((p) => p.id === ida)!;
  const bob = room.players.find((p) => p.id === idb)!;
  bob.pos = { x: alice.pos.x, y: alice.pos.y, z: alice.pos.z + 25 };

  room.receive(ida, { t: 'chat', text: '/gun' });
  room.receive(ida, { t: 'chat', text: '/sniper' });
  assert.equal(alice.item?.id, 'sniper', 'swapped');
  assert.ok(b.inbox.some((m) => m.t === 'system' && m.text === 'alice swapped their gun for a sniper'));
  room.receive(ida, { t: 'chat', text: '/gun' });
  assert.equal(alice.item?.id, 'gun', 'and back');

  press(room, ida, 0, false);
  assert.equal(bob.hearts, MAX_HEARTS, '25 m is past the gun');

  for (let i = 0; i < 30 * 60; i++) room.step();
  assert.equal(alice.item?.id, 'gun', 'still armed a minute later');
  room.receive(ida, { t: 'chat', text: '/sniper' });
  assert.equal(room.players.find((p) => p.id === ida)!.item?.id, 'sniper');
  press(room, ida, 0, false);
  assert.ok(!bob.dead, 'the sniper only fires while scoped');
  press(room, ida, 0, true);
  assert.ok(bob.dead, 'scoped, the sniper reaches 25 m');

  for (const [command, item] of [
    ['/g', 'gun'],
    ['/ft', 'flamethrower'],
  ] as const) {
    room.receive(ida, { t: 'chat', text: command });
    assert.equal(alice.item?.id, item);
  }
  room.receive(ida, { t: 'chat', text: '/j' });
  assert.equal(alice.gear?.id, 'jetpack', 'gear goes on beside the weapon');
  assert.equal(alice.item?.id, 'flamethrower');

  room.receive(ida, { t: 'chat', text: '/unequip' });
  assert.equal(alice.item, null, '/unequip puts the weapon down');
  assert.equal(alice.gear, null, 'and takes the gear off');
});

test('a corpse that never rejoins is removed and its link closed', () => {
  const room = new Room('corpse', { seed: 5 });
  const a = link();
  let closed = false;
  const bLink = {
    ...link(),
    close: () => {
      closed = true;
    },
  };
  const ida = room.join('alice', a)!;
  const idb = room.join('bot', bLink)!;
  const alice = room.players.find((p) => p.id === ida)!;
  const bot = room.players.find((p) => p.id === idb)!;
  bot.pos = { x: alice.pos.x, y: alice.pos.y, z: alice.pos.z + 5 };
  room.receive(ida, { t: 'chat', text: '/sniper' });
  press(room, ida, 0, true);
  assert.ok(bot.dead, 'a scoped sniper headshot');
  for (let i = 0; i < 30 * 12; i++) room.step();
  assert.ok(
    room.players.some((p) => p.id === idb),
    'still a corpse at 12 s',
  );
  for (let i = 0; i < 30 * 2; i++) room.step();
  assert.ok(!room.players.some((p) => p.id === idb), 'gone after the death screen would have reloaded');
  assert.ok(closed, 'its socket was closed');
  assert.ok(
    a.inbox.some((m) => m.t === 'leave' && m.id === idb),
    'everyone saw it leave',
  );
});

test('looks: /elizabeth is for good, and /red recolours', () => {
  const room = new Room('av', { seed: 1 });
  const a = link();
  const b = link();
  const ida = room.join('ann', a, { avatar: 'elizabeth' })!;
  const idb = room.join('bob', b)!;
  const ann = room.players.find((p) => p.id === ida)!;
  const bob = room.players.find((p) => p.id === idb)!;
  assert.equal(ann.avatar, 'elizabeth');
  assert.equal(bob.avatar, 'standard');

  room.receive(idb, { t: 'chat', text: '/elizabeth' });
  assert.equal(bob.avatar, 'elizabeth');
  assert.ok(a.inbox.some((m) => m.t === 'system' && m.text === 'bob is now elizabeth'));
  for (let i = 0; i < 30 * 120; i++) room.step();
  assert.equal(bob.avatar, 'elizabeth', 'no timer: still elizabeth two minutes later');
  assert.equal(bob.item, null, 'looks change nothing else');
  room.receive(idb, { t: 'chat', text: '/elizabeth' });
  assert.deepEqual(b.inbox.at(-1), { t: 'refused', text: "you're already elizabeth" });
  room.receive(idb, { t: 'chat', text: '/standard' });
  assert.equal(bob.avatar, 'standard', 'and back by choice');

  room.receive(idb, { t: 'chat', text: '/sahur' });
  assert.deepEqual(b.inbox.at(-1), { t: 'refused', text: 'unknown command /sahur' }, 'a look goes by its command');
  room.receive(idb, { t: 'chat', text: '/tung' });
  assert.equal(bob.avatar, 'sahur');

  room.receive(idb, { t: 'chat', text: '/RED' });
  assert.equal(bob.color, NAMED_COLORS.red, 'a colour by name, any case');
  assert.equal(bob.avatar, 'standard', "a colour is the standard body's: back to it");
  assert.ok(a.inbox.some((m) => m.t === 'system' && m.text === 'bob is now red'));
  room.receive(ida, { t: 'chat', text: '/red' });
  assert.equal(ann.avatar, 'standard', 'a look chosen on joining is changed like any other');
  room.receive(idb, { t: 'chat', text: '/constructor' });
  assert.deepEqual(b.inbox.at(-1), { t: 'refused', text: 'unknown command /constructor' });
});

test('headshots do 2.5x: a gun takes 5 hearts, a scoped sniper to the head is a one-shot kill', () => {
  const room = new Room('head', { seed: 5 });
  const a = link();
  const ida = room.join('alice', a)!;
  room.receive(ida, { t: 'chat', text: '/gun' });
  const idb = room.join('bob', link())!;
  const idc = room.join('carol', link())!;
  room.receive(idc, { t: 'chat', text: '/sniper' });
  const [alice, bob, carol] = [ida, idb, idc].map((id) => room.players.find((p) => p.id === id)!);
  bob.pos = { x: alice.pos.x, y: alice.pos.y, z: alice.pos.z + 8 };
  carol.pos = { x: alice.pos.x, y: alice.pos.y, z: alice.pos.z - 30 };

  press(room, ida, 0, false);
  assert.equal(bob.hearts, MAX_HEARTS - ITEMS.gun.damage * HEADSHOT_MULTIPLIER);
  assert.ok(a.inbox.some((m) => m.t === 'hit' && m.headshot && m.damage === 5));

  press(room, idc, 0, true);
  assert.ok(alice.dead, 'sniper headshot: 4 x 2.5 = 10 hearts');
  assert.equal(alice.hearts, 0);
});

test('flamethrower: hold to spray a 20 m cone, 0.5 hearts every 5 ticks, on a 7.5 s tank that takes 25 s to refill', () => {
  const room = new Room('flame', { seed: 9 });
  const a = link();
  const ida = room.join('alice', a)!;
  const idb = room.join('bob', link())!;
  const idc = room.join('carol', link())!;
  const idd = room.join('dave', link())!;
  const [alice, bob, carol, dave] = [ida, idb, idc, idd].map((id) => room.players.find((p) => p.id === id)!);
  bob.pos = { x: alice.pos.x + 1.5, y: alice.pos.y, z: alice.pos.z + 6 }; // 14 degrees off axis: in the cone
  carol.pos = { x: alice.pos.x, y: alice.pos.y, z: alice.pos.z + 22 }; // straight ahead but past 20 m
  dave.pos = { x: alice.pos.x + 5, y: alice.pos.y, z: alice.pos.z + 6 }; // 40 degrees off: outside

  room.receive(ida, { t: 'chat', text: '/flamethrower' });
  assert.deepEqual(alice.item, { id: 'flamethrower', locked: false, fuel: 7.5 });
  hold(room, ida, 30);
  assert.equal(bob.hearts, MAX_HEARTS - 3, 'six 0.5 ticks in a second (ticks 0, 5, 10, 15, 20, 25)');
  assert.equal(carol.hearts, MAX_HEARTS, 'out of reach');
  assert.equal(dave.hearts, MAX_HEARTS, 'outside the cone');
  assert.ok(!a.inbox.some((m) => m.t === 'shot'), 'no muzzle event for a hold weapon');
  assert.ok(Math.abs(alice.item!.fuel! - 6.5) < 1e-6, 'a second of fuel burnt');
  assert.ok(alice.firing);

  hold(room, ida, 30 * 6.5);
  assert.ok(alice.item!.fuel! < 1e-6, 'tank empty');
  assert.ok(!alice.firing, 'and it stops');
  const before = bob.hearts;
  hold(room, ida, 30);
  assert.equal(bob.hearts, before, 'holding with an empty tank does nothing');

  hold(room, ida, 30 * 12.5, false);
  assert.ok(Math.abs(alice.item!.fuel! - 3.75) < 1e-6, '12.5 s off the trigger refills half');
  hold(room, ida, 30 * 13, false);
  assert.ok(Math.abs(alice.item!.fuel! - 7.5) < 1e-6, 'full at 25 s, no further');
});

test('ice blower: every touch costs a quarter heart and chills from the last one; the chilled still act, and fire thaws them', () => {
  const room = new Room('ice', { seed: 9 });
  const a = link();
  const ida = room.join('alice', a)!;
  const idb = room.join('bob', link())!;
  room.receive(idb, { t: 'chat', text: '/gun' });
  const [alice, bob] = [ida, idb].map((id) => room.players.find((p) => p.id === id)!);
  bob.pos = { x: alice.pos.x, y: alice.pos.y, z: alice.pos.z + 6 };

  room.receive(ida, { t: 'chat', text: '/ib' });
  assert.deepEqual(alice.item, { id: 'ice-blower', locked: false, fuel: 7.5 });
  hold(room, ida, 30);
  const { damage } = ITEMS['ice-blower'];
  const touches = a.inbox.filter((m) => m.t === 'hit' && m.victim === idb && m.damage === damage).length;
  assert.ok(touches >= 5, 'a touch every cooldown');
  assert.equal(bob.hearts, MAX_HEARTS - touches * damage, 'a quarter heart each, nothing more');
  assert.ok(bob.chilled > CHILL_SECONDS - 10 * TICK_DT, 'the chill restarts at every touch');

  press(room, idb);
  assert.ok(
    a.inbox.some((m) => m.t === 'shot' && m.id === idb),
    'chilled: the trigger still works',
  );

  room.receive(ida, { t: 'chat', text: '/ft' });
  const heard = a.inbox.length;
  hold(room, ida, ITEMS.flamethrower.cooldownTicks + 1);
  assert.ok(
    a.inbox.slice(heard).some((m) => m.t === 'hit' && m.victim === idb),
    'the flame reaches him',
  );
  assert.equal(bob.chilled, 0, 'and thaws him at once');
});

test("a click on the house's door within reach swings it for everyone, once a swing; from afar it does nothing", () => {
  const room = new Room('door', { seed: 4 });
  const a = link();
  const b = link();
  const ida = room.join('alice', a)!;
  room.join('bob', b);
  const alice = room.players.find((p) => p.id === ida)!;
  // The slab's middle shut or open, and the way out from the house through the doorway.
  const door = PINEAPPLE_DOOR;
  const middle = (open: boolean) => {
    const a = door.bearing + (open ? door.swing : 0);
    return { x: door.hinge.x + (door.reach / 2) * Math.cos(a), z: door.hinge.z + (door.reach / 2) * Math.sin(a) };
  };
  const shut = middle(false);
  const out = { x: shut.x - PINEAPPLE_PLACEMENT.x, z: shut.z - PINEAPPLE_PLACEMENT.z };
  const len = Math.hypot(out.x, out.z);
  out.x /= len;
  out.z /= len;
  // Standing `away` metres outside the doorway at the dune's height, looking at the slab's middle
  // wherever it stands.
  const use = (away: number) => {
    alice.pos = { x: shut.x + out.x * away, y: DUNE_HEIGHT + 1.7, z: shut.z + out.z * away };
    const at = middle(swings().at(-1)?.t === 'door' && !!swings().at(-1)?.open);
    const dx = at.x - alice.pos.x;
    const dz = at.z - alice.pos.z;
    const pitch = -Math.atan2(door.y + door.height / 2 - alice.pos.y, Math.hypot(dx, dz));
    room.receive(ida, { t: 'input', f: frame(pitch, [], Math.atan2(dx, dz), door.id) });
    room.step();
  };
  const swings = () => b.inbox.filter((m) => m.t === 'door');

  use(30);
  assert.equal(swings().length, 0, 'out of reach: nothing');
  use(5);
  assert.deepEqual(
    swings().at(-1),
    { t: 'door', id: door.id, open: true, by: ida },
    'in reach: it opens, for everyone',
  );
  use(5);
  assert.equal(swings().length, 1, 'while it swings, a click does nothing');
  for (let i = 0; i < DOOR_SWING_SECONDS * TICK_RATE; i++) room.step();
  use(5);
  assert.equal(swings().at(-1)?.t === 'door' && swings().at(-1)?.open, false, 'swung: a click shuts it again');
});

test('a tap weapon fires once per press however long the key is held', () => {
  const room = new Room('tap', { seed: 3 });
  const ida = room.join('alice', link())!;
  const idb = room.join('bob', link())!;
  const [alice, bob] = [ida, idb].map((id) => room.players.find((p) => p.id === id)!);
  bob.pos = { x: alice.pos.x, y: alice.pos.y, z: alice.pos.z + 5 };
  room.receive(ida, { t: 'chat', text: '/gun' });
  hold(room, ida, 60);
  assert.equal(bob.hearts, MAX_HEARTS - 5, 'one headshot, not six');
});

test('bots are flagged at join, never keep a room open, and are dropped when it closes', () => {
  let empties = 0;
  let botClosed = false;
  const room = new Room('bots', { seed: 4, onEmpty: () => empties++ });
  let botCloseReason = '';
  const bot = {
    ...link(),
    close: (reason: string) => {
      botClosed = true;
      botCloseReason = reason;
    },
  };
  assert.equal(room.join('circle-bot', bot, { bot: true }), null, 'a bot never starts a room on its own');
  assert.deepEqual(bot.inbox.at(-1), { t: 'error', message: 'no one here' });
  const ida = room.join('alice', link())!;
  const idb = room.join('circle-bot', bot, { bot: true })!;
  assert.equal(room.players.find((p) => p.id === idb)!.bot, true);
  assert.equal(room.players.find((p) => p.id === ida)!.bot, false);
  assert.equal(room.humanCount, 1);
  assert.equal(room.playerCount, 2);

  room.leave(ida);
  assert.equal(empties, 1, 'the last person leaving empties the room even with a bot seated');
  room.stop();
  assert.ok(botClosed, 'closing the room disconnects the bot');
  assert.equal(botCloseReason, 'room closed', 'and says why, unlike a corpse (dead)');
  assert.equal(room.playerCount, 0);
});

test('a bot stands where it asks, looking how it asks; a person only chooses a look', () => {
  const room = new Room('placed', { seed: 4 });
  const human = room.join('alice', link(), { spawn: { x: 5, y: 0, z: 5 }, avatar: 'elizabeth' })!;
  const alice = room.players.find((p) => p.id === human)!;
  assert.notDeepEqual([alice.pos.x, alice.pos.z], [5, 5]);
  assert.equal(alice.avatar, 'elizabeth');
  assert.ok(!alice.avatarLocked);
  const idr = room.join('bob', link(), { color: 'red' })!;
  const red = room.players.find((p) => p.id === idr)!;
  assert.equal(red.color, NAMED_COLORS.red, 'or the standard body in a named color');
  const idd = room.join('carol', link(), { avatar: 'light-dragon' })!;
  assert.equal(room.players.find((p) => p.id === idd)!.avatar, 'standard', 'but never a dragon');

  const onFloor = room.join('stalker-bot', link(), { bot: true, spawn: { x: 112, y: 20, z: 0 }, avatar: 'elizabeth' })!;
  const stalker = room.players.find((p) => p.id === onFloor)!;
  assert.deepEqual(stalker.pos, { x: 112, y: 20 + EYE_HEIGHT, z: 0 }, "on the tower's first floor");
  assert.equal(stalker.avatar, 'elizabeth');
  assert.ok(stalker.avatarLocked, 'and stays that way');

  const outside = room.join('circle-bot', link(), { bot: true, spawn: { x: 0, y: 30, z: 500 } })!;
  const lost = room.players.find((p) => p.id === outside)!;
  assert.ok(WORLD_GROUND.edge(lost.pos.x, lost.pos.z) <= -1 + 1e-9, 'clamped inside the outline');
  assert.equal(lost.pos.y, 30 + EYE_HEIGHT, 'at the height it asked for, to fall from there');
});

test('/kill-bots drops every living bot where it stands, people only', () => {
  const room = new Room('cull', { seed: 4 });
  const a = link();
  const ida = room.join('alice', a)!;
  const bots = [link(), link()].map((l) => {
    let closed = '';
    const id = room.join('circle-bot', { ...l, close: (reason: string) => (closed = reason) }, { bot: true })!;
    return { id, l, closed: () => closed };
  });
  room.receive(bots[0].id, { t: 'chat', text: '/kill-bots' });
  assert.deepEqual(bots[0].l.inbox.at(-1), { t: 'refused', text: "bots can't kill bots" });

  room.receive(ida, { t: 'chat', text: '/kill-bots' });
  assert.ok(room.players.filter((p) => p.bot).every((p) => p.dead && p.hearts === 0));
  assert.ok(!room.players.find((p) => p.id === ida)!.dead);
  assert.deepEqual(a.inbox.at(-1), { t: 'system', text: 'alice killed circle-bot x2' });
  room.receive(ida, { t: 'chat', text: '/kill-bots' });
  assert.deepEqual(a.inbox.at(-1), { t: 'refused', text: 'no bots here' });

  for (let i = 0; i <= 5 * TICK_RATE; i++) room.step();
  assert.equal(room.playerCount, 1, 'corpses are dropped like any bot corpse');
  assert.ok(
    bots.every((b) => b.closed() === 'dead'),
    'which ends each bot run',
  );
});

test("the first person in brings the room's default bots; nobody else does", async () => {
  const spawned: BotRequest[] = [];
  const room = new Room('sess-d', {
    seed: 4,
    spawnBot: async (req) => {
      spawned.push(req);
    },
  });
  assert.equal(
    room.join('circle-bot', link(), { bot: true, room: 'global' }),
    null,
    'a bot alone is refused, so it never triggers them',
  );
  const a = link();
  room.join('alice', a, { room: 'global' });
  await Promise.resolve();
  const expected = defaultBotsFor('global').map(({ bot, seconds, targets, ...placement }) =>
    botRequest({ bot, room: 'global', seconds, caller: 'room', ...placement }, targets),
  );
  // The circle bots' looks are the room's own draw: two different ones from the list.
  const looks = spawned.filter((r) => r.bot === 'circle').map((r) => r.avatar);
  assert.ok(
    looks.length === 2 && looks[0] !== looks[1] && looks.every((a) => a && CIRCLE_LOOKS.includes(a)),
    String(looks),
  );
  const sansLook = <T extends Pick<BotRequest, 'bot' | 'avatar'>>(r: T): T =>
    r.bot === 'circle' ? { ...r, avatar: undefined } : r;
  assert.deepEqual(spawned.map(sansLook), expected.map(sansLook), 'placements ride along with the request');
  assert.ok(a.inbox.some((m) => m.t === 'system' && m.text === 'circle-bot x2, stalker-bot x3 on the way'));
  room.join('bob', link(), { room: 'global' });
  room.join('circle-bot', link(), { bot: true, room: 'global' });
  await Promise.resolve();
  assert.equal(spawned.length, expected.length, 'only the first person');

  const quiet = new Room('sess-q', { seed: 4 });
  assert.ok(quiet.join('carol', link(), { room: 'global' }), 'no spawner: joins fine, no bots');
});

test('/circle-bot asks the host to start a bot in this room; people only, default 300 s, full room', async () => {
  const spawned: BotRequest[] = [];
  let fail = false;
  const room = new Room('sess-1', {
    seed: 4,
    spawnBot: async (req) => {
      if (fail) throw new Error('modal down');
      spawned.push(req);
    },
  });
  const a = link();
  const ida = room.join('alice', a, { room: 'late-night' })!;
  const b = link();
  const idb = room.join('circle-bot', b, { bot: true, room: 'late-night' })!;
  await Promise.resolve();
  spawned.length = 0; // alice's arrival spawned the room's default bots; this test is about calls

  const alice = room.players.find((p) => p.id === ida)!;
  // The middle of the tower's top floor, 62 m from the main disc's edge and 60 m up.
  Object.assign(alice.pos, { x: 112, y: 60 + EYE_HEIGHT, z: 0 });
  room.receive(ida, { t: 'chat', text: '/circle-bot -t 60' });
  await Promise.resolve();
  const { spawn: _, ...call } = spawned[0];
  assert.deepEqual(call, { bot: 'circle', room: 'late-night', seconds: 60, caller: 'alice', worker: 'dumb' });
  assert.ok(
    b.inbox.some((m) => m.t === 'system' && m.text === 'alice called circle-bot for 60s'),
    'everyone hears',
  );

  room.receive(ida, { t: 'chat', text: '/stalker' });
  await Promise.resolve();
  assert.equal(spawned[1].seconds, 300, "no number: the bot's default");
  room.receive(ida, { t: 'chat', text: '/circle --time 9999' });
  await Promise.resolve();
  assert.equal(spawned[2].seconds, 3500, 'capped');
  // Flags in any order, short or long; a combat bot also takes --target. Plain /sniper is the rifle.
  room.receive(ida, { t: 'chat', text: '/sniper-bot -t 60 --target Kat bob' });
  room.receive(ida, { t: 'chat', text: '/sniper-bot --target kat --skin tung -n hunter' });
  await Promise.resolve();
  assert.deepEqual(
    spawned.slice(3).map((r) => r.worker === 'combat' && [r.seconds, r.name, r.avatar, r.targets]),
    [
      [60, undefined, undefined, ['Kat', 'bob']],
      [300, 'hunter', 'sahur', ['kat']],
    ],
  );
  assert.ok(b.inbox.some((m) => m.t === 'system' && m.text === 'alice called hunter (sniper-bot) for 300s after kat'));
  for (const { spawn } of spawned) {
    assert.ok(spawn && Math.hypot(spawn.x - 112, spawn.z) <= 50, `a called bot spawns near the caller: ${spawn?.x}`);
    assert.ok(Math.abs(spawn.y - 60) <= STEP_UP, `at the caller's height, in the air or not: ${spawn.y}`);
  }
  for (const text of [
    '/circle-bot 60',
    '/circle-bot -t soon',
    '/circle-bot -n',
    '/circle-bot -s nobody',
    '/circle-bot --target kat',
    '/circle-bot -t 5 --time 6',
  ])
    room.receive(ida, { t: 'chat', text });
  assert.equal(spawned.length, 5, 'no bare words, bad or missing values, wrong flags or repeats');
  assert.deepEqual(a.inbox.at(-1), { t: 'refused', text: 'usage: /circle-bot -t [seconds] -n [name] -s [skin]' });

  room.receive(idb, { t: 'chat', text: '/circle-bot' });
  assert.deepEqual(b.inbox.at(-1), { t: 'refused', text: "bots can't call bots" });

  while (room.botCount < MAX_BOTS) room.join('bot', link(), { bot: true });
  room.receive(ida, { t: 'chat', text: '/stalker-bot' });
  assert.deepEqual(a.inbox.at(-1), { t: 'refused', text: 'this room has enough bots' });
  assert.equal(spawned.length, 5);
  assert.equal(room.join('late-bot', link(), { bot: true }), null);
  assert.ok(room.join('carol', link()));

  fail = true;
  const c = link();
  const room2 = new Room('sess-2', {
    seed: 1,
    spawnBot: async () => {
      throw new Error('modal down');
    },
  });
  const idc = room2.join('carol', c, { room: 'x' })!;
  room2.receive(idc, { t: 'chat', text: '/circle-bot' });
  await new Promise((r) => setTimeout(r, 0));
  assert.deepEqual(c.inbox.at(-1), { t: 'refused', text: "couldn't call circle-bot" });

  const d = link();
  const room3 = new Room('sess-3', { seed: 1 });
  const idd = room3.join('dave', d, { room: 'x' })!;
  room3.receive(idd, { t: 'chat', text: '/circle-bot' });
  assert.deepEqual(d.inbox.at(-1), { t: 'refused', text: "bots can't be called in this room" });
});

test('a bot corpse lingers for 5 s while a browser gets the full death screen', () => {
  const room = new Room('corpses', { seed: 5 });
  const ida = room.join('alice', link())!;
  room.receive(ida, { t: 'chat', text: '/sniper' });
  let botClosed = false;
  const idb = room.join(
    'circle-bot',
    {
      ...link(),
      close: () => {
        botClosed = true;
      },
    },
    { bot: true },
  )!;
  let humanClosed = false;
  const idc = room.join('bob', {
    ...link(),
    close: () => {
      humanClosed = true;
    },
  })!;
  const [alice, bot, bob] = [ida, idb, idc].map((id) => room.players.find((p) => p.id === id)!);
  bot.pos = { x: alice.pos.x, y: alice.pos.y, z: alice.pos.z + 5 };
  press(room, ida, 0, true);
  assert.ok(bot.dead, 'sniper headshot');
  bob.pos = { x: alice.pos.x, y: alice.pos.y, z: alice.pos.z + 5 };
  for (let i = 0; i < ITEMS.sniper.cooldownTicks; i++) room.step();
  press(room, ida, 0, true);
  assert.ok(bob.dead);

  for (let i = 0; i < 30 * 3; i++) room.step();
  assert.ok(!botClosed, 'the bot corpse is still visible before 5 s');
  assert.ok(!humanClosed, 'the browser corpse is still visible');

  for (let i = 0; i < 30 * 2; i++) room.step();
  assert.ok(botClosed, "the bot's connection was closed after about 5 s");
  assert.ok(!room.players.some((p) => p.id === idb), "the bot's corpse is gone");
  assert.ok(!humanClosed, 'the browser still has time to use its death screen');

  for (let i = 0; i < 30 * 9; i++) room.step();
  assert.ok(humanClosed, "the browser's fallback cleanup eventually closed it");
});

test('/colgera: a crystal heart a ring, shattered by a bullet up into its underside and by nothing else (a spray washes over it), the third shot killing it; it rises in a storm that ices the floor and throws the bystanders', () => {
  const room = new Room('colgera', { seed: 5, structures: new Structures([]), spawnBot: async () => {} });
  const a = link();
  const ida = room.join('alice', a, { room: 'colgera' })!;
  const alice = room.players.find((p) => p.id === ida)!;
  const b = link();
  const idb = room.join('bob', b)!;
  const bob = room.players.find((p) => p.id === idb)!;
  room.receive(idb, { t: 'chat', text: '/gun' });
  bob.pos = { x: alice.pos.x + 6, y: EYE_HEIGHT, z: alice.pos.z };
  room.receive(ida, { t: 'chat', text: '/colgera' });
  assert.equal(alice.hearts, 3, 'a crystal a ring');
  assert.deepEqual(alice.item, { id: 'frostbreath', locked: true, fuel: 7.5 });
  // The storm: ice on the floor under it, and bob, 6 m off, thrown away and up for two hearts.
  assert.ok(
    a.inbox.some((m) => m.t === 'frost' && m.on.length > 100),
    'the floor iced over',
  );
  assert.equal(bob.hearts, 8);
  assert.ok(bob.vx > 0 && bob.vy > 0 && bob.thrown !== null, `thrown away and up: ${bob.vx}, ${bob.vy}, ${bob.thrown}`);
  bob.vx = bob.vy = bob.vz = 0;
  bob.thrown = null;

  // Out and flying level 15 m up (in a gun's reach), the body laid along -x behind the head.
  const shape = dragonShape('colgera');
  const up = 15;
  alice.pos = { x: 0, y: up, z: 0 };
  const behind = shape.links.reduce<number[]>((at, link) => [...at, (at.at(-1) ?? 0) + link], []);
  alice.dragon!.spine = behind.flatMap((x) => [-x, up, 0]);
  alice.dragon!.risen = true;
  room.step(); // shots are judged where the snapshots had her
  // A shot straight up into a ring's middle from under it: MAX_PITCH leans the shot a little in
  // +z, so bob stands that much back; the ring's crystal shatters and a heart goes with it.
  const reload = () => {
    for (let i = 0; i < ITEMS.gun.cooldownTicks; i++) room.step();
  };
  const lean = ((up - 0.2 - EYE_HEIGHT) * Math.cos(MAX_PITCH)) / Math.sin(MAX_PITCH);
  const stand = (link: number) => {
    bob.pos = { x: -(behind[link - 1] + behind[link]) / 2, y: EYE_HEIGHT, z: -lean };
  };
  const under = (link: number) => {
    stand(link);
    reload();
    press(room, idb, -MAX_PITCH);
  };
  under(1);
  assert.equal(alice.hearts, 2);
  assert.deepEqual(alice.dragon!.shattered, [0]);
  assert.ok(
    b.inbox.some((m) => m.t === 'hit' && m.victim === ida && m.damage === 1),
    'a heart off',
  );
  under(1);
  assert.equal(alice.hearts, 2, 'a shattered one is a hole');
  // A level shot through the ring's middle from the side, over the crystal: nothing.
  bob.pos = { x: -(behind[0] + behind[1]) / 2, y: up - 0.2, z: 10 };
  reload();
  press(room, idb, 0, false, Math.PI);
  assert.equal(alice.hearts, 2, 'the shell takes nothing');
  assert.equal(b.inbox.filter((m) => m.t === 'hit' && m.victim === ida).length, 1);
  // A flame sprayed up into the next ring's crystal washes over it: only a bullet shatters one.
  room.receive(idb, { t: 'chat', text: '/flamethrower' });
  stand(6);
  for (let i = 0; i < ITEMS.flamethrower.cooldownTicks * 2; i++) {
    room.receive(idb, { t: 'input', f: frame(-MAX_PITCH, ['shoot']) });
    room.step();
  }
  room.receive(idb, { t: 'input', f: frame(-MAX_PITCH, []) }); // let go, so the next press is one
  room.step();
  assert.equal(alice.hearts, 2, 'a spray shatters nothing');
  assert.deepEqual(alice.dragon!.shattered, [0]);
  room.receive(idb, { t: 'chat', text: '/gun' });
  under(6);
  under(16);
  assert.equal(alice.hearts, 0);
  assert.ok(alice.dead, 'the third crystal was the last');
  assert.ok(b.inbox.some((m) => m.t === 'kill' && m.victim === ida && m.shooter === idb));
});

test('/light-dragon: 40 hearts, full, breath for good and no kit, 1.5 hearts back a second, one roar at a time, no bots; dead, it lies 30 s and leaves hearts along its body', () => {
  const room = new Room('dragon', { seed: 3, structures: new Structures([]), spawnBot: async () => {} });
  const a = link();
  const ida = room.join('alice', a, { room: 'dragon' })!;
  const alice = room.players.find((p) => p.id === ida)!;
  room.receive(ida, { t: 'chat', text: '/gun' });
  room.receive(ida, { t: 'chat', text: '/jetpack' });
  room.receive(ida, { t: 'chat', text: '/speedy' });
  alice.hearts = 7;
  room.receive(ida, { t: 'chat', text: '/light-dragon' });
  assert.equal(alice.avatar, 'light-dragon');
  assert.equal(alice.hearts, 40);
  assert.deepEqual(alice.item, { id: 'firebreath', locked: true, fuel: 7.5 });
  assert.equal(alice.gear, null);
  assert.equal(alice.boost, 0);
  assert.ok(a.inbox.some((m) => m.t === 'system' && m.text === 'alice is now light-dragon'));
  room.receive(ida, { t: 'chat', text: '/gun' });
  assert.deepEqual(a.inbox.at(-1), { t: 'refused', text: "you can't put down your firebreath" });
  room.receive(ida, { t: 'chat', text: '/jetpack' });
  assert.deepEqual(a.inbox.at(-1), { t: 'refused', text: 'not as an asian-dragon' });
  room.receive(ida, { t: 'chat', text: '/speedy' });
  assert.deepEqual(a.inbox.at(-1), { t: 'refused', text: 'not as an asian-dragon' });
  room.receive(ida, { t: 'chat', text: '/light-dragon' });
  assert.deepEqual(a.inbox.at(-1), { t: 'refused', text: "you're already light-dragon" });

  // Nothing can hit it while it's rising: a sniper's shots at its head pass through until it's risen.
  const b = link();
  const idb = room.join('bob', b)!;
  room.receive(idb, { t: 'chat', text: '/sniper' });
  const bob = room.players.find((p) => p.id === idb)!;
  const shootAlice = () => {
    bob.pos = { x: alice.pos.x, y: alice.pos.y, z: alice.pos.z - 6 };
    press(room, idb, 0, true);
    for (let i = 0; i < ITEMS.sniper.cooldownTicks; i++) room.step();
  };
  shootAlice();
  assert.ok(!alice.dragon!.risen && alice.hearts >= 40, 'a shot at a rising dragon passes through');
  while (!alice.dragon!.risen) {
    room.receive(ida, { t: 'input', f: frame(0, []) });
    room.step();
  }
  alice.hearts = 28;
  shootAlice();
  const hit = 28 - ITEMS.sniper.damage * HEADSHOT_MULTIPLIER;
  assert.ok(
    alice.hearts >= hit && alice.hearts < hit + 2,
    'a risen one is hit, regenerating a little over the cooldown',
  );
  alice.hearts = 28;
  for (let i = 0; i < 2 * TICK_RATE; i++) room.step();
  assert.ok(Math.abs(alice.hearts - 31) < 1e-6, '3 hearts back in 2 s');
  room.receive(ida, { t: 'input', f: frame(0, ['roar-1']) });
  room.step();
  room.receive(ida, { t: 'input', f: frame(0, ['roar-1']) });
  room.step();
  room.receive(ida, { t: 'input', f: frame(0, []) });
  room.step();
  room.receive(ida, { t: 'input', f: frame(0, ['roar-2']) });
  room.step();
  assert.deepEqual(
    a.inbox.filter((m) => m.t === 'action'),
    [{ t: 'action', id: ida, action: 'roar-1' }],
    'one roar on the press, and none over it',
  );

  const bot = link();
  assert.equal(room.join('circle-bot', bot, { bot: true, avatar: 'light-dragon' }), null);
  assert.deepEqual(bot.inbox.at(-1), { t: 'error', message: "bots can't be an asian-dragon" });
  room.receive(ida, { t: 'chat', text: '/circle-bot -s light-dragon' });
  assert.deepEqual(a.inbox.at(-1), { t: 'refused', text: "bots can't be an asian-dragon" });

  // Shot dead by a sniper at its head, level with it (the body hangs under the head, in the way of
  // a shot from the ground): it drops to the ground and lies there, long after alice has gone, then
  // poofs with a heart under the head and four along the body. Bob is set back down before the
  // fall from up there can kill him.
  bob.pos = { x: alice.pos.x, y: alice.pos.y, z: alice.pos.z - 6 };
  alice.hearts = 9; // under a headshot, even with the tick's regen
  press(room, idb, 0, true);
  assert.ok(alice.dead, 'a headshot: 4 x 2.5');
  bob.pos = { ...bob.pos, y: EYE_HEIGHT };
  bob.vy = 0;
  assert.ok(b.inbox.some((m) => m.t === 'kill' && m.victim === ida && m.headshot));
  room.receive(ida, { t: 'chat', text: '/standard' });
  assert.deepEqual(a.inbox.at(-1), { t: 'refused', text: "not while you're dead" });
  for (let i = 0; i < 9 * TICK_RATE; i++) room.step();
  assert.equal(alice.pos.y, dragonShape('light-dragon').underside.head, 'the head came to rest on the ground');
  room.leave(ida);
  for (let i = 0; i < 20 * TICK_RATE; i++) room.step();
  assert.ok(
    room.players.some((p) => p.id === ida),
    'still lying there at 29 s',
  );
  for (let i = 0; i < 2 * TICK_RATE; i++) room.step();
  assert.ok(!room.players.some((p) => p.id === ida), 'gone at 30 s');
  const snap = [...b.inbox].reverse().find((m) => m.t === 'snap')!;
  assert.equal(snap.pickups.filter((p) => p.kind === 'big-heart').length, 5);
});

test('a ground pound: pressed in the air it hangs, drops faster than a fall, plants its feet, and hurts whoever is on foot near where it lands, harder and further from higher up, and lands as a fall from where it began, whatever fell before', () => {
  const room = new Room('pound', { seed: 3, structures: new Structures([]) });
  const [a, b, c] = [link(), link(), link()];
  const [ida, idb, idc] = [room.join('alice', a)!, room.join('bob', b)!, room.join('carol', c)!];
  const [alice, bob, carol] = [ida, idb, idc].map((id) => room.players.find((p) => p.id === id)!);
  room.receive(ida, { t: 'chat', text: '/mario' });
  // Alice 11 m up, bob 3.5 m from under her (a metre past her reach from a short drop), carol 5 m.
  alice.pos = { x: 0, y: EYE_HEIGHT + 11, z: 0 };
  bob.pos = { x: 3.5, y: EYE_HEIGHT, z: 0 };
  carol.pos = { x: 5, y: EYE_HEIGHT, z: 0 };
  tick(room);
  const pound = poundOf('mario')!;
  const stage = () => alice.pound?.stage;
  room.receive(ida, { t: 'input', f: frame(0, ['pound']) });
  room.step();
  const from = alice.pos.y;
  assert.equal(stage(), 'twirl');
  for (let i = 0; i < Math.round(pound.twirl * TICK_RATE) - 1; i++) tick(room);
  assert.ok(stage() === 'twirl' && alice.pos.y === from, 'hanging where it began, turning over');
  let ticks = 0;
  while (stage() !== 'land' && ticks++ < 60) tick(room);
  // A plain fall of that height takes sqrt(2h/g): about 45 ticks.
  assert.ok(ticks < 20, `down in ${ticks} ticks`);
  assert.equal(alice.pos.y, EYE_HEIGHT);
  // Two 5 m steps of the drop are a heart more, one 10 m step a metre further.
  assert.equal(bob.hearts, MAX_HEARTS - pound.damage - 1, 'bob, within reach, is hurt');
  tick(room);
  assert.ok(bob.pos.x > 3.5 && bob.pos.y > EYE_HEIGHT, 'and knocked back off his feet');
  assert.equal(carol.hearts, MAX_HEARTS, 'carol, past it, is not');
  assert.equal(alice.hearts, MAX_HEARTS, 'and it lands as a fall of that height, unhurt');
  room.receive(ida, { t: 'input', f: { ...frame(0, []), my: 1 } });
  room.step();
  assert.equal(alice.pos.z, 0, 'feet planted');
  for (let i = 0; i < Math.round(pound.recover * TICK_RATE); i++) tick(room);
  assert.equal(alice.pound, null);
  assert.equal(bob.hearts, MAX_HEARTS - pound.damage - 1, 'hurt once');
  // Begun 3 m up at the end of a fall fast enough to kill, it lands as the 3 m it is.
  alice.pos = { x: 40, y: EYE_HEIGHT + 3, z: 0 };
  alice.vy = -45;
  room.receive(ida, { t: 'input', f: frame(0, ['pound']) });
  for (let i = 0; i < 60 && stage() !== 'land'; i++) tick(room);
  assert.ok(stage() === 'land' && alice.hearts === MAX_HEARTS, 'a pound begun low breaks the fall');
  // From past a fatal fall it still goes off, killing bob as it kills alice.
  for (let i = 0; i < 4 * TICK_RATE && alice.pound; i++) room.step();
  alice.pos = { x: 0, y: EYE_HEIGHT + 100, z: 0 };
  bob.pos = { x: 2, y: EYE_HEIGHT, z: 0 };
  room.step();
  room.receive(ida, { t: 'input', f: frame(0, ['pound']) });
  for (let i = 0; i < 4 * TICK_RATE && !alice.dead; i++) room.step();
  assert.ok(alice.dead && bob.dead, 'a kamikaze');
});

test('a strike: a windup after the press its blow lands once on whoever on foot is in front of the body within its reach, a weapon in hand or none, and throws them back', () => {
  const room = new Room('strike', { seed: 3, structures: new Structures([]) });
  const links = [link(), link(), link(), link()];
  const ids = ['alice', 'bob', 'carol', 'dave'].map((name, i) => room.join(name, links[i])!);
  const [alice, bob, carol, dave] = ids.map((id) => room.players.find((p) => p.id === id)!);
  room.receive(ids[0], { t: 'chat', text: '/tung' });
  room.receive(ids[0], { t: 'chat', text: '/gun' });
  // Alice faces +z: bob stands 2.5 m in front of her, carol as far behind, dave 4 m in front.
  alice.pos = { x: 0, y: EYE_HEIGHT, z: 0 };
  bob.pos = { x: 0.5, y: EYE_HEIGHT, z: 2.5 };
  carol.pos = { x: 0, y: EYE_HEIGHT, z: -2.5 };
  dave.pos = { x: 0, y: EYE_HEIGHT, z: 4 };
  const strike = strikeOf('sahur')!;
  // Looking at the sky: the blow goes the way the body faces all the same.
  room.receive(ids[0], { t: 'input', f: frame(-1, ['strike']) });
  room.step();
  assert.equal(alice.strike, 0);
  const windup = Math.round(strike.windup * TICK_RATE);
  for (let i = 0; i < windup - 1; i++) tick(room);
  assert.equal(bob.hearts, MAX_HEARTS, 'not before the windup is over');
  tick(room);
  assert.equal(bob.hearts, MAX_HEARTS - strike.damage, 'bob, in front and in reach, is hit');
  tick(room);
  assert.ok(bob.pos.z > 2.5 && bob.pos.y > EYE_HEIGHT, 'and knocked back off his feet');
  assert.equal(carol.hearts, MAX_HEARTS, 'carol, behind, is not');
  assert.equal(dave.hearts, MAX_HEARTS, 'nor dave, out of reach');
  // Pressed again mid-swing it does nothing; once the swing is over it can be swung again.
  room.receive(ids[0], { t: 'input', f: frame(0, ['strike']) });
  for (let i = 0; i < Math.round(strike.recover * TICK_RATE); i++) tick(room);
  assert.equal(alice.strike, null);
  assert.equal(bob.hearts, MAX_HEARTS - strike.damage, 'hit once');
  const kills = () => links[0].inbox.filter((m) => m.t === 'kill');
  bob.pos = { x: 0, y: EYE_HEIGHT, z: 2 };
  bob.hearts = strike.damage;
  room.receive(ids[0], { t: 'input', f: frame(0, ['strike']) });
  for (let i = 0; i <= windup; i++) tick(room);
  assert.ok(bob.dead);
  assert.deepEqual(
    kills().map((m) => m.t === 'kill' && m.item),
    ['strike'],
    "a kill by it is the strike's, whatever is in the other hand",
  );
});

// A room on an empty world with `names` in it, each standing where given, facing +z.
function kartRoom(...at: Vec3[]): { room: Room; ids: string[]; inboxes: ServerMessage[][] } {
  const room = new Room('karts', {
    seed: 1,
    structures: new Structures([wall({ x: -10, z: 40 }, { x: 10, z: 40 }, 4)]),
  });
  const links = at.map(() => link());
  const ids = at.map((feet, i) => {
    const id = room.join(`p${i}`, links[i])!;
    const p = room.players.find((q) => q.id === id)!;
    p.pos = { x: feet.x, y: feet.y + EYE_HEIGHT, z: feet.z };
    p.yaw = 0;
    return id;
  });
  return { room, ids, inboxes: links.map((l) => l.inbox) };
}

// `id` drops a kart, waits for it to land, and walks into its tail to get in.
function getIn(room: Room, id: string): string {
  const me = room.players.find((p) => p.id === id)!;
  const kart = room.garage.drop(me, 'standard', room.playerCount);
  assert.ok(typeof kart !== 'string', 'a kart dropped');
  for (let i = 0; i < TICK_RATE; i++) tick(room);
  assert.equal(me.riding, null, 'not in it yet, standing off');
  me.pos = { x: kart.pos.x, y: EYE_HEIGHT, z: kart.pos.z - KARTS.standard.body.length / 2 };
  tick(room);
  assert.equal(me.riding, kart.id, 'in the kart');
  return kart.id;
}

function driving(room: Room, id: string, gas: number, actions: ItemAction[] = []): void {
  room.receive(id, { t: 'input', f: { ...frame(0, actions), my: gas } });
  room.step();
}

test('a kart is got into by walking into it, driven, and got out of with E, what the driver held put away meanwhile', () => {
  const { room, ids } = kartRoom({ x: 0, y: 0, z: 0 });
  const [id] = ids;
  const me = room.players[0];
  room.receive(id, { t: 'chat', text: '/gun' });
  const kart = getIn(room, id);
  assert.equal(me.item, null, 'the gun put away');
  assert.equal(typeof room.garage.drop(me, 'standard', room.playerCount), 'string', 'no more karts than players');
  const from = room.garage.list[0].pos.z;
  for (let i = 0; i < 2 * TICK_RATE; i++) driving(room, id, 1);
  const k = room.garage.list[0];
  assert.ok(k.pos.z > from + 10, `driven forward: ${k.pos.z}`);
  assert.ok(Math.hypot(me.pos.x - k.pos.x, me.pos.z - k.pos.z) < 1, 'sat in it');
  driving(room, id, 0, ['exit']);
  const out = room.players[0];
  assert.equal(out.riding, null);
  assert.equal(out.item?.id, 'gun', 'the gun handed back');
  assert.equal(room.garage.list[0].driver, null);
  assert.ok(Math.hypot(out.pos.x - k.pos.x, out.pos.z - k.pos.z) > KARTS.standard.body.width / 2, 'stood beside it');
  assert.equal(room.garage.list[0].id, kart);
  // Standing beside it they stay out, and jumping down onto it they're back in.
  for (let i = 0; i < TICK_RATE; i++) tick(room);
  assert.equal(out.riding, null, 'still out');
  out.pos = { x: k.pos.x, y: k.pos.y + KARTS.standard.body.height + EYE_HEIGHT, z: k.pos.z };
  tick(room);
  assert.equal(out.riding, kart, 'in again');
});

test("a driver's late frames step their kart once each, however long the Room drove it on without them", () => {
  // Twenty-five frames on the gas: all on time, or the last fifteen held up past INPUT_WAIT_TICKS
  // and then come at once, to be run several to a tick.
  const driven = (late: boolean): number => {
    const { room, ids } = kartRoom({ x: 0, y: 0, z: 0 });
    const [id] = ids;
    getIn(room, id);
    for (let i = 0; i < 10; i++) driving(room, id, 1);
    const held = INPUT_WAIT_TICKS + 5;
    if (late) for (let i = 0; i < held; i++) room.step();
    for (let i = 0; i < held; i++) {
      room.receive(id, { t: 'input', f: { ...frame(0, []), my: 1 } });
      if (!late) room.step();
    }
    if (late) for (let i = 0; i < held / MAX_INPUTS_PER_TICK; i++) room.step();
    return room.garage.list[0].pos.z;
  };
  assert.equal(driven(true), driven(false));
});

test('a kart hurts whoever it runs into by how fast they closed, credited to its driver', () => {
  const { room, ids, inboxes } = kartRoom({ x: 0, y: 0, z: 0 }, { x: 20, y: 0, z: 0 });
  const [driver, victim] = ids;
  getIn(room, driver);
  const k = room.garage.list[0];
  const bob = room.players.find((p) => p.id === victim)!;
  bob.pos = { x: k.pos.x, y: EYE_HEIGHT, z: k.pos.z + KARTS.standard.body.length / 2 + 0.6 };
  k.vel = { x: 0, y: 0, z: 20 };
  driving(room, driver, 1);
  const hit = inboxes[0].find((m) => m.t === 'hit' && m.victim === victim);
  assert.ok(hit && hit.t === 'hit' && hit.shooter === driver, 'hit, by the driver');
  assert.ok(Math.abs(bob.hearts - (MAX_HEARTS - 5)) < 0.6, `about 5 hearts off at 20 m/s: ${bob.hearts}`);
  assert.equal((bob.hearts * 4) % 1, 0, `in quarters of a heart: ${bob.hearts}`);
  assert.ok(bob.vy > 0, 'thrown');
});

test("a kart worn out by a wall blows up, hurting its driver and everyone near but not by the wall's knock", () => {
  const { room, ids, inboxes } = kartRoom({ x: 0, y: 0, z: 0 }, { x: 20, y: 0, z: 0 });
  const [driver, near] = ids;
  getIn(room, driver);
  const k = room.garage.list[0];
  k.wrenches = 1;
  k.pos.z = 30;
  k.vel = { x: 0, y: 0, z: 20 };
  const carol = room.players.find((p) => p.id === near)!;
  carol.pos = { x: 3, y: EYE_HEIGHT, z: 36 };
  for (let i = 0; i < 20 && room.garage.list.length; i++) driving(room, driver, 1);
  assert.equal(room.garage.list.length, 0, 'blown up');
  assert.ok(inboxes[0].some((m) => m.t === 'boom'));
  const me = room.players.find((p) => p.id === driver)!;
  assert.equal(me.riding, null, 'thrown out');
  assert.ok(me.vz < 0 && me.vy > -me.vz, `up, and back off its tail: ${me.vy}, ${me.vz}`);
  assert.equal(me.hearts, MAX_HEARTS - BLAST.damage);
  assert.equal(carol.hearts, MAX_HEARTS - BLAST.damage);
});

test('a ground pound and a strike that reach a kart wear it, sheltering its driver', () => {
  const { room, ids } = kartRoom({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 });
  const [driver, pounder, striker] = ids;
  getIn(room, driver);
  const k = room.garage.list[0];
  const [them, mario, tung] = ids.map((id) => room.players.find((p) => p.id === id)!);
  room.receive(pounder, { t: 'chat', text: '/mario' });
  room.receive(striker, { t: 'chat', text: '/tung' });
  // Mario 2.5 m off its side and 2 m up, too low for the pound to grow; Tung a metre off its tail.
  mario.pos = { x: k.pos.x + 2.5, y: k.pos.y + EYE_HEIGHT + 2, z: k.pos.z };
  tung.pos = { x: k.pos.x, y: k.pos.y + EYE_HEIGHT, z: k.pos.z - KARTS.standard.body.length / 2 - 1 };
  tung.yaw = 0;
  room.receive(pounder, { t: 'input', f: frame(0, ['pound']) });
  for (let i = 0; i < 2 * TICK_RATE && mario.pound?.stage !== 'land'; i++) tick(room);
  const pounded = KARTS.standard.wrenches - poundOf('mario')!.damage;
  assert.equal(k.wrenches, pounded, 'the pound wears it');
  room.receive(striker, { t: 'input', f: frame(0, ['strike']) });
  for (let i = 0; i <= Math.round(strikeOf('sahur')!.windup * TICK_RATE); i++) tick(room);
  assert.equal(k.wrenches, pounded - strikeOf('sahur')!.damage, 'and so does the strike');
  assert.ok(them.hearts === MAX_HEARTS && them.riding === k.id, 'its driver unhurt and still in it');
});

test('a shot that reaches a kart first wears it, and one over it hits the driver, whose kart rolls on to a stop', () => {
  const { room, ids } = kartRoom({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 });
  const [driver, shooter] = ids;
  getIn(room, driver);
  const k = room.garage.list[0];
  const me = room.players.find((p) => p.id === shooter)!;
  me.pos = { x: k.pos.x + 8, y: EYE_HEIGHT, z: k.pos.z };
  room.receive(shooter, { t: 'chat', text: '/gun' });
  // Level with the kart's side, below the driver sat over it: 0.45 m up, 8 m off.
  press(room, shooter, Math.atan2(EYE_HEIGHT - 0.45, 8), false, -Math.PI / 2);
  assert.equal(room.garage.list[0].wrenches, KARTS.standard.wrenches - ITEMS.gun.damage);
  const them = room.players.find((p) => p.id === driver)!;
  assert.equal(them.hearts, MAX_HEARTS);
  // Shot dead over the kart mid-drift (once the gun can fire again), they're out of it, and it rolls
  // on with no drift and no mini-turbo, slowing.
  for (let i = 0; i < ITEMS.gun.cooldownTicks; i++) tick(room);
  k.vel = { x: -15, y: 0, z: 0 }; // away from the shooter, along the line of the shot
  k.drift = { way: 1, t: 4 * KARTS.standard.miniTurboTime, from: 1 };
  them.hearts = 1;
  const head = them.pos.y - EYE_HEIGHT + AVATARS[them.avatar].hitbox.top * SEATED - 0.1;
  me.pos = { x: them.pos.x + 8, y: EYE_HEIGHT, z: them.pos.z };
  press(room, shooter, Math.atan2(EYE_HEIGHT - head, 8), false, -Math.PI / 2);
  assert.ok(them.dead && them.riding === null, 'dead, and out of it');
  const kart = room.garage.list[0];
  assert.equal(kart.turbo, null);
  const speed = Math.hypot(kart.vel.x, kart.vel.z);
  for (let i = 0; i < TICK_RATE; i++) tick(room);
  assert.ok(Math.hypot(kart.vel.x, kart.vel.z) < speed, 'slowing');
});

test('a kart driven off the world is fished back onto the middle of the road it left, no worse for it', () => {
  // On the road out behind the Krusty Krab, which runs along x, facing its side.
  const { room, ids } = kartRoom({ x: -250, y: 0, z: -6 });
  const [id] = ids;
  const me = room.players[0];
  getIn(room, id);
  const k = room.garage.list[0];
  for (let i = 0; i < 5 * TICK_RATE && !stranded(k); i++) driving(room, id, 1);
  assert.ok(stranded(k), 'down past the edge');
  const [wrenches, hearts] = [k.wrenches, me.hearts];
  for (let i = 0; i < RESCUE.wait * TICK_RATE; i++) driving(room, id, 0);
  assert.ok(k.rescue, 'Lakitu has it');
  driving(room, id, 0, ['exit']);
  assert.equal(me.riding, k.id, "there's no getting out of his hands");
  for (let i = 0; i < 10 * TICK_RATE && k.rescue; i++) driving(room, id, 0);
  for (let i = 0; i < TICK_RATE / 2; i++) driving(room, id, 0);
  assert.ok(
    k.grounded && k.pos.y === 0 && Math.abs(k.pos.z) < 0.5,
    `in the middle of the road: ${k.pos.y}, ${k.pos.z}`,
  );
  assert.ok(Math.abs(Math.sin(k.yaw)) > 0.99, `turned along it: ${k.yaw}`);
  assert.equal(me.riding, k.id, 'its driver still in it');
  assert.deepEqual([k.wrenches, me.hearts], [wrenches, hearts], 'neither the worse for it');
});
