// Waluigi: 3.1 m of him, half again as tall as Mario as Mario Kart 8's models stand, nearly half
// of it legs (waluigiModel.ts, made by scripts/jointed-model.py), a jointed body (Jointed.ts) on
// Mario's rig, moved by Mario's clips as they are. Worn with /waluigi; his hit capsule is
// AVATARS.waluigi.hitbox.
import type { JointedSpec } from './Jointed';
import { MARIO_STYLE } from './Mario';
import { WALUIGI_MODEL } from './waluigiModel';

export const WALUIGI: JointedSpec = { kind: 'waluigi', model: WALUIGI_MODEL, style: MARIO_STYLE, shadow: 1.2 };
