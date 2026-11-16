// What a character says in its own voice: every one has a row, and its intro is the line each is
// expected to have (none, until its recording is added); the rest only some have: a jump, a long
// jump, a hit, a kill and dying. Each line but the jump is a list of takes, one picked each time.
// Anything a row leaves out is the sound every body makes there.
import type { AvatarId } from '@world/shared';
import type { SoundId } from './Sfx';

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
  // Its player's own death, heard by them alone: over the death screen, after the sound of the hit
  // that killed them. Sent for as a player takes the look (Sfx.want), so only who can die as it
  // fetches it.
  death?: SoundId[];
  twirl?: SoundId; // its ground pound turning over in the air (sim/avatars.ts `Pound`): the whirl every look makes unless given
}

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
    death: ['mario-death'],
  },
  luigi: {
    enter: ['luigi-enter', 'luigi-enter-2'],
    jump: ['mario-jump-1', 'luigi-jump-2', 'luigi-jump-3'],
    leap: ['luigi-leap-1', 'luigi-leap-2'],
    hurt: ['luigi-hurt-1', 'luigi-hurt-2'],
    kill: ['luigi-kill-1', 'luigi-kill-2'],
    death: ['mario-death'],
  },
  wario: {
    enter: ['wario-enter', 'wario-enter-2', 'wario-enter-3'],
    jump: ['mario-jump-1', 'wario-jump-2', 'wario-jump-3'],
    leap: ['wario-leap-1', 'wario-leap-2'],
    hurt: ['wario-hurt-1'],
    kill: ['wario-kill-1', 'wario-kill-2'],
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
    death: ['mario-death'],
  },
  // As Peach, the swoosh for her first jump.
  daisy: {
    enter: ['daisy-enter'],
    jump: ['jump', 'daisy-jump-2', 'daisy-jump-3'],
    leap: ['daisy-leap-1', 'daisy-leap-2'],
    hurt: ['daisy-hurt-1', 'daisy-hurt-2'],
    kill: ['daisy-kill-1', 'daisy-kill-2'],
    death: ['mario-death'],
  },
  waluigi: {
    enter: ['waluigi-enter', 'waluigi-kill-3'],
    jump: ['mario-jump-1', 'waluigi-jump-2', 'waluigi-jump-3'],
    leap: ['waluigi-leap-1', 'waluigi-leap-2'],
    hurt: ['waluigi-hurt-1', 'waluigi-hurt-2'],
    kill: ['waluigi-kill-1', 'waluigi-kill-2', 'waluigi-kill-3'],
    death: ['mario-death'],
    twirl: 'pound-twirl-heavy',
  },
  spongebob: {
    enter: ['spongebob-enter', 'spongebob-enter-2'],
    hurt: ['spongebob-hurt'],
    kill: ['spongebob-kill-1', 'spongebob-kill-2'],
    ...BIKINI_BOTTOM,
  },
  patrick: {
    enter: ['patrick-enter'],
    hurt: ['patrick-hurt-1', 'patrick-hurt-2'],
    kill: ['patrick-kill-1', 'patrick-kill-2'],
    ...BIKINI_BOTTOM,
  },
  krabs: {
    enter: ['krabs-enter', 'krabs-enter-2'],
    hurt: ['krabs-hurt'],
    kill: ['krabs-kill-1', 'krabs-kill-2', 'krabs-kill-3'],
    ...BIKINI_BOTTOM,
  },
  squidward: { enter: [], ...BIKINI_BOTTOM },
  gary: { enter: [], ...BIKINI_BOTTOM },
  plankton: { enter: [], ...BIKINI_BOTTOM },
  sahur: { enter: ['sahur-enter'] },
  mike: { enter: [], death: ['mike-death'] },
  sulley: { enter: [] },
  elizabeth: { enter: [] },
  'light-dragon': { enter: [] },
  colgera: { enter: [] },
};

// One of a line's takes, any of them.
export function take(takes: SoundId[] | undefined): SoundId | undefined {
  return takes?.[Math.floor(Math.random() * takes.length)];
}
