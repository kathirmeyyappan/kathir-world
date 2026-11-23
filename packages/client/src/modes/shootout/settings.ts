// Shootout's settings in the menu's GAME tab (docs/game-modes.md): how many teams, how long the
// game runs, the bots it brings and how good each is, and who's on each team.
import { CLOCK, MIN_TEAMS, TEAMS, isShootout, type ShootoutState } from '@world/shared';
import { IS_TOUCH } from '../../input/touch';
import { clockFace } from '../../ui/clock';
import type { Entry, Row } from '../../ui/menu/rows';
import { botEntry, botsRow, settable } from '../bots';
import type { ModeHooks } from '../index';

const MOVING = IS_TOUCH
  ? 'Tap a player and then a team to move them.'
  : 'Drag a player onto a team, or click them and then the team.';
// What stands in before the room's game is known to be one of these: never shown.
const NONE: Pick<ShootoutState, 'seconds' | 'teams'> = { seconds: CLOCK.seconds, teams: [] };

export function shootoutSettings(hooks: ModeHooks): Row[] {
  const game = () => {
    const told = hooks.game();
    return isShootout(told) ? told : NONE;
  };
  const mine = () => settable(hooks);
  // A member of a team: one of the game's bots by its key, with its level, and anyone else by
  // their id.
  const member = (key: string): Entry => {
    const bot = hooks.game().bots.find((b) => b.key === key);
    return bot ? botEntry(hooks, bot) : hooks.listed(key);
  };
  return [
    {
      kind: 'stepper',
      label: 'TEAMS',
      value: () => String(game().teams.length),
      step: (by) => hooks.set({ teams: game().teams.length + by }),
      can: (by) => mine() && game().teams.length + by >= MIN_TEAMS && game().teams.length + by <= TEAMS.length,
    },
    {
      kind: 'stepper',
      label: 'CLOCK',
      value: () => clockFace(game().seconds),
      step: (by) => hooks.set({ clock: game().seconds + by * CLOCK.step }),
      can: (by) =>
        mine() && game().seconds + by * CLOCK.step >= CLOCK.min && game().seconds + by * CLOCK.step <= CLOCK.max,
    },
    botsRow(hooks),
    {
      kind: 'board',
      columns: () => game().teams.map((team, i) => ({ ...TEAMS[i], players: team.map(member) })),
      can: mine,
      move: (player, to) => hooks.set({ move: player, to }),
      hint: () => (mine() ? MOVING : null),
    },
  ];
}
