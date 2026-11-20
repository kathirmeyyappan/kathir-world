// Plankton: a 0.28 m green one-eyed copepod on two stick legs, antennae and all, from Cheryl Hill's
// Battle for Bikini Bottom Rehydrated model (planktonModel.ts, made by scripts/avatar-model.py), a
// Body (Body.ts): his head is most of him. Worn with /plankton; its hit capsule is
// AVATARS.plankton.hitbox. Far too small to reach a kart's pedals, he drives one standing on top of
// its steering wheel, running on it.
import type { Seat } from '../vehicles/Seat';
import type { BodySpec } from './Body';
import { PLANKTON_MODEL } from './planktonModel';
import { hang, WalkerAvatar, type Pose } from './Walker';

const ARMS_DOWN = 1.2; // radians: the model holds his arms straight out
// On the steering wheel: radians a second his stride runs at with the kart standing, and more for
// each m/s it goes; radians his legs and arms swing each way; metres he bobs; and radians he leans
// into the sharpest turn.
const RUN = 9;
const RUN_PER_SPEED = 0.9;
const RUN_LEGS = 1.0;
const RUN_ARMS = 1.1;
const RUN_BOB = 0.012;
const RUN_LEAN = 0.35;

// He runs on the steering wheel's rim, on its top however it's turned, never getting anywhere, and
// a trick throws him up off it as the kart twirls under him.
class PlanktonAvatar extends WalkerAvatar {
  private running = 0; // radians into his stride on the wheel

  protected override sit(seat: Seat, dt: number): Pose {
    const f = this.figure;
    this.place(seat);
    this.running += dt * (RUN + Math.abs(seat.speed) * RUN_PER_SPEED);
    const swing = Math.sin(this.running);
    this.base.position.copyFrom(seat.top).addInPlaceFromFloats(0, Math.abs(swing) * RUN_BOB + this.thrown(seat), 0);
    this.base.rotation.set(0, 0, -seat.wheel * RUN_LEAN);
    for (const leg of f.legs ?? []) leg.node.rotation.x = leg.side * swing * RUN_LEGS;
    for (const [arm, side] of [
      [f.armL, 1],
      [f.armR, -1],
    ] as const) {
      if (!arm) continue;
      hang(arm.node);
      arm.node.rotation.set(-side * swing * RUN_ARMS, 0, side * ARMS_DOWN);
    }
    if (f.tilt) f.tilt.node.rotation.x = 0;
    return { phase: this.running, effort: 1, on: 'kart' };
  }
}

export const PLANKTON: BodySpec = {
  kind: 'plankton',
  model: PLANKTON_MODEL,
  avatar: PlanktonAvatar,
  shadow: 0.16,
  legSwing: 0.7,
  armSwing: 0.5,
  armsDown: ARMS_DOWN,
  bob: 0.006,
  follow: 0.3,
  // The guns and packs were made for a person, a dozen times his height.
  itemScale: { weapons: 0.12, packs: 0.06 },
};
