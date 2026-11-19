// A kart as it's drawn (a Kart from the room, sim/vehicles/garage.ts): its model's body in its paint,
// its emblem, its four tires turning as it rolls (the front two steering), its steering wheel
// turning, the body tipped to the ground under its tires, and all of it at the size it's built at
// for its driver, eased there; its body sprung over its tires, kicked up off them as a hop begins
// and driven down onto them as it lands, leaning into a hop's turn and a drift's; twirling a whole
// turn under its driver through a trick (theirs to sit through as they will); flashing grey at a
// knock; what it gives off (KartEffects.ts); and its seat as it's drawn, for its driver to sit in. Its model's parts
// and its paint are sent for as one is likely to be dropped (`wantKart`), or else as it's first
// drawn, and until both are here nothing of it is.
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
import { WORLD_STRUCTURES, forwardSpeed, noseOf, type AvatarId, type Kart, type KartId } from '@world/shared';
import { smooth } from '../avatars/motion';
import type { Engine } from '../Engine';
import { begin, type Fetch } from '../fetchOnce';
import { fetchMesh, meshData } from '../models/meshFile';
import { perScene } from '../perScene';
import { KartEffects } from './KartEffects';
import { KART_MODELS, paintOf, type KartModel, type KartPaint } from './kartModel';
import { Seat } from './Seat';

const GLOW = 0.3; // how much a kart lights itself, as the landmarks' models do (models/Models.ts)
const MAX_TURN = 0.5; // radians the front tires turn with the wheel full over
const WHEEL_TURN = 1.6; // radians the steering wheel turns, full over
const TIP_RATE = 10; // per second: how fast the body settles to the tilt of the ground under it
const GROW_RATE = 4; // per second: how fast it grows or shrinks to the size it's built at for its driver
const TRICK_SECONDS = 0.7; // a trick as it's drawn, from the press: the kart's twirl, its driver's leap
// The body on its springs over its tires: how hard it's pulled back to rest and how fast that's
// damped (per s² and per s: a bounce or two), the kick up it gets as a hop begins and down as it
// lands (m/s), the metres its tires hang under it in the air, and how fast they drop there and
// come back (per second).
const SPRING = { pull: 260, damp: 15, hop: 2, land: 2.4, droop: 0.07, rate: 18 };
const SPRING_STEP = 1 / 120; // seconds: the longest step the spring is run in, short enough to stay steady
// Radians it leans over into the turn through a hop and through a drift, and lifts its nose in a
// hop, each eased there at `rate` per second.
const LEAN = { hop: 0.16, drift: 0.07, nose: 0.09, rate: 12 };
const FLASH_SECONDS = 0.12; // a knock's grey flash

// A model's meshes in a scene, hidden, every drawn kart a clone of them sharing their geometry, and
// what its tires are drawn in, whatever its paint.
interface Parts {
  body: Mesh;
  steer: Mesh;
  emblem: Mesh;
  tire: Mesh;
  rubber: StandardMaterial;
}

// A paint's materials: the body's picture painted its two colours where its paint goes, and its emblem.
interface Paint {
  body: StandardMaterial;
  emblem: StandardMaterial;
}

// Each fetched once for a scene and kept for every kart of that model, or in that paint.
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

// What a kart of model `kart` dropped by someone wearing `look` is drawn with, sent for where it
// hasn't been: null until all of it is here.
function filesOf(scene: Scene, kart: KartId, look: AvatarId): { parts: Parts; paint: Paint } | null {
  const model = KART_MODELS[kart];
  const wears = paintOf(model, look);
  const parts = begin(partsIn(scene), kart, () => fetchParts(scene, kart, model)).value;
  const paint = begin(paintsIn(scene), `${model.folder}:${wears.emblem}`, () => makePaint(scene, model, wears)).value;
  return parts && paint ? { parts, paint } : null;
}

// Sends for what a kart is drawn with. Call as soon as one is likely to be dropped, so it's drawn
// from the moment it's there.
export function wantKart(scene: Scene, kart: KartId, look: AvatarId): void {
  filesOf(scene, kart, look);
}

export class KartMesh {
  private readonly scene: Scene;
  readonly root: TransformNode; // where it stands, turned its way
  private readonly tilt: TransformNode; // tipped with the ground under its tires
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
  private lean = { roll: 0, nose: 0 }; // radians it leans into a hop or a drift, and lifts its nose
  private was = { hop: false, grounded: true }; // as it was last frame, to see a hop begin and a landing
  private flashed = 0; // seconds of a knock's flash left

  constructor(
    engine: Engine,
    readonly id: string,
    private readonly kart: KartId,
    private readonly paint: AvatarId,
  ) {
    const scene = engine.scene;
    this.scene = scene;
    this.model = KART_MODELS[kart];
    this.axis = Vector3.FromArray(this.model.steer.axis);
    this.seat = new Seat(this.model);
    this.root = new TransformNode(`kart-${id}`, scene);
    this.tilt = new TransformNode(`kart-${id}-tilt`, scene);
    this.tilt.parent = this.root;
    this.twirl = new TransformNode(`kart-${id}-twirl`, scene);
    this.twirl.parent = this.tilt;
    this.chassis = new TransformNode(`kart-${id}-chassis`, scene);
    this.chassis.parent = this.twirl;
    this.effects = new KartEffects(engine, id, this.tilt, this.chassis, this.model);
    wantKart(scene, kart, paint);
  }

  // Draws it where `kart` is, its tires rolled on by how far it went in `dt` seconds, and puts its
  // seat there.
  update(kart: Kart, dt: number): void {
    if (!this.built) this.build();
    this.root.position.set(kart.pos.x, kart.pos.y, kart.pos.z);
    this.root.rotation.y = kart.yaw;
    this.size = this.size ? this.size + (kart.size - this.size) * (1 - Math.exp(-GROW_RATE * dt)) : kart.size;
    const along = forwardSpeed(kart);
    this.rolled += (along * dt) / (this.model.tire.radius * this.size);
    if (kart.grounded) this.tipTo(kart, dt);
    this.spring(kart, dt);
    const pitch = this.pitch - this.lean.nose;
    const roll = this.roll + this.lean.roll;
    this.tilt.rotation.set(pitch, 0, roll);
    this.tilt.scaling.setAll(this.size);
    this.chassis.position.y = this.sprung.y;
    // The sim's trick while it's in the air, then on through its landing until it's drawn through.
    if (kart.trick) this.trick = { ...kart.trick };
    else if (this.trick && (this.trick.t += dt) >= TRICK_SECONDS) this.trick = null;
    const through = this.trick ? Math.min(1, this.trick.t / TRICK_SECONDS) : 0;
    this.twirl.rotation.y = this.trick ? this.trick.way * 2 * Math.PI * smooth(through) : 0;
    for (const tire of this.tires) {
      tire.spin.rotation.x = this.rolled;
      tire.steer.position.y = tire.rest - this.droop;
      if (tire.front) tire.steer.rotation.y = kart.wheel * MAX_TURN;
    }
    Quaternion.RotationAxisToRef(this.axis, -kart.wheel * WHEEL_TURN, STEER);
    if (this.steer) (this.steer.rotationQuaternion ??= new Quaternion()).copyFrom(STEER);
    Quaternion.RotationYawPitchRollToRef(kart.yaw, pitch, roll, TURN);
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
    this.effects.update(kart, dt);
    if (this.flashed > 0 && (this.flashed -= dt) <= 0)
      for (const { mesh, material } of this.pieces) mesh.material = material;
  }

  // A knock that cost it wrenches: every piece of it grey for a moment.
  flash(): void {
    this.flashed = FLASH_SECONDS;
    const grey = knockedIn(this.scene);
    for (const { mesh } of this.pieces) mesh.material = grey;
  }

  // Lets it go: its own nodes alone, its parts' materials and its paint being the scene's, kept for
  // every kart of its model and paint.
  dispose(): void {
    this.effects.dispose();
    this.root.dispose();
  }

  // The body on its springs this frame: kicked up as a hop begins and down as it lands, and pulled
  // back to rest; its tires hanging while it's in the air; and its lean into a hop's turn or a
  // drift's, nose up through the hop.
  private spring(kart: Kart, dt: number): void {
    const s = this.sprung;
    if (kart.hop && !this.was.hop) s.v += SPRING.hop;
    if (kart.grounded && !this.was.grounded) s.v -= SPRING.land;
    this.was = { hop: kart.hop, grounded: kart.grounded };
    for (let left = Math.min(dt, 0.1); left > 0; left -= SPRING_STEP) {
      const step = Math.min(left, SPRING_STEP);
      s.v += (-SPRING.pull * s.y - SPRING.damp * s.v) * step;
      s.y += s.v * step;
    }
    this.droop += ((kart.grounded ? 0 : SPRING.droop) - this.droop) * (1 - Math.exp(-SPRING.rate * dt));
    const over = kart.hop ? -kart.wheel * LEAN.hop : kart.drift ? -kart.drift.way * LEAN.drift : 0;
    const k = 1 - Math.exp(-LEAN.rate * dt);
    this.lean.roll += (over - this.lean.roll) * k;
    this.lean.nose += ((kart.hop ? LEAN.nose : 0) - this.lean.nose) * k;
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

async function makePaint(scene: Scene, model: KartModel, paint: KartPaint): Promise<Paint> {
  const folder = `/assets/models/${model.folder}`;
  const [body, where] = await Promise.all([pixels(`${folder}/body.png`), pixels(`${folder}/paint.png`)]);
  const [one, two] = paint.colours.map((c) => Color3.FromHexString(c).asArray());
  const out = new Uint8Array(body.data.length);
  for (let i = 0; i < out.length; i += 4) {
    const [first, second] = [where.data[i] / 255, where.data[i + 1] / 255];
    for (let c = 0; c < 3; c++) out[i + c] = body.data[i + c] * (1 - first - second + first * one[c] + second * two[c]);
    out[i + 3] = 255;
  }
  const texture = RawTexture.CreateRGBATexture(
    out,
    body.width,
    body.height,
    scene,
    true,
    false,
    Texture.NEAREST_NEAREST_MIPLINEAR,
  );
  const key = `${model.folder}:${paint.emblem}`;
  const emblem = imageTexture(scene, `${folder}/emblem-${paint.emblem}.png`);
  emblem.hasAlpha = true;
  const emblemMaterial = material(scene, `kart-paint-${key}-emblem`, emblem);
  emblemMaterial.useAlphaFromDiffuseTexture = true;
  emblemMaterial.transparencyMode = StandardMaterial.MATERIAL_ALPHATEST;
  return { body: material(scene, `kart-paint-${key}`, texture), emblem: emblemMaterial };
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

// A picture's pixels, read through a canvas.
async function pixels(url: string): Promise<ImageData> {
  const image = await createImageBitmap(await (await fetch(url)).blob());
  const canvas = new OffscreenCanvas(image.width, image.height);
  const context = canvas.getContext('2d')!;
  context.drawImage(image, 0, 0);
  return context.getImageData(0, 0, image.width, image.height);
}
