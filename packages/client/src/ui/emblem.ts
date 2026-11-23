// A player's emblem beside their name wherever players are listed (a menu's board of them, a
// leaderboard): their livery's (render/liveries.ts), as a tiny round badge. Its picture is sent
// for as the badge is made, and the badge is bare until it's here.
import type { Appearance } from '@world/shared';
import { emblemAddress, liveryOf } from '../render/liveries';

// A player as they're listed: by name, with how they appear, for their emblem; someone no longer
// in the room appears as nothing.
export interface Listed {
  id: string;
  name: string;
  appearance: Appearance | null;
}

export function emblemBadge(who: Appearance): HTMLElement {
  const badge = document.createElement('span');
  badge.className = 'emblem';
  emblemAddress(liveryOf(who)).then(
    (address) => (badge.style.backgroundImage = `url("${address}")`),
    () => {}, // left bare: the next badge made sends for the picture again
  );
  return badge;
}

// A name with its player's emblem before it, where they have one.
export function named(name: string, who: Appearance | null): Node[] {
  return who ? [emblemBadge(who), document.createTextNode(name)] : [document.createTextNode(name)];
}
