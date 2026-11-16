// Picks the avatar builder for a player's avatar id. The Game recreates a player's avatar
// whenever the id in their state changes.
import type { Vector3 } from '@babylonjs/core';
import { AVATARS, type AvatarId, type ItemAction } from '@world/shared';
import type { RemotePlayer } from '../../net/Interpolation';
import type { Engine } from '../Engine';
import { bodyBuilder } from './Body';
import { DragonAvatar } from './Dragon';
import { DRAGONS, type DragonAvatarId } from './dragons';
import { buildElizabeth } from './Elizabeth';
import { JointedAvatar, type JointedSpec } from './Jointed';
import { buildStandard } from './Standard';
import { skinTexture } from './skinned';
import { WalkerAvatar, type Build } from './Walker';
import type { Avatar } from './common';

export type { Avatar } from './common';

// Everyone on foot is a figure the walker poses (Walker.ts), made from its builder; one that moves
// by a rule of its own is a subclass of WalkerAvatar, made here by its class: a jointed
// body (Jointed.ts) is posed in its own style. A dragon skin is the dragon (Dragon.ts) in that skin's
// look (dragons.ts).
type Make = (engine: Engine, id: string, kind: AvatarId, color: string) => Avatar;
const walker =
  (build: Build): Make =>
  (engine, id, kind, color) =>
    new WalkerAvatar(engine, id, kind, build, color);
const jointed =
  (spec: JointedSpec): Make =>
  (engine, id, kind, color) =>
    new JointedAvatar(engine, id, kind, spec, color);
const dragon =
  (look: DragonAvatarId): Make =>
  (engine, id, kind) =>
    new DragonAvatar(engine, id, kind, DRAGONS[look]);

// A look drawn from a model is in a chunk of its own (its builder, its model and the clips only it
// uses), fetched with its atlas the first time anyone is seen wearing it, so the code and textures
// everyone pays for stay the same however many looks there are. `atlas` is false for a model
// painted in its vertices. The dragons fetch their own models (dragons.ts).
interface Lazy {
  load: () => Promise<Make>;
  atlas: boolean;
}
const lazy = (load: () => Promise<Make>, atlas = true): Lazy => ({ load, atlas });
const body = (spec: Promise<Parameters<typeof bodyBuilder>[0]>) => spec.then((s) => walker(bodyBuilder(s)));
const built = (build: Promise<Build>) => build.then(walker);

const LOOKS: Record<AvatarId, Make | Lazy> = {
  standard: walker(buildStandard),
  mario: lazy(() => import('./Mario').then((m) => jointed(m.MARIO))),
  luigi: lazy(() => import('./Luigi').then((m) => jointed(m.LUIGI))),
  wario: lazy(() => import('./Wario').then((m) => jointed(m.WARIO))),
  waluigi: lazy(() => import('./Waluigi').then((m) => jointed(m.WALUIGI))),
  peach: lazy(() => import('./Peach').then((m) => jointed(m.PEACH))),
  daisy: lazy(() => import('./Daisy').then((m) => jointed(m.DAISY))),
  spongebob: lazy(() => body(import('./SpongeBob').then((m) => m.SPONGEBOB))),
  patrick: lazy(() => body(import('./Patrick').then((m) => m.PATRICK))),
  krabs: lazy(() => body(import('./Krabs').then((m) => m.KRABS))),
  squidward: lazy(() => built(import('./Squidward').then((m) => m.buildSquidward))),
  gary: lazy(() => built(import('./Gary').then((m) => m.buildGary))),
  plankton: lazy(() => body(import('./Plankton').then((m) => m.PLANKTON))),
  sandy: lazy(() => built(import('./Sandy').then((m) => m.buildSandy))),
  puff: lazy(() => built(import('./Puff').then((m) => m.buildPuff))),
  larry: lazy(() => built(import('./Larry').then((m) => m.buildLarry))),
  sahur: lazy(() => built(import('./Sahur').then((m) => m.buildSahur)), false),
  mike: lazy(() => body(import('./Mike').then((m) => m.MIKE))),
  sulley: lazy(() => built(import('./Sulley').then((m) => m.buildSulley))),
  elizabeth: walker(buildElizabeth),
  'light-dragon': dragon('light-dragon'),
  colgera: dragon('colgera'),
};

// A look's chunk, once arrived (and the promise of it while on its way); and per scene, its atlas
// once loaded there (or failed: it's drawn with what there is rather than never).
const made = new Map<AvatarId, Make>();
const coming = new Map<AvatarId, Promise<Make>>();
const atlases = new WeakMap<Engine['scene'], Map<AvatarId, Promise<void>>>();
const painted = new WeakMap<Engine['scene'], Set<AvatarId>>();

function chunk(kind: AvatarId, look: Lazy): Promise<Make> {
  let promise = coming.get(kind);
  if (!promise) {
    promise = look.load().then((make) => {
      made.set(kind, make);
      return make;
    });
    // A failed fetch is let go, so the next want tries again.
    promise.catch(() => coming.delete(kind));
    coming.set(kind, promise);
  }
  return promise;
}

function atlas(scene: Engine['scene'], kind: AvatarId): Promise<void> {
  let mine = atlases.get(scene);
  if (!mine) atlases.set(scene, (mine = new Map()));
  let promise = mine.get(kind);
  if (!promise) {
    promise = new Promise((done) => {
      // Kept for as long as the scene is, so the atlas stays loaded for the bodies made after it.
      skinTexture(scene, kind, () => {
        let set = painted.get(scene);
        if (!set) painted.set(scene, (set = new Set()));
        set.add(kind);
        done();
      });
    });
    mine.set(kind, promise);
  }
  return promise;
}

// Sends for a look's chunk and its atlas in this scene, if it has them; resolves with its maker once
// both are here. Call as soon as the look is likely to be wanted.
export function wantLook(engine: Engine, kind: AvatarId): Promise<Make> {
  const look = LOOKS[kind];
  if (typeof look === 'function') return Promise.resolve(look);
  const scene = engine.scene;
  return Promise.all([chunk(kind, look), look.atlas ? atlas(scene, kind) : null]).then(([make]) => make);
}

function ready(engine: Engine, kind: AvatarId): Make | null {
  const look = LOOKS[kind];
  if (typeof look === 'function') return look;
  const make = made.get(kind);
  return make && (!look.atlas || painted.get(engine.scene)?.has(kind)) ? make : null;
}

// The dragons' models and atlases are fetched once the page has nothing better to do, so a dragon
// rising goes on without waiting on the network.
export function preloadAvatars(engine: Engine): void {
  const idle = window.requestIdleCallback ?? ((f: () => void) => setTimeout(f, 3000));
  idle(() => {
    for (const look of Object.keys(DRAGONS) as DragonAvatarId[]) skinTexture(engine.scene, look);
    for (const look of Object.values(DRAGONS)) void look.model();
  });
}

// A player's body as `p` wears it. `was`, the body they wore until now, is disposed of here: at once
// if the new look is ready, or else kept standing in for it until it arrives (the standard body
// standing in where it can't, a dragon becoming a walker), so a switch never shows a body the player
// isn't wearing.
export function createAvatar(
  engine: Engine,
  p: { id: string; color: string; avatar: AvatarId },
  was: Avatar | null = null,
): Avatar {
  const make = ready(engine, p.avatar);
  if (make) {
    was?.dispose();
    return make(engine, p.id, p.avatar, p.color);
  }
  const keep = was && AVATARS[was.kind].class === 'walker' ? was : null;
  if (was !== keep) was?.dispose();
  return new Pending(engine, p, keep ?? walker(buildStandard)(engine, p.id, 'standard', p.color));
}

// A look on its way (always one on foot): what stands in for it, until it arrives and takes its
// place. Everything the Game does to the body goes to whichever is there, and what lasts (the
// weapons' scale, a death by a fall) is carried over to the arrival.
class Pending implements Avatar {
  readonly id: string;
  readonly kind: AvatarId;
  private body: Avatar;
  private arrived = false;
  private gone = false;
  private weapons = 1;
  private fallen = false;

  constructor(engine: Engine, p: { id: string; color: string; avatar: AvatarId }, standIn: Avatar) {
    this.id = p.id;
    this.kind = p.avatar;
    this.body = standIn;
    wantLook(engine, p.avatar)
      .then((make) => {
        if (this.gone) return;
        const body = make(engine, p.id, p.avatar, p.color);
        body.scaleWeapons(this.weapons);
        if (this.fallen) body.fell?.();
        body.hide(); // until the next update places it
        this.body.dispose();
        this.body = body;
        this.arrived = true;
      })
      .catch((e: unknown) => console.error(`loading ${p.avatar}`, e));
  }

  // The stand-in's colour isn't the look's: a change of colour while it's on its way is the same look.
  get color(): string | undefined {
    return this.arrived ? this.body.color : undefined;
  }

  update(p: RemotePlayer, step: number): void {
    this.body.update(p, step);
  }
  flash(): void {
    this.body.flash();
  }
  fire(): void {
    this.body.fire();
  }
  scaleWeapons(factor: number): void {
    this.weapons = factor;
    this.body.scaleWeapons(factor);
  }
  hide(): void {
    this.body.hide();
  }
  dispose(): void {
    this.gone = true;
    this.body.dispose();
  }
  corpse(): Vector3 | null {
    return this.body.corpse();
  }
  fell(): void {
    this.fallen = true;
    this.body.fell?.();
  }
  act(action: ItemAction): void {
    this.body.act?.(action);
  }
}
