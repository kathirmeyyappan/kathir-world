// The half of a game mode both sides share (docs/game-modes.md): its rules, pure functions of the
// game's state as everyone is told of it. The Room enforces them and the client shows them (a
// refused command greyed before it's sent), so the two can't disagree, and nothing worked out from
// the state is sent beside it. FREEPLAY_RULES is freeplay's answers; a game's are those with some
// answered its own way (game.ts).
import type { Command } from '../commands';
import { AVATARS } from '../sim/avatars';
import type { GameState } from './index';

export interface Rules {
  // Why `command` is refused as the game stands, or null.
  refuses(game: GameState, command: Command): string | null;
  // What no hearts means for a person as the game stands.
  dying(game: GameState): Dying;
  // Why its game can't be started as it's set up, or null.
  starts(game: GameState): string | null;
}

// What no hearts means for a person: their body lies `seconds` where it fell, and they're then
// back in a new one. With a `screen`, the death screen stands over that, counting it down: its
// button brings them back sooner, and their look's death sound plays. With none the world stays in
// view, and they watch their body lie there.
export interface Dying {
  seconds: number;
  screen: boolean;
}

// Freeplay's: ten seconds under the death screen.
export const FREEPLAY_DYING: Dying = { seconds: 10, screen: true };

export const FREEPLAY_RULES: Rules = {
  refuses: () => null,
  dying: () => FREEPLAY_DYING,
  starts: () => null,
};

// What a command is to a game's rules. A game says of every kind whether it allows it (`Allowed`),
// and so does a ghost, so a new kind of command doesn't build until each has said.
export type CommandKind =
  | 'speedy'
  | 'weapon'
  | 'gear'
  | 'unequip'
  | 'look' // a look on foot
  | 'dragon' // a look that isn't
  | 'colour'
  | 'bot'
  | 'kill-bots'
  | 'kart'
  | 'teleport';

// The kind a command is; null for one that isn't a command at all.
export function kindOf(command: Command): CommandKind | null {
  switch (command.name) {
    case 'equip':
      return 'weapon';
    case 'wear':
      return 'gear';
    case 'avatar':
      return AVATARS[command.avatar].class === 'walker' ? 'look' : 'dragon';
    case 'color':
      return 'colour';
    case 'unknown':
      return null;
    default:
      return command.name;
  }
}

// Whether each kind of command is allowed.
export type Allowed = Record<CommandKind, boolean>;

// What a ghost may ask for, in whatever game: what's a body's own to do (a look on foot, something
// in hand or worn), and nothing that puts a thing in the world or takes up room in it.
export const GHOST_ALLOWS: Allowed = {
  speedy: true,
  weapon: true,
  gear: true,
  unequip: true,
  look: true,
  dragon: false,
  colour: true,
  bot: false,
  'kill-bots': false,
  kart: false,
  teleport: true,
};
