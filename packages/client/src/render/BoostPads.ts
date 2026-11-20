// The roads' boost pads as they're drawn (sim/roads.ts `Pad`; to the sim each is a thin hidden
// piece whose surface boosts a kart): a panel let into a frame that stands proud of the road round
// it. The panel is lanes of arrowheads, each row of them a colour of the rainbow, pointing the way
// the pad does and running that way, and it glows (Engine.glow): a halo of its own colours, which
// swells and falls. Drawn only: the frame's rim is nothing to the sim, and a tire sinks into it
// unseen, as into the floor's kerb.
// Each pad is two small meshes, streamed in by the loader like whatever else stands somewhere, and
// every pad shares the scene's two materials and its one painted texture.
import { Color3, DynamicTexture, Mesh, StandardMaterial, Texture, type Scene, type VertexData } from '@babylonjs/core';
import type { Pad } from '@world/shared';
import type { Engine } from './Engine';
import type { Loader } from './Loader';
import { perScene } from './perScene';
import { Quads, flipped, type Vec } from './Quads';

// A pad's colours, in the order they run along it.
export const BOOST_RAINBOW = ['#ff5468', '#ffa23e', '#ffe85a', '#63dd73', '#3fd6c8', '#55b8ff', '#b784ff', '#ff7fd0'];

const TEXELS = 32; // across a lane, and along one run of the rainbow
const LANE = 8; // metres across a lane of arrowheads, as near as divides the panel into whole lanes
const RUN = 8; // metres along the panel from one run of the rainbow to the next
const SCROLL = 9; // m/s the arrowheads run along the panel
// The halo: how bright it is at rest (of the panel's own colours), how much brighter at the top of
// its swell, and how many swells a second.
const HALO = { level: 0.22, swell: 0.16, rate: 1.1 };
// The frame: metres across each side of it, how far its top stands over the panel, and how far
// down it goes, into the road, so nothing shows under it on a slope.
const FRAME = { across: 0.6, proud: 0.07, down: 0.3 };
// The frame's colours: its top, its sides lengthwise and its ends, darker each, as structures are
// shaded by the way a face points (Structures.ts).
const STEEL = { top: '#3a3e55', side: '#2a2d40', end: '#1f2132' };

// What every pad in a scene is drawn with: the panel's material, whose pattern runs and whose halo
// swells with the clock, and the frame's.
const looksIn = perScene((scene) => {
  const lanes = () => {
    // Nearest when magnified keeps the pixels crisp up close, as a structure's look is.
    const tex = new DynamicTexture('boost-pad', TEXELS, scene, true, Texture.NEAREST_LINEAR_MIPLINEAR);
    tex.anisotropicFilteringLevel = 8;
    paintLane(tex.getContext() as CanvasRenderingContext2D);
    tex.update();
    tex.wrapU = tex.wrapV = Texture.WRAP_ADDRESSMODE;
    return tex;
  };
  // The colour is the texture exactly (the emissive white, which the texture can only add to), and
  // the halo is the same picture as the emissive texture, at a level of its own.
  const [face, halo] = [lanes(), lanes()];
  const panel = new StandardMaterial('boost-pad-panel', scene);
  panel.disableLighting = true;
  panel.specularColor = Color3.Black();
  panel.diffuseTexture = face;
  panel.emissiveTexture = halo;
  panel.emissiveColor = Color3.White();
  scene.onBeforeRenderObservable.add(() => {
    const t = performance.now() / 1000;
    // The picture is looked up further back along the panel as time goes, so it runs forward.
    face.vOffset = halo.vOffset = 1 - (((t * SCROLL) / RUN) % 1);
    halo.level = HALO.level + HALO.swell * (0.5 + 0.5 * Math.sin(2 * Math.PI * HALO.rate * t));
  });
  const frame = new StandardMaterial('boost-pad-frame', scene);
  frame.disableLighting = true;
  frame.specularColor = Color3.Black();
  frame.emissiveColor = Color3.White();
  frame.freeze();
  return { panel, frame };
});

// One lane's arrowheads, a run of the rainbow long: their points down the lane's middle, pointing
// up the picture, their arms swept back to a dark line down each side of the lane.
function paintLane(ctx: CanvasRenderingContext2D): void {
  const deep = TEXELS / BOOST_RAINBOW.length; // texels from one row of arrowheads to the next
  const half = TEXELS / 2;
  for (let y = 0; y < TEXELS; y++) {
    for (let x = 0; x < TEXELS; x++) {
      const out = Math.abs(x - half + 0.5);
      const swept = (y - out * 0.75 + TEXELS) % TEXELS;
      ctx.fillStyle = out > half - 1 ? '#16131f' : BOOST_RAINBOW[Math.floor(swept / deep)];
      ctx.fillRect(x, y, 1, 1);
    }
  }
}

export function buildBoostPads(engine: Engine, pads: readonly Pad[], loader: Loader): void {
  const scene = engine.scene;
  pads.forEach((pad, i) => {
    let meshes: Mesh[] = [];
    loader.add({
      x: (pad.ax + pad.bx) / 2,
      z: (pad.az + pad.bz) / 2,
      r: Math.hypot(pad.bx - pad.ax, pad.bz - pad.az) / 2 + pad.halfWidth,
      load: function* () {
        const looks = looksIn(scene);
        const { panel, frame } = shapes(pad);
        meshes = [
          made(scene, `boost-pad-${i}`, panel, looks.panel),
          made(scene, `boost-pad-${i}-frame`, frame, looks.frame),
        ];
        engine.glow(meshes[0]);
        yield;
      },
      // The meshes alone: what they're drawn with is the scene's, and kept.
      unload: () => {
        for (const mesh of meshes) mesh.dispose();
        meshes = [];
      },
    });
  });
}

function made(scene: Scene, name: string, data: VertexData, material: StandardMaterial): Mesh {
  const mesh = new Mesh(name, scene);
  data.applyToMesh(mesh);
  mesh.material = material;
  mesh.isPickable = false;
  mesh.freezeWorldMatrix();
  return mesh;
}

// A pad's panel and its frame, where they stand in the world.
function shapes(pad: Pad): { panel: VertexData; frame: VertexData } {
  const a: Vec = [pad.ax, pad.ay, pad.az];
  const length = Math.hypot(pad.bx - pad.ax, pad.by - pad.ay, pad.bz - pad.az);
  // The pad's own axes: across it to the right of the way it points, along it, and square up off it.
  const along: Vec = [(pad.bx - pad.ax) / length, (pad.by - pad.ay) / length, (pad.bz - pad.az) / length];
  const flat = Math.hypot(along[0], along[2]);
  const across: Vec = [along[2] / flat, 0, -along[0] / flat];
  const up: Vec = [-(along[0] * along[1]) / flat, flat, -(along[2] * along[1]) / flat];
  const at = (x: number, s: number, n: number): Vec => [
    a[0] + across[0] * x + along[0] * s + up[0] * n,
    a[1] + across[1] * x + along[1] * s + up[1] * n,
    a[2] + across[2] * x + along[2] * s + up[2] * n,
  ];
  const half = pad.halfWidth;

  // The panel: whole lanes across it, however wide it is.
  const lanes = Math.max(1, Math.round((2 * half) / LANE));
  const runs = length / RUN;
  const panel = new Quads();
  panel.add([at(-half, 0, 0), at(half, 0, 0), at(half, length, 0), at(-half, length, 0)], up, {
    uvs: [
      [0, 0],
      [lanes, 0],
      [lanes, runs],
      [0, runs],
    ],
  });

  // The frame: a bar down each side and one across each end, each a block from down in the road
  // up to proud of the panel: its top and its four sides.
  const frame = new Quads();
  const bar = ([x0, x1]: [number, number], [s0, s1]: [number, number]) => {
    const [n0, n1] = [-FRAME.down, FRAME.proud];
    frame.add([at(x0, s0, n1), at(x1, s0, n1), at(x1, s1, n1), at(x0, s1, n1)], up, { colour: STEEL.top });
    frame.add([at(x1, s0, n0), at(x1, s0, n1), at(x1, s1, n1), at(x1, s1, n0)], across, { colour: STEEL.side });
    frame.add([at(x0, s0, n0), at(x0, s0, n1), at(x0, s1, n1), at(x0, s1, n0)], flipped(across), {
      colour: STEEL.side,
    });
    frame.add([at(x0, s1, n0), at(x0, s1, n1), at(x1, s1, n1), at(x1, s1, n0)], along, { colour: STEEL.end });
    frame.add([at(x0, s0, n0), at(x0, s0, n1), at(x1, s0, n1), at(x1, s0, n0)], flipped(along), { colour: STEEL.end });
  };
  const out = half + FRAME.across;
  bar([-out, -half], [-FRAME.across, length + FRAME.across]);
  bar([half, out], [-FRAME.across, length + FRAME.across]);
  bar([-half, half], [-FRAME.across, 0]);
  bar([-half, half], [length, length + FRAME.across]);
  return { panel: panel.data(), frame: frame.data() };
}
