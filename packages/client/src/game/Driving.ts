// Driving a kart, as the player sees it (sim/vehicles/): every kart drawn, the one they drive from
// its prediction and the rest from the snapshots, with its seat for its driver's body to sit in;
// the kart under the crosshair, which a click gets them into; the look carried round with the kart
// they drive and, once the mouse has been let be a moment, settled back behind it; and the keys
// that drive it besides the movement keys: the drift held on Space, and E to get out.
import type { Scene } from '@babylonjs/core';
import {
  KART_ACTIONS,
  KART_REACH,
  kartAt,
  type ItemAction,
  type Kart,
  type KartState,
  type Structures,
  type Vec3,
} from '@world/shared';
import type { InputManager } from '../input/InputManager';
import { KartMesh } from '../render/vehicles/KartMesh';
import type { Seat } from '../render/vehicles/Seat';

const SETTLE_AFTER = 0.8; // seconds of the look let be before it settles back behind the kart
const SETTLE_RATE = 3; // per second: how fast it settles
const SETTLED_PITCH = 0.12; // radians down the settled look is, over the kart's nose

export class Driving {
  private readonly drawn = new Map<string, KartMesh>();
  private kartYaw: number | null = null; // the yaw of the kart they drive, as last followed
  private left: { yaw: number; pitch: number } | null = null; // the look as it was last left
  private still = 0; // seconds the look has been let be

  constructor(private readonly scene: Scene) {}

  // Draws `karts` as they are this frame, and lets go of any that are gone.
  draw(karts: Kart[], dt: number): void {
    const here = new Set<string>();
    for (const k of karts) {
      here.add(k.id);
      let mesh = this.drawn.get(k.id);
      if (!mesh) this.drawn.set(k.id, (mesh = new KartMesh(this.scene, k.id, k.kart, k.paint)));
      mesh.update(k, dt);
    }
    for (const [id, mesh] of this.drawn)
      if (!here.has(id)) {
        mesh.dispose();
        this.drawn.delete(id);
      }
  }

  // The seat of the kart `id` as it was last drawn, for its driver's body to sit in.
  seatOf(id: string): Seat | null {
    return this.drawn.get(id)?.seat ?? null;
  }

  // The kart a click from `eye` along unit `dir` gets into: the nearest of `karts` within
  // KART_REACH, with no wall nearer.
  under(eye: Vec3, dir: Vec3, karts: Kart[], structures: Structures): Kart | null {
    return kartAt(eye, dir, Math.min(KART_REACH, structures.raycast(eye, dir, KART_REACH)), karts)?.kart ?? null;
  }

  // Turns `look` with the kart they drive (null: they aren't), and once it's been let be for
  // SETTLE_AFTER, eases it back behind the kart, looking a little down over its nose.
  follow(look: { yaw: number; pitch: number }, kart: KartState | null, dt: number): void {
    if (!kart) {
      this.kartYaw = this.left = null;
      return;
    }
    const moved = !this.left || look.yaw !== this.left.yaw || look.pitch !== this.left.pitch;
    this.still = moved ? 0 : this.still + dt;
    if (this.kartYaw !== null) look.yaw += wrap(kart.yaw - this.kartYaw);
    this.kartYaw = kart.yaw;
    if (this.still > SETTLE_AFTER) {
      const k = 1 - Math.exp(-SETTLE_RATE * dt);
      look.yaw -= wrap(look.yaw - kart.yaw) * k;
      look.pitch += (SETTLED_PITCH - look.pitch) * k;
    }
    this.left = { yaw: look.yaw, pitch: look.pitch };
  }

  // The actions a driver's keys hold this frame (KART_ACTIONS): one that's held while its key is
  // down, one that's a tap on a press of its key.
  actions(input: InputManager): ItemAction[] {
    return (Object.keys(KART_ACTIONS) as (keyof typeof KART_ACTIONS)[]).filter((action) => {
      const { key, mode } = KART_ACTIONS[action];
      return mode === 'hold' ? input.isDown(key) : input.wasPressed(key);
    });
  }
}

// An angle brought within [-π, π].
function wrap(a: number): number {
  return a - 2 * Math.PI * Math.round(a / (2 * Math.PI));
}
