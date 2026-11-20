// Where the player sees from. First person is the avatar's own eyes. Third person (Z) is a camera on
// a boom behind its right shoulder that turns with the look, stays a fixed distance out and is
// pulled in short of any wall between it and the body. The crosshair keeps its meaning there by
// aiming the body: the look sent to the server, which is where its shot goes and where others see
// its head turned, is the direction from the eyes to whatever the camera's centre ray lands on, so
// what the crosshair is on is what gets hit. The boom goes out and comes back over a moment, at the
// pace the eyes rise when the look changes; the scope is always looked down from the eyes, at once.
import { Vector3, type UniversalCamera } from '@babylonjs/core';
import {
  classOf,
  dragonShape,
  isDragonAvatar,
  lookDirection,
  MAX_PITCH,
  OUTSIDE_HEIGHT,
  reach,
  type AvatarId,
  type AvatarsOf,
  type PlayerClass,
  type Structures,
  type Target,
  type Vec3,
} from '@world/shared';

export type ViewMode = 'first' | 'third';

// The boom in metres: back from the eyes, out past the right shoulder, and up.
export interface Boom {
  back: number;
  right: number;
  up: number;
}

// How each class (sim/classes.ts) is seen: its boom, for the standard body and in proportion for
// the rest of the walkers, and how wide it sees. A dragon is watched from well back and above its
// head, over the body trailing behind it, and sees wide.
export const VIEWS: Record<PlayerClass, { boom: Boom; fov: number }> = {
  walker: { boom: { back: 3.4, right: 0.6, up: 0.6 }, fov: 1.2 },
  'asian-dragon': { boom: { back: 15, right: 0, up: 5 }, fov: 1.45 },
};
// How a kart is watched as it's driven, whoever drives it, so it sits in one place on screen at one
// size: the boom, metres back and up from its seat at its model's size (behind it and over it, down
// its middle, low and far enough back that all of it shows, tires on the ground, with room under
// them), and how wide it's seen.
export const KART_VIEW = { back: 5.6, up: 1.45, fov: VIEWS.walker.fov };
// A boost as its driver sees it, by how far into one their kart is (its `rush`, 0 to 1): the view
// opens out until, at the full of one, `wide` times as much of the world lies across the screen,
// and the camera closes in on the kart until it's drawn `near` times its size. So the kart stands
// a little bigger while the road and everything beside it stream out past it.
export const RUSH = { wide: 1.3, near: 1.06 };
// Each dragon skin's boom: far enough back and up to see a body of its size behind the head, for
// the model as it comes, and as much again as the body is bigger than it (DragonShape.size).
export const DRAGON_BOOMS: Record<AvatarsOf<'asian-dragon'>, Boom> = {
  'light-dragon': grown(VIEWS['asian-dragon'].boom, dragonShape('light-dragon').size),
  colgera: grown({ back: 26, right: 0, up: 9 }, dragonShape('colgera').size),
};

function grown(boom: Boom, size: number): Boom {
  return { back: boom.back * size, right: boom.right * size, up: boom.up * size };
}

// The boom behind the driver of a kart `size` times its model's, their eyes `seated` metres over
// its seat: KART_VIEW's at that size, closed in on the seat by its `rush` (RUSH), taken from the
// eyes it hangs off.
export function kartBoom(size: number, seated: number, rush: number): Boom {
  const reach = size / (widened(rush) * (1 + (RUSH.near - 1) * rush));
  return { back: KART_VIEW.back * reach, right: 0, up: KART_VIEW.up * reach - seated };
}

// The field of view a kart's driver has through its `rush` (RUSH), `fov` being theirs out of one.
export function kartFov(fov: number, rush: number): number {
  return 2 * Math.atan(Math.tan(fov / 2) * widened(rush));
}

// How many times as much of the world lies across the screen at `rush` of a boost.
function widened(rush: number): number {
  return 1 + (RUSH.wide - 1) * rush;
}

// The boom the camera hangs on behind whoever wears `avatar`.
export function boomOf(avatar: AvatarId): Boom {
  return isDragonAvatar(avatar) ? DRAGON_BOOMS[avatar] : VIEWS[classOf(avatar).id].boom;
}
// Portrait. The camera's field of view is vertical, so a screen taller than wide (a phone held
// upright) sees a narrow slice across, and a body off to the side on the boom lands near its edge
// or past it (a small body's camera is close behind it, so the same shoulder is a wider angle).
// Wider screens are left exactly as they are.
const MIN_HALF_WIDTH = (23 * Math.PI) / 180; // radians either side of the crosshair a portrait screen sees, at least
const SHOULDER_SHARE = 0.35; // how far out to the screen's edge the eyes may sit in portrait, at most

// The field of view (vertical, radians) a screen of this `aspect` (width / height) gets: in
// portrait, widened just enough to see MIN_HALF_WIDTH either side.
export function screenFov(fov: number, aspect: number): number {
  if (aspect >= 1) return fov;
  return Math.max(fov, 2 * Math.atan(Math.tan(MIN_HALF_WIDTH) / aspect));
}

// The boom for a screen of this `aspect` seeing `fov` (as screenFov gives it): in portrait, its
// shoulder brought in so the eyes sit no more than SHOULDER_SHARE of the way to the screen's edge.
// Bringing it in only narrows the gap between the body's look and the crosshair's (see `aim`).
export function screenBoom(boom: Boom, fov: number, aspect: number): Boom {
  if (aspect >= 1) return boom;
  const halfWidth = Math.tan(fov / 2) * aspect; // tangent of the angle the screen sees either side
  return { ...boom, right: Math.min(boom.right, boom.back * halfWidth * SHOULDER_SHARE) };
}
const SKIN = 0.25; // metres the camera keeps off a wall the boom runs into
const FLOOR = 0.15; // metres the camera keeps above the ground when the boom dips under it
// The eyes aim at what the crosshair is on, or a point this far out when nothing is nearer, and no
// nearer than CONVERGE_MIN ahead of the eyes: the look sent is also what the movement keys are
// relative to, and a wall at the nose must not swing it round.
const CONVERGE_FAR = 60;
const CONVERGE_MIN = 5;
const EASE = 0.25; // seconds the boom takes to go out or come in, as the eyes take to rise for a new look
const BODY_FROM = 0.35; // the way out past which the body is drawn: the camera is clear of the head
const STORAGE_KEY = 'world.view'; // the choice, kept for next time

export class View {
  mode: ViewMode = 'third';
  private reach = 0; // how far along its way out the boom is, 0 at the eyes to 1 at its length

  constructor() {
    try {
      if (localStorage.getItem(STORAGE_KEY) === 'first') this.mode = 'first';
    } catch {
      // no storage: the default
    }
    this.reach = this.mode === 'third' ? 1 : 0;
  }

  toggle(): void {
    this.set(this.mode === 'first' ? 'third' : 'first');
  }

  set(mode: ViewMode): void {
    this.mode = mode;
    try {
      localStorage.setItem(STORAGE_KEY, this.mode);
    } catch {
      // not kept
    }
  }

  // Whether the camera is at the eyes this frame, where the first-person hands belong.
  get atEyes(): boolean {
    return this.reach === 0;
  }

  // Whether the player's own body is drawn: the camera is out past the shoulder.
  get showsBody(): boolean {
    return this.reach > BODY_FROM;
  }

  // Puts the camera for this frame: at `eyes` (less the head bob's `dip`) or out along the `boom`
  // behind them, stopped short of `structures`, by how far it has got in `dt` more seconds. Scoped,
  // it is at the eyes at once. The look is the camera's rotation either way, set by the Game.
  place(
    camera: UniversalCamera,
    eyes: Vector3,
    dip: number,
    yaw: number,
    pitch: number,
    boom: Boom,
    scoped: boolean,
    structures: Structures,
    dt: number,
  ): void {
    const target = this.mode === 'third' && !scoped ? 1 : 0;
    const step = Math.min(dt / EASE, Math.abs(target - this.reach));
    this.reach = scoped ? 0 : this.reach + (target > this.reach ? step : -step);
    if (this.reach === 0) {
      camera.position.set(eyes.x, eyes.y - dip, eyes.z);
      return;
    }
    const out = this.reach * this.reach * (3 - 2 * this.reach); // eased at both ends
    const f = lookDirection(yaw, pitch);
    const want = new Vector3(
      eyes.x - f.x * boom.back + Math.cos(yaw) * boom.right,
      eyes.y - f.y * boom.back + boom.up,
      eyes.z - f.z * boom.back - Math.sin(yaw) * boom.right,
    );
    const span = Vector3.Distance(eyes, want);
    const dir = want.subtract(eyes).scaleInPlace(1 / span);
    const along = Math.max(0, Math.min(span * out, structures.raycast(eyes, dir, span) - SKIN));
    const x = eyes.x + dir.x * along;
    const z = eyes.z + dir.z * along;
    const ground = structures.ground.inside(x, z) ? 0 : OUTSIDE_HEIGHT; // past the edge, down in the drop after a dragon
    camera.position.set(x, Math.max(ground + FLOOR, eyes.y + dir.y * along - dip * (1 - out)), z);
  }

  // The look to send: the camera's own at the eyes, else from the eyes to where the camera's centre
  // ray lands on a wall or another player, or CONVERGE_FAR out.
  aim(
    eyes: Vec3,
    camera: Vec3,
    yaw: number,
    pitch: number,
    selfId: string,
    targets: Iterable<Target>,
    structures: Structures,
  ): { yaw: number; pitch: number } {
    if (this.reach === 0) return { yaw, pitch };
    const d = lookDirection(yaw, pitch);
    // The camera sits behind the eyes, a tall body's further back than CONVERGE_MIN, and off to the
    // side of them: a point nearer the eyes than that would be well off to the side too.
    const behind = (eyes.x - camera.x) * d.x + (eyes.y - camera.y) * d.y + (eyes.z - camera.z) * d.z;
    const t = Math.max(Math.max(0, behind) + CONVERGE_MIN, reach(camera, d, targets, CONVERGE_FAR, selfId, structures));
    const dx = camera.x + d.x * t - eyes.x;
    const dy = camera.y + d.y * t - eyes.y;
    const dz = camera.z + d.z * t - eyes.z;
    const aimed = -Math.atan2(dy, Math.hypot(dx, dz));
    return { yaw: Math.atan2(dx, dz), pitch: Math.max(-MAX_PITCH, Math.min(MAX_PITCH, aimed)) };
  }
}
