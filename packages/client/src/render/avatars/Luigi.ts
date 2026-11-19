// Luigi: 2.2 m of the taller brother, as Mario Kart 8's model stands beside Mario's (luigiModel.ts,
// made by scripts/jointed-model.py), a jointed body (Jointed.ts) on Mario's rig. He moves as Mario
// does, by the same clips drawn for his longer legs, but in the air his legs scuttle, running on
// the whole way up and down. Worn with /luigi; his hit capsule is AVATARS.luigi.hitbox.
// In a kart he drives as Mario Kart 8 Deluxe has him drive (luigiKartClips.ts, made by
// scripts/kart-clips.py).
import type { JointedSpec, Style } from './Jointed';
import { LUIGI_KART_CLIPS } from './luigiKartClips';
import { LUIGI_MODEL } from './luigiModel';
import { SM64_STYLE } from './sm64';

export const LUIGI_STYLE: Style = { ...SM64_STYLE, flutter: 3 };

export const LUIGI: JointedSpec = {
  kind: 'luigi',
  model: LUIGI_MODEL,
  style: LUIGI_STYLE,
  kart: LUIGI_KART_CLIPS,
  shadow: 1.2,
};
