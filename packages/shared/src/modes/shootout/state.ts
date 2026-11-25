// Shootout's own part of a game's state (docs/game-modes.md): its settings, which its room master
// changes in the lobby, everyone's team, and each team's points.
import { NAMED_COLORS } from '../../sim/constants';
import type { GameBot, Plays } from '../bots';
import type { GameState } from '../index';

// The teams there can be, in the order they're added: each one's name and the colour its players go
// by in a game.
export const TEAMS = [
  { name: 'TEAM A', colour: NAMED_COLORS.green },
  { name: 'TEAM B', colour: NAMED_COLORS.blue },
  { name: 'TEAM C', colour: NAMED_COLORS.red },
  { name: 'TEAM D', colour: NAMED_COLORS.yellow },
];
export const MIN_TEAMS = 2;
// What a kill of someone on another team is worth to the killer's, and what any death costs the
// dead player's own, which never has less than nothing.
export const POINTS = { kill: 2, death: 1 };
// How long a game runs, in seconds: what it's set to at first, how far a step moves it, and how short
// and how long it can be set.
export const CLOCK = { seconds: 300, step: 30, min: 30, max: 1200 };

// The bot that fights: the bots app's fighter (modal-bots/bots/fighter_bot.py), which reads how
// good to be off its level among the game's bots, and its side off the teams.
export const FIGHTER_BOT: Plays = { bot: 'fighter', worker: 'combat' };

export interface ShootoutState extends GameState {
  mode: 'shootout';
  seconds: number; // how long its game runs, as set
  // Each team's members, in TEAMS' order: a person by their id, and one of the game's bots by its
  // key (`GameBot.key`), here or still to come. Everyone in the game is on one.
  teams: string[][];
  points: number[]; // each team's points in the game being played, or last played
}

export function isShootout(game: GameState): game is ShootoutState {
  return game.mode === 'shootout';
}

// What a player goes by on a team: one of the game's bots its key, anyone else their id.
export function memberOf(bots: GameBot[], player: string): string {
  return bots.find((bot) => bot.id === player)?.key ?? player;
}

// A change its room master makes to its own settings.
export type ShootoutChange =
  | { clock: number } // how long its game runs, seconds
  | { teams: number } // how many teams there are
  | { move: string; to: number }; // a member of a team to the team at that place in TEAMS

export function isShootoutChange(v: unknown): v is ShootoutChange {
  if (typeof v !== 'object' || v === null) return false;
  const c = v as Record<string, unknown>;
  if ('clock' in c) return Number.isFinite(c.clock);
  if ('teams' in c) return Number.isInteger(c.teams);
  return typeof c.move === 'string' && Number.isInteger(c.to);
}
