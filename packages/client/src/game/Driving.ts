// Driving a kart, as the player sees it (sim/vehicles/): every kart drawn, the one they drive from
// its prediction and the rest from the snapshots, with its seat for its driver's body to sit in,
// and what each has begun said, for what's heard of it;
// the kart under the crosshair, which a click gets them into; the look carried round with the kart
// they drive and, once the mouse has been let be a moment, settled back behind it; and the keys
// that drive it besides the movement keys: the drift held on Space, and E to get out.
import {
  KART_ACTIONS,
  KART_REACH,
  kartAt,
  type ItemAction,
  type Kart,
  type KartState,
  type Spark,
  type Structures,
  type Vec3,
} from '@world/shared';
import type { InputManager } from '../input/InputManager';
import type { Engine } from '../render/Engine';
import { KartMesh } from '../render/vehicles/KartMesh';
import type { Seat } from '../render/vehicles/Seat';

const SETTLE_AFTER = 0.8; // seconds of the look let be before it settles back behind the kart
const SETTLE_RATE = 3; // per second: how fast it settles
const SETTLED_PITCH = 0.12; // radians down the settled look is, over the kart's nose

export class Driving {
  onKnock: ((at: Vec3) => void) | null = null; // a kart there lost wrenches to a knock: for what's heard of it
  onBoost: ((at: Vec3) => void) | null = null; // a kart there began a boost: for what's heard of it
  onTrick: ((at: Vec3, driver: string | null) => void) | null = null; // a kart there began a trick, with `driver` in it
  onSpark: ((at: Vec3, spark: Spark) => void) | null = null; // a kart's drift there reached `spark`
  private readonly drawn = new Map<string, KartMesh>(); // each kart drawn
  private kartYaw: number | null = null; // the yaw of the kart they drive, as last followed
  private left: { yaw: number; pitch: number } | null = null; // the look as it was last left
  private still = 0; // seconds the look has been let be

  constructor(private readonly engine: Engine) {}

  // Draws `karts` as they are this frame, says what each has begun since the last (a knock that
  // cost it wrenches, a boost, a trick, a spark of its drift), and lets go of any that are gone.
  draw(karts: Kart[], dt: number): void {
    const here = new Set<string>();
    for (const k of karts) {
      here.add(k.id);
      let mesh = this.drawn.get(k.id);
      if (!mesh) this.drawn.set(k.id, (mesh = new KartMesh(this.engine, k.id, k.kart, k.paint)));
      const began = mesh.update(k, dt);
      if (began.knock) this.onKnock?.(k.pos);
      if (began.boost) this.onBoost?.(k.pos);
      if (began.trick) this.onTrick?.(k.pos, k.driver);
      if (began.spark) this.onSpark?.(k.pos, began.spark);
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
