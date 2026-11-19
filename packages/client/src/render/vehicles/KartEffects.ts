// What a kart gives off as it's driven, for anyone who sees it: sparks from under its back tires
// while its drift holds a spark (kart.ts `sparkOf`), in that spark's colour, with a burst of them
// as each is reached; and flames from its exhaust pipes through a boost. Drawn only: the sim decides
// the spark and the boost. Each is made the first time its kart needs it, so a kart that never
// drifts or boosts carries neither.
import { Color4, Mesh, ParticleSystem, Quaternion, TransformNode, Vector3 } from '@babylonjs/core';
import { KARTS, sparkOf, type KartState, type Spark } from '@world/shared';
import type { Engine } from '../Engine';
import { createJet, type Jet } from '../Jet';
import { plusSprites } from '../Poof';
import type { KartModel } from './kartModel';

// Each spark's colour, blue, yellow and purple, as it flies and as it goes out.
const SPARK_COLOURS: Record<Spark, { lit: Color4; out: Color4 }> = {
  1: { lit: new Color4(0.35, 0.7, 1, 1), out: new Color4(0.1, 0.25, 0.8, 1) },
  2: { lit: new Color4(1, 0.85, 0.2, 1), out: new Color4(0.9, 0.5, 0.05, 1) },
  3: { lit: new Color4(0.85, 0.45, 1, 1), out: new Color4(0.4, 0.1, 0.8, 1) },
};
const SPARK_RATE = 60; // sparks a second from each tire
const SPARK_BURST = 16; // more at once from each as a new spark is reached
const SPARKS_MOST = 64; // alive at once, a tire
const SPARK_SIZES = [0.06, 0.14]; // metres across: tiny
const SPARK_LIFE = [0.15, 0.4]; // seconds
const SPARK_SPEED = [1.5, 4]; // m/s they leave at: back, up and out from the tire
const SPARK_FALL = 7; // m/s² they fall at
const SPARK_HEIGHT = 0.04; // metres over the ground they come from, where the tire meets it
// A boost's flames, a jet from each exhaust pipe (FlameJet.ts): metres long, the half angle it
// spreads at, and how many and how big its blocks are beside a flamethrower's.
const FLAME = { length: 1.4, halfAngle: 0.14, density: 0.5, size: 0.55 };

export class KartEffects {
  private sparks: ParticleSystem[] | null = null; // a system a back tire
  private flames: Jet[] | null = null; // a jet an exhaust pipe
  private spark: Spark | null = null; // the spark the drift had got to, as last drawn

  // `ground` is the kart's node on the ground under its middle, tipped and sized with it, the frame
  // its sparks come out in; `body` what its body hangs from, which its flames go with.
  constructor(
    private readonly engine: Engine,
    private readonly id: string,
    private readonly ground: TransformNode,
    private readonly body: TransformNode,
    private readonly model: KartModel,
  ) {}

  // Its sparks and flames as `kart` is this frame, `dt` seconds on from the last.
  update(kart: KartState, dt: number): void {
    const spark = kart.drift && kart.grounded ? sparkOf(kart.drift.t, KARTS[kart.kart]) : null;
    const reached = spark !== null && spark !== this.spark;
    this.spark = spark;
    if (spark) this.sparks ??= this.makeSparks();
    for (const ps of this.sparks ?? []) {
      if (spark) {
        ps.color1 = ps.color2 = SPARK_COLOURS[spark].lit;
        ps.colorDead = SPARK_COLOURS[spark].out;
      }
      ps.emitRate = spark ? SPARK_RATE : 0;
      // A count to give off at once stands in for the rate until it's taken back (-1).
      ps.manualEmitCount = reached ? SPARK_BURST : -1;
    }
    if (kart.turbo) this.flames ??= this.makeFlames();
    for (const flame of this.flames ?? []) {
      flame.set(kart.turbo !== null);
      flame.update(dt);
    }
  }

  dispose(): void {
    for (const ps of this.sparks ?? []) ps.dispose();
    for (const flame of this.flames ?? []) flame.dispose();
  }

  private makeSparks(): ParticleSystem[] {
    const scene = this.engine.scene;
    return this.model.tires
      .filter((tire) => !tire.front)
      .map(({ at }, i) => {
        // A system follows a mesh: an empty one where the tire meets the ground. Its sparks live in
        // that mesh's frame, so they fly back, up and out from the tire however fast the kart goes,
        // where sparks left to the world would be metres behind it as they're born.
        const emitter = new Mesh(`kart-${this.id}-sparks-${i}`, scene);
        emitter.parent = this.ground;
        emitter.position.set(at[0], SPARK_HEIGHT, at[2]);
        emitter.isPickable = false;
        const out = Math.sign(at[0]);
        const ps = new ParticleSystem(`kart-${this.id}-sparks-${i}`, SPARKS_MOST, scene);
        plusSprites(this.engine, ps, 1); // the lightest grey alone, under the spark's colour
        ps.emitter = emitter;
        ps.isLocal = true;
        ps.blendMode = ParticleSystem.BLENDMODE_ADD;
        ps.applyFog = false;
        ps.updateSpeed = 1 / 60; // so lifetimes are seconds and powers metres per second
        ps.minEmitBox = ps.maxEmitBox = Vector3.Zero();
        ps.direction1 = new Vector3(out * 0.2, 0.5, -1);
        ps.direction2 = new Vector3(out, 1.5, -0.3);
        [ps.minEmitPower, ps.maxEmitPower] = SPARK_SPEED;
        [ps.minSize, ps.maxSize] = SPARK_SIZES;
        [ps.minLifeTime, ps.maxLifeTime] = SPARK_LIFE;
        ps.gravity = new Vector3(0, -SPARK_FALL, 0);
        ps.emitRate = 0;
        ps.start();
        return ps;
      });
  }

  private makeFlames(): Jet[] {
    return this.model.exhausts.map(({ at, way }, i) => {
      // A jet runs along its parent's +z: a node at the pipe's end, turned the way it points.
      const pipe = new TransformNode(`kart-${this.id}-exhaust-${i}`, this.engine.scene);
      pipe.parent = this.body;
      pipe.position.set(...at);
      pipe.rotationQuaternion = Quaternion.FromLookDirectionLH(Vector3.FromArray(way), Vector3.Up());
      return createJet(this.engine, `kart-${this.id}-exhaust-${i}`, pipe, 'fire', FLAME.length, FLAME.halfAngle, FLAME);
    });
  }
}
