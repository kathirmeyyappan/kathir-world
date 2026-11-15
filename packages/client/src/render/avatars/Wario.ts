// Wario: 2.2 m of him, as tall as Luigi and half again as wide, from Mario Kart 8's model
// (warioModel.ts, made by scripts/jointed-model.py), a jointed body (Jointed.ts) on Mario's rig,
// moved by Mario's clips on his own short, wide-set legs. Worn with /wario; his hit capsule is
// AVATARS.wario.hitbox.
import type { JointedSpec } from './Jointed';
import { MARIO_STYLE } from './Mario';
import { WARIO_MODEL } from './warioModel';

export const WARIO: JointedSpec = { kind: 'wario', model: WARIO_MODEL, style: MARIO_STYLE, shadow: 1.7 };
