// Lakitu fishing karts back onto the world (sim/vehicles/rescue.ts), as it's seen: by each kart in
// a rescue within sight, one of him. He comes down from up ahead of it as its rescue begins,
// facing its driver, his hook taking it by the nose; stays there, bobbing on his cloud, while
// the sim hoists it, carries it across and lowers it; and once it's let go, goes back up the way
// he came and is gone. His files are sent for as a driver is first seen stranded, which is
// RESCUE.wait before he's needed; a rescue never waits on them, and with none he isn't drawn.
import type { Scene } from '@babylonjs/core';
import { RESCUE, SCOPED_SIGHT, bodyOf, noseOf, stranded, type Kart, type Vec3 } from '@world/shared';
import { Lakitu, wantLakitu } from './Lakitu';

const LINE = 2.7; // metres of line from the tip of his rod down to his hook
// Where his hook's eye hangs on a kart: metres in from its nose, to the right of its middle (his
// side of it, so the line isn't lost behind its driver's head), and over its top.
const HOOK = { in: 0.4, right: 0.45, over: 0 };
const ASIDE = 1; // radians round to the kart's right of dead ahead he stands, clear of its driver and the HUD over them
const AWAY = { up: 10, ahead: 8 }; // metres up and out ahead of a kart he comes down from and goes back to
const LEAVE = 1; // seconds he takes to go
const VANISH = 0.3; // seconds, the last of those, he shrinks away over
const BOB = { height: 0.07, rate: 4.5 }; // metres he bobs either way on his cloud, and radians a second of it

// One of him: where his hook's eye is on his kart and the way its nose points, as last seen in its
// rescue, whether that was this frame, and the seconds since it was let go.
interface Fishing {
  lakitu: Lakitu;
  eye: Vec3;
  yaw: number;
  holds: boolean;
  gone: number;
}

export class Rescuers {
  private readonly fishing = new Map<string, Fishing>();
  private clock = 0; // seconds, for his bobbing

  constructor(private readonly scene: Scene) {}

  // Draws him over every one of `karts` in a rescue, as they're drawn this frame and seen from
  // `from`, and sees off each one of him whose kart has been let go.
  update(karts: Kart[], from: Vec3, dt: number): void {
    this.clock += dt;
    for (const k of karts) {
      if (!k.rescue && !(k.driver && stranded(k))) continue;
      if (Math.hypot(k.pos.x - from.x, k.pos.y - from.y, k.pos.z - from.z) > SCOPED_SIGHT) continue;
      wantLakitu(this.scene);
      if (!k.rescue) continue;
      const { length, height } = bodyOf(k);
      const nose = noseOf(k.yaw);
      const out = length / 2 - HOOK.in;
      const eye = {
        x: k.pos.x + nose.x * out + nose.z * HOOK.right,
        y: k.pos.y + height + HOOK.over,
        z: k.pos.z + nose.z * out - nose.x * HOOK.right,
      };
      let f = this.fishing.get(k.id);
      if (f) Object.assign(f, { eye, yaw: k.yaw, holds: true, gone: 0 });
      else
        this.fishing.set(k.id, (f = { lakitu: new Lakitu(this.scene, true), eye, yaw: k.yaw, holds: true, gone: 0 }));
      this.place(f, 1 - eased(k.rescue.t / RESCUE.come), 1);
    }
    for (const [id, f] of this.fishing) {
      if (f.holds) {
        f.holds = false;
        continue;
      }
      f.gone += dt;
      if (f.gone < LEAVE) this.place(f, (f.gone / LEAVE) ** 2, Math.min(1, (LEAVE - f.gone) / VANISH));
      else {
        f.lakitu.dispose();
        this.fishing.delete(id);
      }
    }
  }

  // Stands one of him `away` of the way off (0 with his hook on his kart, 1 up ahead of it where he
  // comes from and goes to), at `size` times his own, facing back at it.
  private place(f: Fishing, away: number, size: number): void {
    const nose = noseOf(f.yaw);
    const eye = {
      x: f.eye.x + nose.x * AWAY.ahead * away,
      y: f.eye.y + AWAY.up * away,
      z: f.eye.z + nose.z * AWAY.ahead * away,
    };
    f.lakitu.fish(eye, f.yaw + Math.PI + ASIDE, LINE + BOB.height * Math.sin(this.clock * BOB.rate), size);
  }
}

// From 0 to 1 as `u` goes from 0 to 1, starting and stopping gently.
function eased(u: number): number {
  const c = Math.max(0, Math.min(1, u));
  return c * c * (3 - 2 * c);
}
