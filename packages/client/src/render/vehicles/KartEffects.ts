// What a kart gives off as it's driven, for anyone who sees it: through a drift on the ground,
// smoke off each back tire, thickening up to its first spark; while the drift holds a spark
// (kart.ts `sparkOf`), in that spark's colour, electricity crackling at the base of each back tire
// (jagged bolts that flicker where they stand, over a glow) and sparks flying out from under it,
// with a burst of both as each spark is reached; and flames from its exhaust pipes through a boost,
// tinged the colour of the spark its drift was let go on.
// Drawn only: the sim decides the drift, the spark and the boost. Each is made the first time its
// kart needs it, so a kart that never drifts or boosts carries none of them.
import { Color3, Color4, DynamicTexture, Mesh, ParticleSystem, Texture, TransformNode, Vector3 } from '@babylonjs/core';
import { KARTS, SPARKS, sparkOf, type KartState, type Spark } from '@world/shared';
import type { Engine } from '../Engine';
import { FlameJet } from '../FlameJet';
import { plusSprites, softDisc } from '../Poof';
import type { KartModel } from './kartModel';

// A particle's colour: as it's born, somewhere between `one` and `two`, and as it dies.
interface Tint {
  one: Color4;
  two: Color4;
  dead: Color4;
}

// Each spark's colour, blue, yellow and purple: lit, and as a flying spark goes out.
const SPARK_COLOURS: Record<Spark, { lit: Color4; out: Color4 }> = {
  1: { lit: new Color4(0.35, 0.7, 1, 1), out: new Color4(0.1, 0.25, 0.8, 1) },
  2: { lit: new Color4(1, 0.85, 0.2, 1), out: new Color4(0.9, 0.5, 0.05, 1) },
  3: { lit: new Color4(0.85, 0.45, 1, 1), out: new Color4(0.4, 0.1, 0.8, 1) },
};
const WHITE = new Color4(1, 1, 1, 1);
const faint = (c: Color4, alpha: number) => new Color4(c.r, c.g, c.b, alpha);
const tints = (of: (c: { lit: Color4; out: Color4 }) => Tint): Record<Spark, Tint> => ({
  1: of(SPARK_COLOURS[1]),
  2: of(SPARK_COLOURS[2]),
  3: of(SPARK_COLOURS[3]),
});

// The sparks that fly: a second from each tire, more at once as a new spark is reached, the most
// alive at once, metres across (tiny), seconds each lasts, the m/s they leave at (back, up and out
// from the tire) and the m/s² they fall at.
const FLYING = {
  rate: 60,
  burst: 16,
  most: 64,
  sizes: [0.06, 0.14],
  life: [0.15, 0.4],
  speed: [1.5, 4],
  fall: 7,
  tints: tints(({ lit, out }) => ({ one: lit, two: lit, dead: out })),
};
// The electricity at a tire's base: bolts born all round where it meets the ground, each standing
// where it's born, turned any way, for a few hundredths of a second, so the spot crackles without
// a break; white-hot to the spark's colour.
const CRACKLE = {
  rate: 80,
  burst: 8,
  most: 24,
  sizes: [0.2, 0.44],
  life: [0.05, 0.12],
  tints: tints(({ lit }) => ({ one: lit, two: Color4.Lerp(lit, WHITE, 0.75), dead: lit })),
};
// The glow under the crackle: a few soft discs of the spark's colour, flickering.
const GLOW = {
  rate: 16,
  burst: 0,
  most: 8,
  sizes: [0.45, 0.85],
  life: [0.08, 0.2],
  tints: tints(({ lit }) => ({ one: faint(lit, 0.55), two: faint(lit, 0.35), dead: faint(lit, 0) })),
};
// A drift's smoke off a back tire, the grey "+"s of a poof: a second once the drift's first spark
// is due and the `first` share of that as the drift begins, the most alive at once, the metres
// across each grows from and to, the seconds it lasts, the m/s it leaves at (back, up and out from
// the tire) and the m/s² it rises at.
const SMOKE = {
  rate: 30,
  first: 0.25,
  most: 32,
  grows: [0.16, 0.5],
  life: [0.4, 0.8],
  speed: [0.8, 2.2],
  rise: 1.5,
};
const SPARK_HEIGHT = 0.04; // metres over the ground they come from, where the tire meets it
// The box round that spot the crackle is born in: across, in the tire's widths either side of its
// middle (past its sides, where the tire hides none of it), and in its radii up from the ground and
// behind and ahead of the spot, low enough that the tire's curve leaves room beside it.
const CRACKLE_BOX = { across: 0.7, up: 0.5, along: 1.3 };

const BOLT_CELL = 16; // a bolt's sprite cell, in texture pixels
// Each bolt, a cell of the sheet: the corners of its zigzag across the cell and of a fork off it,
// in pixels, drawn two pixels thick.
const BOLTS: [number, number][][][] = [
  [
    [
      [1, 8],
      [5, 3],
      [8, 10],
      [11, 5],
      [14, 9],
    ],
  ],
  [
    [
      [1, 5],
      [4, 10],
      [7, 6],
      [10, 12],
      [14, 7],
    ],
    [
      [7, 6],
      [10, 1],
    ],
  ],
  [
    [
      [2, 12],
      [5, 7],
      [9, 9],
      [12, 2],
    ],
    [
      [5, 7],
      [3, 2],
    ],
  ],
  [
    [
      [1, 9],
      [4, 5],
      [6, 11],
      [10, 7],
      [12, 12],
      [14, 5],
    ],
  ],
];

// Gives `ps` the bolts to draw: a sheet of its own (disposed with the system), each particle one
// of them, picked as it's born.
function boltSprites(engine: Engine, ps: ParticleSystem): void {
  const size = { width: BOLT_CELL * BOLTS.length, height: BOLT_CELL };
  const sheet = new DynamicTexture('bolts', size, engine.scene, false, Texture.NEAREST_SAMPLINGMODE, undefined, false);
  sheet.hasAlpha = true;
  const ctx = sheet.getContext() as CanvasRenderingContext2D;
  ctx.clearRect(0, 0, size.width, size.height);
  ctx.fillStyle = '#ffffff';
  BOLTS.forEach((lines, cell) => {
    for (const line of lines)
      for (let i = 1; i < line.length; i++) {
        const [ax, ay] = line[i - 1];
        const [bx, by] = line[i];
        const steps = Math.max(Math.abs(bx - ax), Math.abs(by - ay));
        for (let k = 0; k <= steps; k++)
          ctx.fillRect(
            cell * BOLT_CELL + Math.round(ax + ((bx - ax) * k) / steps),
            Math.round(ay + ((by - ay) * k) / steps),
            2,
            2,
          );
      }
  });
  sheet.update(false);
  ps.particleTexture = sheet;
  ps.isAnimationSheetEnabled = true;
  ps.spriteCellWidth = ps.spriteCellHeight = BOLT_CELL;
  ps.startSpriteCellID = 0;
  ps.endSpriteCellID = BOLTS.length - 1;
  ps.spriteRandomStartCell = true;
  ps.spriteCellChangeSpeed = 0;
}

// One of the particle systems a back tire gives off through a spark: how many a second, how many
// more at once as a new spark is reached, and its colours by the spark.
interface Sparking {
  system: ParticleSystem;
  rate: number;
  burst: number;
  tints: Record<Spark, Tint>;
}
// A boost's flames, a jet from each exhaust pipe (FlameJet.ts): metres long, the half angle it
// spreads at, and how many and how big its blocks are beside a flamethrower's.
const FLAME = { length: 1.4, halfAngle: 0.14, density: 0.5, size: 0.55 };
// What tinges the flames of a boost a drift gave, by the spark it was let go on: the spark's colour,
// deeper than it's lit, since a flame's glow washes a light colour out to white.
const TINGES: Record<Spark, Color3> = {
  1: tingeOf(SPARK_COLOURS[1]),
  2: tingeOf(SPARK_COLOURS[2]),
  3: tingeOf(SPARK_COLOURS[3]),
};
function tingeOf({ lit, out }: { lit: Color4; out: Color4 }): Color3 {
  const { r, g, b } = Color4.Lerp(lit, out, 0.6);
  return new Color3(r, g, b);
}

export class KartEffects {
  private spots: Mesh[] | null = null; // where each back tire meets the ground: what its smoke and sparks come from
  private smoke: ParticleSystem[] | null = null; // a back tire's each
  private sparks: Sparking[] | null = null; // each back tire's crackle, glow and flying sparks
  private flames: FlameJet[] | null = null; // a jet an exhaust pipe
  private spark: Spark | null = null; // the spark the drift had got to, as last drawn

  // `ground` is the kart's node on the ground under its middle, tipped and sized with it, the frame
  // its smoke and sparks come out in; `body` what its body hangs from, which its flames go with.
  constructor(
    private readonly engine: Engine,
    private readonly id: string,
    private readonly ground: TransformNode,
    private readonly body: TransformNode,
    private readonly model: KartModel,
  ) {}

  // Its smoke, sparks and flames as `kart` is this frame, `dt` seconds on from the last.
  update(kart: KartState, dt: number): void {
    const spec = KARTS[kart.kart];
    const drifted = kart.drift && kart.grounded ? kart.drift.t : null; // seconds into a drift on the ground
    if (drifted !== null) this.smoke ??= this.makeSmoke();
    const built = drifted === null ? 0 : Math.min(1, drifted / (SPARKS[0].after * spec.miniTurboTime));
    for (const system of this.smoke ?? [])
      system.emitRate = drifted === null ? 0 : SMOKE.rate * (SMOKE.first + (1 - SMOKE.first) * built);
    const spark = drifted === null ? null : sparkOf(drifted, spec);
    const reached = spark !== null && spark !== this.spark;
    this.spark = spark;
    if (spark) this.sparks ??= this.makeSparks();
    for (const { system, rate, burst, tints } of this.sparks ?? []) {
      if (spark) ({ one: system.color1, two: system.color2, dead: system.colorDead } = tints[spark]);
      system.emitRate = spark ? rate : 0;
      // A count to give off at once stands in for the rate until it's taken back (-1).
      system.manualEmitCount = reached && burst > 0 ? burst : -1;
    }
    if (kart.turbo) this.flames ??= this.makeFlames();
    for (const flame of this.flames ?? []) {
      if (kart.turbo) flame.tinge = kart.turbo.spark && TINGES[kart.turbo.spark];
      flame.set(kart.turbo !== null);
      flame.update(dt);
    }
  }

  dispose(): void {
    for (const system of this.smoke ?? []) system.dispose();
    for (const { system } of this.sparks ?? []) system.dispose();
    for (const flame of this.flames ?? []) flame.dispose();
  }

  // An empty mesh where each back tire meets the ground. A system follows a mesh, and its particles
  // live in that mesh's frame, so they stay at the tire however fast the kart goes, where ones left
  // to the world would be metres behind it as they're born.
  private backTires(): Mesh[] {
    return (this.spots ??= this.model.tires
      .filter((tire) => !tire.front)
      .map(({ at }, i) => {
        const spot = new Mesh(`kart-${this.id}-tire-spot-${i}`, this.engine.scene);
        spot.parent = this.ground;
        spot.position.set(at[0], SPARK_HEIGHT, at[2]);
        spot.isPickable = false;
        return spot;
      }));
  }

  // A particle system of at most `most` at a back tire's `spot`, giving nothing off until it's told to.
  private system(spot: Mesh, kind: string, most: number, life: number[]): ParticleSystem {
    const ps = new ParticleSystem(`${spot.name}-${kind}`, most, this.engine.scene);
    ps.emitter = spot;
    ps.isLocal = true;
    ps.applyFog = false;
    ps.updateSpeed = 1 / 60; // so lifetimes are seconds and powers metres per second
    [ps.minLifeTime, ps.maxLifeTime] = life;
    ps.minEmitBox = ps.maxEmitBox = Vector3.Zero();
    ps.minEmitPower = ps.maxEmitPower = 0;
    ps.emitRate = 0;
    ps.start();
    return ps;
  }

  private makeSmoke(): ParticleSystem[] {
    return this.backTires().map((spot) => {
      const out = Math.sign(spot.position.x);
      const smoke = this.system(spot, 'smoke', SMOKE.most, SMOKE.life);
      plusSprites(this.engine, smoke, 2); // the two lightest greys, to show against a dark floor
      smoke.blendMode = ParticleSystem.BLENDMODE_STANDARD;
      smoke.direction1 = new Vector3(out * 0.1, 0.3, -1);
      smoke.direction2 = new Vector3(out * 0.8, 1, -0.4);
      [smoke.minEmitPower, smoke.maxEmitPower] = SMOKE.speed;
      smoke.gravity = new Vector3(0, SMOKE.rise, 0);
      smoke.addSizeGradient(0, SMOKE.grows[0]);
      smoke.addSizeGradient(1, SMOKE.grows[1]);
      smoke.addColorGradient(0, new Color4(1, 1, 1, 0.8));
      smoke.addColorGradient(1, new Color4(1, 1, 1, 0));
      smoke.minAngularSpeed = -3;
      smoke.maxAngularSpeed = 3;
      return smoke;
    });
  }

  private makeSparks(): Sparking[] {
    const { radius, width } = this.model.tire;
    return this.backTires().flatMap((spot) => {
      const lit = (kind: string, { most, sizes, life }: { most: number; sizes: number[]; life: number[] }) => {
        const ps = this.system(spot, kind, most, life);
        ps.blendMode = ParticleSystem.BLENDMODE_ADD;
        [ps.minSize, ps.maxSize] = sizes;
        return ps;
      };
      const out = Math.sign(spot.position.x);
      const flying = lit('sparks', FLYING);
      plusSprites(this.engine, flying, 1); // the lightest grey alone, under the spark's colour
      flying.direction1 = new Vector3(out * 0.2, 0.5, -1);
      flying.direction2 = new Vector3(out, 1.5, -0.3);
      [flying.minEmitPower, flying.maxEmitPower] = FLYING.speed;
      flying.gravity = new Vector3(0, -FLYING.fall, 0);
      const low = new Vector3(-width * CRACKLE_BOX.across, 0, -radius * CRACKLE_BOX.along);
      const high = new Vector3(width * CRACKLE_BOX.across, radius * CRACKLE_BOX.up, radius * CRACKLE_BOX.along);
      const crackle = lit('crackle', CRACKLE);
      boltSprites(this.engine, crackle);
      [crackle.minEmitBox, crackle.maxEmitBox] = [low, high];
      crackle.minInitialRotation = 0;
      crackle.maxInitialRotation = 2 * Math.PI;
      const glow = lit('glow', GLOW);
      glow.particleTexture = softDisc(this.engine);
      [glow.minEmitBox, glow.maxEmitBox] = [low, high];
      return [
        { system: glow, ...GLOW },
        { system: crackle, ...CRACKLE },
        { system: flying, ...FLYING },
      ];
    });
  }

  private makeFlames(): FlameJet[] {
    return this.model.exhausts.map(({ at, way: [x, y, z] }, i) => {
      // A jet runs along its parent's +z: a node at the pipe's end, turned (pitched, then yawed)
      // the way it points.
      const pipe = new TransformNode(`kart-${this.id}-exhaust-${i}`, this.engine.scene);
      pipe.parent = this.body;
      pipe.position.set(...at);
      pipe.rotation.set(-Math.asin(y), Math.atan2(x, z), 0);
      return new FlameJet(this.engine, `kart-${this.id}-exhaust-${i}`, pipe, FLAME.length, FLAME.halfAngle, FLAME);
    });
  }
}
