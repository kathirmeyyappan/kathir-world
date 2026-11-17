// Mr. Krabs: a 2.4 m red crab in a light blue shirt and blue trousers, his eyes on stalks a head
// above the shell his face is on, from Anthony Yanez's model (krabsModel.ts, made by
// scripts/avatar-model.py), a Body (Body.ts): the shell is head and body in one, and the claws are
// its arms. Worn with /krabs; its hit capsule is AVATARS.krabs.hitbox.
import type { BodySpec } from './Body';
import { KRABS_MODEL } from './krabsModel';

export const KRABS: BodySpec = {
  kind: 'krabs',
  model: KRABS_MODEL,
  shadow: 1.5,
  // A scuttle: tiny quick steps, about sixteen a second at a full walk, two a cycle, as in his
  // scuttle loop (audio/Footsteps.ts), with the body rocking from side to side and the claws held up.
  legSwing: 0.35,
  armSwing: 0.1,
  armsDown: 0.7,
  bob: 0.015,
  sway: 0.06,
  follow: 0.3,
  // His claw is two lobes with a notch between them, which opens downward as the model holds it:
  // aiming, the claw is turned over, and an item's handle stands in the notch, against the front
  // lobe, with its body lying over that lobe's tip.
  roll: Math.PI,
  hold: [-0.05, 0.03, 0.31],
  doubleSided: true, // the shirt and shell are open shells: under the chin you look into the collar
};
