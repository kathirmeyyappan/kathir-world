// Pixel-art textures for structure materials (sim/structures.ts `StructureMaterial`), painted once at
// load onto tiny canvases and drawn nearest-neighbour up close, so every texel reads as a chunky
// pixel. One repeat of a texture covers its `tile` in metres, and the renderer maps faces in metres,
// so a brick is the same size on every wall. Keep texels big (a few per metre): fine detail on a big
// wall aliases into moiré. A new material is a painter here; the Record makes it required.
import { createRng, hashSeed, type Rng, type StructureMaterial } from '@world/shared';

export const TEXELS = 32; // texels per repeat along each side

export interface MaterialSpec {
  paint(px: (x: number, y: number, color: string) => void, rng: Rng): void;
  tile: number; // metres covered by one repeat of the texture
  // How tops take the texture. `world`: in world x/z, so neighbours line up and overlapping tops
  // (wall joints, floor rings) paint the same texels. `turned`: along axes turned with the piece (a
  // stair's planks run along each step). `own`: turned with the piece and measured from its middle,
  // so the pattern sits the same on every piece (a boost pad's lanes, whole across it). Use the
  // last two only where pieces of the look never overlap at one height.
  top: TopMapping;
  scroll?: number; // metres a second the pattern runs along each piece, toward its local +z
}
export type TopMapping = 'world' | 'turned' | 'own';

const pick = (rng: Rng, colors: string[]) => colors[Math.floor(rng() * colors.length)];

// Courses of 1.5 × 0.75 m blocks (8 × 4 texels), each course offset by half a block, with a lit
// top edge and a shaded bottom edge on every block, kept gentle so distant walls don't shimmer.
const brick: MaterialSpec = {
  tile: 6,
  top: 'world',
  paint(px, rng) {
    const shades = ['#77767e', '#6e6d76', '#817f86', '#6a6972', '#7d787a', '#726f79', '#86838a'];
    for (let row = 0; row < TEXELS / 4; row++) {
      const offset = row % 2 ? 4 : 0;
      for (let b = 0; b < TEXELS / 8; b++) {
        const color = pick(rng, shades);
        for (let i = 0; i < 8; i++) {
          const x = (b * 8 + i + offset) % TEXELS;
          for (let j = 0; j < 4; j++) {
            const y = row * 4 + j;
            if (j === 3 || i === 7)
              px(x, y, '#46454d'); // mortar
            else if (j === 0) px(x, y, '#8c8990');
            else if (j === 2 && rng() < 0.5) px(x, y, '#65646c');
            else px(x, y, rng() < 0.08 ? '#8e8b92' : color);
          }
        }
      }
    }
  },
};

// Planks 0.375 m wide (4 texels) with dark seams and a little grain: two to a stair tread.
const wood: MaterialSpec = {
  tile: 3,
  top: 'turned',
  paint(px, rng) {
    const shades = ['#7a5233', '#6f4a2d', '#83593a', '#754f31'];
    for (let plank = 0; plank < TEXELS / 4; plank++) {
      const color = pick(rng, shades);
      for (let j = 0; j < 4; j++) {
        for (let x = 0; x < TEXELS; x++) {
          const y = plank * 4 + j;
          if (j === 3) px(x, y, '#3a2515');
          else px(x, y, rng() < 0.12 ? '#5c3b22' : j === 0 ? '#8c6443' : color);
        }
      }
    }
  },
};

// 0.75 m red tiles (8 texels) with dark grout and a highlight in each tile's corner.
const redTile: MaterialSpec = {
  tile: 3,
  top: 'world',
  paint(px, rng) {
    const shades = ['#8a2e2a', '#973530', '#7d2926', '#a03b33', '#8f312c'];
    for (let ty = 0; ty < TEXELS / 8; ty++) {
      for (let tx = 0; tx < TEXELS / 8; tx++) {
        const color = pick(rng, shades);
        for (let i = 0; i < 8; i++) {
          for (let j = 0; j < 8; j++) {
            const x = tx * 8 + i;
            const y = ty * 8 + j;
            if (i === 7 || j === 7) px(x, y, '#3a1515');
            else if (i === 0 && j === 0) px(x, y, '#c0544a');
            else px(x, y, rng() < 0.06 ? '#732522' : color);
          }
        }
      }
    }
  },
};

// 2 m paving stones (16 texels) in offset rows.
const flagstone: MaterialSpec = {
  tile: 4,
  top: 'world',
  paint(px, rng) {
    const shades = ['#5f636b', '#686c74', '#595d65', '#6c6f76'];
    for (let row = 0; row < TEXELS / 16; row++) {
      const offset = row % 2 ? 8 : 0;
      for (let s = 0; s < TEXELS / 16; s++) {
        const color = pick(rng, shades);
        for (let i = 0; i < 16; i++) {
          for (let j = 0; j < 16; j++) {
            const x = (s * 16 + i + offset) % TEXELS;
            const y = row * 16 + j;
            if (i === 15 || j === 15) px(x, y, '#34363c');
            else px(x, y, rng() < 0.07 ? '#50535a' : color);
          }
        }
      }
    }
  },
};

// Sand: pale grains flecked with darker ones, with faint ripples running one way, 2 m to a repeat.
const sand: MaterialSpec = {
  tile: 2,
  top: 'world',
  paint(px, rng) {
    const shades = ['#e9d8a6', '#e3d09b', '#efdfb0', '#dfcb94', '#e6d4a0'];
    for (let y = 0; y < TEXELS; y++) {
      for (let x = 0; x < TEXELS; x++) {
        const ripple = Math.sin(((x + y * 0.5) / TEXELS) * Math.PI * 4) > 0.8;
        px(x, y, rng() < 0.06 ? '#c9b27a' : ripple ? '#d6c28c' : pick(rng, shades));
      }
    }
  },
};

// Plaster: a smooth limewashed wall with no joints, mottled in soft patches a shade off the base
// and flecked here and there, kept gentle so a tall curve of it doesn't shimmer.
const plaster: MaterialSpec = {
  tile: 3,
  top: 'world',
  paint(px, rng) {
    const base = '#e4e0d7';
    const tones = ['#eae6dd', '#dedad1', '#e7e3da', '#e0dcd3'];
    // Patches that wrap round the tile's edges, so the repeat is seamless.
    const patches = Array.from({ length: 12 }, () => ({
      x: rng() * TEXELS,
      y: rng() * TEXELS,
      r: 3 + rng() * 4,
      color: pick(rng, tones),
    }));
    const wrap = (d: number) => Math.min(Math.abs(d), TEXELS - Math.abs(d));
    for (let y = 0; y < TEXELS; y++) {
      for (let x = 0; x < TEXELS; x++) {
        let color = base;
        for (const q of patches) if (wrap(x - q.x) ** 2 + wrap(y - q.y) ** 2 < q.r * q.r) color = q.color;
        px(x, y, rng() < 0.03 ? '#cfcabf' : color);
      }
    }
  },
};

// Steel: the light blue-grey plate of the hatch's platform and slide (the house model's slide
// texture), in plates a metre square with a darker seam between them and a rivet at each corner,
// kept gentle like the plaster.
const steel: MaterialSpec = {
  tile: 2,
  top: 'world',
  paint(px, rng) {
    const base = '#b8c4ef';
    const tones = ['#bcc8f1', '#b4c0ec', '#c0ccf4', '#b6c2ee'];
    const seam = '#9ca8d8';
    const rivet = '#8f9bcf';
    const plate = TEXELS / 2;
    for (let y = 0; y < TEXELS; y++) {
      for (let x = 0; x < TEXELS; x++) {
        const onSeam = x % plate === 0 || y % plate === 0;
        const atRivet = (x % plate === 2 || x % plate === plate - 2) && (y % plate === 2 || y % plate === plate - 2);
        px(x, y, onSeam ? seam : atRivet ? rivet : rng() < 0.12 ? pick(rng, tones) : base);
      }
    }
  },
};

// A boost pad's colours, in the order they run along it.
export const BOOST_RAINBOW = ['#ff5468', '#ffa23e', '#ffe85a', '#63dd73', '#3fd6c8', '#55b8ff', '#b784ff', '#ff7fd0'];
// A boost pad: lanes of arrowheads 8 m across pointing along the piece (up its ramp), each row of
// them a colour of the rainbow, with a dark line between lanes so the arrows read as arrows from
// either end, all running the way they point.
const boost: MaterialSpec = {
  tile: 8,
  top: 'own',
  scroll: 8,
  paint(px) {
    const deep = TEXELS / BOOST_RAINBOW.length; // texels from one row of arrowheads to the next
    const half = TEXELS / 2;
    for (let y = 0; y < TEXELS; y++) {
      for (let x = 0; x < TEXELS; x++) {
        // A lane runs from one edge of the repeat to the other, its arrowheads' points down its
        // middle and their arms swept back to the lines at its sides.
        const out = Math.abs(x - half + 0.5);
        const swept = (y - out * 0.75 + TEXELS) % TEXELS;
        px(x, y, out > half - 1 ? '#16131f' : BOOST_RAINBOW[Math.floor(swept / deep)]);
      }
    }
  },
};

export const MATERIALS: Record<StructureMaterial, MaterialSpec> = {
  brick,
  wood,
  'red-tile': redTile,
  flagstone,
  sand,
  plaster,
  steel,
  boost,
};

// One material's texture as canvas pixels, deterministic for a given material.
export function paintMaterial(ctx: CanvasRenderingContext2D, material: StructureMaterial): void {
  const rng = createRng(hashSeed(material));
  MATERIALS[material].paint((x, y, color) => {
    ctx.fillStyle = color;
    ctx.fillRect(x, y, 1, 1);
  }, rng);
}
