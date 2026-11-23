// The starting lights Lakitu hangs from his line at the start of a race (scripts/lakitu-model.py's
// `signal`): a box with three lamps in a row, each under its hood, facing the way he does. A lamp
// that's lit is its lens drawn again a hair proud of itself in its colour, with a halo. Its files
// (a part and a picture, about 75 KB) are sent for with `wantStartLights`, and until they're here
// nothing of it is drawn.
import { Color3, Mesh, StandardMaterial, Texture, VertexData, type Scene, type TransformNode } from '@babylonjs/core';
import type { Engine } from '../Engine';
import { begin, type Fetch } from '../fetchOnce';
import { fetchMesh, meshData } from '../models/meshFile';
import { perScene } from '../perScene';
import { LAKITU } from './lakituModel';

// The lamps, as the part has them, in its metres: each a lens LENS across round a middle `down`
// from its top and `across` from the next one's, the lens between `depth`'s two distances out in
// front and facing along them.
const LAMPS = { across: 0.425, down: 0.55, lens: 0.2, depth: [0.2, 0.32] };
const PROUD = 0.012; // metres a lit lens stands out of the one it lights: one laid in the other would flicker
const RED = new Color3(1, 0.16, 0.1);
const GREEN = new Color3(0.2, 1, 0.42);
const GLOW = 0.3; // how much the box lights itself, as he does

interface Parts {
  box: Mesh; // all of it, unlit
  lenses: VertexData[]; // each lamp's lens, from his right to his left: the watchers' left to their right
  red: StandardMaterial;
  green: StandardMaterial;
}

// Fetched once for a scene and shared by every one drawn in it.
const partsIn = perScene(() => new Map<string, Fetch<Parts>>());

function partsOf(scene: Scene): Parts | null {
  return begin(partsIn(scene), LAKITU.folder, () => fetchParts(scene)).value ?? null;
}

// Sends for what the lights are drawn with. Call as soon as they're likely to come.
export function wantStartLights(scene: Scene): void {
  partsOf(scene);
}

export class StartLights {
  private lamps: Mesh[] = []; // each lamp's lit lens; none until its files are here

  constructor(
    private readonly engine: Engine,
    private readonly hung: TransformNode, // what it hangs from: its top at the node's origin
  ) {}

  // `red` of the lamps lit red, from the watchers' left, or with `green` all of them green.
  show(red: number, green: boolean): void {
    if (this.lamps.length === 0 && !this.build()) return;
    const parts = partsOf(this.engine.scene)!;
    this.lamps.forEach((lamp, i) => {
      lamp.setEnabled(green || i < red);
      lamp.material = green ? parts.green : parts.red;
    });
  }

  // Hangs its meshes, once its files are here: whether they are.
  private build(): boolean {
    const parts = partsOf(this.engine.scene);
    if (!parts) return false;
    const box = parts.box.clone(parts.box.name, this.hung);
    box.setEnabled(true);
    box.isPickable = false;
    this.lamps = parts.lenses.map((lens, i) => {
      const lamp = new Mesh(`start-lamp-${i}`, this.engine.scene);
      lens.applyToMesh(lamp);
      lamp.parent = this.hung;
      lamp.isPickable = false;
      this.engine.glow(lamp);
      return lamp;
    });
    return true;
  }
}

// A lamp's lens out of the whole part: the triangles all of whose corners are on it.
function lensOf(part: VertexData, lamp: number): VertexData {
  const [positions, normals, indices] = [part.positions!, part.normals!, part.indices!];
  const [near, far] = LAMPS.depth;
  const middle = (1 - lamp) * LAMPS.across;
  const on = (v: number) => {
    const [x, y, z] = [positions[v * 3], positions[v * 3 + 1], positions[v * 3 + 2]];
    return (
      z > near && z < far && Math.abs(normals[v * 3 + 2]) > 0.8 && Math.hypot(x - middle, y + LAMPS.down) < LAMPS.lens
    );
  };
  const lens = new VertexData();
  lens.positions = [];
  lens.normals = [];
  lens.indices = [];
  for (let t = 0; t < indices.length; t += 3) {
    const corners = [indices[t], indices[t + 1], indices[t + 2]];
    if (!corners.every(on)) continue;
    for (const v of corners) {
      lens.indices.push(lens.positions.length / 3);
      lens.positions.push(positions[v * 3], positions[v * 3 + 1], positions[v * 3 + 2] + PROUD);
      lens.normals.push(0, 0, 1);
    }
  }
  return lens;
}

async function fetchParts(scene: Scene): Promise<Parts> {
  const part = meshData(await fetchMesh(LAKITU.folder, 'signal'));
  const box = new Mesh('start-lights', scene);
  part.applyToMesh(box);
  box.setEnabled(false);
  const picture = new Texture(
    `/assets/models/${LAKITU.folder}/props.png`,
    scene,
    false,
    false,
    Texture.NEAREST_NEAREST_MIPLINEAR,
  );
  const skin = new StandardMaterial('start-lights', scene);
  skin.diffuseTexture = picture;
  skin.emissiveTexture = picture;
  skin.emissiveColor = new Color3(GLOW, GLOW, GLOW);
  skin.specularColor = Color3.Black();
  box.material = skin;
  const lit = (name: string, colour: Color3) => {
    const material = new StandardMaterial(name, scene);
    material.emissiveColor = colour;
    material.disableLighting = true;
    material.backFaceCulling = false;
    return material;
  };
  return {
    box,
    lenses: [0, 1, 2].map((lamp) => lensOf(part, lamp)),
    red: lit('start-lamp-red', RED),
    green: lit('start-lamp-green', GREEN),
  };
}
