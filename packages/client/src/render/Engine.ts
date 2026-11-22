// Babylon engine, scene, lights and post-processing. The retro look comes from rendering at a
// reduced internal resolution and letting the browser upscale with nearest-neighbour filtering;
// how reduced, and how many frames a second, are the picture's settings (Picture.ts).
import {
  Color3,
  Color4,
  DefaultRenderingPipeline,
  DirectionalLight,
  Engine as BabylonEngine,
  GlowLayer,
  HemisphericLight,
  Scene,
  StandardMaterial,
  Vector3,
  type AbstractMesh,
  type Mesh,
} from '@babylonjs/core';
import { SIGHT } from '@world/shared';
import { Picture } from './Picture';

// A frame due this close to the display's next tick is drawn on it rather than the one after: the
// loop runs a little after each tick, and a frame due a hair before the next would otherwise wait a
// whole one.
const TICK_SLACK_MS = 3;
const MIN_TICK_MS = 4; // the loop never runs closer than this: a 240 Hz display's tick
const MAX_TICK_MS = 100; // a gap longer than this is a hitch or a sleeping tab, not the display's tick
const TICK_SAMPLES = 61; // gaps the tick is the median of: a second at 60 Hz

export const FOG_COLOR = new Color3(0.02, 0.02, 0.05);
// EXP2, nine tenths thick at SIGHT: exp(-(density × SIGHT)²) is a tenth.
export const BASE_FOG_DENSITY = Math.sqrt(Math.LN10) / SIGHT;

export class Engine {
  readonly engine: BabylonEngine;
  readonly scene: Scene;
  readonly picture: Picture;
  private readonly glowing = new Set<number>(); // the meshes that glow (`glow`), by uniqueId
  private readonly halo: GlowLayer;
  private drawnAt = performance.now(); // when the last frame was drawn
  private due = performance.now(); // when the next frame is due: the frame rate's interval on from the last
  private ran = performance.now(); // when the loop last ran, on a tick of the display
  private tick = Infinity; // ms between the display's ticks: the median of the last gaps between the loop's runs
  private gaps: number[] = [];

  // `main` is the game's own engine: its picture keeps the device's record of the sizes it has died
  // at, and its lost context is one of those deaths. A preview's (BodyView) is neither, or opening
  // the menu while the game tries a finer size would read the game's trial as a death.
  constructor(canvas: HTMLCanvasElement, main = false) {
    this.picture = new Picture(window.matchMedia('(pointer: coarse)').matches, performance.now(), main);
    this.engine = new BabylonEngine(canvas, false, { preserveDrawingBuffer: false, stencil: true });
    this.engine.setHardwareScalingLevel(this.picture.level);
    this.scene = new Scene(this.engine);
    this.scene.clearColor = new Color4(FOG_COLOR.r, FOG_COLOR.g, FOG_COLOR.b, 1);
    this.scene.fogMode = Scene.FOGMODE_EXP2;
    this.scene.fogDensity = BASE_FOG_DENSITY;
    this.scene.fogColor = FOG_COLOR;

    const key = new DirectionalLight('key', new Vector3(-0.4, -1, 0.6), this.scene);
    key.intensity = 0.9;
    key.diffuse = new Color3(0.8, 0.85, 1);
    const fill = new HemisphericLight('fill', new Vector3(0, 1, 0), this.scene);
    fill.intensity = 0.35;
    fill.diffuse = new Color3(0.5, 0.6, 0.9);
    fill.groundColor = new Color3(0.05, 0.2, 0.1);

    // The glow is a blurred picture of the scene drawn over it. Every opaque mesh is drawn into that
    // picture with depth, black unless it glows, so whatever stands in front of a glowing mesh covers
    // its glow as it covers the mesh: drawing the glowing meshes alone would shine through walls.
    // A glow is the light of the thing itself, so the fog takes as much of it as it takes of the
    // thing: far off, where the thing is all fog, it has no halo.
    this.halo = new GlowLayer('glow', this.scene, { mainTextureRatio: 0.25, blurKernelSize: 24 });
    this.halo.intensity = 0.8;
    this.halo.customEmissiveColorSelector = (mesh, _subMesh, material, result) => {
      if (this.glowing.has(mesh.uniqueId) && material instanceof StandardMaterial) {
        const level = (material.emissiveTexture?.level ?? 1) * this.clearTo(mesh);
        const { r, g, b } = material.emissiveColor;
        result.set(r * level, g * level, b * level, material.alpha);
      } else result.set(0, 0, 0, 1);
    };

    const pipeline = new DefaultRenderingPipeline('post', false, this.scene);
    // Anti-alias the low-res frame itself: pixels stay blocky after upscaling but stop shimmering.
    pipeline.samples = 4;
    pipeline.fxaaEnabled = true;
    pipeline.bloomEnabled = true;
    pipeline.bloomThreshold = 0.55;
    pipeline.bloomWeight = 0.35;
    pipeline.bloomKernel = 32;
    pipeline.bloomScale = 0.5;
    pipeline.imageProcessingEnabled = true;
    pipeline.imageProcessing.toneMappingEnabled = true;
    pipeline.imageProcessing.contrast = 1.15;
    pipeline.imageProcessing.vignetteEnabled = true;
    pipeline.imageProcessing.vignetteWeight = 1.2;
    pipeline.imageProcessing.vignetteColor = new Color4(0, 0, 0.02, 0);

    window.addEventListener('resize', () => this.engine.resize());
    // The GPU dropping the context leaves nothing to draw with: the size drawn is pinned off for
    // this device (Picture.lost) and the page starts over.
    if (main)
      this.engine.onContextLostObservable.add(() => {
        this.picture.lost();
        location.reload();
      });
  }

  // Gives a mesh a soft halo of its own light (its material's emissive colour and texture), hidden
  // by anything in front of it and thinned by the fog as the mesh is.
  glow(mesh: AbstractMesh): void {
    this.glowing.add(mesh.uniqueId);
    mesh.onDisposeObservable.add(() => this.glowing.delete(mesh.uniqueId));
  }

  // Leaves a mesh out of the glow's picture, sparing it a second drawing every frame: one too far
  // off, where it's seen at all, for a glow behind it to be there to cover.
  keepFromGlow(mesh: Mesh): void {
    this.halo.addExcludedMesh(mesh);
    mesh.onDisposeObservable.add(() => this.halo.removeExcludedMesh(mesh));
  }

  // How much of a mesh the fog leaves to be seen from the camera, 0 to 1 (the scene's fog, EXP2).
  private clearTo(mesh: AbstractMesh): number {
    const camera = this.scene.activeCamera;
    if (!camera) return 1;
    const middle = mesh.getBoundingInfo().boundingSphere.centerWorld;
    const thick = Vector3.Distance(camera.globalPosition, middle) * this.scene.fogDensity;
    return Math.exp(-thick * thick);
  }

  // Every tick of the display, a frame when one is due: each is due the frame rate's interval on
  // from the one before, so a rate the display's doesn't divide (45 on 60 Hz) comes out right over
  // time, drawn on alternating ticks, and a rate past the display's is the display's. The game steps
  // by the time since the last frame drawn, the picture's auto pixel size judges the pace, and the
  // frame is drawn at whatever size that has settled on. A frame is late when it's drawn more than
  // a tick and a half after it could first have been (when it came due, or the last frame, if it
  // was due already): on time, the first run after that is within a tick of it. Judged from when
  // the loop actually let it through, since the loop's runs jitter round the display's tick, and a
  // frame coming due a hair before one (45 on a 120 Hz display does, every few frames) is let
  // through on that tick or the next as the jitter falls, both of them on time.
  run(update: (dt: number) => void): void {
    this.engine.runRenderLoop(() => {
      const now = performance.now();
      const gap = now - this.ran;
      this.ran = now;
      if (gap >= MIN_TICK_MS && gap < MAX_TICK_MS) this.measureTick(gap);
      if (now < this.due - TICK_SLACK_MS) return;
      const interval = now - this.drawnAt;
      const late = now - Math.max(this.due - TICK_SLACK_MS, this.drawnAt) > 1.5 * this.tick;
      this.drawnAt = now;
      // Behind (a slow frame), the next is due sooner to catch up, but never already: a tab back
      // from sleep draws on the next tick and goes on from there.
      this.due = Math.max(this.due + 1000 / this.picture.frameRate, now);
      this.picture.frame(now, interval, late);
      if (this.engine.getHardwareScalingLevel() !== this.picture.level)
        this.engine.setHardwareScalingLevel(this.picture.level);
      update(interval / 1000);
      this.scene.render();
    });
  }

  // The median, since the loop's runs jitter by a millisecond or two round the tick and now and then
  // come in a pair close together: a tick taken too short turns every frame on time into a late one.
  private measureTick(gap: number): void {
    this.gaps.push(gap);
    if (this.gaps.length > TICK_SAMPLES) this.gaps.shift();
    const sorted = [...this.gaps].sort((a, b) => a - b);
    this.tick = sorted[sorted.length >> 1];
  }

  dispose(): void {
    this.engine.stopRenderLoop();
    this.scene.dispose();
    this.engine.dispose();
  }
}
