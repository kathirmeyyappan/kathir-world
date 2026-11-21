// A look's livery: the two colours and the emblem that whatever is made out in its wearer's name
// wears, as a kart they drop does (vehicles/KartMesh.ts). The primary is the colour the look is
// known by, which its wearer is named and marked in (`nameColour`), and the secondary the one that
// goes with it; the emblem names a picture of its badge,
// the look's mark on an off-white disc that fills the picture edge to edge
// (/assets/textures/emblems/<emblem>.png, about 5 KB, fetched by whatever first draws it).
import type { Appearance, AvatarId } from '@world/shared';

export interface Livery {
  primary: string;
  secondary: string;
  emblem: string;
}

// What a look's row leaves unsaid, and all of it for a look with no row: its wearer's colour over
// black, round the site's logo (Elizabeth).
const BLACK = '#1d1d1f';
const SITE_EMBLEM = 'elizabeth';

// What of each look's livery is its own. The Mario family's are Mario Kart 8's: the colours
// scripts/kart-model.py prints from the Standard Kart's rip, and that game's emblems. Elizabeth's
// colours are her white and the orange of her feet, and the site's logo (scripts/emblems.py) is her.
const LIVERIES: Partial<Record<AvatarId, Partial<Livery>>> = {
  mario: { primary: '#aa0f10', secondary: '#183ab9', emblem: 'mario' },
  luigi: { primary: '#156d05', secondary: '#10287e', emblem: 'luigi' },
  wario: { primary: '#ffb800', secondary: '#761f7b', emblem: 'wario' },
  waluigi: { primary: '#130057', secondary: '#6b0f94', emblem: 'waluigi' },
  peach: { primary: '#e15660', secondary: '#c0a20b', emblem: 'peach' },
  daisy: { primary: '#eba800', secondary: '#cb6a00', emblem: 'daisy' },
  elizabeth: { primary: '#fefef2', secondary: '#fbce70' },
};

// The livery of someone who appears as `who`.
export function liveryOf(who: Appearance): Livery {
  return { primary: who.color, secondary: BLACK, emblem: SITE_EMBLEM, ...LIVERIES[who.avatar] };
}

const LEGIBLE = 0.25; // how light a colour has to be, 0 to 1, to read on the dark names are drawn over
const named = new Map<string, string>();

// The colour someone who appears as `who` goes by wherever they're named or marked (the roster, a
// name tag, a pin, an arrow on a map, the chat): their livery's primary, lightened where it's too
// dark to read there.
export function nameColour(who: Appearance): string {
  const key = `${who.avatar}:${who.color}`;
  let colour = named.get(key);
  if (!colour) named.set(key, (colour = legible(liveryOf(who).primary)));
  return colour;
}

// A hex colour, brought toward white as far as makes it LEGIBLE.
function legible(hex: string): string {
  const rgb = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const light = (0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2]) / 255;
  if (light >= LEGIBLE) return hex;
  const lift = (LEGIBLE - light) / (1 - light);
  return `#${rgb
    .map((v) =>
      Math.round(v + (255 - v) * lift)
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;
}

export function emblemUrl(emblem: string): string {
  return `/assets/textures/emblems/${emblem}.png`;
}
