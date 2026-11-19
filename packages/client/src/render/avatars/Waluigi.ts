// Waluigi: 3.1 m of him, half again as tall as Mario as Mario Kart 8's models stand, nearly half
// of it legs (waluigiModel.ts, made by scripts/jointed-model.py), a jointed body (Jointed.ts) on
// Mario's rig, moved by Mario's clips as they are. Worn with /waluigi; his hit capsule is
// AVATARS.waluigi.hitbox.
// In a kart he drives as Mario Kart 8 Deluxe has him drive (waluigiKartClips.ts, made by
// scripts/kart-clips.py).
import type { JointedSpec } from './Jointed';
import { WALUIGI_KART_CLIPS } from './waluigiKartClips';
import { WALUIGI_MODEL } from './waluigiModel';
import { SM64_STYLE } from './sm64';

export const WALUIGI: JointedSpec = {
  kind: 'waluigi',
  model: WALUIGI_MODEL,
  style: SM64_STYLE,
  kart: WALUIGI_KART_CLIPS,
  shadow: 1.2,
};
