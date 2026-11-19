// Mario: 2 m of plumber, as tall as the standard body, from Mario Kart 8's model (marioModel.ts,
// made by scripts/jointed-model.py), a jointed body (Jointed.ts) moving as Super Mario 64 moved
// him (sm64.ts). Worn with /mario; his hit capsule is AVATARS.mario.hitbox.
// In a kart he drives as Mario Kart 8 Deluxe has him drive (marioKartClips.ts, made by
// scripts/kart-clips.py).
import type { JointedSpec } from './Jointed';
import { MARIO_KART_CLIPS } from './marioKartClips';
import { MARIO_MODEL } from './marioModel';
import { SM64_STYLE } from './sm64';

export const MARIO: JointedSpec = {
  kind: 'mario',
  model: MARIO_MODEL,
  style: SM64_STYLE,
  kart: MARIO_KART_CLIPS,
  shadow: 1.2,
};
