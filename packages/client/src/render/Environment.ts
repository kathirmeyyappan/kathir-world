// Static scenery: the ground's slab, its floor and the kerb along its edge built a chunk at a time
// (Floor.ts) and streamed in by the loader, the ground past the edge OUTSIDE_HEIGHT below as one
// plane under it all, all three gridded by one shader; a gradient sky with stars; and the boundary,
// a wall round the world's reach that only shows up when you get close, at whatever height you're
// at. Sky billboards live in SkyObject.ts.
import {
  Color3,
  Effect,
  Mesh,
  MeshBuilder,
  ShaderMaterial,
  Vector2,
  Vector3,
  VertexData,
  type Scene,
} from '@babylonjs/core';
import { CHUNK, EYE_HEIGHT, OUTSIDE_HEIGHT, type Ground } from '@world/shared';
import { BASE_FOG_DENSITY, Engine, FOG_COLOR } from './Engine';
import {
  GROUND_FOG,
  GROUND_FRAGMENT,
  GROUND_VERTEX,
  SKY_FRAGMENT,
  SKY_VERTEX,
  WALL_FRAGMENT,
  WALL_VERTEX,
} from './shaders';
import { floorChunk } from './Floor';
import type { Loader } from './Loader';

const WALL_REVEAL_DISTANCE = 16;
const SKY_WALL_TOP = 500; // metres: the sky's edge reaches as high as a dragon is likely to fly
const WALL_STEP = 0.8; // metres between ribbon samples round the boundary

// The ground shader's `side` for the slab's meshes, which carry each vertex's own (Floor.ts).
const SIDE_PER_VERTEX = -1;
const FOG_HALF_LIFE = 0.12; // seconds, for the scope's fog change
const ZENITH_COLOR = new Color3(0.01, 0.01, 0.04);
const HORIZON_COLOR = new Color3(0.12, 0.03, 0.14);
const FADED = Math.log(10); // the floor's fog exponent at 90% fogged: where the horizon sits

const ENVIRONMENTS = new WeakMap<Scene, Environment>();

// The scene's environment, if it has one: the world's has, the menu's preview of the player has not.
export function environmentOf(scene: Scene): Environment | null {
  return ENVIRONMENTS.get(scene) ?? null;
}

export class Environment {
  private readonly materials: ShaderMaterial[] = [];
  private readonly grounds: ShaderMaterial[] = []; // the floor's, the ground's past the edge, the kerb's and any ripple's
  private sky!: ShaderMaterial; // set in createSky
  private fogScale = 1;
  private fogTarget = 1;
  private readonly bounds;
  private readonly span: number;
  private time = 0;

  constructor(
    private readonly engine: Engine,
    private readonly ground: Ground,
    loader: Loader,
  ) {
    ENVIRONMENTS.set(engine.scene, this);
    this.bounds = ground.bounds;
    this.span = Math.max(this.bounds.maxX - this.bounds.minX, this.bounds.maxZ - this.bounds.minZ);
    Effect.ShadersStore['worldGroundVertexShader'] = GROUND_VERTEX;
    Effect.ShadersStore['worldGroundFragmentShader'] = GROUND_FRAGMENT;
    Effect.ShadersStore['worldSkyVertexShader'] = SKY_VERTEX;
    Effect.ShadersStore['worldSkyFragmentShader'] = SKY_FRAGMENT;
    Effect.ShadersStore['worldWallVertexShader'] = WALL_VERTEX;
    Effect.ShadersStore['worldWallFragmentShader'] = WALL_FRAGMENT;
    this.createGround(loader);
    this.createSky();
    this.createWalls();
  }

  // The ground past the edge as one plane under everything, hidden by the slab wherever the floor
  // is, and the slab itself a chunk at a time: each chunk's floor and kerb, built when the loader
  // gets to it.
  private createGround(loader: Loader): void {
    const scene = this.engine.scene;
    // In tiles: one triangle across the whole world interpolates depth coarsely far off.
    const size = this.span * 6;
    const outside = MeshBuilder.CreateGround('outside-ground', { width: size, height: size, subdivisions: 16 }, scene);
    outside.position.set(
      (this.bounds.minX + this.bounds.maxX) / 2,
      OUTSIDE_HEIGHT,
      (this.bounds.minZ + this.bounds.maxZ) / 2,
    );
    outside.isPickable = false;
    outside.material = this.groundMaterial('outside-ground', 1);
    const slabMat = this.groundMaterial('slab', SIDE_PER_VERTEX);
    const b = this.bounds;
    for (let cx = Math.floor(b.minX / CHUNK); cx <= Math.floor(b.maxX / CHUNK); cx++)
      for (let cz = Math.floor(b.minZ / CHUNK); cz <= Math.floor(b.maxZ / CHUNK); cz++) {
        const box = { minX: cx * CHUNK, maxX: (cx + 1) * CHUNK, minZ: cz * CHUNK, maxZ: (cz + 1) * CHUNK };
        if (this.ground.partsIn(box).length === 0) continue;
        const ground = this.ground;
        let mesh: Mesh | null = null;
        loader.add({
          x: (cx + 0.5) * CHUNK,
          z: (cz + 0.5) * CHUNK,
          r: (CHUNK * Math.SQRT2) / 2,
          load: function* () {
            const data = yield* floorChunk(ground, cx, cz);
            if (!data) return;
            mesh = new Mesh(`slab-${cx},${cz}`, scene);
            data.applyToMesh(mesh);
            mesh.isPickable = false;
            mesh.material = slabMat;
            mesh.freezeWorldMatrix();
          },
          unload: () => {
            mesh?.dispose();
            mesh = null;
          },
        });
      }
  }

  private groundMaterial(name: string, side: number): ShaderMaterial {
    const mat = new ShaderMaterial(`${name}Mat`, this.engine.scene, 'worldGround', {
      attributes: ['position', 'normal', 'uv'],
      uniforms: [
        'world',
        'worldViewProjection',
        'cameraPos',
        'sideOf',
        'lineColor',
        'majorColor',
        'floorColor',
        'fogColor',
        'fogScale',
        'time',
        'zenithColor',
        'horizonColor',
        'horizon',
        'relief',
        'reliefBase',
        'reliefHeight',
        'reliefGlow',
        'reliefCentre',
        'reliefRadius',
        'reliefStrength',
      ],
    });
    mat.setFloat('sideOf', side);
    mat.setFloat('relief', 0);
    mat.setColor3('lineColor', new Color3(0.2, 0.9, 0.5));
    mat.setColor3('majorColor', new Color3(0.45, 1.0, 0.7));
    mat.setColor3('floorColor', new Color3(0.03, 0.06, 0.05));
    mat.setColor3('fogColor', FOG_COLOR);
    mat.setFloat('fogScale', 1);
    mat.setColor3('zenithColor', ZENITH_COLOR);
    mat.setColor3('horizonColor', HORIZON_COLOR);
    mat.setFloat('horizon', 0);
    mat.backFaceCulling = false;
    this.grounds.push(mat);
    this.materials.push(mat);
    return mat;
  }

  // The floor's look for a patch of it bent into ripples (render/GroundRipple.ts), kept in step
  // with the floor's own until it's released: the same pixels where the patch lies level and
  // unlit, shaded by its slope, and glowing `glow` as a pool round (x, z) out to `radius` (at the
  // strength its owner sets as `reliefStrength`) and on its crests, `height` over `base`.
  rippleGround(x: number, z: number, radius: number, base: number, height: number, glow: Color3): ShaderMaterial {
    const mat = this.groundMaterial('ripple', 0);
    mat.setFloat('relief', 1);
    mat.setFloat('reliefBase', base);
    mat.setFloat('reliefHeight', height);
    mat.setColor3('reliefGlow', glow);
    mat.setVector2('reliefCentre', new Vector2(x, z));
    mat.setFloat('reliefRadius', radius);
    mat.setFloat('reliefStrength', 0);
    mat.setFloat('fogScale', this.fogScale);
    return mat;
  }

  releaseGround(mat: ShaderMaterial): void {
    for (const list of [this.grounds, this.materials]) list.splice(list.indexOf(mat), 1);
    mat.dispose();
  }

  private createSky(): void {
    const scene = this.engine.scene;
    const sky = MeshBuilder.CreateSphere(
      'sky',
      { diameter: this.span * 15, segments: 16, sideOrientation: Mesh.BACKSIDE },
      scene,
    );
    sky.isPickable = false;
    sky.infiniteDistance = true;
    sky.applyFog = false;
    const mat = new ShaderMaterial('skyMat', scene, 'worldSky', {
      attributes: ['position'],
      uniforms: ['worldViewProjection', 'fogColor', 'zenithColor', 'horizonColor', 'horizon', 'time'],
    });
    mat.setColor3('fogColor', FOG_COLOR);
    mat.setColor3('zenithColor', ZENITH_COLOR);
    mat.setColor3('horizonColor', HORIZON_COLOR);
    mat.setFloat('horizon', 0);
    this.sky = mat;
    mat.backFaceCulling = false;
    mat.disableDepthWrite = true;
    sky.material = mat;
    this.materials.push(mat);
  }

  // The one boundary: the circle round the whole world's reach (Ground.keepWithin).
  private createWalls(): void {
    const scene = this.engine.scene;
    const mat = new ShaderMaterial('wallMat', scene, 'worldWall', {
      attributes: ['position', 'uv'],
      uniforms: ['world', 'worldViewProjection', 'cameraPos', 'wallColor', 'revealDistance', 'time'],
      needAlphaBlending: true,
    });
    mat.setColor3('wallColor', new Color3(1.0, 0.25, 0.35));
    mat.setFloat('revealDistance', WALL_REVEAL_DISTANCE);
    mat.backFaceCulling = false;
    mat.disableDepthWrite = true;
    this.materials.push(mat);
    this.createWall(mat);
  }

  // A ribbon round the world's reach, SKY_WALL_TOP metres tall.
  private createWall(mat: ShaderMaterial): void {
    const r = this.ground.reach;
    const steps = Math.max(24, Math.ceil((2 * Math.PI * r) / WALL_STEP));
    const positions: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];
    for (let i = 0; i <= steps; i++) {
      const a = (i / steps) * Math.PI * 2;
      const [x, z] = [Math.cos(a) * r, Math.sin(a) * r];
      positions.push(x, OUTSIDE_HEIGHT, z, x, SKY_WALL_TOP, z);
      // Its distance round in uv.x, so the hex pattern tiles evenly.
      const arc = (i / steps) * 2 * Math.PI * r;
      uvs.push(arc, 0, arc, 1);
      if (i < steps) indices.push(2 * i, 2 * i + 1, 2 * i + 2, 2 * i + 1, 2 * i + 3, 2 * i + 2);
    }
    const wall = new Mesh('sky-wall', this.engine.scene);
    Object.assign(new VertexData(), { positions, indices, uvs }).applyToMesh(wall);
    wall.isPickable = false;
    wall.material = mat;
  }

  // How far you can see, as a multiplier on the squared fog term: 1 is the normal murk, a small
  // number thins it so a scope can pick out a player at its full range. Eased in update().
  setVisibility(fogScale: number): void {
    this.fogTarget = fogScale;
  }

  // Once per frame: the shaders need the camera position for fades, a clock for pulses, and the
  // horizon: where the floor fades out, which is at eye level on the floor and well below it up high.
  update(dt: number, cameraPos: Vector3): void {
    this.time += dt;
    if (this.fogScale !== this.fogTarget) {
      const k = 1 - Math.pow(0.5, dt / FOG_HALF_LIFE);
      this.fogScale += (this.fogTarget - this.fogScale) * k;
      if (Math.abs(this.fogScale - this.fogTarget) < 1e-3) this.fogScale = this.fogTarget;
      for (const g of this.grounds) g.setFloat('fogScale', this.fogScale);
      this.engine.scene.fogDensity = BASE_FOG_DENSITY * Math.sqrt(this.fogScale);
    }
    for (const m of this.materials) {
      m.setFloat('time', this.time);
      m.setVector3('cameraPos', cameraPos);
    }
    const height = Math.max(0, cameraPos.y - EYE_HEIGHT);
    const faded = Math.sqrt(FADED / (GROUND_FOG * this.fogScale)); // metres to where the floor is 90% fog
    const horizon = -height / Math.hypot(height, faded); // the sine of the angle down to it
    this.sky.setFloat('horizon', horizon);
    for (const g of this.grounds) g.setFloat('horizon', horizon);
  }
}
