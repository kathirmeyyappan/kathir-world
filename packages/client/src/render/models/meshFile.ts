// A model's part as its script writes it (scripts/house_mesh.py `emit_part`), in
// /assets/models/<model>/<part>.bin: counts (Uint32 vertices, triangles), positions in centimetres
// (Int16), texture coordinates (Uint16, UV_UNIT to the repeat, v down the image), triangles
// (Uint16), unit normals (Int8).
import { VertexData } from '@babylonjs/core';

const UV_UNIT = 4096; // texture coordinate units to the repeat

// Rejects where the server answers with anything but the file, an error page being no mesh.
export async function fetchMesh(model: string, part: string): Promise<ArrayBuffer> {
  const response = await fetch(`/assets/models/${model}/${part}.bin`);
  if (!response.ok) throw new Error(`${model}/${part}: ${response.status}`);
  return response.arrayBuffer();
}

export function meshData(buffer: ArrayBuffer): VertexData {
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
  return data;
}
