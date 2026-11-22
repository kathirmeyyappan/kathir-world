// Shootout's own part of a game's state (docs/game-modes.md): its settings, which its room master
// changes in the lobby, and everyone's team.
import { NAMED_COLORS } from '../../sim/constants';
import type { GameState } from '../index';

// The teams there can be, in the order they're added: each one's name and the colour its players go
// by in a game.
export const TEAMS = [
  { name: 'A', colour: NAMED_COLORS.red },
  { name: 'B', colour: NAMED_COLORS.green },
  { name: 'C', colour: NAMED_COLORS.blue },
  { name: 'D', colour: NAMED_COLORS.yellow },
];
export const MIN_TEAMS = 2;
// How long a game runs, in seconds: what it's set to at first, how far a step moves it, and how short
// and how long it can be set.
export const CLOCK = { seconds: 300, step: 30, min: 30, max: 1200 };

export interface ShootoutState extends GameState {
  mode: 'shootout';
  seconds: number; // how long its game runs, as set
  teams: string[][]; // each team's players, by id, in TEAMS' order: everyone in the game is on one
}

export function isShootout(game: GameState): game is ShootoutState {
  return game.mode === 'shootout';
}

// A change its room master makes to its settings.
export type ShootoutChange =
  | { clock: number } // how long its game runs, seconds
  | { teams: number } // how many teams there are
  | { move: string; to: number }; // a player, by id, to the team at that place in TEAMS

export function isShootoutChange(v: unknown): v is ShootoutChange {
  if (typeof v !== 'object' || v === null) return false;
  const c = v as Record<string, unknown>;
  if ('clock' in c) return Number.isFinite(c.clock);
  if ('teams' in c) return Number.isInteger(c.teams);
  return typeof c.move === 'string' && Number.isInteger(c.to);
}
