// A look's livery: the two colours and the emblem that whatever is made out in its wearer's name
// wears, as a kart they drop does (vehicles/KartMesh.ts). The primary is the colour the look is
// known by and the secondary the one that goes with it; the emblem names a picture of its badge,
// the look's mark on a disc that fills the picture edge to edge
// (/assets/textures/emblems/<emblem>.png, about 5 KB, fetched by whatever first draws it).
import type { Appearance, AvatarId } from '@world/shared';
import { pixelsOf } from './pictures';

export interface Livery {
  primary: string;
  secondary: string;
  emblem: string;
}

// What a look's row leaves unsaid, and all of it for a look with no row: its wearer's colour over
// black, and a K on a white disc. The K's picture has it in INK, which is painted over in the
// livery's primary as it's drawn (`emblemPixels`), so the one picture serves every colour.
const BLACK = '#1d1d1f';
const DEFAULT_EMBLEM = 'k';
const INK = [255, 0, 0];

// What of each look's livery is its own. The Mario family's are Mario Kart 8's: the colours
// scripts/kart-model.py prints from the Standard Kart's rip, and that game's emblems. Elizabeth's
// colours are her white and the orange of her feet, and her emblem the site's logo, which is her
// (scripts/emblems.py draws it, and the default's).
const LIVERIES: Partial<Record<AvatarId, Partial<Livery>>> = {
  mario: { primary: '#aa0f10', secondary: '#183ab9', emblem: 'mario' },
  luigi: { primary: '#156d05', secondary: '#10287e', emblem: 'luigi' },
  wario: { primary: '#ffb800', secondary: '#761f7b', emblem: 'wario' },
  waluigi: { primary: '#130057', secondary: '#6b0f94', emblem: 'waluigi' },
  peach: { primary: '#e15660', secondary: '#c0a20b', emblem: 'peach' },
  daisy: { primary: '#eba800', secondary: '#cb6a00', emblem: 'daisy' },
  elizabeth: { primary: '#fefef2', secondary: '#fbce70', emblem: 'elizabeth' },
};

// The livery of someone who appears as `who`.
export function liveryOf(who: Appearance): Livery {
  return { primary: who.color, secondary: BLACK, emblem: DEFAULT_EMBLEM, ...LIVERIES[who.avatar] };
}

// A livery's emblem as it's drawn: its picture, the default's K in the livery's primary.
export async function emblemPixels(livery: Livery): Promise<ImageData> {
  const drawn = await pixelsOf(`/assets/textures/emblems/${livery.emblem}.png`);
  if (livery.emblem === DEFAULT_EMBLEM) ink(drawn, livery.primary);
  return drawn;
}

// What tells a livery's emblem as it's drawn from every other's, for whatever keeps one.
export function emblemKey(livery: Livery): string {
  return livery.emblem === DEFAULT_EMBLEM ? `${livery.emblem}:${livery.primary}` : livery.emblem;
}

// Paints `colour` over a picture's INK: each pixel by as much of it as is ink, so an edge the ink
// shares with another colour stays smooth.
function ink(picture: ImageData, colour: string): void {
  const paint = [1, 3, 5].map((i) => parseInt(colour.slice(i, i + 2), 16));
  const { data } = picture;
  for (let i = 0; i < data.length; i += 4) {
    const share = Math.max(0, data[i] - data[i + 1]) / 255;
    for (let c = 0; c < 3; c++) data[i + c] += share * (paint[c] - INK[c]);
  }
}
