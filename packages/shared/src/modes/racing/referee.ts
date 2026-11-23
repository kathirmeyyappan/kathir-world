// Racing as its Room runs it (docs/game-modes.md): what every game shares (game.ts), with a game
// that is a series of races, each on a track of its own, for points by the place finished in.
import { TICK_RATE } from '../../sim/constants';
import { gridOf, onTrack, routes, trackOf, withinTrack } from '../../sim/tracks';
import type { PlayerState } from '../../sim/types';
import { Game } from '../game';
import { RACING_RULES } from './rules';
import { RACE, RACES, isRacingChange, pointsFor, racing, type Racer, type RacingState, type Round } from './state';

export class Racing extends Game {
  private races = RACES.count;
  private racers: Racer[] = [];
  private points: number[] = [];
  private tracks: number[] = []; // each race's track, dealt as the game begins
  private crossed = new Map<string, number>(); // the tick each racer still sat in their kart crossed the line
  private round: Round | null = null;

  override get state(): RacingState {
    const round = this.round && { ...this.round, finished: [...this.round.finished], out: [...this.round.out] };
    return {
      ...super.state,
      mode: 'racing',
      races: this.races,
      racers: this.racers.map((racer) => ({ ...racer })),
      points: [...this.points],
      round,
    };
  }

  // Whoever is in the lobby is to race. Someone who comes once a game has begun watches it.
  override joined(player: PlayerState, made: boolean): void {
    super.joined(player, made);
    if (player.bot || player.ghost) return;
    this.racers.push(racerOf(player));
    this.room.publish();
  }

  // Someone who leaves the lobby isn't to race; someone who leaves a game is out of the race being
  // run and every one after, and stays on its board.
  override left(player: PlayerState): void {
    const racer = this.racers.find((r) => r.id === player.id);
    if (racer && this.round) {
      racer.gone = true;
      if (racing(this.round, this.racers).includes(racer)) this.round.out.push(racer.id);
    } else this.racers = this.racers.filter((r) => r !== racer);
    this.room.publish();
    super.left(player);
  }

  protected override ready(): string | null {
    return RACING_RULES.starts(this.state);
  }

  protected override set(change: unknown): boolean {
    if (!isRacingChange(change)) return false;
    this.races = Math.max(RACES.min, Math.min(RACES.max, change.races));
    return true;
  }

  // The game begins: whoever is here is who races, under the name they have now, each race is
  // dealt a track of its own, and the first is set up for everyone to be put on its grid.
  protected override begin(): void {
    this.racers = this.room.people().map(racerOf);
    this.points = this.racers.map(() => 0);
    const dealt = new Set<number>();
    while (dealt.size < this.races) dealt.add(Math.floor(this.room.random() * routes().length));
    this.tracks = [...dealt];
    this.round = this.setUp(0);
    super.begin();
  }

  // A racer starts a race sat in a kart of their own on its grid, in the order they're listed.
  protected override place(player: PlayerState): PlayerState {
    const here = this.racers.filter((r) => !r.gone);
    const spot = gridOf(trackOf(this.round!.track), here.length)[here.findIndex((r) => r.id === player.id)];
    return spot ? this.room.seat(player, spot, spot.yaw) : super.place(player);
  }

  // A race is run from the tick its racers are let go: each is over the line as their kart crosses
  // it on the track, and out the moment they're in no kart (theirs blew up). The first over starts
  // the clock on the rest; when it runs out, or nobody is left racing, whoever is still out there
  // is out, the places are scored, and the leaderboard stands until the next race, or the results.
  override step(): void {
    super.step();
    const round = this.round;
    if (!this.playing || !round) return;
    const tick = this.room.tick();
    if (round.over !== null) {
      if (tick >= round.over) this.next(round);
      return;
    }
    if (tick < round.go) return;
    const was = round.finished.length + round.out.length;
    const track = trackOf(round.track);
    const here = new Map(this.room.people().map((p) => [p.id, p]));
    for (const racer of racing(round, this.racers)) {
      const player = here.get(racer.id);
      const kart = player && this.room.kartOf(player);
      if (!player || !kart) {
        this.out(round, racer.id, player);
        continue;
      }
      const on = onTrack(track, kart.pos);
      if (!withinTrack(on) || on.at < track.finish) continue;
      round.finished.push(racer.id);
      this.crossed.set(racer.id, tick);
      round.closes ??= tick + RACE.close * TICK_RATE;
    }
    // Someone over the line is let out of their kart a while on: a ghost, free to go where they
    // like until the next race.
    for (const [id, at] of this.crossed) {
      if (tick < at + RACE.free * TICK_RATE) continue;
      this.crossed.delete(id);
      const player = here.get(id);
      if (player) this.room.haunt(player);
    }
    const left = racing(round, this.racers);
    if (left.length === 0 || tick >= (round.closes ?? round.go + RACE.limit * TICK_RATE)) {
      for (const racer of left) this.out(round, racer.id, here.get(racer.id));
      round.finished.forEach((id, i) => {
        this.points[this.racers.findIndex((r) => r.id === id)] += pointsFor(i + 1, this.racers.length);
      });
      round.over = tick + RACE.board * TICK_RATE;
    }
    if (round.over !== null || round.finished.length + round.out.length !== was) this.room.publish();
  }

  // Back in the lobby everyone there is to race the next game, those who watched the last included.
  protected override toLobby(): void {
    this.round = null;
    this.racers = this.room.people().map(racerOf);
    super.toLobby();
  }

  // A racer is out of a race: a ghost from then until the next one, if they're still here.
  private out(round: Round, id: string, player: PlayerState | undefined): void {
    round.out.push(id);
    if (player) this.room.haunt(player);
  }

  // After a race's leaderboard: the next race, on a cleared world with every racer still here back
  // on a grid, or after the last, the game's results.
  private next(round: Round): void {
    if (round.number + 1 >= this.races) return this.finish();
    this.room.clear();
    this.round = this.setUp(round.number + 1);
    const here = new Map(this.room.people().map((p) => [p.id, p]));
    for (const racer of this.racers) {
      const player = here.get(racer.id);
      if (player) this.place(player);
    }
    this.room.publish();
  }

  // Race `number` of the game, about to be run: those who've left are out of it from the start.
  private setUp(number: number): Round {
    this.crossed.clear();
    return {
      number,
      track: this.tracks[number],
      go: this.room.tick() + RACE.grid * TICK_RATE,
      closes: null,
      finished: [],
      out: this.racers.filter((r) => r.gone).map((r) => r.id),
      over: null,
    };
  }
}

function racerOf(player: PlayerState): Racer {
  return { id: player.id, name: player.name, colour: player.color, avatar: player.avatar, gone: false };
}
