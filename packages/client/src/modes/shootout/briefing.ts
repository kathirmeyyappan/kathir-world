// A shootout's rules as its players are told them at its start (MODE_BRIEFING).
import { POINTS } from '@world/shared';

const points = (n: number) => `${n} point${n === 1 ? '' : 's'}`;

export const SHOOTOUT_BRIEFING = `Kill an opponent: +${points(POINTS.kill)}. Die: -${points(POINTS.death)}.`;
