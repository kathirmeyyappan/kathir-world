// Tung Tung Tung Sahur: a 3.2 m wooden log with a face (60% taller than everyone else), drawn from
// the parts of sahurModel.ts (made by scripts/sahur-model.py): the log, an arm at each shoulder, the
// bat and each leg, every one a closed mesh that turns about a joint sunk in the log, so no pose
// opens a seam. The skin shades from orange-brown at the hips to yellow at the top of the head, and
// the eyes are the avatar's own: white balls that are mostly pupil, staring fixed and a little
// wall-eyed. It walks stiff-legged with its arms swinging, twitches its head now and then, and dies
// flat on its back. Worn with /tung; its hit capsule is as tall as it is (AVATARS.sahur.hitbox).
// The bat is carried in its left fist, whatever its right holds, and swung with it on a strike
// (sim/avatars.ts `Strike`); an item goes in the right fist, the arm raised from the shoulder to
// point it along the look. On a ladder the right hand climbs and the left holds the bat clear.
import {
  Color3,
  Mesh,
  MeshBuilder,
  Quaternion,
  TransformNode,
  Vector3,
  VertexData,
  type StandardMaterial,
} from '@babylonjs/core';
import { strikeOf } from '@world/shared';
import type { Engine } from '../Engine';
import { flat } from './common';
import { smooth } from './motion';
import { SAHUR_MODEL } from './sahurModel';
import type { Figure } from './Walker';

const PUPIL = 0.7; // pupil diameter as a fraction of the eyeball's
const EYE_SIZE = 1.02; // the eyeball's radius as a fraction of the sculpt's (a closed lid): it covers it, wide open
const EYE_SINK = -0.012; // metres the eyeball sits back from the sculpt's own (negative: forward)
const STARE_OUT = 0.06; // radians each eye turns outward: the gaze never quite meets yours
const CREASE_DARKEN = 0.6; // how much of the skin's colour the deepest crease loses
const LIE_HEIGHT = 0.28; // metres the fallen log's centre line sits above the ground (its half-depth)
const TWITCH_EVERY_MS = 4300; // roughly; each avatar's twitches are offset by its id
const LEAN = 0.12; // how much of the look's pitch the log leans by
const BEND = Math.PI / 6; // radians the raised arm stays below the look, the elbow bent
const ARM_SWING = 0.3; // radians the arms swing each way at a full-speed walk
// Lying dead, radians the arms and the legs drop from the log's middle to the ground it lies on.
const DEAD_ARMS = 0.2;
const DEAD_LEGS = 0.15;
const STANCE_HALF_LIFE = 0.06; // seconds: how fast the bat arm goes between how it's held on foot and on a ladder

// Where the bat arm points (from the shoulder to the fist) and the bat (from the fist to its end),
// in the log's frame, x to its right and z ahead. On a ladder the arm hangs out from the side with
// the bat down behind it, clear of the rungs; dead, the bat lies along the leg, its end on the ground.
const LADDER = { arm: dir(-0.3, -0.93, -0.2), bat: dir(-0.1, -0.85, -0.5) };
const DEAD_BAT = dir(-0.25, -0.95, -0.16);
// A strike's swing: cocked up behind the left shoulder by `COCKED` of the windup, through the
// blow in front of the body as the windup ends, and on across it to the right by `FOLLOWED` of
// the recovery, the rest of which brings it back to how it was carried.
const COCK = { arm: dir(-0.55, 0.55, -0.35), bat: dir(-0.15, 0.7, -0.7) };
const BLOW = { arm: dir(0.12, -0.22, 0.97), bat: dir(0.4, -0.3, 0.87) };
const FOLLOW = { arm: dir(0.5, -0.62, 0.6), bat: dir(0.8, -0.5, 0.33) };
const COCKED = 0.6;
const FOLLOWED = 0.3;

// Skin by height, in metres above the feet: orange-brown on the body, yellow on the head.
const SKIN = [
  { y: 0, c: new Color3(0.72, 0.34, 0.1) },
  { y: 1.9, c: new Color3(0.9, 0.5, 0.13) },
  { y: 2.45, c: new Color3(0.98, 0.7, 0.16) },
  { y: 3.2, c: new Color3(1, 0.8, 0.2) },
];

type PartKey = keyof typeof SAHUR_MODEL.parts;

export function buildSahur(engine: Engine, id: string, base: TransformNode): Figure {
  const scene = engine.scene;
  const model = SAHUR_MODEL;
  const twitchOffset = [...id].reduce((h, c) => h * 31 + c.charCodeAt(0), 7) % TWITCH_EVERY_MS;

  // Coloured per vertex (skinColours), which tints the glow as well as the lit colour.
  const skin = glossy(flat(scene, `sahur-skin-${id}`, Color3.White(), 0.34));
  const batMat = glossy(flat(scene, `sahur-bat-${id}`, new Color3(0.62, 0.33, 0.14), 0.3));
  const white = glossy(flat(scene, `sahur-white-${id}`, new Color3(0.97, 0.96, 0.93), 0.5));
  const black = flat(scene, `sahur-black-${id}`, new Color3(0.01, 0.01, 0.01), 0);

  // A node at a part's pivot (given in the avatar's frame, so offset by the parent's own pivot),
  // with the part's mesh hung on it.
  const part = (key: PartKey, parent: TransformNode, offset: readonly number[], mat: StandardMaterial) => {
    const { pivot } = model.parts[key];
    const node = new TransformNode(`sahur-${key}-${id}`, scene);
    node.parent = parent;
    node.position.set(pivot[0] - offset[0], pivot[1] - offset[1], pivot[2] - offset[2]);
    const mesh = partMesh(scene, `sahur-${key}-mesh-${id}`, model.parts[key], mat === skin);
    mesh.material = mat;
    mesh.parent = node;
    mesh.isPickable = false;
    return node;
  };
  const origin = [0, 0, 0];
  const foot = model.parts.log.pivot; // the middle of the log's foot, which it leans and twitches about
  const log = part('log', base, origin, skin);
  const legL = part('legL', base, origin, skin);
  const legR = part('legR', base, origin, skin);
  const armL = part('armL', log, foot, skin);
  const armR = part('armR', log, foot, skin);
  const bat = part('bat', armL, model.parts.armL.pivot, batMat); // at the left fist, turning in it

  // Eyes: a white ball in each of the sculpt's sockets, the front mostly pupil, fixed and turned a
  // little outward.
  const r = model.eyeRadius * EYE_SIZE;
  for (const [i, [x, y, z]] of model.eyes.entries()) {
    const side = x > 0 ? 1 : -1;
    const ball = MeshBuilder.CreateSphere(`sahur-eye-${i}-${id}`, { diameter: r * 2, segments: 10 }, scene);
    ball.material = white;
    ball.parent = log;
    ball.position.set(x, y - foot[1], z - EYE_SINK); // over the sculpt's closed lid, inside its orbit
    ball.isPickable = false;
    const pupil = MeshBuilder.CreateDisc(`sahur-pupil-${i}-${id}`, { radius: r * PUPIL, tessellation: 18 }, scene);
    pupil.material = black;
    pupil.parent = ball;
    pupil.rotation.set(0.04, Math.PI + side * STARE_OUT, 0); // a disc faces -z; turn it to face out
    pupil.position.set(Math.sin(side * STARE_OUT) * r * 1.01, -0.04 * r, Math.cos(STARE_OUT) * r * 1.01);
    pupil.isPickable = false;
  }

  // A held item goes in the right fist; the flamethrower's tank rides on the back.
  const between = (from: readonly number[], to: readonly number[]) =>
    new Vector3(to[0] - from[0], to[1] - from[1], to[2] - from[2]);
  const grip = new TransformNode(`avatar-grip-${id}`, scene);
  grip.parent = armR;
  grip.position.copyFrom(between(model.parts.armR.pivot, model.fists.right));
  const reachL = between(model.parts.armL.pivot, model.fists.left).normalize();
  const reachR = grip.position.normalizeToNew();

  // The bat arm's poses as turns from how the model holds it: the arm's about the shoulder, and
  // the bat's in the log's frame, which the arm's own turn is taken out of each frame.
  const carried = Vector3.FromArray(model.bat);
  const pose = (to: { arm: Vector3; bat: Vector3 }) => ({
    arm: Quaternion.FromUnitVectorsToRef(reachL, to.arm, new Quaternion()),
    bat: Quaternion.FromUnitVectorsToRef(carried, to.bat, new Quaternion()),
  });
  const ladder = pose(LADDER);
  const swing = [pose(COCK), pose(BLOW), pose(FOLLOW)];
  const deadBat = Quaternion.FromUnitVectorsToRef(carried, DEAD_BAT, new Quaternion());
  const strike = strikeOf('sahur');
  const held = new Quaternion(); // the bat's turn in the log's frame, eased between its stances
  let onLadder = 0; // how far the arm has gone over to its hold on a ladder, 0 to 1
  let struck: number | null = null; // the strike last seen on the player (seconds into it)
  let swung = -1; // seconds into the swing being drawn; negative with none
  let lastNow = performance.now();

  return {
    tilt: { node: log, follow: LEAN },
    legs: [
      { node: legL, side: 1 },
      { node: legR, side: -1 },
    ],
    armL: { node: armL, reach: reachL },
    armR: { node: armR, grip, reach: reachR },
    back: { node: log, at: new Vector3(0, 2 - foot[1], -0.4) },
    materials: [skin, batMat],
    shadow: 1.3,
    headless: true, // the face is on the log
    legSwing: 0.32, // stiff legs swing from the hip
    airLegs: 0.15,
    armSwing: ARM_SWING,
    bob: 0.05,
    bend: BEND,
    // Flat on its back like a felled log, face to the sky, its limbs dropped to the ground.
    lie: { onto: 'back', height: LIE_HEIGHT, arms: DEAD_ARMS, legs: DEAD_LEGS },
    // The log sways slowly and, every few seconds, jerks sideways for a moment. The bat arm is
    // posed here over the walk's: its swing while a strike runs, else its hold on a ladder or the
    // walk's own swing, with the bat kept as it's carried whichever way the arm has turned.
    extra: (p, { climbing }) => {
      const now = performance.now();
      const dt = Math.min(0.1, (now - lastNow) / 1000);
      lastNow = now;
      const ease = 1 - Math.pow(0.5, dt / STANCE_HALF_LIFE);
      if (p.dead) log.rotation.z = 0;
      else {
        const sinceTwitch = (now + twitchOffset) % TWITCH_EVERY_MS;
        const twitch = sinceTwitch < 140 ? Math.sin((sinceTwitch / 140) * Math.PI) * 0.12 : 0;
        log.rotation.z = Math.sin(now / 1700 + twitchOffset) * 0.03 + twitch;
      }

      // The arm as the walk left it (the hand a ladder's rungs would take is the right's alone),
      // gone over to its hold on a ladder as far as it has got to.
      if (climbing) ARM.set(0, 0, 0, 1);
      else Quaternion.FromEulerAnglesToRef(armL.rotation.x, armL.rotation.y, armL.rotation.z, ARM);
      onLadder = p.dead ? 0 : onLadder + ((climbing ? 1 : 0) - onLadder) * ease;
      Quaternion.SlerpToRef(ARM, ladder.arm, onLadder, ARM);
      Quaternion.SlerpToRef(held, p.dead ? deadBat : climbing ? ladder.bat : CARRIED, ease, held);
      BAT.copyFrom(held);

      // A strike seen to begin starts the swing, which then runs on its own clock, so it is as
      // smooth as the frames however the player's state arrives.
      if (p.strike !== null && (struck === null || p.strike < struck)) swung = p.strike;
      else if (swung >= 0) swung += dt;
      struck = p.strike;
      if (!strike || p.dead || swung >= strike.windup + strike.recover) swung = -1;
      if (strike && swung >= 0) {
        // Each stage runs from where the last ended: up to cocked, down through the blow, on
        // across the body, and back to how the arm was.
        const stages = [strike.windup * COCKED, strike.windup, strike.windup + strike.recover * FOLLOWED];
        const stage = stages.findIndex((end) => swung < end);
        const k = stage < 0 ? stages.length : stage;
        const began = k === 0 ? 0 : stages[k - 1];
        const ended = k === stages.length ? strike.windup + strike.recover : stages[k];
        const through = (swung - began) / (ended - began);
        // The blow itself gathers speed all the way; every other stage starts and ends at rest.
        const eased = k === 1 ? through * through : smooth(through);
        const from = k === 0 ? null : swing[k - 1];
        const to = k === stages.length ? null : swing[k];
        Quaternion.SlerpToRef(from?.arm ?? ARM, to?.arm ?? ARM, eased, ARM);
        Quaternion.SlerpToRef(from?.bat ?? BAT, to?.bat ?? BAT, eased, BAT);
      }
      (armL.rotationQuaternion ??= new Quaternion()).copyFrom(ARM);
      ARM.conjugateToRef(UNDO).multiplyToRef(BAT, (bat.rotationQuaternion ??= new Quaternion()));
    },
  };
}

// Scratch for a frame's pose, shared by every Tung Tung Tung Sahur: none of it survives a call.
const ARM = new Quaternion();
const BAT = new Quaternion();
const UNDO = new Quaternion();
const CARRIED = Quaternion.Identity(); // the bat as the model holds it

function dir(x: number, y: number, z: number): Vector3 {
  return new Vector3(x, y, z).normalize();
}

// Smooth and a little shiny.
function glossy(m: StandardMaterial): StandardMaterial {
  m.specularColor = new Color3(0.25, 0.2, 0.12);
  m.specularPower = 20;
  return m;
}

// One part of the sculpt as a smooth-shaded mesh in its pivot's frame, skin-coloured by height when
// `painted`.
function partMesh(
  scene: Engine['scene'],
  name: string,
  part: {
    readonly pivot: readonly number[];
    readonly positions: string;
    readonly indices: string;
    readonly cavity: string;
  },
  painted: boolean,
): Mesh {
  const positions = Array.from(new Int16Array(bytes(part.positions).buffer), (mm) => mm / 1000);
  const indices = Array.from(new Uint16Array(bytes(part.indices).buffer));
  const data = new VertexData();
  data.positions = positions;
  data.indices = indices;
  data.normals = [];
  VertexData.ComputeNormals(positions, indices, data.normals);
  if (painted) data.colors = skinColours(positions, part.pivot[1], bytes(part.cavity));
  const mesh = new Mesh(name, scene);
  data.applyToMesh(mesh);
  return mesh;
}

// Per-vertex skin colour (r, g, b, a) for vertices `lift` metres above the feet in their own frame,
// darkened into the sculpt's creases (`cavity`, 0 to 255 per vertex).
function skinColours(positions: number[], lift: number, cavity: Uint8Array): number[] {
  const colors: number[] = [];
  for (let i = 1; i < positions.length; i += 3) {
    const y = Math.max(SKIN[0].y, Math.min(SKIN[SKIN.length - 1].y, positions[i] + lift));
    let k = 1;
    while (k < SKIN.length - 1 && SKIN[k].y < y) k++;
    const c = Color3.Lerp(SKIN[k - 1].c, SKIN[k].c, (y - SKIN[k - 1].y) / (SKIN[k].y - SKIN[k - 1].y));
    const shade = 1 - CREASE_DARKEN * (cavity[(i - 1) / 3] / 255);
    colors.push(c.r * shade, c.g * shade * shade, c.b * shade * shade, 1); // creases go brown, not grey
  }
  return colors;
}

function bytes(base64: string): Uint8Array {
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
}
