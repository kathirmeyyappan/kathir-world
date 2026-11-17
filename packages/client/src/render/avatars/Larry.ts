// Larry the Lobster: 2.9 m of lifeguard to the top of his head, his antennae 3.65 m up, from Cheryl
// Hill's Battle for Bikini Bottom Rehydrated model (larryModel.ts, made by scripts/avatar-model.py),
// skinned over seven bones: the trunk, the head with its eyestalks and antennae, the arms out to
// their claws, the legs and the tail. His head turns with the look and a held item sits in his right
// claw. Worn with /larry; his hit capsule is AVATARS.larry.hitbox.
import { TransformNode, Vector3 } from '@babylonjs/core';
import type { Engine } from '../Engine';
import { LARRY_MODEL } from './larryModel';
import { SkinnedBody } from './skinned';
import type { Figure } from './Walker';

const LEG_SWING = 0.6; // radians each way at a full-speed walk
const AIR_LEGS = 0.35;
const ARM_SWING = 0.35;
const ARMS_DOWN = 1.15; // the model holds his arms straight out
const BOB = 0.07; // metres the body rises mid-stride
const HEAD_FOLLOW = 0.5; // how much of the look's pitch the head takes
const TAIL_SWAY = 0.12; // radians each way, in time with his steps
// Lying on his back: radians the legs and arms drop toward the ground.
const DEAD_LEGS = 1.0;
const DEAD_ARMS = 1.2;
// The guns and packs were made for a person, a little over half his height.
const ITEM_SCALE = { weapons: 1.7, packs: 1.5 };
// A quarter turn of the claw as it aims: its pincers, one over the other at rest, close on a
// handle from either side.
const CLAW_ROLL = Math.PI / 2;

type Bone = keyof typeof LARRY_MODEL.bones;
const PARENTS: Record<Bone, Bone | null> = {
  body: null,
  head: 'body',
  armL: 'body',
  armR: 'body',
  legL: 'body',
  legR: 'body',
  tail: 'body',
};

export function buildLarry(engine: Engine, id: string, base: TransformNode): Figure {
  const skin = new SkinnedBody(engine, `larry-${id}`, LARRY_MODEL, 'larry', PARENTS, base);
  const body = skin.node('body');
  const head = skin.node('head');
  const armR = skin.node('armR');
  const legL = skin.node('legL');
  const tail = skin.node('tail');

  // A held item goes in the right claw; the flamethrower's tank hangs on the back.
  const grip = new TransformNode(`avatar-grip-${id}`, engine.scene);
  grip.parent = armR;
  grip.position.copyFrom(skin.offset('armR', LARRY_MODEL.hand));
  const reach = grip.position.normalizeToNew();

  return {
    tilt: { node: head, follow: HEAD_FOLLOW },
    head,
    legs: [
      { node: legL, side: 1 },
      { node: skin.node('legR'), side: -1 },
    ],
    armL: { node: skin.node('armL'), reach: new Vector3(-reach.x, reach.y, reach.z) },
    armR: { node: armR, grip, reach, roll: CLAW_ROLL },
    back: { node: body, at: skin.offset('body', LARRY_MODEL.back) },
    materials: [skin.material],
    shadow: 1.5,
    itemScale: ITEM_SCALE,
    legSwing: LEG_SWING,
    airLegs: AIR_LEGS,
    armSwing: ARM_SWING,
    armsDown: ARMS_DOWN,
    bob: BOB,
    // On his back he lies on his shell, as far up as it is behind him; the tail, which reaches
    // further back, lies out to one side.
    lie: { onto: 'back', height: -LARRY_MODEL.back[2], legs: DEAD_LEGS, arms: DEAD_ARMS },
    // The tail swings against the left leg.
    extra: (p) => {
      tail.rotation.y = p.dead ? Math.PI / 2 : -(legL.rotation.x / LEG_SWING) * TAIL_SWAY;
    },
    dispose: () => skin.dispose(),
  };
}
