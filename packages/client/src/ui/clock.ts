// A game's clocks, as the HUD counts and writes them.
import { TICK_RATE } from '@world/shared';

// Whole seconds from the tick `now` until the tick `until`: none once it's passed.
export function secondsUntil(until: number, now: number): number {
  return Math.max(0, Math.ceil((until - now) / TICK_RATE));
}

// "5:00", "0:30".
export function clockFace(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}
