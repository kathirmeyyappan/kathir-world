// The world's heights as a picture, a pixel a metre: how high the top of whatever stands at each
// spot is over the floor (a keep's roof, a road's bank, the terrace), coloured from blue low to
// pale yellow high, and clear where there's only floor or nothing at all. A map lays it over
// its floor (MapCanvas), working out a few more rows each time it's drawn, so no frame waits on
// it and it fills in from the south as it goes; `legend` is the scale that goes beside it.
import { WORLD_GROUND, WORLD_STRUCTURES } from '@world/shared';

const CELL = 1; // metres a pixel
const LEAST = 0.05; // metres up that still read as floor: a flagstone lying on the sand
// Low to high, each lighter than the last, so the order reads without telling the hues apart.
const RAMP = [
  [58, 102, 196],
  [42, 159, 184],
  [111, 211, 154],
  [223, 232, 106],
  [255, 246, 194],
];
// Metres past the floor's edge still looked at, for what overhangs it. Further out the only spots
// looked at are those some piece stands over: a road's deck, which has no floor under it.
const OVERHANG = 3;

// The colour of a share of the way up the scale, 0 at the floor to 1 at the highest there is.
function shade(share: number): [number, number, number] {
  const at = Math.max(0, Math.min(1, share)) * (RAMP.length - 1);
  const i = Math.min(RAMP.length - 2, Math.floor(at));
  const mix = (k: number) => Math.round(RAMP[i][k] + (RAMP[i + 1][k] - RAMP[i][k]) * (at - i));
  return [mix(0), mix(1), mix(2)];
}

export class Elevation {
  readonly canvas = document.createElement('canvas');
  // Where the picture lies in the world: its corner of least x and z, and its size in metres.
  readonly x = Math.floor(WORLD_GROUND.bounds.minX);
  readonly z = Math.floor(WORLD_GROUND.bounds.minZ);
  readonly top = WORLD_STRUCTURES.top; // metres: the highest there is, the scale's far end
  private readonly ctx = this.canvas.getContext('2d')!;
  private readonly heights: Float32Array; // metres over the floor at each pixel's middle, a row along x at a time
  private readonly aloft: Uint8Array; // 1 at each pixel some piece that may stand past the floor's edge reaches
  private row = 0; // the next row to work out

  constructor() {
    const { width, height } = Object.assign(this.canvas, {
      width: Math.ceil((WORLD_GROUND.bounds.maxX - this.x) / CELL),
      height: Math.ceil((WORLD_GROUND.bounds.maxZ - this.z) / CELL),
    });
    this.heights = new Float32Array(width * height);
    this.aloft = new Uint8Array(width * height);
    // Every pixel within the reach of a piece that might stand past the floor's edge: more than
    // each covers, which costs only a look that finds nothing there.
    for (const piece of WORLD_STRUCTURES.list) {
      const r = Math.hypot(piece.w, piece.d) / 2;
      if (WORLD_GROUND.edge(piece.x, piece.z) + r <= OVERHANG) continue;
      const [i0, i1] = [piece.x - r, piece.x + r].map((x) => Math.floor((x - this.x) / CELL));
      const [k0, k1] = [piece.z - r, piece.z + r].map((z) => Math.floor((z - this.z) / CELL));
      for (let k = Math.max(0, k0); k <= Math.min(height - 1, k1); k++)
        for (let i = Math.max(0, i0); i <= Math.min(width - 1, i1); i++) this.aloft[k * width + i] = 1;
    }
  }

  // The scale the picture is coloured by, the floor to the highest there is: an `.elevation-scale`
  // for the page to place and style, its `.bar` painted here.
  legend(): HTMLElement {
    const scale = document.createElement('div');
    scale.className = 'elevation-scale';
    const bar = document.createElement('span');
    bar.className = 'bar';
    bar.style.background = `linear-gradient(to right, ${RAMP.map(([r, g, b]) => `rgb(${r}, ${g}, ${b})`).join(', ')})`;
    const end = (text: string) => Object.assign(document.createElement('span'), { textContent: text });
    scale.append(end('floor'), bar, end(`${Math.round(this.top)} m`));
    return scale;
  }

  // Works out more of the picture, for up to `budget` milliseconds.
  advance(budget: number): void {
    const until = performance.now() + budget;
    const { width, height } = this.canvas;
    while (this.row < height && performance.now() < until) {
      const line = this.ctx.createImageData(width, 1);
      const z = this.z + (this.row + 0.5) * CELL;
      for (let i = 0; i < width; i++) {
        const x = this.x + (i + 0.5) * CELL;
        if (WORLD_GROUND.edge(x, z) > OVERHANG && !this.aloft[this.row * width + i]) continue;
        const h = WORLD_STRUCTURES.groundAt(x, z, Infinity);
        this.heights[this.row * width + i] = Math.max(0, h);
        if (h < LEAST) continue;
        // Even steps of colour are even steps of the height's root, so the few metres of a
        // road's bank read as clearly as the storeys of the tower.
        line.data.set([...shade(Math.sqrt(h / this.top)), 255], i * 4);
      }
      this.ctx.putImageData(line, 0, this.row);
      this.row++;
    }
  }

  // Metres over the floor at (x, z), as far as the picture has got; 0 on the floor and off it.
  at(x: number, z: number): number {
    const i = Math.floor((x - this.x) / CELL);
    const j = Math.floor((z - this.z) / CELL);
    const inside = i >= 0 && j >= 0 && i < this.canvas.width && j < this.canvas.height;
    return inside ? this.heights[j * this.canvas.width + i] : 0;
  }
}
