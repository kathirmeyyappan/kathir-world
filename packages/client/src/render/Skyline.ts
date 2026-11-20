// The world's skyline: its whole shape in the fog's colour, there from as far off as it could be
// seen, so what's too far to be loaded (Loader.ts REACH) still stands against the sky as a
// silhouette: the floor's slab part by part, the roads' risen lengths, and the big pieces of what's
// built. It's made from what the content already has, a TILE at a time through the loader with a
// reach of its own, each tile one mesh with no texture. Everything in it stands a little inside the
// real thing, which covers it wherever that's loaded, and far enough off to be let go the real
// thing is the fog's colour too, so nothing shows where one takes over from the other.
import { Color3, Mesh, StandardMaterial, VertexData, type Scene } from '@babylonjs/core';
import { CHUNK, OUTSIDE_HEIGHT, type Raised, type Structure, type WorldPart } from '@world/shared';
import { FOG_COLOR, type Engine } from './Engine';
import type { Loader } from './Loader';
import { perScene } from './perScene';
import { over, raisedGround } from './RaisedGround';
import { Quads } from './Quads';
import { placed } from './Structures';

const TILE = 20 * CHUNK; // metres across the square of the world one mesh of the skyline covers
// Metres from a tile within which it's kept: as far as a silhouette a few metres tall is still a
// pixel or two of the picture, and past the whole of the world as it stands.
export const SKYLINE_REACH = 2400;
const INSIDE = 0.3; // metres everything stands in from the real thing's faces
const END = 1; // metres a straight part of the floor stands in from its ends
const ROUND = 12; // metres of a round edge to one flat length of it
const BIG = 8; // metres: a built piece shorter than this every way is too small to tell from afar

// A shape's corners and the triangles between them.
interface Shape {
  positions: number[];
  indices: number[];
}
type Spot = [x: number, y: number, z: number];

const blackIn = perScene((scene) => {
  const black = new StandardMaterial('skyline', scene);
  black.disableLighting = true;
  black.diffuseColor = black.specularColor = Color3.Black();
  black.emissiveColor = FOG_COLOR;
  // Seen from inside as from out: it's an outline, with no sides to tell apart.
  black.backFaceCulling = false;
  black.freeze();
  return black;
});

export function buildSkyline(
  engine: Engine,
  floor: readonly WorldPart[],
  raised: readonly Raised[],
  structures: readonly Structure[],
  loader: Loader,
): void {
  // Each thing goes in the tile its middle is in, as a job that makes its shape when the tile loads.
  const tiles = new Map<string, { x: number; z: number; shapes: (() => Shape)[] }>();
  const put = (x: number, z: number, shape: () => Shape) => {
    const [tx, tz] = [Math.floor(x / TILE), Math.floor(z / TILE)];
    const key = `${tx},${tz}`;
    const tile = tiles.get(key) ?? { x: (tx + 0.5) * TILE, z: (tz + 0.5) * TILE, shapes: [] };
    tile.shapes.push(shape);
    tiles.set(key, tile);
  };
  for (const part of floor) put(...middleOf(part), () => slab(part));
  for (const length of raised) {
    const { x, z } = over(length);
    put(x, z, () => bare(raisedGround(within(length), new Quads(), 'open').data()));
  }
  for (const piece of structures)
    if (told(piece)) put(piece.x, piece.z, () => bare(placed({ ...piece, ...shrunk(piece) })));

  const scene = engine.scene;
  for (const [key, tile] of tiles) {
    let mesh: Mesh | null = null;
    loader.add({
      x: tile.x,
      z: tile.z,
      r: (TILE * Math.SQRT2) / 2,
      reach: SKYLINE_REACH,
      load: function* () {
        const whole: Shape = { positions: [], indices: [] };
        for (const shape of tile.shapes) {
          join(whole, shape());
          yield;
        }
        mesh = made(scene, `skyline-${key}`, whole);
        engine.keepFromGlow(mesh);
      },
      unload: () => {
        mesh?.dispose();
        mesh = null;
      },
    });
  }
}

function made(scene: Scene, name: string, shape: Shape): Mesh {
  const data = new VertexData();
  data.positions = shape.positions;
  data.indices = shape.indices;
  const mesh = new Mesh(name, scene);
  data.applyToMesh(mesh);
  mesh.material = blackIn(scene);
  mesh.isPickable = false;
  mesh.freezeWorldMatrix();
  return mesh;
}

function join(whole: Shape, shape: Shape): void {
  const first = whole.positions.length / 3;
  for (const p of shape.positions) whole.positions.push(p);
  for (const i of shape.indices) whole.indices.push(first + i);
}

// A mesh's corners and triangles alone, as numbers.
function bare(data: VertexData): Shape {
  return { positions: Array.from(data.positions ?? []), indices: Array.from(data.indices ?? []) };
}

// Whether a built piece is in the skyline: drawn, a block or a wedge, and BIG some way.
function told(s: Structure): s is Extract<Structure, { kind: 'box' | 'ramp' }> {
  return !s.hidden && (s.kind === 'box' || s.kind === 'ramp') && Math.max(s.w, s.d, s.h) >= BIG;
}

// A piece's size and height brought INSIDE its own faces, where it's thick enough to be. A block
// keeps its middle. A wedge keeps its slope, its top INSIDE under the real one all the way down,
// so its thin end is sunk into whatever it stands on rather than left standing proud of the slope.
function shrunk(s: Extract<Structure, { kind: 'box' | 'ramp' }>): { w: number; d: number; h: number; y: number } {
  const less = (size: number) => Math.max(size / 2, size - 2 * INSIDE);
  const [w, d, y] = [less(s.w), less(s.d), s.y ?? 0];
  if (s.kind === 'ramp') return { w, d, h: (s.h * d) / s.d, y: y + (s.h * (s.d - d)) / 2 / s.d - INSIDE };
  const h = less(s.h);
  return { w, d, h, y: y + (s.h - h) / 2 };
}

// A length of risen road brought INSIDE its own top and sides, and for a deck its underside. Its
// ends are drawn open: a wall across one would lie in the plane of the real one, and an open end
// looks no different, every face of the skyline being the one colour from either side.
function within(r: Raised): Raised {
  const [halfWidth, deep] = [r.halfWidth - INSIDE, r.deep - 1.5 * INSIDE];
  return r.kind === 'straight'
    ? { ...r, ay: r.ay - INSIDE, by: r.by - INSIDE, halfWidth, deep }
    : { ...r, y: r.y - INSIDE, halfWidth, deep };
}

function middleOf(p: WorldPart): [number, number] {
  if (p.kind === 'bridge') return [(p.ax + p.bx) / 2, (p.az + p.bz) / 2];
  if (p.kind === 'disc') return [p.x, p.z];
  const [r, mid] = [p.kind === 'bend' ? p.r : p.r / 2, (p.from + p.to) / 2];
  return [p.x + r * Math.cos(mid), p.z + r * Math.sin(mid)];
}

// A part of the floor as its slab, INSIDE the real one: its top, and its sides down to the ground
// past the edge.
function slab(p: WorldPart): Shape {
  const shape: Shape = { positions: [], indices: [] };
  const [top, foot] = [-INSIDE, OUTSIDE_HEIGHT];
  // The slab under a run of edges, each from its left end to its right as the part runs: a top
  // between each and the next, and a wall down from the line of the lefts and of the rights.
  const ribbon = (edges: [left: [number, number], right: [number, number]][]) => {
    for (let k = 0; k + 1 < edges.length; k++) {
      const [[a, b], [c, d]] = [edges[k], edges[k + 1]];
      quad(shape, [a[0], top, a[1]], [b[0], top, b[1]], [d[0], top, d[1]], [c[0], top, c[1]]);
      for (const [p0, p1] of [
        [a, c],
        [b, d],
      ])
        quad(shape, [p0[0], top, p0[1]], [p1[0], top, p1[1]], [p1[0], foot, p1[1]], [p0[0], foot, p0[1]]);
    }
    for (const [a, b] of [edges[0], edges[edges.length - 1]])
      quad(shape, [a[0], top, a[1]], [b[0], top, b[1]], [b[0], foot, b[1]], [a[0], foot, a[1]]);
  };
  // Round (x, z) at radius r, at bearings from one to another, a flat length to every ROUND of it.
  const round = (x: number, z: number, r: number, from: number, to: number, reach: number): [number, number][] => {
    const lengths = Math.max(2, Math.ceil((reach * Math.abs(to - from)) / ROUND));
    return Array.from({ length: lengths + 1 }, (_, k) => {
      const a = from + ((to - from) * k) / lengths;
      return [x + r * Math.cos(a), z + r * Math.sin(a)];
    });
  };
  if (p.kind === 'bridge') {
    const length = Math.hypot(p.bx - p.ax, p.bz - p.az);
    const half = p.halfWidth - INSIDE;
    const [ux, uz] = [(p.bx - p.ax) / length, (p.bz - p.az) / length];
    const [sx, sz] = [-uz * half, ux * half];
    // Its ends in from the real ones too, where a road's floor ends in a face of its own at a gap:
    // by END, since the real floor's corners there are cut off as far as its edge is traced.
    const [ax, az, bx, bz] = [p.ax + ux * END, p.az + uz * END, p.bx - ux * END, p.bz - uz * END];
    ribbon([
      [
        [ax + sx, az + sz],
        [ax - sx, az - sz],
      ],
      [
        [bx + sx, bz + sz],
        [bx - sx, bz - sz],
      ],
    ]);
  } else if (p.kind === 'bend') {
    const [inner, outer] = [p.r - p.halfWidth + INSIDE, p.r + p.halfWidth - INSIDE];
    const outside = round(p.x, p.z, outer, p.from, p.to, outer);
    ribbon(round(p.x, p.z, inner, p.from, p.to, outer).map((left, k) => [left, outside[k]]));
  } else {
    // A disc, or a slice of one: a fan out from its middle to its rim.
    const [from, to] = p.kind === 'disc' ? [0, 2 * Math.PI] : [p.from, p.to];
    const r = p.r - INSIDE;
    ribbon(round(p.x, p.z, r, from, to, r).map((rim) => [[p.x, p.z], rim]));
  }
  return shape;
}

function quad(shape: Shape, a: Spot, b: Spot, c: Spot, d: Spot): void {
  const first = shape.positions.length / 3;
  shape.positions.push(...a, ...b, ...c, ...d);
  shape.indices.push(first, first + 1, first + 2, first, first + 2, first + 3);
}
