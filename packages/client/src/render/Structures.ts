// Meshes for the world's structures (sim/structures.ts), built once at load from the same list the
// sim collides with, so what you see is what you bump into. Each kind picks a builder in `build`;
// a new kind won't compile until it has one.
//
// Structures are unlit: a pixel texture (structureMaterials.ts) or a flat colour, shaded by which
// way each face points (tops bright, undersides dark) rather than by the scene's lights, so an
// interior reads the same as an exterior and a round wall doesn't band segment by segment. To keep
// the client light, pieces with the same look in the same REGION are merged into one mesh (a whole
// tower is a few draw calls, each culled when it's off screen), built through the loader
// (render/Loader.ts) a piece a step, nearest region first, and none are pickable: the hover ray
// asks the sim's raycast instead. A region is built as plain vertex data, each piece's put where it
// stands and all of them joined, and only then made a mesh: one buffer for the GPU per region,
// nothing made and thrown away per piece.
import {
  Color3,
  CreateBoxVertexData,
  CreateGroundVertexData,
  DynamicTexture,
  Matrix,
  Mesh,
  StandardMaterial,
  Texture,
  Vector3,
  VertexData,
  type Scene,
} from '@babylonjs/core';
import {
  LADDER_GIRTH,
  surfaceOf,
  type Box,
  type Ladder,
  type Ramp,
  type Structure,
  type StructureKind,
  type StructureMaterial,
  type Terrain,
} from '@world/shared';
import type { Engine } from './Engine';
import type { Loader } from './Loader';
import { perScene } from './perScene';
import { MATERIALS, TEXELS, paintMaterial } from './structureMaterials';

const DEFAULT_COLORS: Record<StructureKind, string> = {
  box: '#39414f',
  ramp: '#454f60',
  terrain: '#1d3a2c',
  ladder: '#8a6a3c',
};
const RAIL = 0.08; // metres square a ladder's rails are, at LADDER_GIRTH through
const RUNG = 0.3; // metres between a ladder's rungs
const REGION = 48; // metres: pieces in the same REGION × REGION square share a merged mesh
const FLAT_TILE = 4; // texture repeat for flat-coloured pieces, which have no texture to repeat
// Brightness by face direction, in each piece's own frame.
const SHADE = { top: 1, bottom: 0.5, sideX: 0.82, sideZ: 0.68 };

export type Look = StructureMaterial | string; // a material, or a flat colour

// A piece's look: its material, or a flat colour.
export function lookOf(s: Structure): Look {
  return s.material ?? s.color ?? DEFAULT_COLORS[s.kind];
}

// The scene's material for a look, made the first time it's asked for and shared by every mesh of
// that look (the merged pieces, and a ripple across their tops, GroundRipple.ts).
const sceneMaterials = perScene(() => new Map<Look, StandardMaterial>());
export function structureMaterial(scene: Scene, look: Look): StandardMaterial {
  const made = sceneMaterials(scene);
  let mat = made.get(look);
  if (!mat) made.set(look, (mat = material(scene, look)));
  return mat;
}

export function buildStructures(engine: Engine, structures: readonly Structure[], loader: Loader): void {
  const scene = engine.scene;
  const groups = new Map<string, { look: Look; x: number; z: number; pieces: { s: Structure; i: number }[] }>();
  structures.forEach((s, i) => {
    if (s.hidden) return;
    const look = lookOf(s);
    const rx = Math.floor(s.x / REGION);
    const rz = Math.floor(s.z / REGION);
    const key = `${look}@${rx},${rz}`;
    const group = groups.get(key) ?? { look, x: (rx + 0.5) * REGION, z: (rz + 0.5) * REGION, pieces: [] };
    group.pieces.push({ s, i });
    groups.set(key, group);
  });
  for (const [key, { look, x, z, pieces }] of groups)
    loader.add({
      x,
      z,
      // A piece a step, so a crowded region is built over a few frames, then joined in one.
      load: function* () {
        const placedPieces: VertexData[] = [];
        for (const { s } of pieces) {
          placedPieces.push(placed(s));
          yield;
        }
        const [first, ...rest] = placedPieces;
        const merged = new Mesh(`structures-${key}`, scene);
        first.merge(rest, true).applyToMesh(merged);
        merged.material = structureMaterial(scene, look);
        merged.isPickable = false;
        merged.freezeWorldMatrix();
      },
    });
}

function material(scene: Scene, look: Look): StandardMaterial {
  const mat = new StandardMaterial(`structure-mat-${look}`, scene);
  mat.disableLighting = true; // the colour is texture × face shade, exactly
  mat.specularColor = Color3.Black();
  if (look in MATERIALS) {
    // Nearest when magnified keeps the pixels crisp up close; trilinear and anisotropic when minified
    // stop distant and glancing walls shimmering.
    const tex = new DynamicTexture(`structure-tex-${look}`, TEXELS, scene, true, Texture.NEAREST_LINEAR_MIPLINEAR);
    tex.anisotropicFilteringLevel = 8;
    paintMaterial(tex.getContext() as CanvasRenderingContext2D, look as StructureMaterial);
    tex.update();
    tex.wrapU = tex.wrapV = Texture.WRAP_ADDRESSMODE;
    mat.diffuseTexture = tex;
    mat.emissiveColor = Color3.White();
  } else {
    mat.emissiveColor = Color3.FromHexString(look);
  }
  mat.freeze();
  return mat;
}

// How a piece's faces take their texture: metres per repeat, and whether tops tile in world x/z.
interface Mapping {
  tile: number;
  worldTop: boolean;
}

function mappingOf(s: Structure): Mapping {
  const spec = s.material ? MATERIALS[s.material] : null;
  return { tile: spec?.tile ?? FLAT_TILE, worldTop: s.worldTop ?? spec?.worldTop ?? true };
}

// Where a top of `s` takes its texture at world (wx, wz): world x/z when its tops tile in the
// world, or else axes turned with the piece.
export function topUv(s: Structure, wx: number, wz: number, { tile, worldTop } = mappingOf(s)): [number, number] {
  if (worldTop) return [wx / tile, wz / tile];
  const yaw = s.yaw ?? 0;
  const [cos, sin] = [Math.cos(yaw), Math.sin(yaw)];
  return [(wx * cos - wz * sin) / tile, (wx * sin + wz * cos) / tile];
}

// A piece's vertices where it stands in the world: built in its own frame, its underside at local
// 0 (`lift` is how far its frame's middle stands over that), then turned by its yaw (Babylon's
// turn about y is the sim's yaw) and moved to its spot.
function placed(s: Structure): VertexData {
  const { data, lift } = build(s, mappingOf(s));
  const turn = Matrix.RotationY(s.yaw ?? 0);
  return data.transform(turn.multiply(Matrix.Translation(s.x, lift + (s.y ?? 0), s.z)));
}

interface Built {
  data: VertexData;
  lift: number;
}

function build(s: Structure, mapping: Mapping): Built {
  switch (s.kind) {
    case 'box':
    case 'ramp':
      return prism(s, mapping);
    case 'terrain':
      return { data: heightfield(s, mapping), lift: 0 };
    case 'ladder':
      return { data: frame(s, mapping), lift: 0 };
  }
}

// A ladder: two rails and a rung every RUNG metres up them, thinner than the frame the sim meets
// so a climber's hands reach past the rungs, each painted like the piece and all merged into one,
// tipped over together by the piece's lean.
function frame(s: Ladder, mapping: Mapping): VertexData {
  const stout = s.d / LADDER_GIRTH;
  const rail = RAIL * stout;
  const depth = 0.14 * stout;
  const lean = s.lean ?? 0;
  const length = s.h / Math.cos(lean); // of the rails
  const parts: VertexData[] = [];
  // A part `along` metres up the rails, `lx` across them.
  const part = (w: number, h: number, d: number, lx: number, along: number) => {
    const data = CreateBoxVertexData({ width: w, height: h, depth: d });
    const tip = Matrix.RotationX(lean);
    data.transform(tip.multiply(Matrix.Translation(lx, along * Math.cos(lean), along * Math.sin(lean))));
    paintFaces(data, s, data.positions!, data.normals!, 0, mapping);
    parts.push(data);
  };
  for (const side of [-1, 1]) part(rail, length, depth, side * (s.w / 2 - rail / 2), length / 2);
  for (let a = RUNG; a < length - rail; a += RUNG) part(s.w - 2 * rail, rail * 0.6, depth * 0.6, 0, a);
  const [first, ...rest] = parts;
  return first.merge(rest, true);
}

// A box over the footprint with each top corner dropped to the kind's surface height there:
// exact for any top that's flat or planar (boxes, ramps).
function prism(s: Box | Ramp, mapping: Mapping): Built {
  const { top, height } = surfaceOf(s);
  const data = CreateBoxVertexData({ width: s.w, height, depth: s.d });
  const positions = data.positions!;
  for (let i = 0; i < positions.length; i += 3) {
    if (positions[i + 1] > 0) positions[i + 1] = top(positions[i], positions[i + 2]) - height / 2;
  }
  const normals: number[] = [];
  VertexData.ComputeNormals(positions, data.indices, normals);
  data.normals = normals;
  paintFaces(data, s, positions, normals, height / 2, mapping);
  return { data, lift: height / 2 }; // the box is centred; its underside is at local 0 once lifted
}

// A grid over the footprint, one vertex per height sample, flat-shaded into facets.
function heightfield(s: Terrain, mapping: Mapping): VertexData {
  const { top } = surfaceOf(s);
  const grid = CreateGroundVertexData({
    width: s.w,
    height: s.d,
    subdivisionsX: s.heights[0].length - 1,
    subdivisionsY: s.heights.length - 1,
  });
  const at = grid.positions!;
  for (let i = 0; i < at.length; i += 3) at[i + 1] = top(at[i], at[i + 2]);
  // Flat-shaded: every triangle its own three corners, each with the triangle's own normal.
  const indices = grid.indices!;
  const positions: number[] = [];
  const normals: number[] = [];
  const corner = (k: number) => Vector3.FromArray(at, indices[k] * 3);
  for (let k = 0; k < indices.length; k += 3) {
    const [a, b, c] = [corner(k), corner(k + 1), corner(k + 2)];
    const n = Vector3.Cross(a.subtract(b), c.subtract(b)).normalize();
    for (const p of [a, b, c]) {
      positions.push(p.x, p.y, p.z);
      normals.push(n.x, n.y, n.z);
    }
  }
  const data = new VertexData();
  data.positions = positions;
  data.normals = normals;
  data.indices = Array.from({ length: positions.length / 3 }, (_, i) => i);
  paintFaces(data, s, positions, normals, 0, { ...mapping, worldTop: true });
  return data;
}

// Texture coordinates in metres (one `tile` per repeat) and a vertex colour per face direction.
// Every coordinate is measured from the world origin, never from the piece, so two pieces of one
// look whose faces overlap in the same plane paint the same texel there and can't flicker: sides
// run along the face (the same way for every face pointing that way) and up world height, and tops
// use world x/z when `worldTop`, or else axes turned with the piece (a stair's planks run along
// each step), which match only between pieces turned the same way.
function paintFaces(
  data: VertexData,
  s: Structure,
  positions: ArrayLike<number>,
  normals: ArrayLike<number>,
  lift: number,
  { tile, worldTop }: Mapping,
): void {
  const yaw = s.yaw ?? 0;
  const cos = Math.cos(yaw);
  const sin = Math.sin(yaw);
  const base = s.y ?? 0;
  const uvs: number[] = [];
  const colors: number[] = [];
  for (let i = 0; i < positions.length / 3; i++) {
    const [lx, ly, lz] = [positions[3 * i], positions[3 * i + 1], positions[3 * i + 2]];
    const [nx, ny, nz] = [normals[3 * i], normals[3 * i + 1], normals[3 * i + 2]];
    const wx = s.x + lx * cos + lz * sin;
    const wy = ly + lift + base;
    const wz = s.z - lx * sin + lz * cos;
    let shade: number;
    if (Math.abs(ny) >= Math.abs(nx) && Math.abs(ny) >= Math.abs(nz)) {
      shade = ny > 0 ? SHADE.top : SHADE.bottom;
      uvs.push(...topUv(s, wx, wz, { tile, worldTop }));
    } else {
      shade = Math.abs(nx) >= Math.abs(nz) ? SHADE.sideX : SHADE.sideZ;
      // The face's normal in the world, turned a quarter about the vertical: along the face.
      const ax = -nx * sin + nz * cos;
      const az = -(nx * cos + nz * sin);
      const len = Math.hypot(ax, az);
      const { ring } = s;
      if (ring && Math.abs(nx) > Math.abs(nz)) {
        // A round wall's long side: the arc round the ring, unwrapped about the piece's own bearing so
        // no face straddles the turn's seam, running the way the face's own mapping would.
        const middle = Math.atan2(s.z - ring.z, s.x - ring.x);
        const off = Math.atan2(wz - ring.z, wx - ring.x) - middle;
        const arc = ring.r * (middle + Math.atan2(Math.sin(off), Math.cos(off)));
        const outward = ax * (s.z - ring.z) - az * (s.x - ring.x) > 0;
        uvs.push((outward ? -arc : arc) / tile, wy / tile);
      } else uvs.push((wx * ax + wz * az) / len / tile, wy / tile);
    }
    colors.push(shade, shade, shade, 1);
  }
  data.uvs = uvs;
  data.colors = colors;
}
