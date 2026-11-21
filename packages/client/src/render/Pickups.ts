// Floating pickups (sim/pickups.ts), drawn where the server says. A heart is the HUD's pixel heart,
// two voxels deep, shaded by face like the structures, and a big heart (what a dead player leaves)
// the same heart drawn bigger (PICKUP_SCALE), with room for a badge on it. A heart is red, unless a body left it (`from`): then it's in
// the primary of that player's livery (liveries.ts), with its emblem on both faces. Every heart of a colour is an instance of one mesh and every badge of an emblem of another, so
// any number of them cost a draw call a colour and one an emblem. An emblem's picture is fetched as
// its look's body is seen dead, ahead of the heart it leaves; a heart whose emblem isn't here yet
// is drawn without it.
import {
  Color3,
  Color4,
  Mesh,
  MeshBuilder,
  StandardMaterial,
  Texture,
  type AbstractMesh,
  type InstancedMesh,
} from '@babylonjs/core';
import type { Appearance, PickupKind, PickupSnapshot } from '@world/shared';
import { HEART } from '../ui/pixelIcons';
import type { Engine } from './Engine';
import { emblemUrl, liveryOf } from './liveries';

const VOXEL = 0.075; // metres per pixel of the heart: 9 pixels make it about 0.7 m across
const DEPTH = 2; // voxels deep
const RED = '#f22938';
const HIGHLIGHT = 2 / 3; // how far toward white a heart's highlight pixel is from its colour
const GLOW = 0.8; // of its colours a heart shines at, unlit: a touch under bloom
// Face shading by direction (Babylon's box faces: front, back, right, left, top, bottom).
const FACE_SHADE = [1, 1, 0.72, 0.72, 0.86, 0.55];
// How many times the heart's size each kind is drawn.
export const PICKUP_SCALE: Record<PickupKind, number> = { heart: 1, 'big-heart': 2.5 };
// A badge on each face of a heart, in the heart's own metres: its radius, how far under the
// heart's middle its own is (under the notch between its lobes, with heart to spare either side),
// and how far off the face it stands.
const BADGE = { radius: 2.1 * VOXEL, drop: 0.2 * VOXEL, off: 0.08 * VOXEL };

export class Pickups {
  private readonly hearts = new Map<string, Mesh>(); // the heart in each colour, by its hex
  private readonly badges = new Map<string, Mesh>(); // each emblem's badges, by its name
  private readonly drawn = new Map<string, AbstractMesh>();

  constructor(private readonly engine: Engine) {}

  // Draws `pickups` where they float, and sends for what the hearts the `dead` leave are drawn with.
  update(pickups: PickupSnapshot[], dead: Appearance[]): void {
    for (const who of dead) this.badge(who);
    const seen = new Set<string>();
    for (const p of pickups) {
      seen.add(p.id);
      let d = this.drawn.get(p.id);
      if (!d) this.drawn.set(p.id, (d = this.draw(p)));
      d.position.set(p.x, p.y, p.z);
      d.rotation.y = p.ry;
    }
    for (const [id, d] of this.drawn) {
      if (seen.has(id)) continue;
      d.dispose();
      this.drawn.delete(id);
    }
  }

  private draw(p: PickupSnapshot): InstancedMesh {
    const heart = instance(this.heart(p.from ? liveryOf(p.from).primary : RED), `pickup-${p.id}`);
    heart.scaling.setAll(PICKUP_SCALE[p.kind]);
    if (p.from) instance(this.badge(p.from), `pickup-${p.id}-badge`).parent = heart;
    return heart;
  }

  private heart(colour: string): Mesh {
    let heart = this.hearts.get(colour);
    if (!heart) this.hearts.set(colour, (heart = buildHeart(this.engine, colour)));
    return heart;
  }

  // The badges of the livery of someone who appears as `who`.
  private badge(who: Appearance): Mesh {
    const { emblem } = liveryOf(who);
    let badge = this.badges.get(emblem);
    if (!badge) this.badges.set(emblem, (badge = buildBadge(this.engine, emblem)));
    return badge;
  }
}

function instance(shape: Mesh, name: string): InstancedMesh {
  const made = shape.createInstance(name);
  made.isPickable = false;
  return made;
}

// The pixel heart as voxels in `colour`, centred on its middle, colours baked into the vertices.
// The shape itself isn't drawn: its instances are.
export function buildHeart(engine: Engine, colour = RED): Mesh {
  const scene = engine.scene;
  const rows = HEART.length;
  const cols = HEART[0].length;
  const base = Color3.FromHexString(colour);
  const highlight = Color3.Lerp(base, Color3.White(), HIGHLIGHT);
  const voxels: Mesh[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const px = HEART[r][c];
      if (px === '.') continue;
      const color = px === '+' ? highlight : base;
      const faceColors = FACE_SHADE.map((s) => new Color4(color.r * s, color.g * s, color.b * s, 1));
      for (let k = 0; k < DEPTH; k++) {
        const v = MeshBuilder.CreateBox('heart-voxel', { size: VOXEL, faceColors }, scene);
        v.position.set((c - (cols - 1) / 2) * VOXEL, ((rows - 1) / 2 - r) * VOXEL, (k - (DEPTH - 1) / 2) * VOXEL);
        voxels.push(v);
      }
    }
  }
  const heart = Mesh.MergeMeshes(voxels, true)!;
  heart.name = `pickup-heart-${colour}`;
  const mat = new StandardMaterial(`pickup-heart-${colour}`, scene);
  mat.disableLighting = true;
  mat.emissiveColor = new Color3(GLOW, GLOW, GLOW); // times the vertex colours
  heart.material = mat;
  heart.isPickable = false;
  heart.setEnabled(false);
  return heart;
}

// An emblem's badges for a heart: its picture on a disc a hair off each of the heart's faces, each
// facing out. Unlit like the heart, and not drawn itself: its instances are, each under a heart's.
function buildBadge(engine: Engine, emblem: string): Mesh {
  const scene = engine.scene;
  const faces = [0, Math.PI].map((turn) => {
    const disc = MeshBuilder.CreateDisc('badge-face', { radius: BADGE.radius, tessellation: 24 }, scene);
    disc.rotation.y = turn;
    disc.position.set(0, -BADGE.drop, (turn ? 1 : -1) * ((DEPTH * VOXEL) / 2 + BADGE.off));
    return disc;
  });
  const badge = Mesh.MergeMeshes(faces, true)!;
  badge.name = `pickup-badge-${emblem}`;
  const picture = new Texture(emblemUrl(emblem), scene, false, false, Texture.NEAREST_NEAREST_MIPLINEAR);
  picture.hasAlpha = true;
  const mat = new StandardMaterial(`pickup-badge-${emblem}`, scene);
  mat.disableLighting = true;
  mat.diffuseTexture = picture;
  mat.emissiveColor = new Color3(GLOW, GLOW, GLOW); // times the picture's colours
  mat.useAlphaFromDiffuseTexture = true;
  mat.transparencyMode = StandardMaterial.MATERIAL_ALPHATEST;
  badge.material = mat;
  badge.isPickable = false;
  badge.setEnabled(false);
  return badge;
}
