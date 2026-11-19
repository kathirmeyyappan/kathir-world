// A kart as it's drawn (a Kart from the room, sim/vehicles/garage.ts): its model's body in its paint,
// its emblem, its four tires turning as it rolls (the front two steering), its steering wheel
// turning, the body tipped to the ground under its tires, and all of it at the size it's built at
// for its driver, eased there; twirling a whole turn under its driver through a trick (theirs to
// sit through as they will); and its seat as it's drawn, for its driver to sit in. Its model's parts
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
import { WORLD_STRUCTURES, noseOf, type AvatarId, type Kart, type KartId } from '@world/shared';
import { smooth } from '../avatars/motion';
import { begin, type Fetch } from '../fetchOnce';
import { fetchMesh, meshData } from '../models/meshFile';
import { perScene } from '../perScene';
import { KART_MODELS, paintOf, type KartModel, type KartPaint } from './kartModel';
import { Seat } from './Seat';

const GLOW = 0.3; // how much a kart lights itself, as the landmarks' models do (models/Models.ts)
const MAX_TURN = 0.5; // radians the front tires turn with the wheel full over
const WHEEL_TURN = 1.6; // radians the steering wheel turns, full over
const TIP_RATE = 10; // per second: how fast the body settles to the tilt of the ground under it
const GROW_RATE = 4; // per second: how fast it grows or shrinks to the size it's built at for its driver
const TRICK_SECONDS = 0.7; // a trick as it's drawn, from the press: the kart's twirl, its driver's leap

// A model's meshes in a scene, hidden, every drawn kart a clone of them sharing their geometry.
interface Parts {
  body: Mesh;
  steer: Mesh;
  emblem: Mesh;
  tire: Mesh;
}

// A paint's materials: the body's picture painted its two colours where its paint goes, and its emblem.
interface Paint {
  body: StandardMaterial;
  emblem: StandardMaterial;
}

// Each fetched once for a scene and kept for every kart of that model, or in that paint.
const partsIn = perScene(() => new Map<KartId, Fetch<Parts>>());
const paintsIn = perScene(() => new Map<string, Fetch<Paint>>());

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
  readonly root: TransformNode; // where it stands, turned its way
  private readonly tilt: TransformNode; // tipped with the ground under its tires
  private readonly twirl: TransformNode; // turned round under its driver through a trick
  private readonly model: KartModel;
  private readonly axis: Vector3; // what its steering wheel turns round
  readonly seat: Seat;
  private steer: TransformNode | null = null;
  private tires: { spin: TransformNode; steer: TransformNode; front: boolean }[] = [];
  private built = false; // its meshes are under it: until its files are here, nothing is
  private rolled = 0; // radians its tires have turned
  private size = 0; // how many times its model's size it's drawn, on its way to the kart's own; none yet
  private trick: { way: 1 | -1; t: number } | null = null; // the trick being drawn: its way, and seconds since its press
  private pitch = 0;
  private roll = 0;

  constructor(
    private readonly scene: Scene,
    readonly id: string,
    private readonly kart: KartId,
    private readonly paint: AvatarId,
  ) {
    this.model = KART_MODELS[kart];
    this.axis = Vector3.FromArray(this.model.steer.axis);
    this.seat = new Seat(this.model);
    this.root = new TransformNode(`kart-${id}`, scene);
    this.tilt = new TransformNode(`kart-${id}-tilt`, scene);
    this.tilt.parent = this.root;
    this.twirl = new TransformNode(`kart-${id}-twirl`, scene);
    this.twirl.parent = this.tilt;
    wantKart(scene, kart, paint);
  }

  // Draws it where `kart` is, its tires rolled on by how far it went in `dt` seconds, and puts its
  // seat there.
  update(kart: Kart, dt: number): void {
    if (!this.built) this.build();
    this.root.position.set(kart.pos.x, kart.pos.y, kart.pos.z);
    this.root.rotation.y = kart.yaw;
    this.size = this.size ? this.size + (kart.size - this.size) * (1 - Math.exp(-GROW_RATE * dt)) : kart.size;
    const f = noseOf(kart.yaw);
    const along = kart.vel.x * f.x + kart.vel.z * f.z;
    this.rolled += (along * dt) / (this.model.tire.radius * this.size);
    if (kart.grounded) this.tipTo(kart, dt);
    this.tilt.rotation.set(this.pitch, 0, this.roll);
    this.tilt.scaling.setAll(this.size);
    // The sim's trick while it's in the air, then on through its landing until it's drawn through.
    if (kart.trick) this.trick = { ...kart.trick };
    else if (this.trick && (this.trick.t += dt) >= TRICK_SECONDS) this.trick = null;
    const through = this.trick ? Math.min(1, this.trick.t / TRICK_SECONDS) : 0;
    this.twirl.rotation.y = this.trick ? this.trick.way * 2 * Math.PI * smooth(through) : 0;
    for (const tire of this.tires) {
      tire.spin.rotation.x = this.rolled;
      if (tire.front) tire.steer.rotation.y = kart.wheel * MAX_TURN;
    }
    Quaternion.RotationAxisToRef(this.axis, -kart.wheel * WHEEL_TURN, STEER);
    if (this.steer) (this.steer.rotationQuaternion ??= new Quaternion()).copyFrom(STEER);
    Quaternion.RotationYawPitchRollToRef(kart.yaw, this.pitch, this.roll, TURN);
    this.seat.place(
      kart,
      this.root.position,
      TURN,
      this.size,
      STEER,
      along,
      this.trick && { way: this.trick.way, through },
    );
  }

  // Lets it go: its own nodes alone, its parts' materials and its paint being the scene's, kept for
  // every kart of its model and paint.
  dispose(): void {
    this.root.dispose();
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
    const { parts: p, paint: materials } = files;
    const piece = (mesh: Mesh, name: string, parent: TransformNode) => {
      const made = mesh.clone(`kart-${this.id}-${name}`, parent);
      made.setEnabled(true);
      return made;
    };
    piece(p.body, 'body', this.twirl).material = materials.body;
    piece(p.emblem, 'emblem', this.twirl).material = materials.emblem;
    this.steer = new TransformNode(`kart-${this.id}-steer`, this.scene);
    this.steer.parent = this.twirl;
    this.steer.position.set(...this.model.steer.at);
    piece(p.steer, 'wheel', this.steer).material = materials.body;
    this.tires = this.model.tires.map(({ at, front }, i) => {
      const steer = new TransformNode(`kart-${this.id}-tire-${i}`, this.scene);
      steer.parent = this.twirl;
      steer.position.set(...at);
      const spin = new TransformNode(`kart-${this.id}-tire-${i}-spin`, this.scene);
      spin.parent = steer;
      // The model's tire has its rim to the right, and its lettering mirrored with the rest of the
      // model into the game's frame (scripts/house_mesh.py MIRROR): mirrored back, across its
      // axle on the right and along it on the left, its rim faces out on both.
      const tire = piece(p.tire, `tire-${i}`, spin);
      if (at[0] > 0) tire.scaling.z = -1;
      else tire.scaling.x = -1;
      return { spin, steer, front };
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
  tire.material = material(scene, `kart-${kart}-tire`, imageTexture(scene, `/assets/models/${model.folder}/tire.png`));
  return { body, steer, emblem, tire };
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
