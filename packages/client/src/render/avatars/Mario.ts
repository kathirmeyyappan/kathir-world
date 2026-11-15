// Mario: 2 m of plumber, as tall as the standard body, from Mario Kart 8's model (marioModel.ts,
// made by scripts/jointed-model.py), a jointed body (Jointed.ts) moving as Super Mario 64 moved
// him (sm64.ts). Worn with /mario; his hit capsule is AVATARS.mario.hitbox.
import type { JointedSpec } from './Jointed';
import { MARIO_MODEL } from './marioModel';
import { SM64_STYLE } from './sm64';

export const MARIO: JointedSpec = { kind: 'mario', model: MARIO_MODEL, style: SM64_STYLE, shadow: 1.2 };
