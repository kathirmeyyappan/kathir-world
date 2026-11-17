// Mike Wazowski (Monsters, Inc.): a 1.4 m green ball with one eye, on two short legs, from
// Guilherme Navarro's low-poly model (mikeModel.ts, made by scripts/avatar-model.py), a Body
// (Body.ts): the ball is head and body in one. Worn with /mike or /wazowski; its hit capsule is
// AVATARS.mike.hitbox.
import type { BodySpec } from './Body';
import { MIKE_MODEL } from './mikeModel';

export const MIKE: BodySpec = {
  kind: 'mike',
  model: MIKE_MODEL,
  shadow: 1.1,
  legSwing: 0.7,
  armSwing: 0.45,
  bob: 0.03,
  follow: 0.35,
  // The handle stands in his cupped palm, the item's body on his fingers.
  hold: [-0.03, -0.08, -0.05],
};
