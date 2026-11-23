// Racing's own part of a game's state (docs/game-modes.md): how many races a game is, who races,
// and the race being run: its track, its clocks, and who has finished it or is out of it.
import type { GameState } from '../index';

export const MIN_RACERS = 2; // how many it takes to start a game
// How many races a game is: what it's set to at first, and the least and most it can be.
export const RACES = { count: 3, min: 1, max: 9 };
// A race's clocks, in seconds: its racers held on the grid; of that, the countdown at its end; from
// its first finisher until it closes on whoever hasn't finished, the last of which is a hurry; how
// long one that nobody finishes runs; and how long its leaderboard stands before the next begins.
export const RACE = { grid: 5, countdown: 3, close: 45, hurry: 10, limit: 300, board: 6 };

// Someone racing: who they are, what they were called and the colour they went by as the game
// began, and whether they've left the room since: someone who has is out of every race from then
// on, and stays on the board.
export interface Racer {
  id: string;
  name: string;
  colour: string;
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
  racers: Racer[]; // in the lobby, everyone there; in a game, whoever was as it began
  points: number[]; // each racer's points in the game being played, or last played, in `racers`' order
  round: Round | null; // the race being run or just run; null in the lobby
}

export function isRacing(game: GameState): game is RacingState {
  return game.mode === 'racing';
}

// A change its room master makes to its settings.
export interface RacingChange {
  races: number;
}

export function isRacingChange(v: unknown): v is RacingChange {
  return typeof v === 'object' && v !== null && 'races' in v && Number.isInteger(v.races);
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
