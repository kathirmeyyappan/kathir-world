// Sandy Cheeks: 2.85 m of squirrel in her air suit, from Cheryl Hill's Battle for Bikini Bottom
// Rehydrated model (sandyModel.ts, made by scripts/avatar-model.py), skinned over seven bones: the
// suit, her head inside the helmet, the arms, the legs and the tail. The helmet is glass, which the
// model leaves out and this draws: a clear dome on the suit, the flower on top of it, her head
// turning inside it with the look. Her tail sways on its own. She dies flat on her back with the
// tail out to one side. Worn with /sandy; her hit capsule is AVATARS.sandy.hitbox.
import { Color3, MeshBuilder, StandardMaterial, TransformNode, Vector3 } from '@babylonjs/core';
import type { Engine } from '../Engine';
import { SANDY_MODEL } from './sandyModel';
import { SkinnedBody } from './skinned';
import type { Figure } from './Walker';

const LEG_SWING = 0.7; // radians each way at a full-speed walk
const AIR_LEGS = 0.4;
const ARM_SWING = 0.6;
const ARMS_DOWN = 1.25; // the model holds her arms straight out
const BOB = 0.065; // metres the body rises mid-stride
const HEAD_FOLLOW = 0.5; // how much of the look's pitch the head takes
const TAIL_SWAY = 0.18; // radians each way, all the time
const TAIL_SWAY_MS = 1400;
// Lying on her back: radians the legs and arms drop toward the ground.
const DEAD_LEGS = 1.0;
const DEAD_ARMS = 1.2;
// Where an item's handle goes from the end of her arm, in the grip's frame: back into her glove,
// low enough that the item's body lies on top of it.
const HOLD = new Vector3(0, 0.03, 0.05);
const GLASS_ALPHA = 0.16; // how much of the helmet's glass shows: a sheen, the head plain through it
const GLASS_SEGMENTS = 14;

type Bone = keyof typeof SANDY_MODEL.bones;
const PARENTS: Record<Bone, Bone | null> = {
  body: null,
  head: 'body',
  armL: 'body',
  armR: 'body',
  legL: 'body',
  legR: 'body',
  tail: 'body',
};

export function buildSandy(engine: Engine, id: string, base: TransformNode): Figure {
  const swayOffset = [...id].reduce((h, c) => h * 31 + c.charCodeAt(0), 7) % TAIL_SWAY_MS;
  const skin = new SkinnedBody(engine, `sandy-${id}`, SANDY_MODEL, 'sandy', PARENTS, base);
  const body = skin.node('body');
  const head = skin.node('head');
  const armR = skin.node('armR');
  const tail = skin.node('tail');

  // The helmet: a dome as big as the model's glass, on the suit.
  const [across, up, through] = SANDY_MODEL.glass.size;
  const helmet = MeshBuilder.CreateSphere(
    `sandy-helmet-${id}`,
    { diameterX: across, diameterY: up, diameterZ: through, segments: GLASS_SEGMENTS },
    engine.scene,
  );
  const glass = new StandardMaterial(`sandy-glass-${id}`, engine.scene);
  glass.diffuseColor = new Color3(0.75, 0.9, 1);
  glass.emissiveColor = new Color3(0.3, 0.38, 0.45);
  glass.specularColor = new Color3(1, 1, 1);
  glass.specularPower = 48;
  glass.alpha = GLASS_ALPHA;
  helmet.material = glass;
  helmet.isPickable = false;
  helmet.parent = body;
  helmet.position.copyFrom(skin.offset('body', SANDY_MODEL.glass.at));

  // A held item goes in the right palm; the flamethrower's tank hangs on the back below the shoulders.
  const grip = new TransformNode(`avatar-grip-${id}`, engine.scene);
  grip.parent = armR;
  grip.position.copyFrom(skin.offset('armR', SANDY_MODEL.hand));
  const reach = grip.position.normalizeToNew();

  return {
    tilt: { node: head, follow: HEAD_FOLLOW },
    head,
    legs: [
      { node: skin.node('legL'), side: 1 },
      { node: skin.node('legR'), side: -1 },
    ],
    armL: { node: skin.node('armL'), reach: new Vector3(-reach.x, reach.y, reach.z) },
    armR: { node: armR, grip, reach, hold: HOLD },
    back: { node: body, at: skin.offset('body', SANDY_MODEL.back) },
    materials: [skin.material],
    shadow: 1.55,
    legSwing: LEG_SWING,
    airLegs: AIR_LEGS,
    armSwing: ARM_SWING,
    armsDown: ARMS_DOWN,
    bob: BOB,
    // On her back she lies on her suit, as far up as its back is behind her, not propped on the
    // helmet or the tail, which reach further back.
    lie: { onto: 'back', height: -SANDY_MODEL.back[2], legs: DEAD_LEGS, arms: DEAD_ARMS },
    // The tail sways on its own; dead, it lies out to one side, out of the floor.
    extra: (p) => {
      tail.rotation.y = p.dead
        ? Math.PI / 2
        : Math.sin(((performance.now() + swayOffset) / TAIL_SWAY_MS) * 2 * Math.PI) * TAIL_SWAY;
    },
    dispose: () => skin.dispose(),
  };
}
