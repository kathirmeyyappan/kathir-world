// A few small sparkles drifting down from under something held up in the air by nothing (a float,
// sim/avatars.ts `Float`): the "+"s of a poof (render/Poof.ts), tiny and lit, a handful a second,
// each blinking out after a moment. One system for as long as its owner lives, giving off sparkles
// only while it's told to.
import { Color4, ParticleSystem, Vector3 } from '@babylonjs/core';
import type { Engine } from './Engine';
import { plusSprites } from './Poof';

const RATE = 9; // sparkles a second
const MOST = 16; // alive at once
const SIZES = [0.07, 0.13]; // metres across, smallest and biggest
const LIFE = [0.35, 0.8]; // seconds
const DRIFT = 0.5; // m/s they leave at, down and a little out
const GOLD = new Color4(1, 0.95, 0.65, 1);
const PINK = new Color4(1, 0.78, 0.92, 1);

export class Sparkles {
  private readonly system: ParticleSystem;
  private readonly at = new Vector3();

  // `across` is the metres over which they come out, round where they're put.
  constructor(engine: Engine, across: number) {
    const ps = new ParticleSystem('sparkles', MOST, engine.scene);
    plusSprites(engine, ps, 1);
    ps.blendMode = ParticleSystem.BLENDMODE_ADD;
    ps.emitter = this.at;
    const r = across / 2;
    ps.minEmitBox = new Vector3(-r, 0, -r);
    ps.maxEmitBox = new Vector3(r, 0, r);
    ps.direction1 = new Vector3(-0.3, -1, -0.3);
    ps.direction2 = new Vector3(0.3, -0.5, 0.3);
    ps.minEmitPower = DRIFT / 2;
    ps.maxEmitPower = DRIFT;
    [ps.minSize, ps.maxSize] = SIZES;
    [ps.minLifeTime, ps.maxLifeTime] = LIFE;
    ps.color1 = GOLD;
    ps.color2 = PINK;
    ps.colorDead = PINK; // no fade: they blink out
    ps.gravity = new Vector3(0, -0.6, 0);
    ps.emitRate = 0;
    ps.start();
    this.system = ps;
  }

  // Whether it gives off sparkles, and where from.
  set(on: boolean, at: Vector3): void {
    this.at.copyFrom(at);
    this.system.emitRate = on ? RATE : 0;
  }

  dispose(): void {
    this.system.dispose();
  }
}
