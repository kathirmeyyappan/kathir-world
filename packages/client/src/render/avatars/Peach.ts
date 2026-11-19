// Peach: 2.5 m of princess, from Mario Kart 8's model (peachModel.ts, made by
// scripts/jointed-model.py), a jointed body (Jointed.ts). Where she moves her own way the clips are
// Super Smash Bros. Brawl's own of her (peachClips.ts, made by scripts/peach-clips.py): standing,
// her walk and the quick walk she has in a run's place, her jump, fall and landing, and her float.
// The rest are the family's (sm64.ts). Her skirt and her ponytail move by themselves (soft.ts). Worn with /peach;
// her hit capsule is AVATARS.peach.hitbox.
// In a kart she drives as Mario Kart 8 Deluxe has her drive (peachKartClips.ts, made by
// scripts/kart-clips.py).
import type { JointedSpec } from './Jointed';
import { PEACH_KART_CLIPS } from './peachKartClips';
import { PEACH_MODEL } from './peachModel';
import { PEACH_STYLE } from './peachStyle';

export const PEACH: JointedSpec = {
  kind: 'peach',
  model: PEACH_MODEL,
  style: PEACH_STYLE,
  kart: PEACH_KART_CLIPS,
  shadow: 1.3,
  // Out of its band going back and down, then hanging.
  tail: [
    [0, -0.6, -0.8],
    [0, -0.95, -0.3],
    [0, -1, -0.05],
  ],
};
