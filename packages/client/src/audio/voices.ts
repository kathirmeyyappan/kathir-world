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
  jump?: SoundId; // leaving the ground on a jump: the swoosh unless given
  leap?: SoundId[]; // leaving it on a long jump (sim/avatars.ts `Leap`): the jump's sound unless given
  hurt?: SoundId[]; // taking damage, heard by everyone near
  kill?: SoundId[]; // a moment after killing someone
  // Its player's own death, heard by them alone: on the hit that kills them, in the hurt sound's
  // place, and on over the death screen. Sent for as a player takes the look (Sfx.want), so only
  // who can die as it fetches it.
  death?: SoundId[];
}

// Everyone from Bikini Bottom dies to the one song.
const BIKINI_BOTTOM = { death: ['spongebob-death'] } satisfies Partial<Voice>;

export const VOICES: Record<AvatarId, Voice> = {
  standard: { enter: [] },
  mario: {
    enter: ['mario-enter'],
    jump: 'mario-jump',
    leap: ['mario-leap-1', 'mario-leap-2'],
    hurt: ['mario-hurt-1', 'mario-hurt-2', 'mario-hurt-3'],
    kill: ['mario-kill-1', 'mario-kill-2'],
    death: ['mario-death'],
  },
  luigi: {
    enter: ['luigi-enter'],
    jump: 'mario-jump',
    leap: ['luigi-leap-1', 'luigi-leap-2'],
    hurt: ['luigi-hurt-1', 'luigi-hurt-2'],
    kill: ['luigi-kill-1', 'luigi-kill-2'],
    death: ['mario-death'],
  },
  spongebob: { enter: [], ...BIKINI_BOTTOM },
  patrick: { enter: [], ...BIKINI_BOTTOM },
  krabs: { enter: [], ...BIKINI_BOTTOM },
  squidward: { enter: [], ...BIKINI_BOTTOM },
  gary: { enter: [], ...BIKINI_BOTTOM },
  plankton: { enter: [], ...BIKINI_BOTTOM },
  mike: { enter: [] },
  sulley: { enter: [] },
  elizabeth: { enter: [] },
  sahur: { enter: [] },
  'light-dragon': { enter: [] },
  colgera: { enter: [] },
};

// One of a line's takes, any of them.
export function take(takes: SoundId[] | undefined): SoundId | undefined {
  return takes?.[Math.floor(Math.random() * takes.length)];
}
