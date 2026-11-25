// A shootout's rules as its players are told them at its start (MODE_BRIEFING).
import { POINTS } from '@world/shared';
import { gain, loss, type Said } from '../../ui/GameBanner';

const points = (n: number) => `${n} point${n === 1 ? '' : 's'}`;

export const SHOOTOUT_BRIEFING: Said = {
  rows: [
    ['Kill an opponent: ', gain(`+${points(POINTS.kill)}`)],
    ['Die: ', loss(`-${points(POINTS.death)}`)],
  ],
  compact: true,
};
