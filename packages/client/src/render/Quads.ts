// Quads gathered into one mesh's data, for the shapes a renderer builds by hand.
import { Color3, VertexData } from '@babylonjs/core';

export type Vec = [number, number, number];

export class Quads {
  private readonly positions: number[] = [];
  private readonly normals: number[] = [];
  private readonly uvs: number[] = [];
  private readonly colors: number[] = [];
  private readonly indices: number[] = [];

  // A quad through `corners` in order round it, facing `normal`, in `colour` or mapped by `uvs`.
  add(corners: Vec[], normal: Vec, look: { colour: string } | { uvs: [number, number][] }): void {
    const first = this.positions.length / 3;
    for (const corner of corners) {
      this.positions.push(...corner);
      this.normals.push(...normal);
    }
    if ('uvs' in look) this.uvs.push(...look.uvs.flat());
    else {
      const { r, g, b } = Color3.FromHexString(look.colour);
      for (let k = 0; k < corners.length; k++) this.colors.push(r, g, b, 1);
    }
    // Wound the way the scene's front faces are, whichever way round the corners were given.
    const [p, q, r] = corners;
    const [u, v] = [minus(q, p), minus(r, p)];
    const turn = dot(cross(u, v), normal);
    this.indices.push(...(turn < 0 ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2]).map((k) => first + k));
  }

  data(): VertexData {
    const data = new VertexData();
    data.positions = this.positions;
    data.normals = this.normals;
    data.indices = this.indices;
    if (this.uvs.length) data.uvs = this.uvs;
    if (this.colors.length) data.colors = this.colors;
    return data;
  }
}

export const minus = (a: Vec, b: Vec): Vec => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const dot = (a: Vec, b: Vec): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a: Vec, b: Vec): Vec => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
export const flipped = (v: Vec): Vec => [-v[0], -v[1], -v[2]];
export const unit = (v: Vec): Vec => {
  const length = Math.hypot(...v);
  return [v[0] / length, v[1] / length, v[2] / length];
};
