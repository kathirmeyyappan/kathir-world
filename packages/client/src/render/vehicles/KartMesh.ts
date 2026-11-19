// A kart as it's drawn (a Kart from the room, sim/vehicles/garage.ts): its model's body in its paint,
// its emblem, its four tires turning as it rolls (the front two steering), its steering wheel
// turning, the body tipped to the ground under its tires, and all of it at the size it's built at
// for its driver, eased there; twirling a whole turn under its driver through a trick (theirs to
// sit through as they will); and its seat as it's drawn, for its driver to sit in. Its model's parts are fetched the first time a kart of that model is drawn, and
// each paint is made the first time one wears it: until both are here it's drawn as a box of its
// size in its paint's first colour.
import {
  Color3,
  Mesh,
  MeshBuilder,
  Quaternion,
  RawTexture,
  StandardMaterial,
  Texture,
  TransformNode,
  Vector3,
  type Scene,
} from '@babylonjs/core';
import { KARTS, WORLD_STRUCTURES, noseOf, type AvatarId, type Kart, type KartId } from '@world/shared';
import { smooth } from '../avatars/motion';
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

const partsIn = perScene(() => new Map<KartId, Promise<Parts>>());
const paintsIn = perScene(() => new Map<string, Promise<{ body: StandardMaterial; emblem: StandardMaterial }>>());

export class KartMesh {
  readonly root: TransformNode; // where it stands, turned its way
  private readonly tilt: TransformNode; // tipped with the ground under its tires
  private readonly twirl: TransformNode; // turned round under its driver through a trick
  private readonly model: KartModel;
  private readonly axis: Vector3; // what its steering wheel turns round
  readonly seat: Seat;
  private steer: TransformNode | null = null;
  private tires: { spin: TransformNode; steer: TransformNode; front: boolean }[] = [];
  private standIn: Mesh | null;
  private rolled = 0; // radians its tires have turned
  private size = 0; // how many times its model's size it's drawn, on its way to the kart's own; none yet
  private trick: { way: 1 | -1; t: number } | null = null; // the trick being drawn: its way, and seconds since its press
  private pitch = 0;
  private roll = 0;
  private disposed = false;

  constructor(
    private readonly scene: Scene,
    readonly id: string,
    kart: KartId,
    paint: AvatarId,
  ) {
    this.model = KART_MODELS[kart];
    this.axis = Vector3.FromArray(this.model.steer.axis);
    this.seat = new Seat(this.model);
    this.root = new TransformNode(`kart-${id}`, scene);
    this.tilt = new TransformNode(`kart-${id}-tilt`, scene);
    this.tilt.parent = this.root;
    this.twirl = new TransformNode(`kart-${id}-twirl`, scene);
    this.twirl.parent = this.tilt;
    const { width, length, height } = KARTS[kart].body;
    this.standIn = MeshBuilder.CreateBox(`kart-${id}-stand-in`, { width, depth: length, height }, scene);
    this.standIn.position.y = height / 2;
    this.standIn.parent = this.twirl;
    const flat = new StandardMaterial(`kart-${id}-stand-in`, scene);
    flat.diffuseColor = Color3.FromHexString(paintOf(this.model, paint).colours[0]);
    this.standIn.material = flat;
    void Promise.all([parts(scene, kart, this.model), painted(scene, this.model, paintOf(this.model, paint))]).then(
      ([p, materials]) => this.build(p, materials),
    );
  }

  // Draws it where `kart` is, its tires rolled on by how far it went in `dt` seconds, and puts its
  // seat there.
  update(kart: Kart, dt: number): void {
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

  // Lets it go, and its stand-in's material with it: its parts' materials and paint are the scene's,
  // kept for every kart of its model and paint.
  dispose(): void {
    this.disposed = true;
    this.standIn?.dispose(false, true);
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

  private build(p: Parts, materials: { body: StandardMaterial; emblem: StandardMaterial }): void {
    if (this.disposed) return;
    this.standIn?.dispose(false, true);
    this.standIn = null;
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

function parts(scene: Scene, kart: KartId, model: KartModel): Promise<Parts> {
  const made = partsIn(scene);
  let got = made.get(kart);
  if (!got) {
    const mesh = async (name: string) => {
      const m = new Mesh(`kart-${kart}-${name}`, scene);
      meshData(await fetchMesh(model.folder, name)).applyToMesh(m);
      m.setEnabled(false);
      return m;
    };
    got = Promise.all(['body', 'steer', 'emblem', 'tire'].map(mesh)).then(([body, steer, emblem, tire]) => {
      tire.material = material(
        scene,
        `kart-${kart}-tire`,
        imageTexture(scene, `/assets/models/${model.folder}/tire.png`),
      );
      return { body, steer, emblem, tire };
    });
    made.set(kart, got);
  }
  return got;
}

// A paint's materials: the body's picture painted its two colours where its paint goes, and its emblem.
function painted(
  scene: Scene,
  model: KartModel,
  paint: KartPaint,
): Promise<{ body: StandardMaterial; emblem: StandardMaterial }> {
  const made = paintsIn(scene);
  const key = `${model.folder}:${paint.emblem}`;
  let got = made.get(key);
  if (!got) {
    const folder = `/assets/models/${model.folder}`;
    got = Promise.all([pixels(`${folder}/body.png`), pixels(`${folder}/paint.png`)]).then(([body, where]) => {
      const colours = paint.colours.map((c) => Color3.FromHexString(c));
      const out = new Uint8Array(body.data.length);
      for (let i = 0; i < out.length; i += 4) {
        const [first, second] = [where.data[i] / 255, where.data[i + 1] / 255];
        for (let c = 0; c < 3; c++) {
          const tint = 1 - first - second + first * colours[0].asArray()[c] + second * colours[1].asArray()[c];
          out[i + c] = body.data[i + c] * tint;
        }
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
      const emblem = imageTexture(scene, `${folder}/emblem-${paint.emblem}.png`);
      emblem.hasAlpha = true;
      const emblemMaterial = material(scene, `kart-paint-${key}-emblem`, emblem);
      emblemMaterial.useAlphaFromDiffuseTexture = true;
      emblemMaterial.transparencyMode = StandardMaterial.MATERIAL_ALPHATEST;
      return { body: material(scene, `kart-paint-${key}`, texture), emblem: emblemMaterial };
    });
    made.set(key, got);
  }
  return got;
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
