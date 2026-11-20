// A map of the world drawn onto a canvas: every map there is draws through this, the HUD's minimap
// (Minimap.ts), the menu's (menu/Map.ts) and the guide's, so they all show the one world, the
// outline (WORLD_GROUND) and the landmarks (content/landmarks.ts) as shared has them. Three views:
// CLOSE and WIDE keep you centred and turn so you always face up, CLOSE round you and WIDE further
// out; WORLD shows the whole outline north-up.
// Everything is drawn each frame as shapes in world metres through the view's transform, at the
// screen's own pixel density (RES canvas pixels to the CSS pixel), so edges stay smooth at any zoom
// and as the near view turns: the outline's parts (discs, bridges, bends and slices), landmarks grey
// on the floor (SpongeBob's house and the Krusty Krab as themselves, a road's climbs as arrowheads
// pointing up them and its boost pads as rainbows), and up past HIGH_UP the walkways up there too.
// Markers go on top: cubes as faint specks, people as smaller copies of your arrow pointing their
// way, bots as squares, and anyone on another level (a floor above, a bridge below) faded. The
// canvas can be any size and change it; each draw fits the view to the size it has.
import {
  EYE_HEIGHT,
  HIGH_LANDMARKS,
  HIGH_UP,
  LANDMARKS,
  WORLD_GROUND,
  type KrustyKrabMark,
  type Landmark,
  type Pad,
  type PineappleMark,
  type Bounds,
  type RoadMark,
  type Slope,
  type WorldPart,
} from '@world/shared';
import { BOOST_RAINBOW } from '../render/BoostPads';
import type { Elevation } from './Elevation';

export interface MinimapFrame {
  me: { x: number; y: number; z: number; yaw: number };
  players: { x: number; y: number; z: number; yaw: number; color: string; bot: boolean }[];
  cubes: { x: number; z: number }[];
}

export type MinimapView = 'close' | 'wide' | 'world';
// Closest first: what P steps through, and the toggles' order.
export const MINIMAP_VIEWS: readonly MinimapView[] = ['close', 'wide', 'world'];

// How a view is drawn beyond its own framing: `zoom` times closer, and slid `pan` metres along the
// view's own right and up (so a view centred on you pans as you turn).
export interface Framing {
  zoom: number;
  pan: { right: number; up: number };
}

export const STILL: Framing = { zoom: 1, pan: { right: 0, up: 0 } };

// Canvas pixels per CSS pixel: the screen's own density, and at least two, so a plain screen gets
// the map drawn finer and smoothed down.
const RES = Math.min(3, Math.max(2, Math.ceil(window.devicePixelRatio || 1)));
// Metres from you to the nearer edge in each view centred on you.
const RANGES: Record<Exclude<MinimapView, 'world'>, number> = { close: 32, wide: 100 };
const WORLD_MARGIN = 8; // metres round the outline in the world view
const HEIGHTS_BUDGET = 8; // milliseconds a draw spends working out the heights, until they're all in
const GRID_SPACING = 10;
const EDGE = 2.2; // CSS pixels of outline outside the world's edge
const ACCENT = '127, 209, 174'; // the UI's mint
const FLOOR = `rgba(${ACCENT}, 0.11)`;
const GRID = `rgba(${ACCENT}, 0.27)`;
const OUTLINE = `rgba(${ACCENT}, 0.9)`;
const LANDMARK = 'rgba(150, 150, 158, 0.78)';
const RING = 'rgb(70, 70, 78)'; // a landmark's inner circles
const CLIMB = `rgba(${ACCENT}, 0.85)`; // the arrowheads up a road's slope
// A slope's arrowheads: CSS pixels from one to the next at the least (and metres, zoomed in), and
// how much of the road's width each spans.
const CLIMB_SPACING = { px: 7, m: 5 };
const CLIMB_SPAN = 0.6;
const WOOD = 'rgb(138, 100, 64)'; // a wooden walkway's footprint (the terrace's staircases)
// SpongeBob's house: its dune's sand, the fruit's skin and the diamonds hatched across it, and its
// leaves, the outer ones darker.
const SAND = 'rgb(214, 196, 140)';
const PINEAPPLE = 'rgb(232, 168, 58)';
const HATCH = 'rgba(128, 72, 24, 0.85)';
const LEAVES = ['rgb(62, 140, 62)', 'rgb(118, 192, 84)'];
const LEAF_EDGE = 'rgba(24, 64, 28, 0.8)';
// The Krusty Krab: its plinth, the arches at its ends, the barrel of its roof and the seams between
// the roof's staves.
const PLINTH = 'rgb(104, 78, 54)';
const ARCH = 'rgb(150, 114, 78)';
const ROOF = 'rgb(84, 62, 44)';
const SEAM = 'rgba(36, 24, 14, 0.9)';
const OTHERS = 0.6; // other people's arrows, as a fraction of yours
const BOT = 5; // CSS pixels across a bot's square, inside its light edge: still under a person's arrow
const LEVEL = 3; // metres of height difference at which another player reads as above or below you

// Pixel <-> world mapping for a view. `origin` is the world point at the canvas centre, `f`/`r` the
// world directions that map to screen up and right, `scale` metres per CSS pixel.
interface Transform {
  ox: number;
  oz: number;
  scale: number;
  fx: number;
  fz: number;
  rx: number;
  rz: number;
}

export class MapCanvas {
  private readonly ctx: CanvasRenderingContext2D;
  // Offscreen layers, each masked to its shapes before it's laid under what's drawn.
  private readonly gridLayer = layer();
  private readonly floorLayer = layer();
  private readonly landmarkLayer = layer();
  private readonly woodLayer = layer();
  private readonly houseLayer = layer();
  private readonly parts: Map<WorldPart, Path2D>; // each part's path, made once
  private readonly bounds;
  private width = 0; // CSS pixels, as last drawn
  private height = 0;

  constructor(readonly canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!;
    this.parts = new Map(WORLD_GROUND.parts.map((part) => [part, partPath(part)]));
    this.bounds = WORLD_GROUND.bounds;
  }

  // The frame in `view`, filling the canvas at the size it's shown at: the floor with its
  // landmarks, or with `heights` under how high everything on it stands, in their place.
  draw(frame: MinimapFrame, view: MinimapView, framing: Framing = STILL, heights: Elevation | null = null): void {
    this.fit();
    if (!this.width) return;
    const { x, y, z } = frame.me;
    const t = this.transform(frame.me, view, framing);
    this.drawGround(t, y - EYE_HEIGHT > HIGH_UP ? [...LANDMARKS, ...HIGH_LANDMARKS] : LANDMARKS, heights);

    const ctx = this.ctx;
    ctx.setTransform(RES, 0, 0, RES, 0, 0); // markers in CSS pixels
    ctx.fillStyle = 'rgba(255,255,255,0.35)'; // faint specks; players should stand out
    for (const c of frame.cubes) this.square(t, c.x, c.z, 2);
    for (const p of frame.players) {
      ctx.globalAlpha = Math.abs(p.y - y) < LEVEL ? 1 : 0.45;
      ctx.fillStyle = p.color;
      if (p.bot) this.bot(t, p.x, p.z);
      else this.arrow(t, p.x, p.z, p.yaw - (view === 'world' ? 0 : frame.me.yaw), OTHERS);
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#fff';
    this.arrow(t, x, z, view === 'world' ? frame.me.yaw : 0, 1);
  }

  // The whole world, north up, with no one on it: its floor and landmarks as from the ground, or
  // with `heights` its floor under how high everything on it stands.
  drawWorld(framing: Framing = STILL, heights: Elevation | null = null): void {
    this.fit();
    if (!this.width) return;
    this.drawGround(this.transform({ x: 0, y: 0, z: 0, yaw: 0 }, 'world', framing), LANDMARKS, heights);
  }

  // The floor through `t` with `landmarks` on it, or with `heights` laid over it in their place:
  // their picture, a little more of it worked out each time it's drawn until it's all there.
  private drawGround(t: Transform, landmarks: Landmark[], heights: Elevation | null): void {
    this.drawFloor(t, heights ? [] : landmarks);
    if (!heights) return;
    heights.advance(HEIGHTS_BUDGET);
    const ctx = this.ctx;
    this.toWorld(ctx, t);
    ctx.imageSmoothingEnabled = false; // a metre a pixel, each kept square
    ctx.drawImage(heights.canvas, heights.x, heights.z);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  // The world point under `x`, `y` CSS pixels from the canvas's corner, in the world view.
  worldAt(x: number, y: number, framing: Framing = STILL): { x: number; z: number } {
    this.fit();
    const t = this.transform({ x: 0, y: 0, z: 0, yaw: 0 }, 'world', framing);
    const right = (x - this.width / 2) * t.scale;
    const up = (this.height / 2 - y) * t.scale;
    return { x: t.ox + right * t.rx + up * t.fx, z: t.oz + right * t.rz + up * t.fz };
  }

  // Metres per CSS pixel the view is drawn at before any zoom: what a wheel's step is relative to.
  baseScale(view: MinimapView): number {
    this.fit();
    return this.transform({ x: 0, y: 0, z: 0, yaw: 0 }, view, STILL).scale;
  }

  // The canvas's backing store at the size it's shown at (RES to the CSS pixel), with the layers.
  private fit(): void {
    const width = this.canvas.clientWidth;
    const height = this.canvas.clientHeight;
    if (width === this.width && height === this.height) return;
    this.width = width;
    this.height = height;
    for (const c of [
      this.canvas,
      this.gridLayer.canvas,
      this.floorLayer.canvas,
      this.landmarkLayer.canvas,
      this.woodLayer.canvas,
      this.houseLayer.canvas,
    ]) {
      c.width = width * RES;
      c.height = height * RES;
    }
  }

  private transform(me: MinimapFrame['me'], view: MinimapView, framing: Framing): Transform {
    const short = Math.min(this.width, this.height);
    let t: Transform;
    if (view !== 'world') {
      t = {
        ox: me.x,
        oz: me.z,
        scale: (RANGES[view] * 2) / short,
        fx: Math.sin(me.yaw),
        fz: Math.cos(me.yaw),
        rx: Math.cos(me.yaw),
        rz: -Math.sin(me.yaw),
      };
    } else {
      const b = this.bounds;
      const span = Math.max(b.maxX - b.minX, b.maxZ - b.minZ) + 2 * WORLD_MARGIN;
      t = { ox: (b.minX + b.maxX) / 2, oz: (b.minZ + b.maxZ) / 2, scale: span / short, fx: 0, fz: 1, rx: 1, rz: 0 };
    }
    t.scale /= framing.zoom;
    // The centre slid `pan` along the view's right and up: the point there is what's at the centre.
    t.ox += t.rx * framing.pan.right + t.fx * framing.pan.up;
    t.oz += t.rz * framing.pan.right + t.fz * framing.pan.up;
    return t;
  }

  // The floor, its grid, `landmarks` and the world's edge, as shapes in world metres through `t`,
  // each only where it's on the canvas, so a frame costs what's in view however big the world is.
  // The edge is every part's outline with everything inside the world rubbed out again, leaving the
  // outside half of the line round the whole; the rest goes under it, top first, each on a layer
  // masked to its shapes so overlapping parts don't double up.
  private drawFloor(t: Transform, all: Landmark[]): void {
    const view = this.view(t);
    const parts = WORLD_GROUND.partsIn(view).map((part) => this.parts.get(part)!);
    const landmarks = all.filter((l) => overlaps(landmarkBox(l), view));
    const W = this.width * RES;
    const H = this.height * RES;
    const k = RES / t.scale; // canvas pixels per metre
    const place = (c: CanvasRenderingContext2D) => {
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.globalCompositeOperation = 'source-over';
      c.clearRect(0, 0, W, H);
      this.toWorld(c, t);
    };
    const px = (n: number) => (n * RES) / k; // n CSS pixels, in metres
    // Covers `layer` wherever `shapes` do, solid, once however many overlap.
    const cover = (layer: CanvasRenderingContext2D, shapes: Path2D[]) => {
      layer.fillStyle = '#000';
      for (const s of shapes) layer.fill(s, 'evenodd');
      layer.setTransform(1, 0, 0, 1, 0, 0);
    };
    // Turns what's on `layer` to `fill`, keeping only where it is.
    const tint = (layer: CanvasRenderingContext2D, fill: string) => {
      layer.globalCompositeOperation = 'source-in';
      layer.fillStyle = fill;
      layer.fillRect(0, 0, W, H);
    };

    const ctx = this.ctx;
    place(ctx);
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = px(2 * EDGE);
    // Every part's outline in one stroke, so where two run together the line is no heavier.
    const outlines = new Path2D();
    for (const p of parts) outlines.addPath(p);
    ctx.stroke(outlines);
    ctx.globalCompositeOperation = 'destination-out';
    for (const p of parts) ctx.fill(p);
    ctx.globalCompositeOperation = 'destination-over';

    ctx.strokeStyle = RING;
    ctx.lineWidth = px(1);
    for (const l of landmarks) {
      if (l.kind !== 'disc' || !l.rings) continue;
      for (let i = 1; i <= l.rings; i++) {
        ctx.beginPath();
        ctx.arc(l.x, l.z, (l.r * i) / (l.rings + 1), 0, 2 * Math.PI);
        ctx.stroke();
      }
    }
    ctx.strokeStyle = CLIMB;
    ctx.lineWidth = px(1.2);
    ctx.lineJoin = 'miter';
    for (const l of landmarks)
      if (l.kind === 'slope') ctx.stroke(climbPath(l, Math.max(CLIMB_SPACING.m, px(CLIMB_SPACING.px))));
    for (const l of landmarks) {
      if (l.kind !== 'pad') continue;
      const rainbow = ctx.createLinearGradient(l.ax, l.az, l.bx, l.bz);
      BOOST_RAINBOW.forEach((colour, i) => rainbow.addColorStop(i / (BOOST_RAINBOW.length - 1), colour));
      ctx.fillStyle = rainbow;
      ctx.fill(padPath(l));
    }
    const marks = landmarks.filter(
      (l): l is Footprint =>
        l.kind !== 'pineapple' && l.kind !== 'krusty-krab' && l.kind !== 'slope' && l.kind !== 'pad',
    );
    const wooden = (l: Footprint) => l.kind === 'bridge' && !!l.wood;
    place(this.landmarkLayer);
    cover(this.landmarkLayer, marks.filter((l) => !wooden(l)).map(partPath));
    tint(this.landmarkLayer, LANDMARK);
    place(this.woodLayer);
    cover(this.woodLayer, marks.filter(wooden).map(partPath));
    tint(this.woodLayer, WOOD);
    // The layer composited only when a house is on it: Chrome can keep showing a layer's last
    // drawing after a clear with nothing drawn over it, which left a house standing on the map
    // where it had been.
    place(this.houseLayer);
    let housed = false;
    for (const l of landmarks) {
      if (l.kind === 'pineapple') drawPineapple(this.houseLayer, l, px);
      else if (l.kind === 'krusty-krab') drawKrustyKrab(this.houseLayer, l, px);
      else continue;
      housed = true;
    }

    place(this.floorLayer);
    cover(this.floorLayer, parts); // the world's floor, as a mask for the grid first
    const grid = this.gridLayer;
    place(grid);
    const b = {
      minX: Math.max(this.bounds.minX, view.minX),
      maxX: Math.min(this.bounds.maxX, view.maxX),
      minZ: Math.max(this.bounds.minZ, view.minZ),
      maxZ: Math.min(this.bounds.maxZ, view.maxZ),
    };
    grid.beginPath();
    for (let x = Math.ceil(b.minX / GRID_SPACING) * GRID_SPACING; x <= b.maxX; x += GRID_SPACING) {
      grid.moveTo(x, b.minZ);
      grid.lineTo(x, b.maxZ);
    }
    for (let z = Math.ceil(b.minZ / GRID_SPACING) * GRID_SPACING; z <= b.maxZ; z += GRID_SPACING) {
      grid.moveTo(b.minX, z);
      grid.lineTo(b.maxX, z);
    }
    grid.strokeStyle = GRID;
    grid.lineWidth = px(1);
    grid.stroke();
    grid.setTransform(1, 0, 0, 1, 0, 0);
    grid.globalCompositeOperation = 'destination-in';
    grid.drawImage(this.floorLayer.canvas, 0, 0);
    tint(this.floorLayer, FLOOR);

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    for (const l of [this.houseLayer, this.landmarkLayer, this.woodLayer, grid, this.floorLayer])
      if (l !== this.houseLayer || housed) ctx.drawImage(l.canvas, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
  }

  // Sets `c` to draw in world metres as `t` views them.
  private toWorld(c: CanvasRenderingContext2D, t: Transform): void {
    const k = RES / t.scale; // canvas pixels per metre
    c.setTransform(
      k * t.rx,
      -k * t.fx,
      k * t.rz,
      -k * t.fz,
      (this.width * RES) / 2 - k * (t.rx * t.ox + t.rz * t.oz),
      (this.height * RES) / 2 + k * (t.fx * t.ox + t.fz * t.oz),
    );
  }

  // The box in world metres round all of the canvas as `t` draws it, a little past its edge so the
  // world's outline drawn just outside a part still shows at the canvas's side.
  private view(t: Transform): Bounds {
    const margin = 2 * EDGE * t.scale;
    const corners = [
      [0, 0],
      [this.width, 0],
      [0, this.height],
      [this.width, this.height],
    ].map(([x, y]) => {
      const right = (x - this.width / 2) * t.scale;
      const up = (this.height / 2 - y) * t.scale;
      return { x: t.ox + right * t.rx + up * t.fx, z: t.oz + right * t.rz + up * t.fz };
    });
    return {
      minX: Math.min(...corners.map((c) => c.x)) - margin,
      maxX: Math.max(...corners.map((c) => c.x)) + margin,
      minZ: Math.min(...corners.map((c) => c.z)) - margin,
      maxZ: Math.max(...corners.map((c) => c.z)) + margin,
    };
  }

  private toPixel(t: Transform, x: number, z: number): [number, number] {
    const dx = x - t.ox;
    const dz = z - t.oz;
    const lx = dx * t.rx + dz * t.rz;
    const ly = dx * t.fx + dz * t.fz;
    return [this.width / 2 + lx / t.scale, this.height / 2 - ly / t.scale];
  }

  // A square `size` CSS pixels across at (x, z), in the current fill.
  private square(t: Transform, x: number, z: number, size: number): void {
    const [px, py] = this.toPixel(t, x, z);
    this.ctx.fillRect(px - size / 2, py - size / 2, size, size);
  }

  // A bot at (x, z): a square in the current fill, edged light so it reads against the floor.
  private bot(t: Transform, x: number, z: number): void {
    const [px, py] = this.toPixel(t, x, z);
    const ctx = this.ctx;
    ctx.fillRect(px - BOT / 2, py - BOT / 2, BOT, BOT);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.lineWidth = 1;
    ctx.strokeRect(px - BOT / 2 - 0.5, py - BOT / 2 - 0.5, BOT + 1, BOT + 1);
  }

  // Your arrow at (x, z), turned `angle` clockwise from up and `scale` times your size, in the
  // current fill.
  private arrow(t: Transform, x: number, z: number, angle: number, scale: number): void {
    const [px, py] = this.toPixel(t, x, z);
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(angle);
    ctx.scale(scale, scale);
    ctx.beginPath();
    ctx.moveTo(0, -7);
    ctx.lineTo(6, 5);
    ctx.lineTo(0, 2.5);
    ctx.lineTo(-6, 5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}

// Your x, y, z for a map's corner: the sim's coordinates, with y the height of your feet rather than
// your eyes.
export function coordsOf(me: MinimapFrame['me']): string {
  const n = (v: number) => Math.round(v) || 0; // `|| 0` so a hair below zero reads 0, not -0
  return `${n(me.x)}, ${n(me.y - EYE_HEIGHT)}, ${n(me.z)}`;
}

function layer(): CanvasRenderingContext2D {
  return document.createElement('canvas').getContext('2d')!;
}

// A landmark filled in grey: any but those drawn as themselves.
type Footprint = Exclude<Landmark, PineappleMark | KrustyKrabMark | RoadMark>;

// A boost pad's rectangle, from its one end to its other.
function padPath(s: Pad): Path2D {
  const length = Math.hypot(s.bx - s.ax, s.bz - s.az);
  const [px, pz] = [(-(s.bz - s.az) / length) * s.halfWidth, ((s.bx - s.ax) / length) * s.halfWidth];
  const path = new Path2D();
  path.moveTo(s.ax + px, s.az + pz);
  path.lineTo(s.bx + px, s.bz + pz);
  path.lineTo(s.bx - px, s.bz - pz);
  path.lineTo(s.ax - px, s.az - pz);
  path.closePath();
  return path;
}

// A road's climb as arrowheads across it, `spacing` metres apart at the least, each pointing up it.
function climbPath(s: Slope, spacing: number): Path2D {
  const path = new Path2D();
  const length = Math.hypot(s.bx - s.ax, s.bz - s.az);
  const [ux, uz] = [(s.bx - s.ax) / length, (s.bz - s.az) / length];
  const count = Math.max(1, Math.floor(length / spacing));
  const across = s.halfWidth * CLIMB_SPAN;
  const deep = Math.min(across, length / count / 2);
  for (let i = 0; i < count; i++) {
    const at = ((i + 0.5) * length) / count;
    const [x, z] = [s.ax + ux * at, s.az + uz * at];
    path.moveTo(x - ux * (deep / 2) - uz * across, z - uz * (deep / 2) + ux * across);
    path.lineTo(x + ux * (deep / 2), z + uz * (deep / 2));
    path.lineTo(x - ux * (deep / 2) + uz * across, z - uz * (deep / 2) - ux * across);
  }
  return path;
}

// SpongeBob's house from above, in world metres: its dune's sand, the fruit hatched in diamonds as
// its skin is, and its crown of leaves in the middle, a ring of long dark ones under a ring of short
// light ones between them. `px` is CSS pixels in metres.
function drawPineapple(c: CanvasRenderingContext2D, m: PineappleMark, px: (n: number) => number): void {
  const disc = (r: number) => {
    c.beginPath();
    c.arc(m.x, m.z, r, 0, 2 * Math.PI);
  };
  c.fillStyle = SAND;
  disc(m.sand);
  c.fill();
  c.fillStyle = PINEAPPLE;
  disc(m.r);
  c.fill();
  c.save();
  c.clip();
  c.strokeStyle = HATCH;
  c.lineWidth = px(1.2);
  c.beginPath();
  const step = m.r / 3.5;
  for (let d = -2 * m.r; d <= 2 * m.r; d += step) {
    c.moveTo(m.x + d - m.r, m.z - m.r);
    c.lineTo(m.x + d + m.r, m.z + m.r);
    c.moveTo(m.x + d - m.r, m.z + m.r);
    c.lineTo(m.x + d + m.r, m.z - m.r);
  }
  c.stroke();
  c.restore();
  c.strokeStyle = HATCH;
  c.lineWidth = px(1.2);
  disc(m.r);
  c.stroke();
  c.strokeStyle = LEAF_EDGE;
  c.lineWidth = px(0.8);
  LEAVES.forEach((fill, ring) => {
    const length = m.r * (ring === 0 ? 0.62 : 0.4);
    const width = length * 0.3;
    c.fillStyle = fill;
    for (let i = 0; i < 8; i++) {
      const a = ((i + ring / 2) / 8) * 2 * Math.PI;
      const [ux, uz] = [Math.cos(a), Math.sin(a)];
      const tip = { x: m.x + ux * length, z: m.z + uz * length };
      const mid = { x: m.x + (ux * length) / 2, z: m.z + (uz * length) / 2 };
      c.beginPath();
      c.moveTo(m.x, m.z);
      c.quadraticCurveTo(mid.x - uz * width, mid.z + ux * width, tip.x, tip.z);
      c.quadraticCurveTo(mid.x + uz * width, mid.z - ux * width, m.x, m.z);
      c.fill();
      c.stroke();
    }
  });
}

// The Krusty Krab from above, in world metres: its plinth, open at the door, the barrel of its roof
// with the seams between its staves running its length, and the arches across its two ends. `px`
// is CSS pixels in metres.
function drawKrustyKrab(c: CanvasRenderingContext2D, m: KrustyKrabMark, px: (n: number) => number): void {
  const arch = m.w * 0.08; // how much of the length each arch takes
  const roof = { w: m.w - 2 * arch - m.w * 0.05, d: m.d * 0.8 };
  c.save();
  c.translate(m.x, m.z);
  c.rotate(-m.yaw); // the building's own frame: its length across, its door toward +z
  c.fillStyle = PLINTH;
  c.fillRect(-m.w / 2, -m.d / 2, m.w, m.d);
  c.clearRect(-m.w * 0.085, m.d * 0.4, m.w * 0.17, m.d * 0.11); // the doorway
  c.fillStyle = ROOF;
  c.fillRect(-roof.w / 2, -roof.d / 2, roof.w, roof.d);
  c.strokeStyle = SEAM;
  c.lineWidth = px(0.8);
  c.beginPath();
  for (let i = 1; i < 6; i++) {
    const z = -roof.d / 2 + (roof.d * i) / 6;
    c.moveTo(-roof.w / 2, z);
    c.lineTo(roof.w / 2, z);
  }
  c.stroke();
  c.fillStyle = ARCH;
  for (const side of [-1, 1]) c.fillRect(side * (roof.w / 2 + arch / 2) - arch / 2, -m.d * 0.46, arch, m.d * 0.92);
  c.strokeRect(-m.w / 2, -m.d / 2, m.w, m.d);
  c.restore();
}

// The box round a landmark in world metres, as the map draws it.
function landmarkBox(l: Landmark): Bounds {
  const round = (x: number, z: number, r: number): Bounds => ({ minX: x - r, maxX: x + r, minZ: z - r, maxZ: z + r });
  if (l.kind === 'disc') return round(l.x, l.z, l.r);
  if (l.kind === 'pineapple') return round(l.x, l.z, l.sand);
  if (l.kind === 'krusty-krab') return round(l.x, l.z, Math.hypot(l.w, l.d) / 2);
  return {
    minX: Math.min(l.ax, l.bx) - l.halfWidth,
    maxX: Math.max(l.ax, l.bx) + l.halfWidth,
    minZ: Math.min(l.az, l.bz) - l.halfWidth,
    maxZ: Math.max(l.az, l.bz) + l.halfWidth,
  };
}

function overlaps(a: Bounds, b: Bounds): boolean {
  return a.maxX >= b.minX && a.minX <= b.maxX && a.maxZ >= b.minZ && a.minZ <= b.maxZ;
}

// A part of the outline, or a landmark, as one closed path in world metres (a landmark open in the
// middle as a second circle, which an even-odd fill leaves out). Bridges have round ends unless
// they're square.
function partPath(p: WorldPart | Footprint): Path2D {
  const path = new Path2D();
  if (p.kind === 'disc') {
    path.arc(p.x, p.z, p.r, 0, 2 * Math.PI);
    if ('inner' in p && p.inner) {
      path.moveTo(p.x + p.inner, p.z);
      path.arc(p.x, p.z, p.inner, 0, 2 * Math.PI);
    }
    return path;
  }
  if (p.kind === 'sector') {
    path.moveTo(p.x, p.z);
    path.arc(p.x, p.z, p.r, p.from, p.to);
    path.closePath();
    return path;
  }
  if (p.kind === 'bend') {
    path.arc(p.x, p.z, p.r + p.halfWidth, p.from, p.to);
    path.arc(p.x, p.z, p.r - p.halfWidth, p.to, p.from, true);
    path.closePath();
    return path;
  }
  const w = p.halfWidth;
  const side = Math.atan2(p.bz - p.az, p.bx - p.ax) + Math.PI / 2; // the bearing of one side from the middle line
  if ('square' in p && p.square) {
    const [sx, sz] = [w * Math.cos(side), w * Math.sin(side)];
    path.moveTo(p.ax + sx, p.az + sz);
    path.lineTo(p.bx + sx, p.bz + sz);
    path.lineTo(p.bx - sx, p.bz - sz);
    path.lineTo(p.ax - sx, p.az - sz);
    path.closePath();
    return path;
  }
  path.arc(p.bx, p.bz, w, side, side - Math.PI, true);
  path.arc(p.ax, p.az, w, side - Math.PI, side, true);
  path.closePath();
  return path;
}
