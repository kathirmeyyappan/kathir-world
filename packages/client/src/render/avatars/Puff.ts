// Mrs. Puff: 2.55 m of pufferfish in her sailor dress and hat, from Cheryl Hill's Battle for Bikini
// Bottom Rehydrated model (puffModel.ts, made by scripts/avatar-model.py), skinned over six bones:
// the round body with its skirt, the head, the arms and the short legs under the skirt. Her head
// turns with the look. Worn with /puff; her hit capsule is AVATARS.puff.hitbox.
import { TransformNode, Vector3 } from '@babylonjs/core';
import type { Engine } from '../Engine';
import { PUFF_MODEL } from './puffModel';
import { SkinnedBody } from './skinned';
import type { Figure } from './Walker';

const LEG_SWING = 0.6; // radians each way at a full-speed walk
const AIR_LEGS = 0.3;
const ARM_SWING = 0.4;
const ARMS_DOWN = 1.0; // the model holds her arms straight out; let down they rest on the skirt
const BOB = 0.06; // metres the body rises mid-stride
const SWAY = 0.05; // radians she rocks from foot to foot
const HEAD_FOLLOW = 0.5; // how much of the look's pitch the head takes
// Lying on her back: radians the legs and arms drop toward the ground.
const DEAD_LEGS = 0.6;
const DEAD_ARMS = 0.9;
// A fin is a flat blade with nothing to close round a handle: aiming, it's turned on edge
// (FIN_ROLL) and the handle lies against its inner face, up where the item's body clears its top
// edge. Where the handle goes from the fin's middle, in the grip's frame.
const HOLD = new Vector3(-0.06, 0, 0.12);
const FIN_ROLL = Math.PI / 2;
const LIES = 0.85; // metres her middle lies off the ground: on the back of her body, the skirt's rim crushed under it

type Bone = keyof typeof PUFF_MODEL.bones;
const PARENTS: Record<Bone, Bone | null> = {
  body: null,
  head: 'body',
  armL: 'body',
  armR: 'body',
  legL: 'body',
  legR: 'body',
};

export function buildPuff(engine: Engine, id: string, base: TransformNode): Figure {
  const skin = new SkinnedBody(engine, `puff-${id}`, PUFF_MODEL, 'puff', PARENTS, base);
  const body = skin.node('body');
  const head = skin.node('head');
  const armR = skin.node('armR');

  // A held item goes in the right palm; the flamethrower's tank hangs on the back.
  const grip = new TransformNode(`avatar-grip-${id}`, engine.scene);
  grip.parent = armR;
  grip.position.copyFrom(skin.offset('armR', PUFF_MODEL.hand));
  const reach = grip.position.normalizeToNew();

  return {
    tilt: { node: head, follow: HEAD_FOLLOW },
    head,
    legs: [
      { node: skin.node('legL'), side: 1 },
      { node: skin.node('legR'), side: -1 },
    ],
    armL: { node: skin.node('armL'), reach: new Vector3(-reach.x, reach.y, reach.z) },
    armR: { node: armR, grip, reach, hold: HOLD, roll: FIN_ROLL },
    back: { node: body, at: skin.offset('body', PUFF_MODEL.back) },
    materials: [skin.material],
    shadow: 1.9,
    legSwing: LEG_SWING,
    airLegs: AIR_LEGS,
    armSwing: ARM_SWING,
    armsDown: ARMS_DOWN,
    bob: BOB,
    sway: SWAY,
    lie: { onto: 'back', height: LIES, legs: DEAD_LEGS, arms: DEAD_ARMS },
    dispose: () => skin.dispose(),
  };
}
