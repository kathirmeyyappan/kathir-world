// Where a ground pound lands (sim/avatars.ts `Pound`): a thin pale ring running out over the floor
// to the edge of what it hurts, fading as it goes, gone in a third of a second. One flat mesh a
// pound, a hair over the surface, sharing one unlit material.
import { MeshBuilder, StandardMaterial, Color3, type Scene, type Vector3 } from '@babylonjs/core';
import type { Engine } from './Engine';
import { perScene } from './perScene';

const SECONDS = 0.32;
const BAND = 0.07; // metres across the ring's line, at its full size
const LIFT = 0.04; // metres over the surface it runs across
const ALPHA = 0.5; // how solid it starts

const material = perScene((scene: Scene) => {
  const m = new StandardMaterial('pound-ring', scene);
  m.disableLighting = true;
  m.emissiveColor = new Color3(0.92, 0.92, 0.95);
  m.backFaceCulling = false;
  m.fogEnabled = false;
  return m;
});

// A ring from `at`, a point on the ground, out to `reach` metres.
export function poundRing(engine: Engine, at: Vector3, reach: number): void {
  const scene = engine.scene;
  // A torus of radius 1, its tube flattened to a band: scaled out to the reach, the band with it.
  const ring = MeshBuilder.CreateTorus('pound-ring', { diameter: 2, thickness: BAND / reach, tessellation: 40 }, scene);
  ring.material = material(scene);
  ring.isPickable = false;
  ring.position.set(at.x, at.y + LIFT, at.z);
  engine.glowLayer.addExcludedMesh(ring);
  const born = performance.now();
  const grow = () => {
    const through = Math.min(1, (performance.now() - born) / 1000 / SECONDS);
    const out = reach * (1 - (1 - through) ** 3); // fast off the landing, easing into its edge
    ring.scaling.set(out, 0.02, out);
    ring.visibility = ALPHA * (1 - through);
    if (through < 1) return;
    scene.onBeforeRenderObservable.removeCallback(grow);
    engine.glowLayer.removeExcludedMesh(ring);
    ring.dispose();
  };
  grow();
  scene.onBeforeRenderObservable.add(grow);
}
