// The streaks that fly past a driver's view through a boost: thin strips lying along the way the
// camera looks, in its own frame, round the edges of the view and clear of its middle, each with
// dashes of light running down it toward the eye, so on screen they fly outward from where the
// kart is heading. One mesh on the camera with one small painted texture, made at the first boost
// and drawn only through one.
import { Color3, DynamicTexture, Mesh, StandardMaterial, Texture, VertexData, type Scene } from '@babylonjs/core';

const STREAKS = 56;
const RING = { near: 2.2, far: 5 }; // metres out from the middle of the view that the strips lie
// Each strip's ends, as tangents of the angle from the middle of the view: it runs in from past the
// screen's edge to where the kart and the road ahead of it are, which it keeps clear of.
const SPAN = { edge: 2.4, clear: 0.34 };
const WIDTH = 0.035; // metres across a strip
const RUN = 8; // metres from one dash to the next along a strip
const DASH = 0.4; // of that, the dash, its head toward the eye and fading back along its tail
const SPEED = 60; // m/s the dashes run toward the eye
const ALPHA = 0.7; // how solid the brightest streak is at the full of a boost
const TEXELS = 64; // along one run of the picture

export class SpeedLines {
  private readonly mesh: Mesh;
  private readonly material: StandardMaterial;
  private readonly dashes: DynamicTexture;
  private run = 0; // how far through a run the dashes have got, 0 to 1

  constructor(scene: Scene) {
    this.dashes = new DynamicTexture(
      'speed-lines',
      { width: 1, height: TEXELS },
      scene,
      false,
      Texture.BILINEAR_SAMPLINGMODE,
    );
    this.dashes.hasAlpha = true;
    paintDash(this.dashes.getContext() as CanvasRenderingContext2D);
    this.dashes.update();
    this.dashes.wrapV = Texture.WRAP_ADDRESSMODE;
    this.material = new StandardMaterial('speed-lines', scene);
    this.material.disableLighting = true;
    this.material.emissiveColor = Color3.White();
    this.material.opacityTexture = this.dashes;
    this.material.backFaceCulling = false;
    this.material.disableDepthWrite = true;
    this.material.fogEnabled = false;
    this.mesh = new Mesh('speed-lines', scene);
    strips().applyToMesh(this.mesh);
    this.mesh.material = this.material;
    this.mesh.hasVertexAlpha = true;
    this.mesh.isPickable = false;
    this.mesh.alwaysSelectAsActiveMesh = true;
    this.mesh.parent = scene.activeCamera;
    this.mesh.setEnabled(false);
  }

  // Draws them as `rush` of a boost has it (0: none), their dashes `dt` seconds further on.
  update(rush: number, dt: number): void {
    this.mesh.setEnabled(rush > 0);
    if (rush <= 0) return;
    this.material.alpha = ALPHA * rush;
    // The picture is looked up further along each strip as time goes, so its dashes run in.
    this.run = (this.run + (SPEED / RUN) * dt) % 1;
    this.dashes.vOffset = this.run;
  }
}

// One run of a strip's picture: clear, but for a dash that's solid at its head and fades back
// along its tail. The canvas's rows go up the picture from its far end, so the tail is painted
// first and the head last, nearest the eye and the way the dashes run.
function paintDash(ctx: CanvasRenderingContext2D): void {
  ctx.clearRect(0, 0, 1, TEXELS);
  const rows = Math.round(DASH * TEXELS);
  for (let y = 0; y < rows; y++) {
    ctx.fillStyle = `rgba(255, 255, 255, ${((y + 1) / rows) ** 1.5})`;
    ctx.fillRect(0, y, 1, 1);
  }
}

// The strips, in the camera's frame (z the way it looks): each at its own bearing round the middle
// of the view and its own distance out, flat to the eye, its dashes at their own place along it,
// fading in from nothing at its far end to its own brightness at its near one.
function strips(): VertexData {
  const positions: number[] = [];
  const uvs: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  for (let i = 0; i < STREAKS; i++) {
    const bearing = ((i + scatter(i, 1)) / STREAKS) * 2 * Math.PI;
    const out = RING.near + (RING.far - RING.near) * scatter(i, 2);
    const [x, y] = [Math.cos(bearing) * out, Math.sin(bearing) * out];
    const [ax, ay] = [(-Math.sin(bearing) * WIDTH) / 2, (Math.cos(bearing) * WIDTH) / 2];
    const [near, far] = [out / SPAN.edge, out / SPAN.clear];
    const [shift, bright] = [scatter(i, 3), 0.45 + 0.55 * scatter(i, 4)];
    const first = positions.length / 3;
    for (const [z, alpha] of [
      [near, bright],
      [far, 0],
    ]) {
      positions.push(x - ax, y - ay, z, x + ax, y + ay, z);
      uvs.push(0, shift + z / RUN, 1, shift + z / RUN);
      colors.push(1, 1, 1, alpha, 1, 1, 1, alpha);
    }
    indices.push(first, first + 1, first + 2, first + 1, first + 3, first + 2);
  }
  const data = new VertexData();
  data.positions = positions;
  data.uvs = uvs;
  data.colors = colors;
  data.indices = indices;
  return data;
}

// A number from 0 to 1 for strip `i`'s `n`th choice, the same every time, so the streaks lie the
// same way from one boost to the next.
function scatter(i: number, n: number): number {
  const s = Math.sin(i * 127.1 + n * 311.7) * 43758.5453;
  return s - Math.floor(s);
}
