// The bots' map of the bodies there are: every avatar's hitbox, for aiming, its eyes, its walk and
// the way it moves (modal-bots/common/map/bodies.py), from the avatars' rows alone. Built at once.
import { AVATAR_IDS, AVATARS, jumpVelocityOf, walkSpeedOf, type AvatarId, type Hitbox } from '../avatars';
import { stamped } from './stage';

export interface BodiesMap {
  source: number;
  hitboxes: Record<string, Hitbox>; // what a shot has to land in, by avatar id (sim/avatars.ts)
  eyes: Record<string, number>; // metres from the feet to each avatar's eyes, where its shots leave (sim/avatars.ts)
  walks: Record<string, number>; // how fast each avatar walks at full keys, m/s (sim/avatars.ts walkSpeedOf)
  moves: Record<string, Move>; // how each avatar moves, the moves' key to its jumps (ground.ts MovesMap)
}

// A way of moving on foot: a walk in m/s and a jump's velocity, as `${walk} ${jump}`. Every class
// but the walker moves as the standard body does here.
export type Move = string;

export function moveOf(id: AvatarId): Move {
  const as = AVATARS[id].class === 'walker' ? id : 'standard';
  return `${walkSpeedOf(as)} ${jumpVelocityOf(as)}`;
}

// Each way of moving there is, with the look that stands for it: the first to move that way, the
// standard body for its own.
export function movers(): Map<Move, AvatarId> {
  const movers = new Map<Move, AvatarId>();
  for (const id of ['standard', ...AVATAR_IDS] as const) if (!movers.has(moveOf(id))) movers.set(moveOf(id), id);
  return movers;
}

export function buildBodiesMap(): BodiesMap {
  const each = <T>(f: (id: AvatarId) => T) => Object.fromEntries(AVATAR_IDS.map((id) => [id, f(id)]));
  return stamped({
    hitboxes: each((id) => AVATARS[id].hitbox),
    eyes: each((id) => AVATARS[id].eye),
    walks: each(walkSpeedOf),
    moves: each(moveOf),
  });
}
