// Where a driver sits in a kart, as the kart is drawn this frame: what their body sits in
// (avatars/Walker.ts `sit`). Its frame is the kart's, tipped with it, from the middle of the seat's
// top: x to the kart's right, y up, z ahead. `at` and `turn` put that frame in the world, and the
// rest is in it, at the size the kart is drawn.
import { Quaternion, Vector3 } from '@babylonjs/core';
import type { KartModel } from './kartModel';

export class Seat {
  readonly at = new Vector3(); // the middle of the seat's top, in the world
  readonly turn = new Quaternion(); // the kart's, tipped with it as it's drawn
  yaw = 0; // radians the kart faces
  wheel = 0; // how far over its steering wheel is, -1 to 1, to the right
  speed = 0; // m/s along the kart
  readonly grips: readonly [Vector3, Vector3] = [new Vector3(), new Vector3()]; // left and right, turned with the wheel
  readonly feet = new Vector3(); // where the right foot rests; the left's is across the middle from it
  readonly hub = new Vector3(); // the steering wheel's middle
  readonly top = new Vector3(); // the top of its rim, as it stands unturned

  // All of those as the model has them, at its own size: the seat in the kart's frame, and the rest
  // from it, but the grips, each from the steering wheel's middle.
  private readonly model: { from: Vector3; feet: Vector3; hub: Vector3; top: Vector3; grips: [Vector3, Vector3] };

  constructor(model: KartModel) {
    const from = Vector3.FromArray(model.seat);
    const hub = Vector3.FromArray(model.steer.at);
    // Up the face of the wheel: the world's up, less what of it is along the axis the wheel turns round.
    const axis = Vector3.FromArray(model.steer.axis);
    const up = Vector3.Up().subtractInPlace(axis.scale(axis.y)).normalize();
    this.model = {
      from,
      feet: Vector3.FromArray(model.feet).subtractInPlace(from),
      hub: hub.subtract(from),
      top: hub.subtract(from).addInPlace(up.scaleInPlace(model.steer.radius)),
      grips: [
        Vector3.FromArray(model.grips[0]).subtractInPlace(hub),
        Vector3.FromArray(model.grips[1]).subtractInPlace(hub),
      ],
    };
  }

  // Puts it in a kart whose ground under its middle is at `pos` (KartMesh's root), turned by
  // `turn` there and drawn `size` times its model's size; its steering wheel turned by `steer`
  // about its own middle, `wheel` of the way over; going `speed` along it.
  place(
    pos: Vector3,
    turn: Quaternion,
    size: number,
    yaw: number,
    steer: Quaternion,
    wheel: number,
    speed: number,
  ): void {
    const m = this.model;
    this.turn.copyFrom(turn);
    m.from.scaleToRef(size, this.at).rotateByQuaternionToRef(turn, this.at).addInPlace(pos);
    this.yaw = yaw;
    this.wheel = wheel;
    this.speed = speed;
    m.feet.scaleToRef(size, this.feet);
    m.hub.scaleToRef(size, this.hub);
    m.top.scaleToRef(size, this.top);
    for (let i = 0; i < 2; i++)
      m.grips[i].rotateByQuaternionToRef(steer, this.grips[i]).addInPlace(m.hub).scaleInPlace(size);
  }
}
