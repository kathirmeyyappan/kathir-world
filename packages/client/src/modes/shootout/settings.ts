// Shootout's settings in the menu's GAME tab (docs/game-modes.md): how many teams, who's on each,
// and how long the game runs.
import { CLOCK, MIN_TEAMS, TEAMS, isShootout, type ShootoutState } from '@world/shared';
import { IS_TOUCH } from '../../input/touch';
import type { Row } from '../../ui/menu/rows';
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
  const mine = () => hooks.master() && hooks.game().phase === 'lobby';
  return [
    {
      kind: 'stepper',
      label: 'TEAMS',
      value: () => String(game().teams.length),
      step: (by) => hooks.set({ teams: game().teams.length + by }),
      can: (by) => mine() && game().teams.length + by >= MIN_TEAMS && game().teams.length + by <= TEAMS.length,
    },
    {
      kind: 'board',
      columns: () =>
        game().teams.map((team, i) => ({
          ...TEAMS[i],
          players: team.map((id) => ({ id, name: hooks.nameOf(id) })),
        })),
      can: mine,
      move: (player, to) => hooks.set({ move: player, to }),
      hint: () => (mine() ? MOVING : null),
    },
    {
      kind: 'stepper',
      label: 'CLOCK',
      value: () => clock(game().seconds),
      step: (by) => hooks.set({ clock: game().seconds + by * CLOCK.step }),
      can: (by) =>
        mine() && game().seconds + by * CLOCK.step >= CLOCK.min && game().seconds + by * CLOCK.step <= CLOCK.max,
    },
    {
      kind: 'stepper',
      label: 'BOTS',
      value: () => '0',
      step: () => {},
      can: () => false,
      hint: () => 'Bots that play this mode are on the way.',
    },
  ];
}

// "5:00", "0:30".
function clock(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}
