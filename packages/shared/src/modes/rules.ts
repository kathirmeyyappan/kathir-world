// The half of a game mode both sides share (docs/game-modes.md): its rules, pure functions of the
// game's state as everyone is told of it. The Room enforces them and the client shows them (a
// refused command greyed before it's sent), so the two can't disagree, and nothing worked out from
// the state is sent beside it. FREEPLAY_RULES is freeplay's answers; a game's are those with some
// answered its own way (game.ts).
import type { Command } from '../commands';
import { AVATARS } from '../sim/avatars';
import type { Track } from '../sim/tracks';
import type { GameState } from './index';

export interface Rules {
  // Why `command` is refused as the game stands, or null.
  refuses(game: GameState, command: Command): string | null;
  // What no hearts means for a person as the game stands.
  dying(game: GameState): Dying;
  // Why its game can't be started as it's set up, or null.
  starts(game: GameState): string | null;
  // The side a player (by id) is on in the game as it stands, or null: none, as everyone is where
  // there are no sides to be on.
  side(game: GameState, player: string): Side | null;
  // How the game stands, the best first: who has what, and who's winning, or once it's over, won.
  standings(game: GameState): Standing[];
  // How `viewer` is shown the player `other` (by id) as the game stands.
  sees(game: GameState, viewer: { id: string; ghost: boolean }, other: string): Sight;
  // The track in play as the game stands (sim/tracks.ts), which is all the floor there is to a
  // kart while it is; null: the whole world's.
  track(game: GameState): Track | null;
  // Whether a player (by id) is kept in the kart they drive as the game stands: there's no getting
  // out of it.
  seated(game: GameState, player: string): boolean;
  // Whether the kart a player (by id) drives is held as the game stood at `tick`: its keys do
  // nothing, so it stands where it is, or rolls to a stop.
  held(game: GameState, player: string, tick: number): boolean;
}

// How one player is shown another: `plain`, as anyone is in freeplay (their name over their head, a
// pin at the screen's edge, a mark on the maps); `side`, the same with a mark as big as the viewer's
// own, for someone on their side; or `hidden`, with none of the three.
export type Sight = 'plain' | 'side' | 'hidden';

// A side in a game (a team): what it's called, and the colour its players go by.
export interface Side {
  name: string;
  colour: string;
}

export interface Standing {
  side: Side;
  points: number;
  won: boolean; // no side has more
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
  side: () => null,
  standings: () => [],
  sees: () => 'plain',
  track: () => null,
  seated: () => false,
  held: () => false,
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
