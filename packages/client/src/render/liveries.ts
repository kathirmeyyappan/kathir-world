// A look's livery: the two colours and the emblem that whatever is made out in its wearer's name
// wears, as a kart they drop does (vehicles/KartMesh.ts). The primary is the colour the look is
// known by, which its wearer is named and marked in (`nameColour`), and the secondary the one that
// goes with it; the emblem names a picture of its badge, the look's mark on a disc that fills the
// picture edge to edge
// (/assets/textures/emblems/<emblem>.png, about 5 KB, fetched by whatever first draws it).
import type { Appearance, AvatarId } from '@world/shared';
import { pixelsOf } from './pictures';

export interface Livery {
  primary: string;
  secondary: string;
  emblem: string;
}

// What a look's row leaves unsaid, and all of it for a look with no row: its wearer's colour over
// black, and the game's initials on a white disc, the K over the W on a diagonal. Their picture
// has them in INK, which is painted over in the livery's primary as it's drawn (`emblemPixels`),
// so the one picture serves every colour.
const BLACK = '#1d1d1f';
const DEFAULT_EMBLEM = 'kw';
const INK = [255, 0, 0];

// What of each look's livery is its own. The Mario family's are Mario Kart 8's: the colours
// scripts/kart-model.py prints from the Standard Kart's rip, and that game's emblems. Elizabeth's
// colours are her white and the orange of her feet, and her emblem the site's logo, which is her
// (scripts/emblems.py draws it, the default's, and every mark made here). Every other look's are
// two colours off its own model, what most of it is and what it wears or is marked with, and
// where it has one a mark of its own, a picture of them or of something of theirs (what each is,
// beside its row in scripts/emblems.py).
const LIVERIES: Partial<Record<AvatarId, Partial<Livery>>> = {
  mario: { primary: '#aa0f10', secondary: '#183ab9', emblem: 'mario' },
  luigi: { primary: '#156d05', secondary: '#10287e', emblem: 'luigi' },
  wario: { primary: '#ffb800', secondary: '#761f7b', emblem: 'wario' },
  waluigi: { primary: '#130057', secondary: '#6b0f94', emblem: 'waluigi' },
  peach: { primary: '#e15660', secondary: '#c0a20b', emblem: 'peach' },
  daisy: { primary: '#eba800', secondary: '#cb6a00', emblem: 'daisy' },
  elizabeth: { primary: '#fefef2', secondary: '#fbce70', emblem: 'elizabeth' },
  spongebob: { primary: '#f5e653', secondary: '#a87424', emblem: 'spongebob' },
  patrick: { primary: '#e98a8a', secondary: '#7fae3c', emblem: 'patrick' },
  krabs: { primary: '#e0142a', secondary: '#6c84cc', emblem: 'krabs' },
  squidward: { primary: '#c4e0de', secondary: '#e09a14', emblem: 'squidward' },
  gary: { primary: '#e4b8c4', secondary: '#6ccccc', emblem: 'gary' },
  plankton: { primary: '#4f8068', secondary: '#74787c', emblem: 'plankton' },
  sandy: { primary: '#c8935f', secondary: '#f6f6f2', emblem: 'sandy' },
  puff: { primary: '#d9a84a', secondary: '#246cb4', emblem: 'puff' },
  larry: { primary: '#f05048', secondary: '#2a5fc8', emblem: 'larry' },
  sahur: { primary: '#b8834a', secondary: '#6b4423', emblem: 'sahur' },
  mike: { primary: '#8cc832', secondary: '#2f9c8f', emblem: 'monsters' },
  sulley: { primary: '#19a9b4', secondary: '#7a4fb0', emblem: 'monsters' },
  'light-dragon': { primary: '#ead9bd', secondary: '#e4b43c' },
  colgera: { primary: '#9fdcf5', secondary: '#24243c' },
};

// The livery of someone who appears as `who`.
export function liveryOf(who: Appearance): Livery {
  return { primary: who.color, secondary: BLACK, emblem: DEFAULT_EMBLEM, ...LIVERIES[who.avatar] };
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
  const rgb = rgbOf(hex);
  const light = (0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2]) / 255;
  if (light >= LEGIBLE) return hex;
  const lift = (LEGIBLE - light) / (1 - light);
  return `#${rgb.map((v) => hexOf(v + (255 - v) * lift)).join('')}`;
}

// A livery's emblem as it's drawn: its picture, the default's letters in the livery's primary.
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
  const paint = rgbOf(colour);
  const { data } = picture;
  for (let i = 0; i < data.length; i += 4) {
    const share = Math.max(0, data[i] - data[i + 1]) / 255;
    for (let c = 0; c < 3; c++) data[i + c] += share * (paint[c] - INK[c]);
  }
}

// A hex colour's red, green and blue, 0 to 255, and one of them back as its two hex digits.
function rgbOf(hex: string): number[] {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
}

function hexOf(part: number): string {
  return Math.round(part).toString(16).padStart(2, '0');
}
