// What each game mode adds to the client (docs/game-modes.md), by mode, for the parts every mode
// shares to lay out without knowing which mode they're in. A mode's own is in its directory here;
// a mode with nothing of its own adds nothing.
import type { GameModeId, GameState } from '@world/shared';
import type { Row } from '../ui/menu/rows';
import { shootoutFacts } from './shootout/facts';
import { shootoutSettings } from './shootout/settings';

// What a mode's settings read, and how they ask for a change.
export interface ModeHooks {
  game: () => GameState; // the room's game as the Room last told of it
  master: () => boolean; // whether the player is its room master, whose the settings are to change
  set: (change: unknown) => void; // asks for a change to them (the mode's own, in the shared package)
  nameOf: (id: string) => string; // what a player is called
}

// The rows of each mode's settings in the menu's GAME tab: everyone sees them as they stand, and
// they're the room master's to change, in the lobby.
export const MODE_SETTINGS: Record<GameModeId, (hooks: ModeHooks) => Row[]> = {
  freeplay: () => [],
  racing: () => [],
  shootout: shootoutSettings,
};

// Each mode's numbers as the guide gives them, worked out from what the game runs on.
export const MODE_FACTS: Record<GameModeId, () => { label: string; value: string }[]> = {
  freeplay: () => [],
  racing: () => [],
  shootout: shootoutFacts,
};
