// What a race has on the HUD while it's run (docs/game-modes.md): over the view, the grid's
// words and its count, then what a racer has to know (the clock on them once someone has
// finished, the place they finished in, that they're out); in the top right, their place; and
// once the race is run, its leaderboard.
import {
  RACE,
  TICK_RATE,
  isRacing,
  onTrack,
  placesOf,
  pointsFor,
  racing,
  trackOf,
  type GameState,
  type Kart,
  type RacingState,
  type Round,
} from '@world/shared';
import { secondsUntil } from '../../ui/clock';
import type { BannerLine } from '../../ui/GameBanner';
import type { Leaderboard } from '../../ui/Results';
import type { Moment, Showing } from '../index';

const GO_SECONDS = 1; // how long GO! stands once the grid is let go

export function racingHud(game: GameState, at: Moment): Showing {
  if (!isRacing(game) || !game.round) return { line: null, scores: null, board: null };
  const round = game.round;
  if (round.over !== null) return { line: null, scores: null, board: boardOf(game, round, at.tick) };
  const places = placesOf(round, game.racers, alongOf(round, at.karts));
  // The place of someone racing or over the line; null for anyone else (out, or watching).
  const placed = !round.out.includes(at.me) && places.includes(at.me) ? places.indexOf(at.me) + 1 : null;
  const left = round.closes === null ? null : secondsUntil(round.closes, at.tick);
  const race = `race ${round.number + 1}/${game.races}`;
  return {
    line: lineOf(game, round, at, placed, left),
    board: null,
    scores: {
      headline: placed === null ? null : ordinal(placed),
      caption: placed === null ? race : `of ${game.racers.length} · ${race}`,
      standings: [],
      seconds: left,
      urgent: left !== null && left <= RACE.hurry,
    },
  };
}

// How far along the round's track each racer's kart is: null for one in no kart.
function alongOf(round: Round, karts: Kart[]): (id: string) => number | null {
  const track = trackOf(round.track);
  return (id) => {
    const kart = karts.find((k) => k.driver === id);
    return kart ? onTrack(track, kart.pos).at : null;
  };
}

// What the race says to a racer right now; nothing to someone only watching it.
function lineOf(
  game: RacingState,
  round: Round,
  at: Moment,
  placed: number | null,
  left: number | null,
): BannerLine | null {
  if (!game.racers.some((r) => r.id === at.me)) return null;
  if (placed === null) return { text: 'ELIMINATED\nwait for the race to end', tone: 'big' };
  const toGo = (round.go - at.tick) / TICK_RATE;
  if (toGo > RACE.countdown) return { text: 'Follow the green to the end as fast as you can!' };
  if (toGo > 0) return { text: String(Math.ceil(toGo)), tone: 'big' };
  if (toGo > -GO_SECONDS) return { text: 'GO!', tone: 'big' };
  if (round.finished.includes(at.me)) {
    const waiting = racing(round, game.racers).length > 0 && left !== null;
    return { text: `You finished ${ordinal(placed)}!${waiting ? `\nthe rest have ${left} seconds` : ''}` };
  }
  if (left === null) return null;
  const first = game.racers.find((r) => r.id === round.finished[0]);
  return {
    text: `${first?.name ?? 'someone'} finished! ${left} seconds left`,
    tone: left <= RACE.hurry ? 'urgent' : undefined,
  };
}

// A run race's leaderboard: every racer by their points in the game so far, with what this race
// gave them, until the next begins.
function boardOf(game: RacingState, round: Round, tick: number): Leaderboard {
  const most = Math.max(...game.points);
  const last = round.number + 1 >= game.races;
  return {
    title: `RACE ${round.number + 1} OF ${game.races}`,
    colour: null,
    lines: game.racers
      .map((racer, i) => {
        const place = round.finished.indexOf(racer.id) + 1;
        return {
          name: racer.name,
          colour: racer.colour,
          note: place > 0 ? `+${pointsFor(place, game.racers.length)}` : 'OUT',
          points: game.points[i],
          won: game.points[i] === most,
        };
      })
      .sort((a, b) => b.points - a.points),
    footer: `${last ? 'results' : 'next race'} in ${secondsUntil(round.over ?? tick, tick)}`,
  };
}

// "1st", "2nd", "3rd", "4th", "11th", "22nd".
function ordinal(n: number): string {
  const teen = n % 100 >= 11 && n % 100 <= 13;
  return `${n}${teen ? 'th' : (['th', 'st', 'nd', 'rd'][n % 10] ?? 'th')}`;
}
