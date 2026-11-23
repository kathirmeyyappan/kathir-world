// Racing's own part of a game's state (docs/game-modes.md): how many races a game is, who races,
// and the race being run: its track, its clocks, and who has finished it or is out of it.
import { AVATARS, AVATAR_IDS, type AvatarId } from '../../sim/avatars';
import type { GameState } from '../index';

export const MIN_RACERS = 2; // how many it takes to start a game
// How many races a game is: what it's set to at first, and the least and most it can be.
export const RACES = { count: 3, min: 1, max: 9 };
// A race's clocks, in seconds: its racers held on the grid; of that, the countdown at its end; from
// its first finisher until it closes on whoever hasn't finished, the last of which is a hurry; from
// a racer's crossing the line until they're let out of their kart, a ghost; how long a race that
// nobody finishes runs; and how long its leaderboard stands before the next begins.
export const RACE = { grid: 5, countdown: 3, close: 45, hurry: 10, free: 5, limit: 300, board: 6 };

// A racing bot's level: the least skilled there is and the most, and the one a bot is added at.
export const BOT_LEVELS = { least: 1, most: 5, first: 3 };
// How good a racer a bot is asked to be, from 0 (the middle of the road, short of flat out) to 1
// (all of the road, every drift and trick there is), at the lowest level and the highest: short
// of both ends, since each bot has form of its own either side of what it's asked for
// (modal-bots/bots/racer_bot.py).
const RATINGS = { least: 0.1, most: 0.88 };
export const RACER_BOT = 'racer'; // the bots app's name for a racer
export const MOST_BOTS = 8; // how many bots a game can be set to bring
// The looks a game's bots race in, one drawn for each as it's added: every look on foot a person
// can take but the standard body, which is nobody's.
export const BOT_LOOKS: readonly AvatarId[] = AVATAR_IDS.filter(
  (id) => id !== 'standard' && AVATARS[id].class === 'walker' && AVATARS[id].command !== null && !AVATARS[id].hidden,
);
// Seconds past its countdown that a game's start waits for the bots it asked for, before it begins
// without the ones that haven't come.
export const BOT_WAIT = 30;

// What a game's bots are called, the first of them bot 1.
export function botName(index: number): string {
  return `bot ${index + 1}`;
}

// How good a racer the bot at `level` is asked to be: the levels evenly from the least to the most.
export function ratingOf(level: number): number {
  const share = (level - BOT_LEVELS.least) / (BOT_LEVELS.most - BOT_LEVELS.least);
  return RATINGS.least + (RATINGS.most - RATINGS.least) * share;
}

// One of the bots a game brings to race, as set: its level, and the look it races in, which the
// room draws for it as it's added.
export interface RaceBot {
  level: number;
  avatar: AvatarId;
}

// Someone racing: who they are, what they were called and how they appeared as the game began
// (their colour and the look they wore), for a bot of the game's how good a racer it's asked to be
// (`ratingOf` its level), and whether they've left the room since: someone who has is out of every
// race from then on, and stays on the board.
export interface Racer {
  id: string;
  name: string;
  colour: string;
  avatar: AvatarId;
  rating: number | null;
  gone: boolean;
}

export interface Round {
  number: number; // which race of the game it is, from 0
  track: number; // its track, by its place among the routes there are (sim/tracks.ts `routes`)
  go: number; // the tick its racers are let go at
  closes: number | null; // the tick it's over at for whoever hasn't finished: set as the first does
  finished: string[]; // the racers over the line, by id, in the order they crossed it
  out: string[]; // the racers out of it, by id
  over: number | null; // once it's run, the tick the next race begins at, or the game's results stand
}

export interface RacingState extends GameState {
  mode: 'racing';
  races: number; // how many races a game is, as set
  bots: RaceBot[]; // the bots a game brings to race, as set: the first is bot 1
  racers: Racer[]; // in the lobby, everyone there; in a game, whoever was as it began, its bots too
  points: number[]; // each racer's points in the game being played, or last played, in `racers`' order
  round: Round | null; // the race being run or just run; null in the lobby
}

export function isRacing(game: GameState): game is RacingState {
  return game.mode === 'racing';
}

// A change its room master makes to its settings: how many races, or its bots' levels, all of
// them as they're then to be: one more than there are is a bot added, and one fewer the last gone.
export type RacingChange = { races: number } | { bots: number[] };

export function isRacingChange(v: unknown): v is RacingChange {
  if (typeof v !== 'object' || v === null) return false;
  if ('races' in v) return Number.isInteger(v.races);
  const level = (l: unknown) => Number.isInteger(l) && Number(l) >= BOT_LEVELS.least && Number(l) <= BOT_LEVELS.most;
  return 'bots' in v && Array.isArray(v.bots) && v.bots.length <= MOST_BOTS && v.bots.every(level);
}

// What finishing in `place` (1 for first) is worth among `racers` racers: one for each of them,
// less one for each place behind first. Not finishing is worth nothing.
export function pointsFor(place: number, racers: number): number {
  return racers - (place - 1);
}

// The racers still racing `round`: not over the line, not out.
export function racing(round: Round, racers: Racer[]): Racer[] {
  return racers.filter((r) => !round.finished.includes(r.id) && !round.out.includes(r.id));
}

// Every racer's place in `round`, the first first: those over the line in the order they crossed
// it, those still racing by how far `along` its track they are (null: nowhere on it), then those
// out of it.
export function placesOf(round: Round, racers: Racer[], along: (id: string) => number | null): string[] {
  const going = racing(round, racers)
    .map((r) => ({ id: r.id, at: along(r.id) ?? -Infinity }))
    .sort((a, b) => b.at - a.at);
  return [...round.finished, ...going.map((r) => r.id), ...round.out];
}
