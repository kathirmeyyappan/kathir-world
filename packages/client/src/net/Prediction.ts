// Client-side prediction for the local player. Inputs are applied immediately with the shared sim
// and kept until the server acknowledges them; on each snapshot we rewind to the server's state
// and replay what it hasn't seen yet. A driver's frames drive their kart (sim/vehicles/kart.ts
// `ride`), so it's the kart that's predicted, rewound and replayed with them.
import {
  TICK_DT,
  clonePlayer,
  controlsOf,
  ride,
  stepKart,
  stepPlayer,
  type InputFrame,
  type Kart,
  type KartState,
  type PlayerState,
  type Structures,
} from '@world/shared';

export class Prediction {
  state: PlayerState;
  kart: KartState | null = null; // the kart they drive, as predicted
  private last: InputFrame | null = null; // the frame last applied
  private pending: InputFrame[] = [];
  private seq = 0;

  constructor(
    initial: PlayerState,
    private readonly structures: Structures,
  ) {
    this.state = clonePlayer(initial);
  }

  nextSeq(): number {
    return ++this.seq;
  }

  // Applies a local frame.
  apply(frame: InputFrame): void {
    this.step(this.state, this.kart, frame);
    this.pending.push(frame);
    this.last = frame;
  }

  // The kart they drive `into` seconds into the tick to come, on the keys of their last frame: where
  // it's drawn between one tick and the next, so it moves and turns on every frame the screen draws
  // rather than thirty times a second. Only where it is and how it's turned run on: what it's doing
  // (a hop, a drift, a trick, a boost) changes on its tick.
  kartBetween(into: number): KartState | null {
    if (!this.kart) return null;
    const on = cloneKart(this.kart);
    stepKart(on, controlsOf(this.last), into, this.structures);
    return { ...this.kart, pos: on.pos, yaw: on.yaw, wheel: on.wheel };
  }

  // Returns how far the corrected position moved, so the caller can smooth the pop. `kart` is the
  // server's word on the kart they drive, if they do.
  reconcile(server: PlayerState, kart: Kart | undefined): { dx: number; dy: number; dz: number } {
    this.pending = this.pending.filter((f) => f.seq > server.lastSeq);
    const next = clonePlayer(server);
    const driven = server.riding && kart ? cloneKart(kart) : null;
    for (const f of this.pending) this.step(next, driven, f);
    const delta = {
      dx: this.state.pos.x - next.pos.x,
      dy: this.state.pos.y - next.pos.y,
      dz: this.state.pos.z - next.pos.z,
    };
    this.state = next;
    this.kart = driven;
    return delta;
  }

  private step(p: PlayerState, kart: KartState | null, frame: InputFrame): void {
    if (p.riding && kart) ride(p, kart, frame, TICK_DT, this.structures);
    else stepPlayer(p, frame, TICK_DT, this.structures);
  }
}

function cloneKart(k: KartState): KartState {
  return {
    ...k,
    pos: { ...k.pos },
    vel: { ...k.vel },
    drift: k.drift && { ...k.drift },
    trick: k.trick && { ...k.trick },
    turbo: k.turbo && { ...k.turbo },
  };
}
