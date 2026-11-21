// Lakitu as he fishes (scripts/lakitu-model.py's `fishing`): on his cloud with his rod held out
// in front of him, a line hanging from its tip and the hook on its end. He's stood by where the
// eye of his hook is, so whatever he fishes for says where that is and he's over it. His files (two
// parts and a picture, about 80 KB) are sent for with `wantLakitu`, and until they're here nothing
// of him is drawn.
import {
  Color3,
  Mesh,
  MeshBuilder,
  StandardMaterial,
  Texture,
  TransformNode,
  Vector3,
  type LinesMesh,
  type Scene,
} from '@babylonjs/core';
import type { Vec3 } from '@world/shared';
import { begin, type Fetch } from '../fetchOnce';
import { fetchMesh, meshData } from '../models/meshFile';
import { perScene } from '../perScene';
import { LAKITU } from './lakituModel';

const GLOW = 0.3; // how much he lights himself, as a kart does (vehicles/KartMesh.ts)
const LINE = new Color3(0.7, 0.7, 0.66); // pale, to show against a night sky, and under what blooms
const [TIP_X, TIP_Y, TIP_Z] = LAKITU.fishing.tip;

interface Parts {
  body: Mesh;
  hook: Mesh;
}

// Fetched once for a scene and shared by every one of him drawn in it.
const partsIn = perScene(() => new Map<string, Fetch<Parts>>());

function partsOf(scene: Scene): Parts | null {
  return begin(partsIn(scene), LAKITU.folder, () => fetchParts(scene)).value ?? null;
}

// Sends for what he's drawn with. Call as soon as he's likely to come, so he's drawn from the
// moment he does.
export function wantLakitu(scene: Scene): void {
  partsOf(scene);
}

export class Lakitu {
  private readonly body: TransformNode; // the middle of him, turned the way he faces
  private readonly hook: TransformNode; // the eye of his hook
  // A metre of line down from the origin, stood at the tip of his rod and stretched to the hook.
  private readonly line: LinesMesh;
  private built = false;

  constructor(private readonly scene: Scene) {
    this.body = new TransformNode('lakitu', scene);
    this.hook = new TransformNode('lakitu-hook', scene);
    this.line = MeshBuilder.CreateLines('lakitu-line', { points: [Vector3.Zero(), Vector3.Down()] }, scene);
    this.line.color = LINE;
    this.line.isPickable = false;
    this.line.setEnabled(false);
  }

  // Stands him fishing, facing `yaw` at `size` times his own, the tip of his rod `line` metres
  // over `eye`, where his hook's eye hangs.
  fish(eye: Vec3, yaw: number, line: number, size: number): void {
    if (!this.built && !this.build()) return;
    const [sin, cos] = [Math.sin(yaw), Math.cos(yaw)];
    const tip = eye.y + line;
    this.body.position.set(
      eye.x - (TIP_X * cos + TIP_Z * sin) * size,
      tip - TIP_Y * size,
      eye.z - (TIP_Z * cos - TIP_X * sin) * size,
    );
    this.hook.position.set(eye.x, eye.y, eye.z);
    for (const node of [this.body, this.hook]) {
      node.rotation.y = yaw;
      node.scaling.setAll(size);
    }
    this.line.position.set(eye.x, tip, eye.z);
    this.line.scaling.y = line;
  }

  dispose(): void {
    this.body.dispose();
    this.hook.dispose();
    this.line.dispose();
  }

  // Hangs his meshes under him, once his files are here: whether they are.
  private build(): boolean {
    const parts = partsOf(this.scene);
    if (!parts) return false;
    for (const [mesh, parent] of [
      [parts.body, this.body],
      [parts.hook, this.hook],
    ] as const) {
      const made = mesh.clone(mesh.name, parent);
      made.setEnabled(true);
      made.isPickable = false;
    }
    this.line.setEnabled(true);
    return (this.built = true);
  }
}

// His meshes, made once both parts are here, and what they're painted with.
async function fetchParts(scene: Scene): Promise<Parts> {
  const [body, hook] = (await Promise.all(['fishing', 'hook'].map((part) => fetchMesh(LAKITU.folder, part)))).map(
    (buffer, i) => {
      const mesh = new Mesh(i === 0 ? 'lakitu-body' : 'lakitu-hook', scene);
      meshData(buffer).applyToMesh(mesh);
      mesh.setEnabled(false);
      return mesh;
    },
  );
  const picture = new Texture(
    `/assets/models/${LAKITU.folder}/lakitu.png`,
    scene,
    false,
    false,
    Texture.NEAREST_NEAREST_MIPLINEAR,
  );
  const skin = new StandardMaterial('lakitu', scene);
  skin.diffuseTexture = picture;
  skin.emissiveTexture = picture;
  skin.emissiveColor = new Color3(GLOW, GLOW, GLOW);
  skin.specularColor = Color3.Black();
  body.material = hook.material = skin;
  return { body, hook };
}
