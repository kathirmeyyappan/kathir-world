// The ground's slab as meshes, a CHUNK square at a time (sim/ground.ts): the floor's top, and along
// its edge the kerb, its face dropping to the ground past the edge with a toe at its foot. Each
// chunk's edge is traced from the ground's distance to it, sampled on one grid for the whole world
// (CELL metres), so the chunks' meshes meet along their sides without a seam. The ground past the
// edge is one plane under everything (Environment.ts), hidden by the slab wherever the floor is.
import { VertexData } from '@babylonjs/core';
import { CHUNK, OUTSIDE_HEIGHT, type Ground } from '@world/shared';

// Metres between samples of the ground's edge: the length of a stretch of kerb, which on the
// tightest curve there is (a plateau of 20 m) leaves the edge a few millimetres off the circle.
const CELL = 1;
const SAMPLES = CHUNK / CELL + 1;

// The kerb along the edge: metres across, inside the edge, and up; the floor stops halfway across
// under it, so its cut edge never shows. It's only drawn: the sim's floor is flat to the edge, and
// a foot sinks its 8 cm into it unseen.
export const KERB_WIDTH = 0.5;
export const KERB_HEIGHT = 0.08;

type Point = { x: number; z: number };

// What each vertex of a chunk's mesh is part of, in its uv.y: the ground's shader draws each its
// own way (shaders.ts, `side`), and one mesh a chunk is one draw.
export const FLOOR_SIDE = 0;
export const KERB_SIDE = 2;

// Chunk (cx, cz)'s floor and kerb as one mesh, in world metres, or null where it has neither: a loader's job
// (Loader.ts), yielding after each row of samples and each row of the kerb's cells, a few hundred
// microseconds of work apiece.
export function* floorChunk(ground: Ground, cx: number, cz: number): Generator<void, VertexData | null> {
  const x0 = cx * CHUNK;
  const z0 = cz * CHUNK;
  const edge = new Float64Array(SAMPLES * SAMPLES);
  for (let j = 0; j < SAMPLES; j++) {
    for (let i = 0; i < SAMPLES; i++) edge[j * SAMPLES + i] = ground.edge(x0 + i * CELL, z0 + j * CELL);
    yield;
  }
  const floor = floorOf(edge, x0, z0);
  yield;
  const kerb = yield* kerbOf(ground, edge, x0, z0);
  const parts = [floor, kerb].filter((d): d is VertexData => d !== null);
  return parts.length === 0 ? null : parts[0].merge(parts.slice(1), true);
}

// The floor's top: inside the edge by half the kerb, a quad for each run of cells wholly inside it
// along a row and the inside of each cell it crosses, as a fan.
function floorOf(edge: Float64Array, x0: number, z0: number): VertexData | null {
  const level = -KERB_WIDTH / 2;
  const positions: number[] = [];
  const indices: number[] = [];
  const polygon = (points: Point[]) => {
    const base = positions.length / 3;
    for (const p of points) positions.push(p.x, 0, p.z);
    for (let k = 1; k + 1 < points.length; k++) indices.push(base, base + k, base + k + 1);
  };
  const at = (i: number, j: number) => edge[j * SAMPLES + i] - level;
  for (let j = 0; j < SAMPLES - 1; j++) {
    let run = -1; // the first cell of the run of whole cells along this row, if one is open
    const close = (end: number) => {
      if (run < 0) return;
      const [xa, xb] = [x0 + run * CELL, x0 + end * CELL];
      const [za, zb] = [z0 + j * CELL, z0 + (j + 1) * CELL];
      polygon([
        { x: xa, z: za },
        { x: xb, z: za },
        { x: xb, z: zb },
        { x: xa, z: zb },
      ]);
      run = -1;
    };
    for (let i = 0; i < SAMPLES - 1; i++) {
      const corners = cellCorners(i, j, x0, z0, at);
      if (corners.every((c) => c.v < 0)) {
        if (run < 0) run = i;
        continue;
      }
      close(i);
      const inside = insideOf(corners);
      if (inside.length >= 3) polygon(inside);
    }
    close(SAMPLES - 1);
  }
  if (indices.length === 0) return null;
  const normals = positions.map((_, k) => (k % 3 === 1 ? 1 : 0));
  return Object.assign(new VertexData(), {
    positions,
    indices,
    normals,
    uvs: Array.from({ length: (positions.length / 3) * 2 }, (_, k) => (k % 2 === 1 ? FLOOR_SIDE : 0)),
  });
}

// The kerb along every stretch of edge crossing the chunk's cells, each stretch on its own: at
// each end the way out square to the edge there (the ground's distance's slope), so neighbouring
// stretches, in this chunk or the next, share their ends exactly. Across it, at each end: its
// inner face (uv.x 1, drawn as the grid's rim), its top, its face down the drop, and the toe at
// its foot, KERB_WIDTH out over the ground past the edge and KERB_HEIGHT up from it.
function* kerbOf(ground: Ground, edge: Float64Array, x0: number, z0: number): Generator<void, VertexData | null> {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const foot = OUTSIDE_HEIGHT + KERB_HEIGHT;
  const ring = (p: Point): void => {
    const n = outward(ground, p);
    const at = (d: number): [number, number] => [p.x + n.x * d, p.z + n.z * d];
    const [ix, iz] = at(-KERB_WIDTH);
    const [tx, tz] = at(KERB_WIDTH);
    const across: [number, number, number, number][] = [
      [ix, 0, iz, 1],
      [ix, KERB_HEIGHT, iz, 1],
      [ix, KERB_HEIGHT, iz, 0],
      [p.x, KERB_HEIGHT, p.z, 0],
      [p.x, foot, p.z, 0],
      [tx, foot, tz, 0],
      [tx, OUTSIDE_HEIGHT, tz, 0],
    ];
    for (const [x, y, z, rim] of across) {
      positions.push(x, y, z);
      // The way out, level, at every vertex: what the grid down the drop is laid by (shaders.ts).
      normals.push(n.x, 0, n.z);
      uvs.push(rim, KERB_SIDE);
    }
  };
  const stretch = (a: Point, b: Point) => {
    const base = positions.length / 3;
    ring(a);
    ring(b);
    for (let k = 0; k < KERB_RING - 1; k++) {
      if (k === 1) continue; // between the rim's top and the top's own first vertex: the same point
      const [p, q] = [base + k, base + KERB_RING + k];
      indices.push(p, p + 1, q, p + 1, q + 1, q);
    }
  };
  const at = (i: number, j: number) => edge[j * SAMPLES + i];
  for (let j = 0; j < SAMPLES - 1; j++) {
    for (let i = 0; i < SAMPLES - 1; i++) {
      const crossings = crossingsOf(cellCorners(i, j, x0, z0, at));
      for (let k = 0; k + 1 < crossings.length; k += 2) stretch(crossings[k], crossings[k + 1]);
    }
    yield;
  }
  if (indices.length === 0) return null;
  return Object.assign(new VertexData(), { positions, normals, uvs, indices });
}

const KERB_RING = 7; // vertices across the kerb at each end of a stretch

interface Corner extends Point {
  v: number; // the sampled value there, negative inside
}

// A cell's corners, round it: (i, j), (i + 1, j), (i + 1, j + 1), (i, j + 1).
function cellCorners(i: number, j: number, x0: number, z0: number, at: (i: number, j: number) => number): Corner[] {
  return [
    [i, j],
    [i + 1, j],
    [i + 1, j + 1],
    [i, j + 1],
  ].map(([ci, cj]) => ({ x: x0 + ci * CELL, z: z0 + cj * CELL, v: at(ci, cj) }));
}

// Where the value crosses zero along the side from `a` to `b`.
function crossing(a: Corner, b: Corner): Point {
  const t = a.v / (a.v - b.v);
  return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t };
}

// The part of a cell inside (value below zero): its corners inside and the crossings between them,
// in order round it.
function insideOf(corners: Corner[]): Point[] {
  const points: Point[] = [];
  for (let k = 0; k < 4; k++) {
    const a = corners[k];
    const b = corners[(k + 1) % 4];
    if (a.v < 0) points.push(a);
    if (a.v < 0 !== b.v < 0) points.push(crossing(a, b));
  }
  return points;
}

// The points where the edge crosses a cell's sides, in pairs, each pair a stretch of it.
function crossingsOf(corners: Corner[]): Point[] {
  const points: Point[] = [];
  for (let k = 0; k < 4; k++) {
    const a = corners[k];
    const b = corners[(k + 1) % 4];
    if (a.v < 0 !== b.v < 0) points.push(crossing(a, b));
  }
  return points;
}

// The way out of the floor square to its edge at `p`, a unit vector: the slope of the distance.
function outward(ground: Ground, p: Point): Point {
  const e = 0.01;
  const dx = ground.edge(p.x + e, p.z) - ground.edge(p.x - e, p.z);
  const dz = ground.edge(p.x, p.z + e) - ground.edge(p.x, p.z - e);
  const len = Math.hypot(dx, dz) || 1;
  return { x: dx / len, z: dz / len };
}
