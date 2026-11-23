// Client-side prediction for the local player. Inputs are applied immediately with the shared sim
// and kept until the server acknowledges them; on each snapshot we rewind to the server's state
// and replay what it hasn't seen yet. A driver's frames drive their kart (sim/vehicles/kart.ts
// `ride`), so it's the kart that's predicted, rewound and replayed with them. The Room steps a
// frame a tick, so one it hasn't answered yet is taken to be stepped as many ticks on from the
// last tick heard as there are frames ahead of it: what a kart held by the room's game is let go by.
import {
  TICK_DT,
  clonePlayer,
  controlsOf,
  forwardSpeed,
  ride,
  stepKart,
  stepPlayer,
  type InputFrame,
  type Kart,
  type KartState,
  type PlayerState,
  type Structures,
} from '@world/shared';

// How a kart is going: m/s along its nose, and the m/s² that's changing by.
export interface KartPace {
  speed: number;
  accel: number;
}

export class Prediction {
  state: PlayerState;
  kart: KartState | null = null; // the kart they drive, as predicted
  private last: InputFrame | null = null; // the frame last applied
  private pending: InputFrame[] = [];
  private seq = 0;
  private tick = 0; // the Room's tick as of the snapshot last reconciled with

  constructor(
    initial: PlayerState,
    private readonly structures: Structures,
    // Whether the room's game holds the kart they drive where it stands at `tick` of the Room's
    // clock (the shared package's `Rules.held`): its keys do nothing then, as in the Room.
    private readonly held: (tick: number) => boolean,
  ) {
    this.state = clonePlayer(initial);
  }

  nextSeq(): number {
    return ++this.seq;
  }

  // The Room's tick as their next frame will meet it, as near as can be told.
  get nextTick(): number {
    return this.tick + this.pending.length;
  }

  // Applies a local frame.
  apply(frame: InputFrame): void {
    this.step(this.state, this.kart, frame, this.nextTick);
    this.pending.push(frame);
    this.last = frame;
  }

  // The kart they drive `into` seconds into the tick to come, on the keys of their last frame: where
  // it's drawn between one tick and the next, so it moves and turns on every frame the screen draws
  // rather than thirty times a second. Only where it is and how it's turned run on: what it's doing
  // (a hop, a drift, a trick, a boost) changes on its tick.
  kartBetween(into: number): KartState | null {
    const on = this.kartAfter(into);
    return this.kart && on && { ...this.kart, pos: on.pos, yaw: on.yaw, wheel: on.wheel };
  }

  // How the kart they drive is going: its speed as of its last tick, and how fast the keys of their
  // last frame are changing it, by a tick taken ahead on them.
  kartPace(): KartPace | null {
    const on = this.kartAfter(TICK_DT);
    if (!this.kart || !on) return null;
    const speed = forwardSpeed(this.kart);
    return { speed, accel: (forwardSpeed(on) - speed) / TICK_DT };
  }

  // The kart they drive `seconds` on from its last tick, on the keys of their last frame.
  private kartAfter(seconds: number): KartState | null {
    if (!this.kart) return null;
    const on = cloneKart(this.kart);
    stepKart(on, controlsOf(this.held(this.nextTick) ? null : this.last), seconds, this.structures);
    return on;
  }

  // Returns how far the corrected position moved, so the caller can smooth the pop. `kart` is the
  // server's word on the kart they drive, if they do, and `tick` the Room's as it sent them.
  reconcile(server: PlayerState, kart: Kart | undefined, tick: number): { dx: number; dy: number; dz: number } {
    this.pending = this.pending.filter((f) => f.seq > server.lastSeq);
    this.tick = tick;
    const next = clonePlayer(server);
    const driven = server.riding && kart ? cloneKart(kart) : null;
    this.pending.forEach((f, i) => this.step(next, driven, f, tick + i));
    const delta = {
      dx: this.state.pos.x - next.pos.x,
      dy: this.state.pos.y - next.pos.y,
      dz: this.state.pos.z - next.pos.z,
    };
    this.state = next;
    this.kart = driven;
    return delta;
  }

  // One frame's step, taken as the Room will take it at `tick`.
  private step(p: PlayerState, kart: KartState | null, frame: InputFrame, tick: number): void {
    if (p.riding && kart) ride(p, kart, frame, TICK_DT, this.structures, this.held(tick));
    else stepPlayer(p, frame, TICK_DT, this.structures);
  }
}

function cloneKart(k: KartState): KartState {
  return {
    ...k,
    pos: { ...k.pos },
    vel: { ...k.vel },
    hop: k.hop && { ...k.hop },
    drift: k.drift && { ...k.drift },
    trick: k.trick && { ...k.trick },
    turbo: k.turbo && { ...k.turbo },
  };
}
