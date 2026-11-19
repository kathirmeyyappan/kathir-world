// Landmarks drawn from mesh files rather than built from structures: the pineapple house, in the
// parts scripts/house-model.py writes (render/models/pineappleParts.ts), and the Krusty Krab, in
// those scripts/krusty-krab-model.py writes (render/models/krustyKrabParts.ts), each fetched
// through the loader (render/Loader.ts) and stood where the shared content puts it
// (content/pineapple.ts, content/krustyKrab.ts). The sim never sees these meshes; it collides with
// the structures the content hides inside them, so what you bump into is theirs to keep true to the
// models. Each door hangs on a node at its pin and swings to the state the Room tells us
// (sim/doors.ts) over DOOR_SWING_SECONDS; a door of two leaves has a node for each. A part of a
// floor of rooms is fetched while that floor is wanted, drawn only while it could be seen, and let
// go once it's far off and long unseen (Interiors.ts): its interior is `<model>:<floor>`. The parts
// outside are the model's full detail, kept within the loader's reach and let go past it, a shell
// standing in for them there: a few thousand triangles in its own colours, from the shape the
// content already has, made at once and kept for good.
import { Color3, Mesh, StandardMaterial, Texture, TransformNode, VertexData, type Scene } from '@babylonjs/core';
import {
  DOOR_SWING_SECONDS,
  KRUSTY_KRAB,
  KRUSTY_KRAB_DOOR,
  KRUSTY_KRAB_FOOTPRINT,
  KRUSTY_KRAB_PLACEMENT,
  KRUSTY_KRAB_PROFILE,
  PINEAPPLE_FOOTPRINT,
  PINEAPPLE_PLACEMENT,
  PINEAPPLE_PROFILE,
} from '@world/shared';
import type { Engine } from '../Engine';
import type { Interiors } from '../Interiors';
import { wait, type Loader } from '../Loader';
import { placed } from '../Structures';
import { KRUSTY_KRAB_PARTS } from './krustyKrabParts';
import { PINEAPPLE_PARTS } from './pineappleParts';

const GLOW = 0.3; // how much a model lights itself, like the avatars, so it reads at night
const UV_UNIT = 4096; // texture coordinate units to the repeat in the mesh files
const LATHE_SEGMENTS = 32; // round a lathed shell
// How much a shell lights itself: more than GLOW, standing in for the textures' lighter pixels.
const SHELL_GLOW = 0.55;
// The shells' colours, near the models' own as the fog leaves them.
const PINEAPPLE_SKIN = new Color3(1, 0.72, 0.28);
const TIMBER = [0.55, 0.38, 0.22];

// One part of a model, as the scripts list them: its mesh (<name>.bin in the model's folder), its
// texture (<texture>.png beside it), whether the texture repeats or is an atlas, whether it has
// clear pixels, whether it's drawn as painted rather than lit, how solid it's drawn if it's
// see-through, whether only its outside is drawn, the hinge it hangs on, if it swings, and the
// floor of rooms it's part of, if it's inside.
interface Part {
  name: string;
  texture: string;
  wrap: boolean;
  alpha?: boolean;
  unlit?: boolean;
  opacity?: number;
  oneSided?: boolean;
  door?: string;
  floor?: string;
}

// A model: its folder under /assets/models, where it stands, its parts, its hinges, each named as
// the parts name it, with its pin in the model's frame, how far it swings, and the sim's door it
// belongs to, and its shell: a circle on the floor round all of it, and its mesh in world metres,
// painted in its vertices' colours.
interface Model {
  name: string;
  placement: { x: number; y: number; z: number; yaw: number };
  parts: readonly Part[];
  hinges: { name: string; door: string; at: readonly [number, number]; y: number; swing: number }[];
  shell: { r: number; data: () => VertexData };
}

const MODELS: Model[] = [
  {
    name: 'pineapple',
    placement: PINEAPPLE_PLACEMENT,
    parts: PINEAPPLE_PARTS,
    hinges: PINEAPPLE_PROFILE.doors.map((d) => ({ name: d.id, door: d.id, at: d.hinge, y: d.y, swing: d.swing })),
    // The fruit turned through the shell's rings, on its dune (drawn with the structures): past
    // SCOPED_SIGHT the leaves are lost in the fog.
    shell: {
      r: PINEAPPLE_FOOTPRINT.r,
      data: () => lathe(PINEAPPLE_PROFILE.rings, PINEAPPLE_PLACEMENT, PINEAPPLE_SKIN),
    },
  },
  {
    name: 'krusty-krab',
    placement: KRUSTY_KRAB_PLACEMENT,
    parts: KRUSTY_KRAB_PARTS,
    hinges: KRUSTY_KRAB_PROFILE.doors.map((d) => ({
      name: d.part,
      door: KRUSTY_KRAB_DOOR,
      at: d.hinge,
      y: 0,
      swing: d.swing,
    })),
    // The sim's boxes and wedges of it, but its door's, shaded by face as the structures are.
    shell: {
      r: Math.hypot(KRUSTY_KRAB_FOOTPRINT.w, KRUSTY_KRAB_FOOTPRINT.d) / 2,
      data: () => {
        const [first, ...rest] = KRUSTY_KRAB.filter((s) => !s.door).map(placed);
        const data = first.merge(rest, true);
        data.colors = Float32Array.from(data.colors!, (c, i) => (i % 4 === 3 ? c : c * TIMBER[i % 4]));
        return data;
      },
    },
  },
];

interface Hinge {
  node: TransformNode;
  swing: number;
}

export class Models {
  // Each of the sim's doors: its hinges, whether it stands open, and when it last began to swing.
  private readonly doors = new Map<string, { hinges: Hinge[]; open: boolean; at: number }>();

  constructor(engine: Engine, loader: Loader, interiors: Interiors) {
    const scene = engine.scene;
    for (const model of MODELS) {
      const root = new TransformNode(`model-${model.name}`, scene);
      root.position.set(model.placement.x, model.placement.y, model.placement.z);
      root.rotation.y = model.placement.yaw;
      const { x, z } = model.placement;
      const hinges = new Map<string, TransformNode>();
      for (const hinge of model.hinges) {
        const node = new TransformNode(`model-${model.name}-door-${hinge.name}`, scene);
        node.parent = root;
        node.position.set(hinge.at[0], hinge.y, hinge.at[1]);
        hinges.set(hinge.name, node);
        const door = this.doors.get(hinge.door) ?? { hinges: [], open: false, at: 0 };
        door.hinges.push({ node, swing: hinge.swing });
        this.doors.set(hinge.door, door);
      }
      // The parts outside, drawn only once every one of them is here, all at once in the shell's
      // place, so the two never overlap and the shell stands in while they're on their way.
      const shell = shellMesh(scene, model);
      const outside: (Mesh | null)[] = [];
      const whole = () => {
        const all = outside.every((mesh) => mesh !== null);
        shell.setEnabled(!all);
        for (const mesh of outside) mesh?.setEnabled(all);
      };
      for (const part of model.parts) {
        const parent = part.door ? hinges.get(part.door)! : root;
        if (!part.floor) {
          // Within the loader's reach of the model, and let go past it.
          const k = outside.push(null) - 1;
          loader.add({
            x,
            z,
            r: model.shell.r,
            load: function* () {
              outside[k] = yield* fetchPart(scene, model.name, part, parent);
              whole();
            },
            // Its material and texture with it; the texture's image stays in the browser's cache.
            unload: () => {
              outside[k]?.dispose(false, true);
              outside[k] = null;
              whole();
            },
          });
          continue;
        }
        // Fetched through the loader whenever its floor is wanted, and let go with it (Interiors).
        let mesh: Mesh | null = null;
        interiors.add(`${model.name}:${part.floor}`, {
          load: () =>
            new Promise<void>((done, fail) =>
              loader.add({
                x,
                z,
                load: function* () {
                  try {
                    mesh = yield* fetchPart(scene, model.name, part, parent);
                    done();
                  } catch (e: unknown) {
                    fail(e);
                  }
                },
              }),
            ),
          unload: () => {
            mesh?.dispose(false, true);
            mesh = null;
          },
          show: (on) => mesh?.setEnabled(on),
        });
      }
    }
  }

  // A door's state from the Room: swung over the next DOOR_SWING_SECONDS, or set at once. Turned
  // back mid-swing, it carries on from where it is: the new swing starts as far along as brings
  // it to the old one's angle.
  setDoor(id: string, open: boolean, swing = true): void {
    const door = this.doors.get(id);
    if (!door || door.open === open) return;
    const now = performance.now();
    const at = swung(door, now);
    door.open = open;
    const begun = 1 - Math.sqrt(open ? 1 - at : at);
    door.at = swing ? now - begun * DOOR_SWING_SECONDS * 1000 : -Infinity;
  }

  // Whether a door stands open or is swinging, either way: shut, it hides what's behind it.
  ajar(id: string): boolean {
    const door = this.doors.get(id);
    return !!door && swung(door, performance.now()) > 0;
  }

  update(): void {
    const now = performance.now();
    for (const door of this.doors.values()) {
      // The sim's swing turns from +x toward +z; Babylon's turn about y goes the other way round.
      for (const hinge of door.hinges) hinge.node.rotation.y = -hinge.swing * swung(door, now);
    }
  }
}

// How far open a door is drawn at a moment, 0 shut to 1 open: fast off the latch, settling at the end.
function swung(door: { open: boolean; at: number }, now: number): number {
  const t = Math.min(1, (now - door.at) / (DOOR_SWING_SECONDS * 1000));
  const eased = 1 - (1 - t) * (1 - t);
  return door.open ? eased : 1 - eased;
}

// A model's shell, lit like its parts, its vertices' colours standing for their textures.
function shellMesh(scene: Scene, model: Model): Mesh {
  const mesh = new Mesh(`model-${model.name}-shell`, scene);
  model.shell.data().applyToMesh(mesh);
  const material = new StandardMaterial(`model-${model.name}-shell`, scene);
  material.emissiveColor = new Color3(SHELL_GLOW, SHELL_GLOW, SHELL_GLOW);
  material.specularColor = Color3.Black();
  mesh.material = material;
  mesh.isPickable = false;
  mesh.freezeWorldMatrix();
  return mesh;
}

// A solid of revolution through `rings` (height, radius) about a model's placement, in one colour,
// closed over the top; its foot is open, standing on what's under it.
function lathe(
  rings: readonly (readonly [number, number])[],
  at: { x: number; y: number; z: number },
  color: Color3,
): VertexData {
  const positions: number[] = [];
  const indices: number[] = [];
  for (const [h, r] of rings)
    for (let i = 0; i < LATHE_SEGMENTS; i++) {
      const a = (2 * Math.PI * i) / LATHE_SEGMENTS;
      positions.push(at.x + r * Math.cos(a), at.y + h, at.z + r * Math.sin(a));
    }
  for (let k = 0; k + 1 < rings.length; k++)
    for (let i = 0; i < LATHE_SEGMENTS; i++) {
      const [a, b] = [k * LATHE_SEGMENTS + i, k * LATHE_SEGMENTS + ((i + 1) % LATHE_SEGMENTS)];
      const [c, d] = [a + LATHE_SEGMENTS, b + LATHE_SEGMENTS];
      indices.push(a, b, c, b, d, c);
    }
  const top = rings.length - 1;
  const middle = positions.length / 3;
  positions.push(at.x, at.y + rings[top][0], at.z);
  for (let i = 0; i < LATHE_SEGMENTS; i++)
    indices.push(top * LATHE_SEGMENTS + i, top * LATHE_SEGMENTS + ((i + 1) % LATHE_SEGMENTS), middle);
  const normals: number[] = [];
  VertexData.ComputeNormals(positions, indices, normals);
  const colors = Array.from({ length: positions.length / 3 }, () => [color.r, color.g, color.b, 1]).flat();
  return Object.assign(new VertexData(), { positions, indices, normals, colors });
}

// Fetches a part and hangs its mesh on `parent`: counts (Uint32 vertices, triangles), positions in
// centimetres (Int16), texture coordinates (Uint16, UV_UNIT to the repeat), triangles (Uint16),
// unit normals (Int8). Drawn both sides (the leaves and the rooms' walls are single sheets) unless
// the part says nothing looks at its inside.
function* fetchPart(
  scene: Scene,
  model: string,
  part: Part,
  parent: TransformNode,
): Generator<Promise<unknown> | void, Mesh, unknown> {
  const url = `/assets/models/${model}/${part.name}.bin`;
  const buffer = yield* wait(fetch(url).then((r) => r.arrayBuffer()));
  const [vertices, triangles] = new Uint32Array(buffer, 0, 2);
  let at = 8;
  const positions = new Int16Array(buffer, at, vertices * 3);
  at += vertices * 6;
  const uvs = new Uint16Array(buffer, at, vertices * 2);
  at += vertices * 4;
  const indices = new Uint16Array(buffer, at, triangles * 3);
  at += triangles * 6;
  const normals = new Int8Array(buffer, at, vertices * 3);
  const data = new VertexData();
  data.positions = Float32Array.from(positions, (cm) => cm / 100);
  data.uvs = Float32Array.from(uvs, (u) => u / UV_UNIT);
  data.indices = indices;
  data.normals = Float32Array.from(normals, (n) => n / 127);
  const mesh = new Mesh(`model-${model}-${part.name}`, scene);
  data.applyToMesh(mesh);
  const image = new Texture(
    `/assets/models/${model}/${part.texture}.png`,
    scene,
    false,
    false,
    Texture.NEAREST_NEAREST_MIPLINEAR,
  );
  if (part.wrap) image.wrapU = image.wrapV = Texture.WRAP_ADDRESSMODE;
  const material = new StandardMaterial(`model-${model}-${part.name}`, scene);
  material.diffuseTexture = image;
  material.emissiveTexture = image;
  material.specularColor = Color3.Black();
  material.backFaceCulling = part.oneSided ?? false;
  material.twoSidedLighting = true;
  if (part.unlit) {
    // Indoors: every surface shows its texture as painted, whichever way it faces.
    material.disableLighting = true;
    material.emissiveColor = Color3.White();
  } else material.emissiveColor = new Color3(GLOW, GLOW, GLOW);
  if (part.alpha) {
    // Clear pixels (the rooms' net ceilings) are cut out, not blended, so nothing sorts.
    image.hasAlpha = true;
    material.useAlphaFromDiffuseTexture = true;
    material.transparencyMode = StandardMaterial.MATERIAL_ALPHATEST;
    material.alphaCutOff = 0.5;
  }
  if (part.opacity !== undefined) {
    material.alpha = part.opacity;
    material.transparencyMode = StandardMaterial.MATERIAL_ALPHABLEND;
  }
  mesh.material = material;
  mesh.parent = parent;
  mesh.isPickable = false;
  return mesh;
}
