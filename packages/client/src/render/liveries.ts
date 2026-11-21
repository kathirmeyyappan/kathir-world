// A look's livery: the two colours and the emblem that whatever is made out in its wearer's name
// wears, as a kart they drop does (vehicles/KartMesh.ts). The primary is the colour the look is
// known by and the secondary the one that goes with it; the emblem names a picture of its badge,
// the look's mark on an off-white disc that fills the picture edge to edge
// (/assets/textures/emblems/<emblem>.png, about 5 KB, fetched by whatever first draws it).
import type { AvatarId } from '@world/shared';

export interface Livery {
  primary: string;
  secondary: string;
  emblem: string;
}

export const MARIO_LIVERY: Livery = { primary: '#aa0f10', secondary: '#183ab9', emblem: 'mario' };

// The Mario family's are Mario Kart 8's: the colours scripts/kart-model.py prints from the
// Standard Kart's rip, and that game's emblems.
const LIVERIES: Partial<Record<AvatarId, Livery>> = {
  mario: MARIO_LIVERY,
  luigi: { primary: '#156d05', secondary: '#10287e', emblem: 'luigi' },
  wario: { primary: '#ffb800', secondary: '#761f7b', emblem: 'wario' },
  waluigi: { primary: '#130057', secondary: '#6b0f94', emblem: 'waluigi' },
  peach: { primary: '#e15660', secondary: '#c0a20b', emblem: 'peach' },
  daisy: { primary: '#eba800', secondary: '#cb6a00', emblem: 'daisy' },
};

// The livery of whoever wears `look`: null for a look that has none.
export function liveryOf(look: AvatarId): Livery | null {
  return LIVERIES[look] ?? null;
}

export function emblemUrl(emblem: string): string {
  return `/assets/textures/emblems/${emblem}.png`;
}
