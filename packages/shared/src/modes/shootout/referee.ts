// Shootout as its Room runs it (docs/game-modes.md): what every game shares (game.ts), with its
// own settings and everyone on a team.
import type { PlayerState } from '../../sim/types';
import { Game } from '../game';
import { SHOOTOUT_RULES } from './rules';
import { CLOCK, MIN_TEAMS, TEAMS, isShootoutChange, type ShootoutState } from './state';

export class Shootout extends Game {
  private seconds = CLOCK.seconds;
  private teams: string[][] = Array.from({ length: MIN_TEAMS }, () => []);

  override get state(): ShootoutState {
    return { ...super.state, mode: 'shootout', seconds: this.seconds, teams: this.teams.map((team) => [...team]) };
  }

  // Whoever comes into the game, or into the lobby it's set up in, goes on the team with the fewest.
  override joined(player: PlayerState, made: boolean): void {
    super.joined(player, made);
    if (player.bot || player.ghost) return;
    this.fewest().push(player.id);
    this.room.publish();
  }

  // Someone who leaves is gone from their team.
  override left(player: PlayerState): void {
    this.teams = this.teams.map((team) => team.filter((id) => id !== player.id));
    this.room.publish();
    super.left(player);
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

  // Those who watched the last game as ghosts are players in the lobby, each on a team.
  protected override toLobby(): void {
    const teamed = new Set(this.teams.flat());
    for (const player of this.room.people()) if (!teamed.has(player.id)) this.fewest().push(player.id);
    super.toLobby();
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

  private move(id: string, to: number): void {
    if (!this.teams[to] || !this.teams.some((team) => team.includes(id))) return;
    this.teams = this.teams.map((team) => team.filter((other) => other !== id));
    this.teams[to].push(id);
  }
}
