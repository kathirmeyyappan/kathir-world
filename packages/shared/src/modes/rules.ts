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
};

// What a command is to a game's rules. A game says of every kind whether it allows it (game.ts
// `Allowed`), so a new kind of command doesn't build until every game has said.
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
