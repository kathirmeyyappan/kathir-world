// Wario: 2.2 m of him, as tall as Luigi and half again as wide, from Mario Kart 8's model
// (warioModel.ts, made by scripts/jointed-model.py), a jointed body (Jointed.ts) on Mario's rig,
// moved by Mario's clips on his own short, wide-set legs, his arms held closer and his body
// rocking over each step: a waddle. Worn with /wario; his hit capsule is
// AVATARS.wario.hitbox.
// In a kart he drives as Mario Kart 8 Deluxe has him drive (warioKartClips.ts, made by
// scripts/kart-clips.py).
import type { JointedSpec, Style } from './Jointed';
import { WARIO_KART_CLIPS } from './warioKartClips';
import { WARIO_MODEL } from './warioModel';
import { SM64_STYLE } from './sm64';

// Mario's stride with most of the arms' swing taken out of it, rocking from foot to foot.
export const WARIO_STYLE: Style = { ...SM64_STYLE, arms: 0.35, waddle: 0.07 };

export const WARIO: JointedSpec = {
  kind: 'wario',
  model: WARIO_MODEL,
  style: WARIO_STYLE,
  kart: WARIO_KART_CLIPS,
  shadow: 1.7,
};
