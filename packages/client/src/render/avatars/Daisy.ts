// Daisy: 2.4 m of princess, from Mario Kart 8's model (daisyModel.ts, made by
// scripts/jointed-model.py), a jointed body (Jointed.ts) on Peach's rig, skirt and all, moved by
// Peach's clips as they are (peachStyle.ts). Her skirt moves by itself (soft.ts); her hair is short and
// stays on her head. Worn with /daisy; her hit capsule is AVATARS.daisy.hitbox.
import type { JointedSpec } from './Jointed';
import { DAISY_MODEL } from './daisyModel';
import { PEACH_STYLE } from './peachStyle';

export const DAISY: JointedSpec = { kind: 'daisy', model: DAISY_MODEL, style: PEACH_STYLE, shadow: 1.3 };
