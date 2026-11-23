// The row every mode's settings end on until there are bots that play it (docs/game-modes.md):
// drawn, and not to be pressed.
import type { Row } from '../ui/menu/rows';

export const BOTS_TO_COME: Row = {
  kind: 'stepper',
  label: 'BOTS',
  value: () => '0',
  step: () => {},
  can: () => false,
  hint: () => 'Bots that play this mode are on the way.',
};
