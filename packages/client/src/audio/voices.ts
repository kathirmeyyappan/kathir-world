// What a character says in its own voice, where it has one: on a jump, a long jump, a hit, a kill,
// on becoming that character and on dying. Each line but the jump is a list of takes, one picked
// each time.
// Anything a row leaves out is the sound every body makes there.
import type { AvatarId } from '@world/shared';
import type { SoundId } from './Sfx';

export interface Voice {
  jump?: SoundId; // leaving the ground on a jump: the swoosh unless given
  leap?: SoundId[]; // leaving it on a long jump (sim/avatars.ts `Leap`): the jump's sound unless given
  hurt?: SoundId[]; // taking damage, heard by everyone near
  kill?: SoundId[]; // a moment after killing someone
  enter?: SoundId[]; // on a player switching to this look
  // Its player's own death, heard by them alone: on the hit that kills them, in the hurt sound's
  // place, and on over the death screen. Sent for as a player takes the look (Sfx.want), so only
  // who can die as it fetches it.
  death?: SoundId[];
}

// Everyone from Bikini Bottom dies to the one song.
const BIKINI_BOTTOM: Voice = { death: ['spongebob-death'] };

export const VOICES: Partial<Record<AvatarId, Voice>> = {
  mario: {
    jump: 'mario-jump',
    leap: ['mario-leap-1', 'mario-leap-2'],
    hurt: ['mario-hurt-1', 'mario-hurt-2', 'mario-hurt-3'],
    kill: ['mario-kill-1', 'mario-kill-2'],
    enter: ['mario-enter'],
    death: ['mario-death'],
  },
  luigi: {
    jump: 'mario-jump',
    leap: ['luigi-leap-1', 'luigi-leap-2'],
    hurt: ['luigi-hurt-1', 'luigi-hurt-2'],
    kill: ['luigi-kill-1', 'luigi-kill-2'],
    enter: ['luigi-enter'],
    death: ['mario-death'],
  },
  spongebob: BIKINI_BOTTOM,
  patrick: BIKINI_BOTTOM,
  krabs: BIKINI_BOTTOM,
  squidward: BIKINI_BOTTOM,
  gary: BIKINI_BOTTOM,
  plankton: BIKINI_BOTTOM,
};

// One of a line's takes, any of them.
export function take(takes: SoundId[] | undefined): SoundId | undefined {
  return takes?.[Math.floor(Math.random() * takes.length)];
}
