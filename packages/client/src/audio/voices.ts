// What a character says in its own voice: every one has a row, and its intro is the line each is
// expected to have (none, until its recording is added); the rest only some have: a jump, a long
// jump, a hit, a kill, a kart's boost, dying, and a theme of its own. Each line but the jump is a
// list of takes, one picked each time. Anything a row leaves out is the sound every body makes there.
import { floatOf, poundOf, strikeOf, type AvatarId } from '@world/shared';
import type { SoundId } from './Sfx';

// A look's own music, looped for as long as someone wears it (Game.ts `music`). To its wearer it's
// the only music there is: no dragon's or building's plays over it, wherever they go. `heardBy`
// says who else hears it: `everyone` round the wearer, from where they are (a dragon's, heard
// coming), or the `wearer` alone (Elizabeth's), when it's heard flat at its volume.
export interface Theme {
  sound: SoundId;
  heardBy: 'everyone' | 'wearer';
}

export interface Voice {
  // Its intro: said as a player switches to this look, heard by them and everyone near. Lazy in
  // SOUNDS, so it's fetched the first time it's said within earshot and costs nothing until then.
  enter: SoundId[];
  // Leaving the ground on a jump, in the swoosh's place: the first of a chain of jumps (sim/avatars.ts
  // `Chain`), then its second and its third, the last one given serving any after it; a backflip
  // (`Crouch`) sounds as the third.
  jump?: SoundId[];
  leap?: SoundId[]; // leaving it on a long jump (sim/avatars.ts `Leap`): the jump's sound unless given
  hurt?: SoundId[]; // taking damage, heard by everyone near
  kill?: SoundId[]; // a moment after killing someone
  // Its cry as the kart it drives begins a boost (sim/vehicles/kart.ts: a drift's, a trick's or a
  // boost pad's), heard by everyone near: takes borrowed from its other lines, each played at
  // BOOST_CRY whichever line it's from; none unless given.
  boost?: SoundId[];
  // Its player's own death, heard by them alone: over the death screen, after the sound of the hit
  // that killed them. Sent for as a player takes the look (Sfx.want), so only who can die as it
  // fetches it.
  death?: SoundId[];
  twirl?: SoundId; // its ground pound turning over in the air (sim/avatars.ts `Pound`): the whirl every look makes unless given
  // Its theme, sent for as its own player takes the look (Sfx.want), with the death.
  theme?: Theme;
}

// What a boost's cry plays at, whichever of a look's lines it borrows: the lines' recordings are
// level with each other and it's their volumes that differ by what they're for (an intro's is over
// twice a jump's), so the one volume makes every cry as loud as the next.
export const BOOST_CRY = 0.16;

// Everyone from Bikini Bottom dies to the one song.
const BIKINI_BOTTOM = { death: ['spongebob-death'] } satisfies Partial<Voice>;

export const VOICES: Record<AvatarId, Voice> = {
  standard: { enter: [] },
  mario: {
    enter: ['mario-enter', 'mario-enter-2'],
    jump: ['mario-jump-1', 'mario-jump-2', 'mario-jump-3'],
    leap: ['mario-leap-1', 'mario-leap-2', 'mario-leap-3'],
    hurt: ['mario-hurt-1', 'mario-hurt-2', 'mario-hurt-3'],
    kill: ['mario-kill-1', 'mario-kill-2'],
    boost: ['mario-leap-1', 'mario-leap-2', 'mario-leap-3', 'mario-jump-3'],
    death: ['mario-death'],
  },
  luigi: {
    enter: ['luigi-enter', 'luigi-enter-2'],
    jump: ['mario-jump-1', 'luigi-jump-2', 'luigi-jump-3'],
    leap: ['luigi-leap-1', 'luigi-leap-2'],
    hurt: ['luigi-hurt-1', 'luigi-hurt-2'],
    kill: ['luigi-kill-1', 'luigi-kill-2'],
    boost: ['luigi-enter-2', 'luigi-leap-2', 'luigi-jump-3'],
    death: ['mario-death'],
  },
  wario: {
    enter: ['wario-enter', 'wario-enter-2', 'wario-enter-3'],
    jump: ['mario-jump-1', 'wario-jump-2', 'wario-jump-3'],
    leap: ['wario-leap-1', 'wario-leap-2'],
    hurt: ['wario-hurt-1'],
    kill: ['wario-kill-1', 'wario-kill-2'],
    boost: ['wario-enter', 'wario-enter-2', 'wario-leap-2'],
    death: ['mario-death'],
    twirl: 'pound-twirl-heavy',
  },
  // Her first jump is the swoosh every look makes: she has a voice for the second and third.
  peach: {
    enter: ['peach-enter', 'peach-enter-2'],
    jump: ['jump', 'peach-jump-2', 'peach-jump-3'],
    leap: ['peach-leap-1', 'peach-leap-2'],
    hurt: ['peach-hurt-1'],
    kill: ['peach-kill-1', 'peach-kill-2'],
    boost: ['peach-enter', 'peach-jump-3', 'peach-leap-1', 'peach-leap-2'],
    death: ['mario-death'],
  },
  // As Peach, the swoosh for her first jump.
  daisy: {
    enter: ['daisy-enter'],
    jump: ['jump', 'daisy-jump-2', 'daisy-jump-3'],
    leap: ['daisy-leap-1', 'daisy-leap-2'],
    hurt: ['daisy-hurt-1', 'daisy-hurt-2'],
    kill: ['daisy-kill-1', 'daisy-kill-2'],
    boost: ['daisy-jump-3', 'daisy-leap-1', 'daisy-leap-2'],
    death: ['mario-death'],
  },
  waluigi: {
    enter: ['waluigi-enter', 'waluigi-kill-3'],
    jump: ['mario-jump-1', 'waluigi-jump-2', 'waluigi-jump-3'],
    leap: ['waluigi-leap-1', 'waluigi-leap-2'],
    hurt: ['waluigi-hurt-1', 'waluigi-hurt-2'],
    kill: ['waluigi-kill-1', 'waluigi-kill-2', 'waluigi-kill-3'],
    boost: ['waluigi-enter', 'waluigi-leap-1', 'waluigi-leap-2', 'waluigi-jump-3'],
    death: ['mario-death'],
    twirl: 'pound-twirl-heavy',
  },
  spongebob: {
    enter: ['spongebob-enter', 'spongebob-enter-2'],
    hurt: ['spongebob-hurt'],
    kill: ['spongebob-kill-1', 'spongebob-kill-2'],
    boost: ['spongebob-kill-1'],
    ...BIKINI_BOTTOM,
  },
  patrick: {
    enter: ['patrick-enter'],
    hurt: ['patrick-hurt-1', 'patrick-hurt-2'],
    kill: ['patrick-kill-1', 'patrick-kill-2'],
    boost: ['patrick-kill-1'],
    ...BIKINI_BOTTOM,
  },
  krabs: {
    enter: ['krabs-enter', 'krabs-enter-2'],
    hurt: ['krabs-hurt'],
    kill: ['krabs-kill-1', 'krabs-kill-2', 'krabs-kill-3'],
    boost: ['krabs-enter-2'],
    ...BIKINI_BOTTOM,
  },
  squidward: {
    enter: ['squidward-enter-1', 'squidward-enter-2'],
    hurt: ['squidward-hurt-1', 'squidward-hurt-2', 'squidward-hurt-3'],
    kill: ['squidward-kill-1', 'squidward-kill-2'],
    boost: ['squidward-hurt-3'],
    ...BIKINI_BOTTOM,
  },
  gary: {
    enter: ['gary-enter'],
    hurt: ['gary-hurt-1', 'gary-hurt-2'],
    kill: ['gary-kill-1'],
    ...BIKINI_BOTTOM,
  },
  plankton: {
    enter: ['plankton-enter'],
    hurt: ['plankton-hurt'],
    kill: ['plankton-kill-1', 'plankton-kill-2'],
    ...BIKINI_BOTTOM,
  },
  sandy: {
    enter: ['sandy-enter', 'sandy-enter-2'],
    hurt: ['sandy-hurt-1'],
    kill: ['sandy-kill-1', 'sandy-kill-2'],
    boost: ['sandy-enter-2'],
    ...BIKINI_BOTTOM,
  },
  puff: {
    enter: ['puff-enter', 'puff-enter-2'],
    hurt: ['puff-hurt-1', 'puff-hurt-2', 'puff-hurt-3'],
    kill: ['puff-kill-1', 'puff-kill-2'],
    boost: ['puff-hurt-2'],
    ...BIKINI_BOTTOM,
  },
  larry: {
    enter: ['larry-enter', 'larry-enter-2'],
    hurt: ['larry-hurt-1', 'larry-hurt-2'],
    kill: ['larry-kill-1', 'larry-kill-2'],
    boost: ['larry-enter'],
    ...BIKINI_BOTTOM,
  },
  sahur: { enter: ['sahur-enter'] },
  mike: { enter: [], hurt: ['mike-hurt'], boost: ['mike-hurt'], death: ['mike-death'] },
  sulley: { enter: [] },
  elizabeth: { enter: [], theme: { sound: 'elizabeth-theme', heardBy: 'wearer' } },
  'light-dragon': { enter: [], theme: { sound: 'dragon-theme', heardBy: 'everyone' } },
  colgera: { enter: [], theme: { sound: 'colgera-theme', heardBy: 'everyone' } },
};

// The sounds of moves only some looks have, beside what they say: what the game plays for each
// (Game.ts, Footsteps.ts) and what the guide lists under a look's sounds (guide/sounds.ts).
export interface MoveSound {
  sound: SoundId;
  rate: number; // speed and pitch together, 1 as recorded
}

// A strike's swing (sim/avatars.ts `Strike`): the jump's swoosh slower and lower, a heavy bat's.
export function swingOf(avatar: AvatarId): MoveSound | null {
  return strikeOf(avatar) ? { sound: 'jump', rate: 0.7 } : null;
}

// A float's shimmer (sim/avatars.ts `Float`), looped for as long as the float lasts.
export function shimmerOf(avatar: AvatarId): SoundId | null {
  return floatOf(avatar) ? 'float-sparkle' : null;
}

// The whirl of a look's ground pound turning over: its own, or the one every look makes; null for a
// look that can't pound.
export function twirlOf(avatar: AvatarId): SoundId | null {
  return poundOf(avatar) ? (VOICES[avatar].twirl ?? 'pound-twirl') : null;
}

// One of a line's takes, any of them.
export function take(takes: SoundId[] | undefined): SoundId | undefined {
  return takes?.[Math.floor(Math.random() * takes.length)];
}
