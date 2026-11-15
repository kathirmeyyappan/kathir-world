// Peach: 2.5 m of princess, from Mario Kart 8's model (peachModel.ts, made by
// scripts/jointed-model.py), a jointed body (Jointed.ts). Where she moves her own way the clips are
// Super Smash Bros. Brawl's own of her (peachClips.ts, made by scripts/peach-clips.py): standing,
// her walk and the quick walk she has in a run's place, her jump, fall and landing, and her float.
// The rest are the family's (sm64.ts). Her skirt and her ponytail move by themselves (soft.ts). Worn with /peach;
// her hit capsule is AVATARS.peach.hitbox.
import type { JointedSpec, Style } from './Jointed';
import { PEACH_CLIPS } from './peachClips';
import { PEACH_MODEL } from './peachModel';
import { SM64_STYLE } from './sm64';

// Her arms held closer through a stride than the clips swing them: she doesn't flail.
export const PEACH_STYLE: Style = {
  ...SM64_STYLE,
  clips: { ...SM64_STYLE.clips, ...PEACH_CLIPS },
  arms: 0.4,
};

export const PEACH: JointedSpec = {
  kind: 'peach',
  model: PEACH_MODEL,
  style: PEACH_STYLE,
  shadow: 1.3,
  // Out of its band going back and down, then hanging.
  tail: [
    [0, -0.6, -0.8],
    [0, -0.95, -0.3],
    [0, -1, -0.05],
  ],
};
