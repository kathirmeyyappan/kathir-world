// How Peach moves, and Daisy with her: the family's clips (sm64.ts) with Super Smash Bros. Brawl's
// own of her over them where she moves her own way (peachClips.ts). Apart from either model, so
// each princess's chunk carries only her own.
import type { Style } from './Jointed';
import { PEACH_CLIPS } from './peachClips';
import { SM64_STYLE } from './sm64';

export const PEACH_STYLE: Style = {
  ...SM64_STYLE,
  // Going over backwards onto her back throws her skirt up over her, so a fall kills her as
  // anything else does.
  clips: { ...SM64_STYLE.clips, ...PEACH_CLIPS, fallen: undefined },
};
