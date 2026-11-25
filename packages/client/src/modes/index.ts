// What each game mode adds to the client (docs/game-modes.md), by mode, for the parts every mode
// shares to lay out without knowing which mode they're in. A mode's own is in its directory here;
// a mode with nothing of its own adds nothing.
import type { GameModeId, GameState, Kart } from '@world/shared';
import type { Start } from '../render/lakitu/Starter';
import type { Listed } from '../ui/emblem';
import type { BannerLine } from '../ui/GameBanner';
import type { Row } from '../ui/menu/rows';
import type { Leaderboard } from '../ui/Results';
import type { Tally } from '../ui/Scores';
import { racingFacts } from './racing/facts';
import { racingHud } from './racing/hud';
import { racingSettings } from './racing/settings';
import { SHOOTOUT_BRIEFING } from './shootout/briefing';
import { shootoutFacts } from './shootout/facts';
import { shootoutHud } from './shootout/hud';
import { shootoutSettings } from './shootout/settings';

// What a mode's settings read, and how they ask for a change.
export interface ModeHooks {
  game: () => GameState; // the room's game as the Room last told of it
  master: () => boolean; // whether the player is its room master, whose the settings are to change
  set: (change: unknown) => void; // asks for a change to them (the mode's own, in the shared package)
  listed: (id: string) => Listed; // a player as a board lists them
}

// The rows of each mode's settings in the menu's GAME tab: everyone sees them as they stand, and
// they're the room master's to change, in the lobby.
export const MODE_SETTINGS: Record<GameModeId, (hooks: ModeHooks) => Row[]> = {
  freeplay: () => [],
  racing: racingSettings,
  shootout: shootoutSettings,
};

// The moment a game is shown at: who's looking, the Room's tick as their next frame will meet it
// (what their kart is held or let go by), and the room's karts.
export interface Moment {
  me: string;
  tick: number;
  karts: Kart[];
}

// What a game shows while it's played: on the HUD, the line standing over the view
// (ui/GameBanner.ts), what's in the top right (ui/Scores.ts), a leaderboard over the view
// (ui/Results.ts) and the map of the track in play, whole, with the line under it
// (ui/TrackPreview.ts); and in the world, Lakitu starting a race (render/lakitu/Starter.ts). Null:
// nothing there.
export interface Showing {
  line: BannerLine | null;
  scores: Tally | null;
  board: Leaderboard | null;
  preview: string | null;
  starter: Start | null;
}

export const NOTHING: Showing = { line: null, scores: null, board: null, preview: null, starter: null };

// What each mode's game shows while it's played, to the player at that moment.
export const MODE_HUD: Record<GameModeId, (game: GameState, at: Moment) => Showing> = {
  freeplay: () => NOTHING,
  racing: racingHud,
  shootout: shootoutHud,
};

// What each mode's game tells its players as they come into it, after which side they're on: its
// rules in a line. Null: nothing.
export const MODE_BRIEFING: Record<GameModeId, string | null> = {
  freeplay: null,
  racing: null,
  shootout: SHOOTOUT_BRIEFING,
};

// Each mode's numbers as the guide gives them, worked out from what the game runs on.
export const MODE_FACTS: Record<GameModeId, () => { label: string; value: string }[]> = {
  freeplay: () => [],
  racing: racingFacts,
  shootout: shootoutFacts,
};
