import type { AvatarId } from './avatars';
import type { DragonState } from './dragon';
import type { GearState } from './gear';
import type { ItemAction, ItemState } from './items';

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

// One player as the server sees them. `pos` is eye position, not feet.
export interface PlayerState {
  id: string;
  name: string;
  color: string;
  pos: Vec3;
  vy: number;
  vx: number; // the walk's velocity across the floor, m/s: what it keeps on a slippery footing (walker.ts)
  vz: number;
  // Thrown (by ice, or by a weapon): in the air with the keys given only this much grip on the
  // flight, m/s² (0: none), until it lands; null on its own feet (walker.ts `throwWalker`).
  thrown: number | null;
  leap: boolean; // in a long jump (avatars.ts `Leap`), until it lands or something else moves it
  rest: number; // seconds its feet have still to stay down before they can jump (a long jump's landing, LEAP_REST)
  // A chain of jumps (avatars.ts `Chain`): which jump of it the last one was, from 1, or 0 with no
  // chain running; and the seconds its feet have been down since they last landed, up to a second.
  hop: number;
  down: number;
  // In a ground pound (avatars.ts `Pound`, walker.ts): the stage it's at and the seconds into it,
  // 0 on the tick the stage began, with the eye height it began at, which its landing and its
  // power are judged from; null otherwise.
  pound: { stage: 'twirl' | 'drop' | 'land'; t: number; from: number } | null;
  crouch: boolean; // crouched on the ground (avatars.ts `Crouch`): the crouch action held there
  backflip: boolean; // in the jump taken out of a crouch, until it lands or something else moves it
  strike: number | null; // seconds into a strike (avatars.ts `Strike`), 0 on the tick of the press; null out of one
  // A float (avatars.ts `Float`): whether it is floating, and the seconds it has floated since it last stood.
  floating: boolean;
  floated: number;
  // On a ladder (structures.ts `ladder`, walker.ts): the piece, the face it climbs (±1 along the
  // ladder's local z), and which way round the ladder it last went to it (-1 by its left, 1 by its
  // right), for the swing; null on foot.
  climb: { piece: number; side: 1 | -1; way: 1 | -1 } | null;
  // How fast the feet are walking, m/s: what paces the legs and the footsteps. The walk the keys
  // ask for on a slippery footing (the feet work however the body slides), else the walk the body
  // makes (none against a wall); 0 for a class that doesn't walk.
  walk: number;
  yaw: number;
  pitch: number;
  // The way the body faces, radians as a yaw (walker.ts `turnBody`): its look while it holds
  // something to aim, else the way it last went, kept while it stands; the ladder's way on a
  // ladder. Every client draws it so, whoever saw the body move.
  facing: number;
  lastSeq: number;
  reading: string | null;
  boost: number; // seconds of /speedy left, 0 when normal
  chilled: number; // seconds of the slow walk left (an ice hit, constants.ts)
  item: ItemState | null; // the weapon they're holding, if any
  gear: GearState | null; // what they're wearing beside it, if anything (sim/gear.ts)
  scoped: boolean; // aiming down the sniper's scope (reported by the client, kept here so everyone sees it)
  firing: boolean; // a hold item is spraying this tick
  thrusting: boolean; // their gear is lifting them this tick (a jetpack's jet)
  avatar: AvatarId; // how they look, and so their class (sim/classes.ts)
  dragon: DragonState | null; // a dragon's body (sim/dragon.ts); null on foot
  avatarLocked: boolean; // a bot's look, fixed for its run; commands can't change it
  riding: string | null; // the kart they're driving (vehicles/garage.ts), sat in its seat; null on foot
  hearts: number; // a full life at spawn (classes.ts), down to 0 when shot enough
  kills: number; // players this one has finished off since joining
  deaths: number; // times they've died since joining
  bot: boolean; // declared by the client at join; a headless player, shown as one, and never keeps a room open
  dead: boolean; // lying where they died, until the Room brings a person back in a new body (room.ts `respawn`)
}

// One tick of intent from a client. Look is client-authoritative; movement is not.
export interface InputFrame {
  seq: number;
  mx: number;
  my: number;
  yaw: number;
  pitch: number;
  jump: boolean;
  reading: string | null;
  use?: string | null; // the door clicked this tick (sim/doors.ts), if any
  actions: ItemAction[]; // item and class actions held this tick (tap ones on the press, toggles while on)
  view?: number; // server tick the player was seeing others at; shots are judged there (rewind.ts)
}

export interface CubeState {
  id: string;
  pos: Vec3;
  rot: { x: number; y: number };
  target: { x: number; z: number };
  time: number;
  wanderSpeed: number;
  floatFrequency: number;
  rotationSpeed: number;
}
