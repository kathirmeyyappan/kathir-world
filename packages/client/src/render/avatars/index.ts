// Every look's body: how it's made and what it's drawn with. A look's files are fetched the first
// time it's wanted (`wantLook`), never at startup, so what everyone pays for at join stays the same
// however many looks there are. The Game makes a player's body with `createAvatar` whenever their
// look or colour changes.
import type { Vector3 } from '@babylonjs/core';
import { AVATARS, type AvatarId, type ItemAction } from '@world/shared';
import type { RemotePlayer } from '../../net/Interpolation';
import type { Engine } from '../Engine';
import type { Seat } from '../vehicles/Seat';
import { bodyBuilder, type BodySpec } from './Body';
import { begin, type Fetch } from '../fetchOnce';
import { DragonAvatar } from './Dragon';
import { DRAGONS, type DragonAvatarId } from './dragons';
import { buildElizabeth } from './Elizabeth';
import { JointedAvatar, type JointedSpec } from './Jointed';
import { buildStandard } from './Standard';
import { skinTexture, type AtlasName } from './skinned';
import { WalkerAvatar, type Build } from './Walker';
import type { Avatar } from './common';

export type { Avatar } from './common';

type Make = (engine: Engine, id: string, kind: AvatarId, color: string) => Avatar;

// A look: how its body is made, and the files it's drawn with, fetched together.
//
// One that `make`s its body has its maker in the chunk everyone loads, and makes it at once: a
// dragon rises and roars as it comes up, and fills its model in when that and its atlases are here
// (Dragon.ts). One that `load`s its maker has it in a chunk of its own (a dynamic import of its
// builder, model and the clips only it uses), and its body waits for that and its atlases, the body
// its player had standing in meanwhile (`Pending`).
type Look = { atlases: readonly AtlasName[] } & (
  | { make: Make; model?: () => Promise<unknown> } // a dragon's model (dragons.ts)
  | { load: () => Promise<Make> }
);

// Everyone on foot is a figure the walker poses (Walker.ts), made from its builder; one that moves
// by a rule of its own is a subclass of WalkerAvatar, made here by its class: a jointed body
// (Jointed.ts) is posed in its own style, and a Body may name its own (BodySpec.avatar).
const walker =
  (build: Build, avatar: typeof WalkerAvatar = WalkerAvatar): Make =>
  (engine, id, kind, color) =>
    new avatar(engine, id, kind, build, color);
const jointed =
  (spec: JointedSpec): Make =>
  (engine, id, kind, color) =>
    new JointedAvatar(engine, id, kind, spec, color);

const inChunk = (make: Make): Look => ({ make, atlases: [] });
// A look on foot drawn from a model, from its module: a jointed body, a trunk on two arms and two
// legs (Body.ts), or a builder of its own. Every one is painted by its atlas but Tung Tung Tung
// Sahur, painted in its vertices.
const ofJointed = (kind: AvatarId, spec: () => Promise<JointedSpec>): Look => ({
  load: () => spec().then(jointed),
  atlases: [kind],
});
const ofBody = (kind: AvatarId, spec: () => Promise<BodySpec>): Look => ({
  load: () => spec().then((s) => walker(bodyBuilder(s), s.avatar)),
  atlases: [kind],
});
const ofBuild = (kind: AvatarId, build: () => Promise<Build>, atlas = true): Look => ({
  load: () => build().then(walker),
  atlases: atlas ? [kind] : [],
});
// A dragon skin is the dragon (Dragon.ts) in that skin's look (dragons.ts).
const ofDragon = (kind: DragonAvatarId): Look => {
  const look = DRAGONS[kind];
  return {
    make: (engine, id) => new DragonAvatar(engine, id, kind, look, wantLook(engine, kind).then(look.model)),
    atlases: look.glow ? [kind, `${kind}-glow`] : [kind],
    model: look.model,
  };
};

const LOOKS: Record<AvatarId, Look> = {
  standard: inChunk(walker(buildStandard)),
  mario: ofJointed('mario', () => import('./Mario').then((m) => m.MARIO)),
  luigi: ofJointed('luigi', () => import('./Luigi').then((m) => m.LUIGI)),
  wario: ofJointed('wario', () => import('./Wario').then((m) => m.WARIO)),
  waluigi: ofJointed('waluigi', () => import('./Waluigi').then((m) => m.WALUIGI)),
  peach: ofJointed('peach', () => import('./Peach').then((m) => m.PEACH)),
  daisy: ofJointed('daisy', () => import('./Daisy').then((m) => m.DAISY)),
  spongebob: ofBody('spongebob', () => import('./SpongeBob').then((m) => m.SPONGEBOB)),
  patrick: ofBody('patrick', () => import('./Patrick').then((m) => m.PATRICK)),
  krabs: ofBody('krabs', () => import('./Krabs').then((m) => m.KRABS)),
  squidward: ofBuild('squidward', () => import('./Squidward').then((m) => m.buildSquidward)),
  gary: ofBuild('gary', () => import('./Gary').then((m) => m.buildGary)),
  plankton: ofBody('plankton', () => import('./Plankton').then((m) => m.PLANKTON)),
  sandy: ofBuild('sandy', () => import('./Sandy').then((m) => m.buildSandy)),
  puff: ofBuild('puff', () => import('./Puff').then((m) => m.buildPuff)),
  larry: ofBuild('larry', () => import('./Larry').then((m) => m.buildLarry)),
  sahur: ofBuild('sahur', () => import('./Sahur').then((m) => m.buildSahur), false),
  mike: ofBody('mike', () => import('./Mike').then((m) => m.MIKE)),
  sulley: ofBuild('sulley', () => import('./Sulley').then((m) => m.buildSulley)),
  elizabeth: inChunk(walker(buildElizabeth)),
  'light-dragon': ofDragon('light-dragon'),
  colgera: ofDragon('colgera'),
};

// Makers fetched in chunks of their own, for every scene; atlases per scene, since a texture is. A
// maker that fails to arrive is sent for again by the next want (fetchOnce.ts); an atlas that fails
// counts as done, and the body is drawn with what there is.
const makers = new Map<AvatarId, Fetch<Make>>();
const atlases = new WeakMap<Engine['scene'], Map<AtlasName, Fetch<void>>>();

function atlas(scene: Engine['scene'], name: AtlasName): Fetch<void> {
  let mine = atlases.get(scene);
  if (!mine) atlases.set(scene, (mine = new Map()));
  return begin(mine, name, () => new Promise<void>((done) => void skinTexture(scene, name, done)));
}

// Sends for a look's files (its maker, its atlases in this scene, a dragon's model), resolving with
// its maker once they're all here. Call as soon as the look is likely to be wanted.
export function wantLook(engine: Engine, kind: AvatarId): Promise<Make> {
  const look = LOOKS[kind];
  const painting = look.atlases.map((name) => atlas(engine.scene, name).promise);
  if ('make' in look) return Promise.all([...painting, look.model?.()]).then(() => look.make);
  const maker = begin(makers, kind, look.load).promise;
  return Promise.all([maker, ...painting]).then(() => maker);
}

// The maker of a body that can be drawn now: one made at once, or one whose chunk and atlases are
// here; null while they're on their way.
function readyMaker(engine: Engine, kind: AvatarId): Make | null {
  const look = LOOKS[kind];
  if ('make' in look) return look.make;
  const maker = begin(makers, kind, look.load);
  const painted = look.atlases.every((name) => atlas(engine.scene, name).done);
  return maker.done && painted ? (maker.value ?? null) : null;
}

// A player's body as `p` wears it. `was`, the body they wore until now, is disposed of here: at once
// if the new look can be drawn, or else kept standing in for it until it can. With no body on foot
// to keep (a dragon becoming a walker, or a body first seen in its look) nothing is drawn until it
// arrives, so a player is never drawn in a look nobody chose for them.
export function createAvatar(
  engine: Engine,
  p: { id: string; color: string; avatar: AvatarId },
  was: Avatar | null = null,
): Avatar {
  const make = readyMaker(engine, p.avatar);
  const heading = was?.heading?.() ?? null;
  const keep = !make && was && AVATARS[was.kind].class === 'walker' ? was : null;
  if (was !== keep) was?.dispose();
  const body = make ? make(engine, p.id, p.avatar, p.color) : new Pending(engine, p, keep);
  if (heading !== null) body.face?.(heading);
  return body;
}

// A look on foot on its way: the body it had standing in for it, or none, until it arrives and
// takes its place. Everything the Game does to the body goes to whichever is there, and what lasts
// (the weapons' scale) is carried over to the arrival.
class Pending implements Avatar {
  readonly id: string;
  readonly kind: AvatarId;
  private body: Avatar | null;
  private arrived = false;
  private gone = false;
  private weapons = 1;
  private facing: number | null = null; // the way the arrival is to face, if the stand-in can't say

  constructor(engine: Engine, p: { id: string; color: string; avatar: AvatarId }, standIn: Avatar | null) {
    this.id = p.id;
    this.kind = p.avatar;
    this.body = standIn;
    wantLook(engine, p.avatar)
      .then((make) => {
        if (this.gone) return;
        const body = make(engine, p.id, p.avatar, p.color);
        const heading = this.heading();
        if (heading !== null) body.face?.(heading);
        body.scaleWeapons(this.weapons);
        body.hide(); // until the next update places it
        this.body?.dispose();
        this.body = body;
        this.arrived = true;
      })
      .catch((e: unknown) => console.error(`loading ${p.avatar}`, e));
  }

  // The stand-in's colour isn't the look's: a change of colour while it's on its way is the same look.
  get color(): string | undefined {
    return this.arrived ? this.body?.color : undefined;
  }

  update(p: RemotePlayer, step: number, seat: Seat | null): void {
    this.body?.update(p, step, seat);
  }
  heading(): number | null {
    return this.body?.heading?.() ?? this.facing;
  }
  face(yaw: number): void {
    this.facing = yaw;
    this.body?.face?.(yaw);
  }
  flash(): void {
    this.body?.flash();
  }
  fire(): void {
    this.body?.fire();
  }
  scaleWeapons(factor: number): void {
    this.weapons = factor;
    this.body?.scaleWeapons(factor);
  }
  hide(): void {
    this.body?.hide();
  }
  dispose(): void {
    this.gone = true;
    this.body?.dispose();
  }
  corpse(): Vector3 | null {
    return this.body?.corpse() ?? null;
  }
  act(action: ItemAction): void {
    this.body?.act?.(action);
  }
}
