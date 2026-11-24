// Shootout as its Room runs it (docs/game-modes.md): what every game shares (game.ts), with its
// own settings, everyone on a team, and a fight between the teams for points until the clock runs
// out.
import { INDOOR_ROOMS } from '../../content/regions';
import type { Region } from '../../sim/regions';
import type { PlayerState } from '../../sim/types';
import type { GameBot } from '../bots';
import { Game } from '../game';
import { SHOOTOUT_RULES } from './rules';
import { CLOCK, FIGHTER_BOT, MIN_TEAMS, POINTS, TEAMS, isShootoutChange, memberOf, type ShootoutState } from './state';

export class Shootout extends Game {
  protected readonly plays = FIGHTER_BOT;
  private seconds = CLOCK.seconds;
  // Each team's members (state.ts): a person by their id, one of its bots by its key.
  private teams: string[][] = Array.from({ length: MIN_TEAMS }, () => []);
  private points: number[] = [];
  private sites: Region[][] = []; // the rooms each team starts in, no two teams sharing one
  private readonly own = new Map<string, string>(); // everyone's own colour, by id, while they wear their team's

  override get state(): ShootoutState {
    return {
      ...super.state,
      mode: 'shootout',
      seconds: this.seconds,
      teams: this.teams.map((team) => [...team]),
      points: [...this.points],
    };
  }

  // Whoever comes into the game, or into the lobby it's set up in, goes on the team with the fewest.
  override joined(player: PlayerState, made: boolean): void {
    super.joined(player, made);
    if (player.bot || player.ghost) return;
    this.fewest().push(player.id);
    this.room.publish();
  }

  // Someone who leaves is gone from their team. One of its bots that goes is still on its own, to
  // come again with the next game.
  override left(player: PlayerState): void {
    this.teams = this.teams.map((team) => team.filter((id) => id !== player.id));
    this.room.publish();
    super.left(player);
  }

  // A bot goes on the team with the fewest as it's added, and the one that goes is the last on
  // the team with the most.
  protected override added(bot: GameBot): void {
    this.fewest().push(bot.key);
  }

  protected override dropped(bot: GameBot): void {
    this.teams = this.teams.map((team) => team.filter((member) => member !== bot.key));
  }

  protected override goes(): GameBot | undefined {
    const keys = new Set(this.bots.map((bot) => bot.key));
    const most = this.teams
      .filter((team) => team.some((member) => keys.has(member)))
      .reduce<string[]>((most, team) => (team.length >= most.length ? team : most), []);
    return [...this.bots].reverse().find((bot) => most.includes(bot.key));
  }

  protected override ready(): string | null {
    return SHOOTOUT_RULES.starts(this.state);
  }

  protected override set(change: unknown): boolean {
    if (!isShootoutChange(change)) return false;
    if ('clock' in change) {
      const steps = Math.round(change.clock / CLOCK.step);
      this.seconds = Math.max(CLOCK.min, Math.min(CLOCK.max, steps * CLOCK.step));
    } else if ('teams' in change) this.resize(change.teams);
    else this.move(change.move, change.to);
    return true;
  }

  // The fight begins: the rooms indoors are dealt round the teams, everyone starts in one of their
  // team's, spread over them, and every team has no points.
  protected override begin(): void {
    const rooms = [...INDOOR_ROOMS];
    for (let i = rooms.length - 1; i > 0; i--) {
      const j = Math.floor(this.room.random() * (i + 1));
      [rooms[i], rooms[j]] = [rooms[j], rooms[i]];
    }
    this.sites = this.teams.map((_, team) => rooms.filter((_, i) => i % this.teams.length === team));
    this.points = this.teams.map(() => 0);
    super.begin();
  }

  // Whoever is in the fight wears their team's colour, their own kept for the lobby.
  protected override enter(player: PlayerState): PlayerState {
    const body = super.enter(player);
    const team = this.teamOf(body.id);
    if (team >= 0) {
      this.own.set(body.id, body.color);
      body.color = TEAMS[team].colour;
    }
    return body;
  }

  protected override place(player: PlayerState): PlayerState {
    const team = this.teamOf(player.id);
    if (team < 0) return super.place(player);
    const rooms = this.sites[team];
    const place = this.teams[team].indexOf(memberOf(this.bots, player.id));
    return this.room.embody(player, [{ region: rooms[place % rooms.length], weight: 1 }]);
  }

  protected override runs(): number {
    return this.seconds;
  }

  // A death costs the dead player's team, and a kill of someone on another team is the killer's
  // team's gain: a teammate's kill is worth nothing.
  override died(victim: PlayerState, killer: PlayerState | null): void {
    if (!this.playing) return;
    const [lost, won] = [this.teamOf(victim.id), killer ? this.teamOf(killer.id) : -1];
    if (lost < 0) return;
    this.points[lost] = Math.max(0, this.points[lost] - POINTS.death);
    if (won >= 0 && won !== lost) this.points[won] += POINTS.kill;
    this.room.publish();
  }

  // Everyone has their own colour back in the lobby, and those who watched the last game as ghosts
  // are players there, each on a team.
  protected override toLobby(): void {
    const teamed = new Set(this.teams.flat());
    for (const player of this.room.people()) if (!teamed.has(player.id)) this.fewest().push(player.id);
    super.toLobby();
    for (const player of this.room.people()) player.color = this.own.get(player.id) ?? player.color;
    this.own.clear();
  }

  // The team a player is on, by their id; -1 for someone on none.
  private teamOf(id: string): number {
    const member = memberOf(this.bots, id);
    return this.teams.findIndex((team) => team.includes(member));
  }

  private fewest(): string[] {
    return this.teams.reduce((least, team) => (team.length < least.length ? team : least));
  }

  // As many teams as asked for, as far as there can be: a new one is empty, and the last one's
  // players are dealt round the others in turn as it goes.
  private resize(count: number): void {
    const teams = Math.max(MIN_TEAMS, Math.min(TEAMS.length, count));
    while (this.teams.length < teams) this.teams.push([]);
    while (this.teams.length > teams) {
      const gone = this.teams.pop()!;
      gone.forEach((id, i) => this.teams[i % this.teams.length].push(id));
    }
  }

  private move(member: string, to: number): void {
    if (!this.teams[to] || !this.teams.some((team) => team.includes(member))) return;
    this.teams = this.teams.map((team) => team.filter((other) => other !== member));
    this.teams[to].push(member);
  }
}
