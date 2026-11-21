// A kart as it's drawn (a Kart from the room, sim/vehicles/garage.ts): its model's body in the livery
// of whoever dropped it (render/liveries.ts; Mario's for a look with none), its four tires turning as it rolls (the front two steering), its steering wheel
// turning, the body tipped to the ground under its tires, and all of it at the size it's built at
// for its driver, eased there; its body sprung over its tires, kicked up off them as a hop begins,
// as its drift reaches a spark and as a boost begins, and driven down onto them as hard as it
// lands; leaning into a hop's turn and a drift's, and turned into the drift's turn, its tail out,
// its nose up through a hop and as a boost rises; twirling a whole turn under its driver through a
// trick (theirs to sit through as they will); flashing grey at a knock; what it gives off
// (KartEffects.ts); and its seat as it's drawn, for its driver to sit in. It says what it sees its
// kart begin from one frame to the next (`Began`), for whatever else shows or sounds that. Its
// model's parts and its livery are sent for as one is likely to be dropped (`wantKart`), or else as
// it's first drawn, and until both are here nothing of it is.
import {
  Color3,
  Mesh,
  Quaternion,
  RawTexture,
  StandardMaterial,
  Texture,
  TransformNode,
  Vector3,
  type Scene,
} from '@babylonjs/core';
import {
  KARTS,
  TRICK,
  TURBO,
  WORLD_STRUCTURES,
  createKart,
  forwardSpeed,
  noseOf,
  sizeFor,
  sparkOf,
  type Appearance,
  type Kart,
  type KartId,
  type Spark,
} from '@world/shared';
import { smooth } from '../avatars/motion';
import type { Engine } from '../Engine';
import { begin, type Fetch } from '../fetchOnce';
import { fetchMesh, meshData } from '../models/meshFile';
import { emblemUrl, liveryOf, MARIO_LIVERY, type Livery } from '../liveries';
import { perScene } from '../perScene';
import { KartEffects } from './KartEffects';
import { KART_MODELS, type KartModel } from './kartModel';
import { Seat } from './Seat';

const GLOW = 0.3; // how much a kart lights itself, as the landmarks' models do (models/Models.ts)
const MAX_TURN = 0.5; // radians the front tires turn with the wheel full over
const WHEEL_TURN = 1.6; // radians the steering wheel turns, full over
const TIP_RATE = 10; // per second: how fast the body settles to the tilt of the ground under it
const GROW_RATE = 4; // per second: how fast it grows or shrinks to the size it's built at for its driver
// The body on its springs over its tires: how hard it's pulled back to rest and how fast that's
// damped (per s² and per s: a couple of bounces); the kicks up it gets as a hop begins, as its
// drift reaches a spark and as a boost begins (m/s); the kick down as it lands, `land` of the speed
// it came down at up to `hard`; the metres it can sink onto its tires; the metres its tires hang
// under it in the air, and how fast they drop there and come back (per second).
const SPRING = {
  pull: 220,
  damp: 10,
  hop: 2.6,
  spark: 1.3,
  boost: 1.5,
  land: 0.6,
  hard: 4.5,
  sink: 0.09,
  droop: 0.09,
  rate: 18,
};
const SPRING_STEP = 1 / 120; // seconds: the longest step the spring is run in, short enough to stay steady
// Radians it leans over into the turn through a hop and through a drift; lifts its nose in a hop,
// and as a boost rises and for `kick` seconds after; and is turned into a drift's turn, its tail
// out: by `slip`, `steer` more or less with the wheel held into the drift or out of it, and half a
// slip toward the wheel through the hop before. Each is eased there at `rate` per second.
const LEAN = { hop: 0.2, drift: 0.08, nose: 0.12, boost: 0.07, kick: 0.15, slip: 0.3, steer: 0.1, rate: 12 };
const FLASH_SECONDS = 0.12; // a knock's grey flash

// What a kart is seen to have begun since the frame before.
export interface Began {
  hop: boolean;
  landing: number; // m/s it came down onto the ground at, or 0
  trick: boolean; // its first in the air or another after
  boost: boolean;
  spark: Spark | null; // the spark its drift has just reached
  knock: boolean; // it lost wrenches
}

// A model's meshes in a scene, hidden, every drawn kart a clone of them sharing their geometry, and
// what its tires are drawn in, whatever its livery.
interface Parts {
  body: Mesh;
  steer: Mesh;
  emblem: Mesh;
  tire: Mesh;
  rubber: StandardMaterial;
}

// A livery's materials on a model: the body's picture painted its two colours where its paint goes,
// and its emblem on the model's patch for one.
interface Paint {
  body: StandardMaterial;
  emblem: StandardMaterial;
}

// Each fetched once for a scene and kept for every kart of that model, or of that model in that livery.
const partsIn = perScene(() => new Map<KartId, Fetch<Parts>>());
const paintsIn = perScene(() => new Map<string, Fetch<Paint>>());
// What every piece of a kart is drawn in for the moment of a knock.
const knockedIn = perScene((scene) => {
  const grey = new StandardMaterial('kart-knocked', scene);
  grey.diffuseColor = new Color3(0.75, 0.77, 0.8);
  grey.emissiveColor = new Color3(0.5, 0.52, 0.55);
  grey.specularColor = Color3.Black();
  return grey;
});

// What a kart of model `kart` dropped by someone who appeared as `who` is drawn with, sent for
// where it hasn't been: null until all of it is here.
function filesOf(scene: Scene, kart: KartId, who: Appearance): { parts: Parts; paint: Paint } | null {
  const model = KART_MODELS[kart];
  const livery = liveryOf(who) ?? MARIO_LIVERY;
  const key = [kart, livery.primary, livery.secondary, livery.emblem].join(':');
  const parts = begin(partsIn(scene), kart, () => fetchParts(scene, kart, model)).value;
  const paint = begin(paintsIn(scene), key, () => makePaint(scene, key, model, livery)).value;
  return parts && paint ? { parts, paint } : null;
}

// Sends for what a kart is drawn with. Call as soon as one is likely to be dropped, so it's drawn
// from the moment it's there.
export function wantKart(scene: Scene, kart: KartId, who: Appearance): void {
  filesOf(scene, kart, who);
}

// A kart of model `kart` standing still on the ground at the origin, facing +z, in the livery of
// whoever appears as `who` and built to seat them: what a view of one outside the world draws.
export function parkedKart(id: string, kart: KartId, who: Appearance): Kart {
  return {
    ...createKart(kart, sizeFor(who.avatar), { x: 0, y: 0, z: 0 }, 0),
    grounded: true,
    id,
    paint: { avatar: who.avatar, color: who.color },
    wrenches: KARTS[kart].wrenches,
    driver: null,
  };
}

export class KartMesh {
  private readonly scene: Scene;
  readonly root: TransformNode; // where it stands, turned its way
  private readonly tilt: TransformNode; // tipped with the ground under its tires
  private readonly slid: TransformNode; // turned into a drift's turn, on that ground
  private readonly twirl: TransformNode; // turned round under its driver through a trick
  private readonly chassis: TransformNode; // its body, sprung over its tires
  private readonly effects: KartEffects;
  private readonly model: KartModel;
  private readonly axis: Vector3; // what its steering wheel turns round
  readonly seat: Seat;
  private steer: TransformNode | null = null;
  private tires: { spin: TransformNode; steer: TransformNode; front: boolean; rest: number }[] = [];
  private pieces: { mesh: Mesh; material: StandardMaterial }[] = []; // its meshes, and what each is drawn in
  private built = false; // its meshes are under it: until its files are here, nothing is
  private rolled = 0; // radians its tires have turned
  private size = 0; // how many times its model's size it's drawn, on its way to the kart's own; none yet
  private trick: { way: 1 | -1; t: number } | null = null; // the trick being drawn: its way, and seconds since its press
  private pitch = 0;
  private roll = 0;
  private sprung = { y: 0, v: 0 }; // metres its body rides over its rest on its tires, and m/s that's changing
  private droop = 0; // metres its tires hang under it
  private lean = { roll: 0, nose: 0, slip: 0 }; // radians it leans into a hop or a drift, lifts its nose, and is turned into a drift
  // Its kart as last drawn, to see what it has begun since: in its hop, on the ground, m/s it was
  // falling at, the seconds into its trick, the boosts it had begun, the spark its drift had, its
  // wrenches.
  private was: {
    hop: boolean;
    grounded: boolean;
    fall: number;
    trick: number | null;
    boosts: number;
    spark: Spark | null;
    wrenches: number;
  } | null = null;
  private flashed = 0; // seconds of a knock's flash left

  constructor(
    engine: Engine,
    readonly id: string,
    private readonly kart: KartId,
    private readonly paint: Appearance,
  ) {
    const scene = engine.scene;
    this.scene = scene;
    this.model = KART_MODELS[kart];
    this.axis = Vector3.FromArray(this.model.steer.axis);
    this.seat = new Seat(this.model);
    this.root = new TransformNode(`kart-${id}`, scene);
    this.tilt = new TransformNode(`kart-${id}-tilt`, scene);
    this.tilt.parent = this.root;
    this.slid = new TransformNode(`kart-${id}-slid`, scene);
    this.slid.parent = this.tilt;
    this.twirl = new TransformNode(`kart-${id}-twirl`, scene);
    this.twirl.parent = this.slid;
    this.chassis = new TransformNode(`kart-${id}-chassis`, scene);
    this.chassis.parent = this.twirl;
    this.effects = new KartEffects(engine, id, this.slid, this.chassis, this.model);
    wantKart(scene, kart, paint);
  }

  // Draws it where `kart` is, its tires rolled on by how far it went in `dt` seconds, and puts its
  // seat there. Returns what the kart has begun since it was last drawn.
  update(kart: Kart, dt: number): Began {
    if (!this.built) this.build();
    const began = this.see(kart);
    if (began.knock) this.flash();
    this.root.position.set(kart.pos.x, kart.pos.y, kart.pos.z);
    this.root.rotation.y = kart.yaw;
    this.size = this.size ? this.size + (kart.size - this.size) * (1 - Math.exp(-GROW_RATE * dt)) : kart.size;
    const along = forwardSpeed(kart);
    this.rolled += (along * dt) / (this.model.tire.radius * this.size);
    if (kart.grounded) this.tipTo(kart, dt);
    this.spring(kart, began, dt);
    const pitch = this.pitch - this.lean.nose;
    const roll = this.roll + this.lean.roll;
    this.tilt.rotation.set(pitch, 0, roll);
    this.tilt.scaling.setAll(this.size);
    this.slid.rotation.y = this.lean.slip;
    this.chassis.position.y = this.sprung.y;
    // The sim's trick while it's in the air, then on through its landing until it's drawn through.
    if (kart.trick) this.trick = { ...kart.trick };
    else if (this.trick && (this.trick.t += dt) >= TRICK.seconds) this.trick = null;
    const through = this.trick ? Math.min(1, this.trick.t / TRICK.seconds) : 0;
    this.twirl.rotation.y = this.trick ? this.trick.way * 2 * Math.PI * smooth(through) : 0;
    for (const tire of this.tires) {
      tire.spin.rotation.x = this.rolled;
      tire.steer.position.y = tire.rest - this.droop;
      if (tire.front) tire.steer.rotation.y = kart.wheel * MAX_TURN;
    }
    Quaternion.RotationAxisToRef(this.axis, -kart.wheel * WHEEL_TURN, STEER);
    if (this.steer) (this.steer.rotationQuaternion ??= new Quaternion()).copyFrom(STEER);
    Quaternion.RotationYawPitchRollToRef(kart.yaw, pitch, roll, TURN);
    TURN.multiplyInPlace(Quaternion.RotationYawPitchRollToRef(this.lean.slip, 0, 0, SLIP));
    this.seat.place(
      kart,
      this.root.position,
      TURN,
      this.size,
      this.sprung.y,
      STEER,
      along,
      this.trick && { way: this.trick.way, through },
    );
    this.effects.update(kart, began, dt);
    if (this.flashed > 0 && (this.flashed -= dt) <= 0)
      for (const { mesh, material } of this.pieces) mesh.material = material;
    return began;
  }

  // What `kart` has begun since it was last drawn; nothing the first time it's seen.
  private see(kart: Kart): Began {
    const now = {
      hop: kart.hop !== null,
      grounded: kart.grounded,
      fall: -kart.vel.y,
      trick: kart.trick?.t ?? null,
      boosts: kart.boosts,
      spark: kart.drift && sparkOf(kart.drift.t, KARTS[kart.kart]),
      wrenches: kart.wrenches,
    };
    const was = this.was ?? now;
    this.was = now;
    return {
      hop: now.hop && !was.hop,
      landing: now.grounded && !was.grounded ? Math.max(was.fall, 0) : 0,
      trick: now.trick !== null && (was.trick === null || now.trick < was.trick),
      boost: now.boosts > was.boosts,
      spark: now.spark !== was.spark ? now.spark : null,
      knock: now.wrenches < was.wrenches,
    };
  }

  // A knock that cost it wrenches: every piece of it grey for a moment.
  private flash(): void {
    this.flashed = FLASH_SECONDS;
    const grey = knockedIn(this.scene);
    for (const { mesh } of this.pieces) mesh.material = grey;
  }

  // Lets it go: its own nodes alone, its parts' materials and its paint being the scene's, kept for
  // every kart of its model and livery.
  dispose(): void {
    this.effects.dispose();
    this.root.dispose();
  }

  // The body on its springs this frame: kicked by what the kart has `began`, pulled back to rest,
  // and stopped where it's down on its tires; its tires hanging while it's in the air; and its
  // lean: over into a hop's turn or a drift's, nose up through a hop and a boost's rise, and turned
  // into a drift.
  private spring(kart: Kart, began: Began, dt: number): void {
    const s = this.sprung;
    if (began.hop) s.v += SPRING.hop;
    if (began.spark) s.v += SPRING.spark;
    if (began.boost) s.v += SPRING.boost;
    s.v -= Math.min(SPRING.hard, SPRING.land * began.landing);
    for (let left = Math.min(dt, 0.1); left > 0; left -= SPRING_STEP) {
      const step = Math.min(left, SPRING_STEP);
      s.v += (-SPRING.pull * s.y - SPRING.damp * s.v) * step;
      s.y += s.v * step;
      if (s.y < -SPRING.sink) [s.y, s.v] = [-SPRING.sink, Math.max(s.v, 0)];
    }
    this.droop += ((kart.grounded ? 0 : SPRING.droop) - this.droop) * (1 - Math.exp(-SPRING.rate * dt));
    const { hop, drift, turbo, wheel } = kart;
    // A hop leans and turns the way it's going, where the wheel has given it one, as the drift it
    // lands in will; and the wheel's own way until then.
    const hopped = hop?.way ?? wheel;
    const over = hop ? -hopped * LEAN.hop : drift ? -drift.way * LEAN.drift : 0;
    const rising = turbo !== null && turbo.t < TURBO.rise + LEAN.kick;
    const nose = hop ? LEAN.nose : rising ? LEAN.boost : 0;
    const slip = drift ? drift.way * LEAN.slip + wheel * LEAN.steer : hop ? (hopped * LEAN.slip) / 2 : 0;
    const k = 1 - Math.exp(-LEAN.rate * dt);
    this.lean.roll += (over - this.lean.roll) * k;
    this.lean.nose += (nose - this.lean.nose) * k;
    this.lean.slip += (slip - this.lean.slip) * k;
  }

  // Eases the body toward the tilt of the ground under its tires: nose up or down by the ground
  // under the front pair against the back's, and over by the left's against the right's.
  private tipTo(kart: Kart, dt: number): void {
    const f = noseOf(kart.yaw);
    // Each tire's spot, metres to the kart's right and ahead of its middle, and the ground under it.
    const ground = this.model.tires.map(({ at }) => {
      const across = at[0] * this.size;
      const along = at[2] * this.size;
      const x = kart.pos.x + f.z * across + f.x * along;
      const z = kart.pos.z - f.x * across + f.z * along;
      return { across, along, y: WORLD_STRUCTURES.groundAt(x, z, kart.pos.y + 0.5) };
    });
    type Tire = (typeof ground)[number];
    const mean = (pick: (g: Tire) => boolean) => {
      const some = ground.filter(pick);
      return some.reduce((s, g) => s + g.y, 0) / some.length;
    };
    const span = (pick: (g: Tire) => number) => Math.max(...ground.map(pick)) - Math.min(...ground.map(pick));
    const pitch = -Math.atan2(
      mean((g) => g.along > 0) - mean((g) => g.along < 0),
      span((g) => g.along),
    );
    const roll = Math.atan2(
      mean((g) => g.across > 0) - mean((g) => g.across < 0),
      span((g) => g.across),
    );
    const k = 1 - Math.exp(-TIP_RATE * dt);
    this.pitch += (pitch - this.pitch) * k;
    this.roll += (roll - this.roll) * k;
  }

  // Hangs its meshes under it, once its files are here.
  private build(): void {
    const files = filesOf(this.scene, this.kart, this.paint);
    if (!files) return;
    this.built = true;
    const { parts: p, paint } = files;
    const piece = (mesh: Mesh, name: string, parent: TransformNode, material: StandardMaterial) => {
      const made = mesh.clone(`kart-${this.id}-${name}`, parent);
      made.setEnabled(true);
      made.material = material;
      this.pieces.push({ mesh: made, material });
      return made;
    };
    piece(p.body, 'body', this.chassis, paint.body);
    piece(p.emblem, 'emblem', this.chassis, paint.emblem);
    this.steer = new TransformNode(`kart-${this.id}-steer`, this.scene);
    this.steer.parent = this.chassis;
    this.steer.position.set(...this.model.steer.at);
    piece(p.steer, 'wheel', this.steer, paint.body);
    this.tires = this.model.tires.map(({ at, front }, i) => {
      const steer = new TransformNode(`kart-${this.id}-tire-${i}`, this.scene);
      steer.parent = this.twirl;
      steer.position.set(...at);
      const spin = new TransformNode(`kart-${this.id}-tire-${i}-spin`, this.scene);
      spin.parent = steer;
      // The model's tire has its rim to the right, and its lettering mirrored with the rest of the
      // model into the game's frame (scripts/house_mesh.py MIRROR): mirrored back, across its
      // axle on the right and along it on the left, its rim faces out on both.
      const tire = piece(p.tire, `tire-${i}`, spin, p.rubber);
      if (at[0] > 0) tire.scaling.z = -1;
      else tire.scaling.x = -1;
      return { spin, steer, front, rest: at[1] };
    });
  }
}

// Scratch for a frame's turns, shared by every kart: none of it survives a call.
const STEER = new Quaternion();
const TURN = new Quaternion();
const SLIP = new Quaternion();

// A model's meshes, made once every one of its parts is here.
async function fetchParts(scene: Scene, kart: KartId, model: KartModel): Promise<Parts> {
  const names = ['body', 'steer', 'emblem', 'tire'];
  const buffers = await Promise.all(names.map((name) => fetchMesh(model.folder, name)));
  const [body, steer, emblem, tire] = buffers.map((buffer, i) => {
    const mesh = new Mesh(`kart-${kart}-${names[i]}`, scene);
    meshData(buffer).applyToMesh(mesh);
    mesh.setEnabled(false);
    return mesh;
  });
  const rubber = material(scene, `kart-${kart}-tire`, imageTexture(scene, `/assets/models/${model.folder}/tire.png`));
  return { body, steer, emblem, tire, rubber };
}

async function makePaint(scene: Scene, key: string, model: KartModel, livery: Livery): Promise<Paint> {
  const folder = `/assets/models/${model.folder}`;
  const [body, where, badge] = await Promise.all([
    picture(`${folder}/body.png`).then(pixels),
    picture(`${folder}/paint.png`).then(pixels),
    picture(emblemUrl(livery.emblem)),
  ]);
  // The paint's picture is red where the primary goes and green where the secondary does.
  const [primary, secondary] = [livery.primary, livery.secondary].map((c) => Color3.FromHexString(c).asArray());
  const out = new Uint8Array(body.data.length);
  for (let i = 0; i < out.length; i += 4) {
    const [first, second] = [where.data[i] / 255, where.data[i + 1] / 255];
    for (let c = 0; c < 3; c++)
      out[i + c] = body.data[i + c] * (1 - first - second + first * primary[c] + second * secondary[c]);
    out[i + 3] = 255;
  }
  const emblem = material(scene, `kart-paint-${key}-emblem`, rawTexture(scene, decal(model, badge)));
  emblem.diffuseTexture!.hasAlpha = true;
  emblem.useAlphaFromDiffuseTexture = true;
  emblem.transparencyMode = StandardMaterial.MATERIAL_ALPHATEST;
  const painted = rawTexture(scene, { data: out, width: body.width, height: body.height });
  return { body: material(scene, `kart-paint-${key}`, painted), emblem };
}

// An emblem's picture on the clear canvas a model's emblem patch is drawn from (KartModel.emblem),
// the canvas as many pixels as leave the picture its own.
function decal(model: KartModel, badge: ImageBitmap): ImageData {
  const { at, size } = model.emblem;
  const canvas = new OffscreenCanvas(Math.round(badge.width / size[0]), Math.round(badge.height / size[1]));
  const context = canvas.getContext('2d')!;
  context.drawImage(badge, Math.round(at[0] * canvas.width), Math.round(at[1] * canvas.height));
  return context.getImageData(0, 0, canvas.width, canvas.height);
}

function material(scene: Scene, name: string, texture: Texture): StandardMaterial {
  const m = new StandardMaterial(name, scene);
  m.diffuseTexture = texture;
  m.emissiveTexture = texture;
  m.emissiveColor = new Color3(GLOW, GLOW, GLOW);
  m.specularColor = Color3.Black();
  return m;
}

function imageTexture(scene: Scene, url: string): Texture {
  return new Texture(url, scene, false, false, Texture.NEAREST_NEAREST_MIPLINEAR);
}

interface Pixels {
  data: Uint8Array | Uint8ClampedArray;
  width: number;
  height: number;
}

function rawTexture(scene: Scene, { data, width, height }: Pixels): Texture {
  const bytes = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  return RawTexture.CreateRGBATexture(bytes, width, height, scene, true, false, Texture.NEAREST_NEAREST_MIPLINEAR);
}

async function picture(url: string): Promise<ImageBitmap> {
  return createImageBitmap(await (await fetch(url)).blob());
}

// A picture's pixels, read through a canvas.
function pixels(image: ImageBitmap): ImageData {
  const canvas = new OffscreenCanvas(image.width, image.height);
  const context = canvas.getContext('2d')!;
  context.drawImage(image, 0, 0);
  return context.getImageData(0, 0, image.width, image.height);
}
