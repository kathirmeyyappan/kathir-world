// A walker with a whole skeleton, moved by animation: a trunk of hips, spine and chest under a
// head, arms that bend at the elbow and legs that bend at the knee, skinned from a model made by
// scripts/jointed-model.py. Where the walker (Walker.ts) swings every body's limbs by one rule, this
// one plays clips (clips.ts): each frame is its idle, its walk or run at the point in the stride
// its feet have got to, its jump, its fall and its landing, blended from one into the next. So it
// moves as whoever animated the clips moved it, and a new character is a model and its clips. The
// walker still places and turns the body, counts its stride, aims what it holds and lays it down dead.
import { Quaternion, TransformNode, Vector3 } from '@babylonjs/core';
import { GRAVITY, chainOf, crouchOf, jumpVelocityOf, poundOf, walkSpeedOf, type AvatarId } from '@world/shared';
import type { RemotePlayer } from '../../net/Interpolation';
import type { Engine } from '../Engine';
import { Sparkles } from '../Sparkles';
import type { Seat } from '../vehicles/Seat';
import {
  ARMS,
  CLIP_BONES,
  LEGS,
  blend,
  clip,
  motion,
  sample,
  turnAt,
  type Clip,
  type Motion,
  type RawClip,
} from './clips';
import {
  ARM_ELBOW,
  ARM_GRIP,
  ARM_IN,
  ARM_L,
  ARM_OUT,
  ARM_R,
  ARM_SWING,
  CHEST_LEAN,
  CHEST_TILT,
  CHEST_TURN,
  FOOT_L,
  FOOT_PITCH,
  FOOT_R,
  FOOT_X,
  FOOT_Y,
  FOOT_YAW,
  FOOT_Z,
  HEAD_LEAN,
  HEAD_TILT,
  HEAD_TURN,
  HIP_LEAN,
  HIP_TILT,
  HIP_TURN,
  HIP_X,
  HIP_Y,
  HIP_Z,
  pose,
  smooth,
  type BodyPose,
} from './motion';
import { bytes, SkinnedBody, type SkinnedModel } from './skinned';
import { bellOf, Skirt, Tail } from './soft';
import { HEAD_LIMIT, headShare, limbLead, MOVING, rungHeld, WalkerAvatar, type Figure, type Pose } from './Walker';

export type JointedBone =
  | 'hips'
  | 'spine'
  | 'chest'
  | 'head'
  | 'armL'
  | 'forearmL'
  | 'handL'
  | 'fingersL'
  | 'thumbL'
  | 'armR'
  | 'forearmR'
  | 'handR'
  | 'fingersR'
  | 'thumbR'
  | 'legL'
  | 'shinL'
  | 'footL'
  | 'legR'
  | 'shinR'
  | 'footR';
// Bones only some models have, which no clip or pose turns: they move by themselves (soft.ts). A
// skirt's rings, from the hips down, and a tail of hair's links, from the head.
export type SoftBone = 'skirt1' | 'skirt2' | 'skirt3' | 'hair1' | 'hair2' | 'hair3';
type RigBone = JointedBone | SoftBone;
const SKIRT = ['skirt1', 'skirt2', 'skirt3'] as const;
const HAIR = ['hair1', 'hair2', 'hair3'] as const;
const PARENTS: Record<RigBone, RigBone | null> = {
  skirt1: 'hips',
  skirt2: 'skirt1',
  skirt3: 'skirt2',
  hair1: 'head',
  hair2: 'hair1',
  hair3: 'hair2',
  hips: null,
  spine: 'hips',
  chest: 'spine',
  head: 'chest',
  armL: 'chest',
  forearmL: 'armL',
  handL: 'forearmL',
  fingersL: 'handL',
  thumbL: 'handL',
  armR: 'chest',
  forearmR: 'armR',
  handR: 'forearmR',
  fingersR: 'handR',
  thumbR: 'handR',
  legL: 'hips',
  shinL: 'legL',
  footL: 'shinL',
  legR: 'hips',
  shinR: 'legR',
  footR: 'shinR',
};

// A model on this rig, standing in a T-pose: its arms straight out to the sides, its legs straight down.
export interface JointedModel extends SkinnedModel<JointedBone> {
  readonly bones: Readonly<Record<JointedBone, readonly number[]>> &
    Readonly<Partial<Record<SoftBone, readonly number[]>>>;
  // A skirt's hem, with a skirt's bones: metres it reaches to a side, ahead and behind, and below the skirt's top.
  readonly hem?: readonly number[];
  readonly sole: readonly number[]; // metres a shoe's toe reaches ahead of its ankle, and its heel behind it
  readonly temple: readonly number[]; // the head's widest point on its right, where a hand laid beside it goes
  // For resting that hand on the head (`Rig.resting`): how far out the head reaches at the points
  // of a grid over its side, and the hand's vertices from its palm's middle (scripts/jointed-model.py).
  readonly skull: {
    readonly at: readonly number[];
    readonly cell: number;
    readonly across: number;
    readonly far: string;
  };
  readonly mitt: string;
}

// The clips only a look with the move has.
type Moves =
  'leap' | 'pound' | 'pounded' | 'double' | 'doubleFall' | 'triple' | 'crouch' | 'crawl' | 'backflip' | 'float' | 'die';

// How a character moves: its clips, and the few numbers round them.
export interface Style {
  clips: {
    idle: RawClip; // standing, looped
    walk: RawClip; // a stride at a slow walk, starting as the right foot comes down
    run: RawClip; // and at a run
    jump: RawClip; // leaving the ground, held at its end while it's going up
    fall: RawClip; // coming down, looped
    land: RawClip; // from the bottom of a landing's crouch back up to standing
    leap?: RawClip; // a long jump (sim/avatars.ts `Leap`), takeoff to landing: held at its end
    // A ground pound (sim/avatars.ts `Pound`): turning over in the air into the seat it drops in,
    // held at its end; and landing sat, then getting up.
    pound?: RawClip;
    pounded?: RawClip;
    // A chain of jumps (sim/avatars.ts `Chain`): its second going up, held at its end, and coming
    // down; and its third, a somersault through the whole flight, held at its end.
    double?: RawClip;
    doubleFall?: RawClip;
    triple?: RawClip;
    // A crouch (sim/avatars.ts `Crouch`): sat low, looped; a cycle of its crawl, looped; and the
    // jump out of it, a backward somersault through the whole flight, held at its end.
    crouch?: RawClip;
    crawl?: RawClip;
    backflip?: RawClip;
    float?: RawClip; // a float (sim/avatars.ts `Float`): held up in the air, looped
    // Dying where it stands, played once and held at its end, where it lies. A body without one
    // goes over in the walker's leap and lies as `dead` has it.
    die?: RawClip;
  };
  flutter?: number; // strides a second its legs run on at in the air: a scuttle
  landSpeed: number; // m/s of fall that lands all the way into the landing's crouch
  dead: BodyPose; // lying on its back
  follow: number; // the share of the look's pitch the head takes
  bank: number; // radians it leans into a turn for each radian a second it's turning, at a full walk
  glance: number; // one time through its idle in this many it looks about as the clip has it; the rest its head stays ahead
  arms?: number; // the share of its stride's arm swing it keeps, the rest held as its idle holds them: all of it unless given
  waddle?: number; // radians it rocks over each foot as that foot comes down: a heavy body's walk
}

export interface JointedSpec {
  kind: AvatarId;
  model: JointedModel;
  style: Style;
  shadow: number; // metres across
  // With a tail of hair's bones: the way each of its links runs as the hair is dressed, from the
  // head to its tip, by the way the head faces: ahead of it (z) and up (soft.ts `Tail`).
  tail?: readonly (readonly [number, number, number])[];
}

// The share of its full walk under which a body walks and over which it runs, the stride between
// being a blend of the two: the run comes in early, as it does in the games the clips are from.
const WALKS = 0.3;
const RUNS = 0.45;
const EASE_MOVING = 0.1; // seconds a body takes to settle from its stride into standing, and to pick it up
// Seconds into its pose in the air, out of it, and over the top of a jump from going up to coming
// down: each from rest to rest, so no pose is snapped to in a frame.
const TAKEOFF_SECONDS = 0.12;
const TOUCHDOWN_SECONDS = 0.12;
const APEX_SECONDS = 0.28;
const LAND_IN = 0.05; // seconds a landing takes to drop into its crouch
// A float's sparkles come out across this many metres under the body, this far over its feet.
const SPARKLES_ACROSS = 0.7;
const SPARKLES_UP = 0.15;
const FLOAT_SECONDS = 0.2; // seconds it takes to settle into a float, and to drop out of one
const DIE_IN = 0.15; // seconds it takes to go from whatever it was doing into its dying
const CROUCH_SECONDS = 0.15; // seconds it takes to sink into a crouch, and to rise out of one
const EASE_DIRECTION = 0.09; // seconds its stride takes to come round to a new way of going
const EASE_KICKING = 0.15; // seconds its legs take to stop fluttering as a jet takes its weight, and to start again
const EASE_BANK = 0.15; // seconds it takes to lean into a turn, and to come back up out of one
const MAX_BANK = 0.3; // radians it leans into the sharpest turn
// Facing its look with its feet going another way, its hips turn toward the way they're going by
// up to SIDESTEP radians and its chest back by as much; past BACKPEDAL from ahead it runs backward.
const SIDESTEP = 1.1;
const BACKPEDAL = 2;
// How closed its hands are: loose standing, fists running and jumping, open coming down.
const GRIP_IDLE = 0.3;
const GRIP_RUN = 1;
const GRIP_FALL = 0.2;
// On a ladder: the hips in toward it and the feet on its rungs, a rung apart, each stepping up as
// the other holds; the hands on the rails overhead, each reaching as its own foot steps.
// On a ladder: looking up it, fists closed, toes up on the rungs.
const CLIMB = pose({
  head: { lean: -0.2 },
  armL: { grip: 1 },
  armR: { grip: 1 },
  footL: { pitch: -0.25 },
  footR: { pitch: -0.25 },
});
const CLIMB_NEAR = 0.85; // the share of its arm's length a climber's shoulders are held from the rungs
const CLIMB_BACK = 0.25; // metres its hips may hang back from where it stands to hold them there
const HANDS_APART = 0.22; // metres each fist is from the ladder's middle, inside the rails
const FEET_APART = 0.17;
const HANDS_UP = 0.1; // the share of its arm's length its hands hold above its shoulders
const STEP_UP = 0.2; // metres up from where it stands the middle of a foot's step is
const RUNG_EDGE = 0.1; // metres this side of a rung's middle a fist closes on it
const CLIMB_SWAY = 0.03; // metres its hips go over the foot that bears it
const CLIMB_TILT = 0.05; // radians its hips tip with that
// In a kart: sat back a little with its chest over the wheel and fists closed on the grips; its
// hips' pivot this share of a thigh over the seat, and leaning this many radians into the sharpest
// turn.
const SAT = pose({
  hips: { lean: -0.2 },
  chest: { lean: 0.25 },
  armL: { grip: 1 },
  armR: { grip: 1 },
});
const SAT_HIPS = 0.35;
const SAT_TILT = 0.15;
// A fist: radians the fingers fold under the palm, and the thumb turns in and down after them.
const FINGER_CURL = 1.7;
const THUMB_FOLD = 0.6;
const THUMB_CURL = 1.3;
const FIST = 0.05; // metres a fist's middle is from the palm's, on the palm's side
const FLIP_SHARE = 0.9; // the share of a triple jump's flight on the flat its somersault takes
const POUND_IN = 0.07; // seconds a ground pound takes to pull the body into its turn
const GETS_UP = 0.5; // the share of a ground pound's landing after which it's on its feet, and eases into what it does next
const HEAD_AT = turnAt(CLIP_BONES.indexOf('head')); // where the head's turn is in a clip's moment

export class JointedAvatar extends WalkerAvatar {
  private readonly rig: Rig;
  private readonly style: Style;
  private readonly clips: Record<Exclude<keyof Style['clips'], Moves>, Clip> & Record<Moves, Clip | null>;
  private readonly out = motion();
  private readonly other = motion();
  private readonly third = motion();
  private readonly worked = pose(); // a pose worked out, not played: on a ladder or in a kart
  private peak = 0; // the highest its feet have been since it left the ground, metres
  private falling = 0; // how far over the top of its jump it is: 0 going up, 1 coming down
  private grounded = true;
  private bank = 0; // radians it's leaning into a turn, to its right
  private dirX = 0; // the way it's going across the floor, in its own frame: its length under 1 through a change
  private dirZ = 1;
  private moving = 0; // how much of its stride it's in, the rest standing
  private airborne = 0; // how far into its pose in the air it is: 0 on the ground, 1 well off it
  private aloft = 0; // seconds since it left the ground
  private kicking = 1; // how much of its flutter its legs have in the air: none under a jet's thrust
  private leaping = 0; // how far into its long jump's pose it is, of its poses in the air
  private floating = 0; // and into its float's
  private sparkles: Sparkles | null = null; // what a float gives off under it, once it has floated
  private pound: RemotePlayer['pound'] = null; // the stage of its ground pound when it was last drawn
  private turned = 0; // seconds since its ground pound began
  private sat = Infinity; // seconds since its ground pound landed
  private readonly flip: number; // seconds its triple jump's somersault takes: done just before it's down again on the flat
  private readonly backflip: number; // and its backflip's
  private crouching = 0; // how far down into its crouch it is: 0 standing, 1 sat in it
  private impact = 0; // how hard it last landed, 0 to 1
  private landing = Infinity; // seconds since it last landed
  private readonly ahead: Float32Array; // the head's turn as its idle starts: looking ahead
  private readonly rest: Motion; // its idle as it starts: how it holds itself standing

  constructor(engine: Engine, id: string, kind: AvatarId, spec: JointedSpec, color: string) {
    let rig: Rig | undefined;
    super(
      engine,
      id,
      kind,
      (engine, id, base) => {
        rig = new Rig(engine, id, spec, base);
        return rig.figure;
      },
      color,
    );
    this.rig = rig!;
    this.style = spec.style;
    const raw = spec.style.clips;
    if (raw.float) {
      const extra = this.figure.extra;
      this.figure.extra = (p, pose) => {
        extra?.(p, pose);
        const on = p.floating && !p.dead;
        if (on) this.sparkles ??= new Sparkles(engine, SPARKLES_ACROSS);
        this.sparkles?.set(on, UNDER.copyFrom(this.root.position).addInPlaceFromFloats(0, SPARKLES_UP, 0));
      };
    }
    this.clips = {
      idle: clip(raw.idle),
      walk: clip(raw.walk),
      run: clip(raw.run),
      jump: clip(raw.jump),
      fall: clip(raw.fall),
      land: clip(raw.land),
      leap: raw.leap ? clip(raw.leap) : null,
      pound: raw.pound ? clip(raw.pound) : null,
      pounded: raw.pounded ? clip(raw.pounded) : null,
      double: raw.double ? clip(raw.double) : null,
      doubleFall: raw.doubleFall ? clip(raw.doubleFall) : null,
      triple: raw.triple ? clip(raw.triple) : null,
      crouch: raw.crouch ? clip(raw.crouch) : null,
      crawl: raw.crawl ? clip(raw.crawl) : null,
      backflip: raw.backflip ? clip(raw.backflip) : null,
      float: raw.float ? clip(raw.float) : null,
      die: raw.die ? clip(raw.die) : null,
    };
    const chain = chainOf(kind);
    const third = jumpVelocityOf(kind) * Math.sqrt((chain?.rise ?? 1) ** 2);
    this.flip = FLIP_SHARE * ((2 * third) / GRAVITY);
    this.backflip = FLIP_SHARE * ((2 * jumpVelocityOf(kind) * Math.sqrt(crouchOf(kind)?.flip ?? 1)) / GRAVITY);
    sample(this.third, this.clips.idle, 0, true);
    this.ahead = this.third.slice(HEAD_AT, HEAD_AT + 4);
    this.rest = this.third.slice();
  }

  // On the ground or in the air: its idle, its walk or run where its stride has got to, its jump,
  // its fall and its landing, each blended into the next, the body leaning into its turns (the
  // walker turns it); with something to aim, its hips turned toward the way its feet go.
  protected override walk(p: RemotePlayer, feetY: number, step: number, dt: number): Pose {
    const walked = super.walk(p, feetY, step, dt);
    const { style, clips, out, other, third } = this;
    const pace = p.walk / walkSpeedOf(this.kind);
    const speed = Math.hypot(this.velX, this.velZ);
    const armed = p.item !== null;
    const banking = dt > 0 && !armed ? (this.turn / dt) * style.bank * Math.min(1, pace) : 0;
    this.bank = eased(this.bank, Math.max(-MAX_BANK, Math.min(MAX_BANK, banking)), dt, EASE_BANK);
    if (speed > MOVING) {
      const sin = Math.sin(this.facing);
      const cos = Math.cos(this.facing);
      this.dirX = eased(this.dirX, (this.velX * cos - this.velZ * sin) / speed, dt, EASE_DIRECTION);
      this.dirZ = eased(this.dirZ, (this.velX * sin + this.velZ * cos) / speed, dt, EASE_DIRECTION);
    }
    // Which way its feet go from the way it faces: ahead unless it's holding its look elsewhere.
    const aside = Math.atan2(this.dirX, this.dirZ);
    const backward = Math.abs(aside) > BACKPEDAL;
    const hips = Math.max(-SIDESTEP, Math.min(SIDESTEP, backward ? wrap(aside + Math.PI) : aside));

    // Standing, into its stride as it gets going: the walk or the run, or between them, at the
    // point in the stride the feet have got to (run backward, a stride is the same one reversed).
    this.moving = eased(this.moving, p.grounded && pace > 0.02 ? 1 : 0, dt, EASE_MOVING);
    const striding = this.moving > 0.999 ? 1 : this.moving < 0.001 ? 0 : smooth(this.moving);
    if (striding < 1) {
      const through = this.stood / clips.idle.seconds;
      sample(out, clips.idle, through, true);
      // Mostly it only breathes: the head is held where the idle starts, ahead, but for one time
      // through in `glance`, which starts and ends there too.
      if (Math.floor(through) % style.glance !== style.glance - 1) out.set(this.ahead, HEAD_AT);
    }
    let grip = GRIP_IDLE;
    if (striding > 0) {
      const stride = striding < 1 ? other : out;
      const cycle = backward ? 1 - ((step / 2) % 1) : (step / 2) % 1;
      const running = smooth((pace - WALKS) / (RUNS - WALKS));
      if (running < 1) sample(stride, clips.walk, cycle, true);
      if (running > 0) sample(running < 1 ? third : stride, clips.run, cycle, true);
      if (running > 0 && running < 1) blend(stride, stride, third, running);
      if (style.arms !== undefined) blend(stride, stride, this.rest, 1 - style.arms, ARMS, LEGS);
      if (striding < 1) blend(out, out, other, striding);
      grip += (GRIP_RUN - GRIP_IDLE) * striding * running;
    }

    // A crouch, sunk into and risen out of: sat on its heels, or crawling.
    this.crouching = Math.min(1, Math.max(0, this.crouching + (p.crouch ? dt : -dt) / CROUCH_SECONDS));
    const sat = clips.crouch && p.grounded && !p.pound ? smooth(this.crouching) * (1 - striding) : 0;
    if (clips.crouch && this.crouching > 0) {
      sample(other, clips.crouch, this.stood / clips.crouch.seconds, true);
      // The crawl's limbs go by the footsteps' count, a hand down at each (gaits.ts `crawl`).
      if (clips.crawl && striding > 0) {
        sample(third, clips.crawl, step / 2, true);
        blend(other, other, third, striding);
      }
      blend(out, out, other, smooth(this.crouching));
    }

    // A landing, as hard as the drop from its highest point: into the crouch and back up out of it.
    if (p.grounded) {
      if (!this.grounded) {
        this.impact = Math.min(1, Math.sqrt(2 * GRAVITY * Math.max(0, this.peak - feetY)) / style.landSpeed);
        this.landing = 0;
      }
      this.peak = feetY;
    } else {
      if (this.grounded) this.falling = 0;
      this.peak = Math.max(this.peak, feetY);
      this.falling = Math.min(1, Math.max(0, this.falling + (this.sinking ? dt : -dt) / APEX_SECONDS));
    }
    this.grounded = p.grounded;
    this.landing += dt;
    if (this.landing < clips.land.seconds) {
      const through = this.landing / clips.land.seconds;
      sample(other, clips.land, through, false);
      blend(out, out, other, this.impact * Math.min(1, this.landing / LAND_IN) * (1 - smooth(through)));
    }

    // In the air: its jump going up and its fall coming down, by which way it last moved.
    const flipping = p.grounded || p.floating ? null : p.backflip ? clips.backflip : p.hop === 3 ? clips.triple : null;
    this.aloft = p.grounded ? 0 : this.aloft + dt;
    this.kicking = eased(this.kicking, p.thrusting ? 0 : 1, dt, EASE_KICKING);
    this.airborne = Math.min(
      1,
      Math.max(0, this.airborne + (p.grounded ? -dt / TOUCHDOWN_SECONDS : dt / TAKEOFF_SECONDS)),
    );
    if (this.airborne > 0) {
      const down = smooth(this.falling);
      // The second of a chain of jumps goes up and comes down its own way.
      const rise = (p.hop === 2 && clips.double) || clips.jump;
      sample(other, rise, this.aloft / rise.seconds, false);
      if (p.hop === 2 && clips.doubleFall) sample(third, clips.doubleFall, this.falling, false);
      else sample(third, clips.fall, this.aloft / clips.fall.seconds, true);
      blend(other, other, third, down);
      if (style.flutter && this.kicking > 0.001) {
        sample(third, clips.run, this.aloft * style.flutter, true);
        blend(other, other, third, this.kicking, LEGS);
      }
      // A long jump is its own way through the air, takeoff to landing.
      this.leaping = Math.min(1, Math.max(0, this.leaping + (p.leap ? dt : -dt) / TAKEOFF_SECONDS));
      if (clips.leap && this.leaping > 0) {
        sample(third, clips.leap, this.aloft / clips.leap.seconds, false);
        blend(other, other, third, smooth(this.leaping));
      }
      // And the third is one somersault, the whole body's, from takeoff to landing, as a backflip is.
      if (flipping) sample(other, flipping, this.aloft / (p.backflip ? this.backflip : this.flip), false);
      // A float is its own way of hanging there, whatever jump it was.
      this.floating = Math.min(1, Math.max(0, this.floating + (p.floating ? dt : -dt) / FLOAT_SECONDS));
      if (clips.float && this.floating > 0) {
        sample(third, clips.float, this.stood / clips.float.seconds, true);
        blend(other, other, third, smooth(this.floating));
      }
      const air = smooth(this.airborne);
      blend(out, out, other, air);
      grip += (GRIP_RUN + (GRIP_FALL - GRIP_RUN) * down - grip) * air;
    }

    // A ground pound takes the whole body: turning over for as long as the sim hangs it there, sat
    // for the drop, then landing sat and getting up, easing into whatever it does next.
    const spec = poundOf(this.kind);
    if (p.pound !== this.pound) {
      if (p.pound && !this.pound) this.turned = 0;
      if (p.pound === 'land') this.sat = 0;
      this.pound = p.pound;
    }
    this.turned += dt;
    this.sat += dt;
    const turning = p.pound === 'twirl' || p.pound === 'drop';
    let own = 0; // how much of the body is the pound's
    if (clips.pound && spec && turning) {
      sample(third, clips.pound, p.pound === 'drop' ? 1 : this.turned / spec.twirl, false);
      own = smooth(this.turned / POUND_IN);
      grip = GRIP_FALL;
    } else if (clips.pounded && this.sat < clips.pounded.seconds) {
      const through = this.sat / clips.pounded.seconds;
      sample(third, clips.pounded, through, false);
      own = 1 - smooth((through - GETS_UP) / (1 - GETS_UP));
    }
    if (own > 0) blend(out, out, third, own);

    const off = wrap(p.yaw - this.facing);
    const looks = flipping ? 0 : headShare(off) * (1 - own);
    const head = Math.max(-HEAD_LIMIT, Math.min(HEAD_LIMIT, off)) * looks;
    // A waddle: over the right foot as it comes down, the stride's start, and over the left at its middle.
    const rock = (style.waddle ?? 0) * striding * Math.cos(Math.PI * step);
    this.rig.play(out, grip, this.bank + rock, armed ? hips * striding : 0, head, p.pitch * style.follow * looks);
    // Sat in a crouch its hands are on its head, which the clip's arms reach only on the body it
    // was drawn for.
    if (sat > 0) this.rig.clasp(sat);
    // On its feet its hands rest on its skirt, if it has one; in the air its arms are the clip's own.
    this.rig.drape((1 - smooth(this.airborne)) * (1 - smooth(this.crouching)) * (1 - own), !armed);
    if (!turning && !flipping) this.arm(p);
    return walked;
  }

  // On a ladder, where the walker has put the body: each fist and foot on a rung of it, going up
  // in turn as the body climbs past, the hips in close and over the foot that bears them.
  protected override climb(p: RemotePlayer, feetY: number, dt: number): Pose {
    const posed = super.climb(p, feetY, dt);
    this.moving = this.airborne = this.impact = 0;
    const { rig, climbed, rungsAhead: ahead } = this;
    const held = this.worked;
    held.set(CLIMB);
    held[HIP_Z] = Math.max(-CLIMB_BACK, ahead - RUNG_EDGE - rig.shoulder.z - CLIMB_NEAR * rig.armLength);
    const over = Math.sin((climbed - limbLead(1, true)) * (Math.PI / 2));
    held[HIP_X] = CLIMB_SWAY * over;
    held[HIP_TILT] = CLIMB_TILT * over;
    for (const side of [-1, 1] as const) {
      const hand = rungHeld(climbed, limbLead(side, false), rig.shoulder.y + HANDS_UP * rig.armLength);
      rig.reach(held, side, side * HANDS_APART, hand, ahead - RUNG_EDGE);
      rig.tread(held, side, side * FEET_APART, rungHeld(climbed, limbLead(side, true), STEP_UP), ahead);
    }
    this.bank = 0;
    const off = wrap(p.yaw - this.facing);
    held[HEAD_TURN] = Math.max(-HEAD_LIMIT, Math.min(HEAD_LIMIT, off));
    held[HEAD_LEAN] += p.pitch * this.style.follow;
    rig.apply(held);
    this.arm(p);
    return posed;
  }

  // In a kart, where the walker has put it: sat on the seat with its feet on the pedals and its
  // fists on the grips, turning the wheel with them, leaning into the turn and its head to the look.
  protected override sit(p: RemotePlayer, seat: Seat): Pose {
    this.place(seat);
    this.base.rotation.set(0, 0, 0);
    this.base.position.set(0, 0, 0);
    this.moving = this.airborne = this.impact = this.bank = 0;
    const sat = this.worked;
    sat.set(SAT);
    this.rig.sit(sat, seat);
    sat[CHEST_TILT] = seat.wheel * SAT_TILT;
    const off = wrap(p.yaw - this.facing);
    sat[HEAD_TURN] = Math.max(-HEAD_LIMIT, Math.min(HEAD_LIMIT, off));
    sat[HEAD_LEAN] += p.pitch * this.style.follow;
    this.rig.apply(sat);
    return { phase: this.gait.phase, effort: 0, on: 'kart' };
  }

  override hide(): void {
    super.hide();
    this.sparkles?.set(false, this.root.position);
  }

  override dispose(): void {
    super.dispose();
    this.sparkles?.dispose();
  }

  protected override lie(): void {
    const { die } = this.clips;
    if (!die) {
      super.lie();
      this.rig.apply(this.style.dead);
      return;
    }
    // The clip takes the body over itself, from standing where it stood.
    this.base.rotation.set(0, 0, 0);
    this.base.position.set(0, 0, 0);
    sample(this.third, die, this.gone / die.seconds, false);
    blend(this.out, this.out, this.third, smooth(this.gone / DIE_IN));
    this.rig.play(this.out, 0, 0, 0, 0, 0);
  }

  // With something in its hand, the weapon arm, straight, along the look.
  private arm(p: RemotePlayer): void {
    if (!p.item || p.dead) return;
    this.rig.straighten();
    this.aim(p);
  }
}

// A skirt's vertices, each from the top of the skirt in the model's frame: the ones that follow a
// skirt bone before any other.
function cloth(model: JointedModel): [number, number, number][] {
  const names = Object.keys(model.bones);
  const top = model.bones.skirt1!;
  const at = new Int16Array(bytes(model.positions).buffer);
  const follows = bytes(model.boneIndices);
  const out: [number, number, number][] = [];
  for (let v = 0; v < at.length / 3; v++)
    if (names[follows[v * 4]].startsWith('skirt'))
      out.push([at[v * 3] / 1000 - top[0], at[v * 3 + 1] / 1000 - top[1], at[v * 3 + 2] / 1000 - top[2]]);
  return out;
}

// How far ahead of the hips' pivot the trunk reaches standing, in metres: the furthest of the
// vertices that follow the hips, the spine or the chest before any other bone, below the shoulders.
function trunkFront(model: JointedModel): number {
  const names = Object.keys(model.bones);
  const at = new Int16Array(bytes(model.positions).buffer);
  const follows = bytes(model.boneIndices);
  const shoulders = model.bones.armR[1];
  const hips = model.bones.hips[2];
  let front = 0;
  for (let v = 0; v < at.length / 3; v++)
    if (TRUNK.has(names[follows[v * 4]]) && at[v * 3 + 1] / 1000 < shoulders)
      front = Math.max(front, at[v * 3 + 2] / 1000 - hips);
  return front;
}
const TRUNK = new Set(['hips', 'spine', 'chest']);

// `value` on its way to `target`, `dt` seconds on, most of the way there after `seconds`.
function eased(value: number, target: number, dt: number, seconds: number): number {
  return value + (target - value) * (1 - Math.exp((-3 * dt) / seconds));
}

function wrap(angle: number): number {
  return ((angle + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
}

// The skeleton: the model's skin on its bones, what the walker needs of them, and the pose solver.
class Rig {
  readonly figure: Figure;
  private readonly skin: SkinnedBody<RigBone>;
  private readonly skirt: Skirt | null;
  private readonly hipsAt: Vector3; // the hips' pivot, standing
  private readonly bones: TransformNode[]; // the bones a clip turns, in a clip's order
  private gripped = -1; // how closed `play` last left the hands, none yet
  private readonly thigh: number; // metres, hip to knee
  private readonly shin: number; // knee to ankle
  private readonly ankle: number; // metres the ankle stands off the ground
  private readonly toe: number;
  private readonly heel: number;
  readonly shoulder: Vector3; // the right shoulder, standing
  // In the chest's frame, which the head and both arms hang in: each shoulder and the neck; and in
  // the head's, from the neck, where the right hand rests on it.
  private readonly shoulderL: Vector3;
  private readonly shoulderR: Vector3;
  private readonly neck: Vector3;
  private readonly temple: Vector3;
  private readonly palm: Vector3; // the right palm's middle from its wrist, in the hand's frame
  // The head's relief and the hand's (the model's `skull` and `mitt`), in metres: how far out the
  // head reaches at the points of a grid from (y, z) in its frame, and the hand's vertices from its
  // palm's middle as triples, along it, across it and how far under.
  private readonly skull: { y: number; z: number; cell: number; across: number; rows: number; far: Float32Array };
  private readonly mitt: Float32Array;
  private readonly wrist: number; // metres, elbow to wrist
  readonly armLength: number; // metres from a shoulder to its fist's middle, the arm straight
  private readonly front: number; // metres its trunk reaches ahead of the hips' pivot, below the shoulders
  private readonly upper: number; // metres, shoulder to elbow
  private readonly fore: number; // elbow to the fist's middle
  // Each leg's hip joint from the hips' pivot, and where its ankle stands.
  private readonly hipL: Vector3;
  private readonly hipR: Vector3;
  private readonly standL: Vector3;
  private readonly standR: Vector3;

  constructor(engine: Engine, id: string, spec: JointedSpec, base: TransformNode) {
    const { kind, model } = spec;
    const skin = new SkinnedBody<RigBone>(engine, `${kind}-${id}`, model, kind, PARENTS, base);
    this.skin = skin;
    this.bones = CLIP_BONES.map((bone) => skin.node(bone));
    const at = (bone: JointedBone) => Vector3.FromArray(model.bones[bone] as number[]);
    this.hipsAt = at('hips');
    this.thigh = Vector3.Distance(at('legR'), at('shinR'));
    this.shin = Vector3.Distance(at('shinR'), at('footR'));
    this.ankle = model.bones.footR[1];
    [this.toe, this.heel] = model.sole;
    this.hipL = at('legL').subtract(this.hipsAt);
    this.hipR = at('legR').subtract(this.hipsAt);
    this.standL = at('footL');
    this.standR = at('footR');
    this.shoulder = at('armR');
    this.shoulderL = at('armL').subtract(at('chest'));
    this.shoulderR = at('armR').subtract(at('chest'));
    this.neck = at('head').subtract(at('chest'));
    this.temple = Vector3.FromArray(model.temple as number[]).subtract(at('head'));
    this.palm = Vector3.FromArray(model.hand as number[]).subtract(at('handR'));
    const far = Float32Array.from(new Int16Array(bytes(model.skull.far).buffer), (mm) => mm / 1000);
    const { cell, across } = model.skull;
    this.skull = { y: model.skull.at[0], z: model.skull.at[1], cell, across, rows: far.length / across, far };
    this.mitt = Float32Array.from(new Int16Array(bytes(model.mitt).buffer), (mm) => mm / 1000);
    this.wrist = Vector3.Distance(at('forearmR'), at('handR'));
    this.upper = Vector3.Distance(at('armR'), at('forearmR'));
    this.fore = Vector3.Distance(at('forearmR'), Vector3.FromArray(model.hand as number[]));
    this.armLength = this.upper + this.fore;
    this.front = trunkFront(model);

    // A held item goes in the right palm, which the walker points along the look from the shoulder:
    // the arm's own length, straight, is its reach.
    // A held item is gripped in the right fist, the hand turned thumb up as a hand holds a pistol:
    // the palm's middle, with the fist's middle a little to the palm's side of it, turned with the
    // hand about the wrist. The grip hangs on the forearm, which stays as the model holds it while
    // the arm aims, so the walker turns the item along the look as it does for any arm.
    const armR = skin.node('armR');
    const palm = skin.offset('handR', model.hand);
    const grip = new TransformNode(`avatar-grip-${id}`, engine.scene);
    grip.parent = skin.node('forearmR');
    grip.position.copyFrom(skin.offset('forearmR', model.bones.handR));
    grip.position.addInPlaceFromFloats(palm.x, palm.z, palm.y + FIST);
    const chest = skin.node('chest');
    const hem = model.hem;
    const skirt = hem
      ? new Skirt(
          base,
          skin.node('hips'),
          SKIRT.map((bone) => skin.node(bone)),
          [
            [skin.node('legL'), skin.node('shinL'), skin.node('footL')],
            [skin.node('legR'), skin.node('shinR'), skin.node('footR')],
          ],
          { across: hem[0], ahead: hem[1], behind: hem[2], drop: hem[3] },
          bellOf(cloth(model), hem[3]),
        )
      : null;
    this.skirt = skirt;
    const tail = spec.tail
      ? new Tail(
          skin.node('head'),
          HAIR.filter((bone) => skin.has(bone)).map((bone) => skin.node(bone)),
          base.parent as TransformNode,
          spec.tail.map(([x, y, z]) => new Vector3(x, y, z).normalize()),
        )
      : null;
    this.figure = {
      armR: { node: armR, grip, reach: at('handR').subtract(at('armR')).normalize() },
      back: { node: chest, at: skin.offset('chest', model.back) },
      materials: [skin.material],
      shadow: spec.shadow,
      // The walker's own swings are none: every limb is posed here.
      legSwing: 0,
      airLegs: 0,
      armSwing: 0,
      bob: 0,
      lie: { onto: 'back', height: model.lie },
      extra:
        skirt || tail
          ? () => {
              skirt?.update();
              tail?.update();
            }
          : undefined,
      dispose: () => skin.dispose(),
    };
  }

  // A clip's moment onto the bones as it has them, with what a clip can't know laid over it: the
  // lean into a turn (`bank`, radians to the right), the hips turned toward where the feet go and
  // the chest back by as much (`aside`), the head to the look, and how closed the hands are.
  play(m: Motion, grip: number, bank: number, aside: number, headTurn: number, headLean: number): void {
    const leg = this.thigh + this.shin;
    const [hips, spine, , head] = this.bones;
    hips.position.set(this.hipsAt.x + m[0] * leg, this.hipsAt.y + m[1] * leg, this.hipsAt.z + m[2] * leg);
    for (let b = 0; b < this.bones.length; b++) {
      const o = turnAt(b);
      (this.bones[b].rotationQuaternion ??= new Quaternion()).set(m[o], m[o + 1], m[o + 2], m[o + 3]);
    }
    // A turn before a bone's own is in its parent's frame: the hips' is the body's.
    if (bank !== 0 || aside !== 0) {
      turned(aside, 0, bank, A);
      A.multiplyToRef(hips.rotationQuaternion!, hips.rotationQuaternion!);
    }
    if (aside !== 0) {
      turned(-aside, 0, 0, A);
      A.multiplyToRef(spine.rotationQuaternion!, spine.rotationQuaternion!);
    }
    if (headTurn !== 0 || headLean !== 0) {
      turned(headTurn, headLean, 0, A);
      head.rotationQuaternion!.multiplyInPlace(A);
    }
    this.grip(grip);
  }

  // Both hands closed `grip` of the way to fists: turned only when that has changed.
  private grip(grip: number): void {
    if (Math.abs(grip - this.gripped) < 0.01) return;
    this.gripped = grip;
    this.hand(-1, grip, 'fingersL', 'thumbL');
    this.hand(1, grip, 'fingersR', 'thumbR');
  }

  // Turns every joint to `pose`. The trunk's turns are the body's frame's, so each is taken into its
  // parent's; a leg is the two-bone triangle from its hip joint to where the pose puts its ankle,
  // the knee bent the way the foot points.
  apply(pose: BodyPose): void {
    const hips = this.skin.node('hips');
    hips.position.set(this.hipsAt.x + pose[HIP_X], this.hipsAt.y + pose[HIP_Y], this.hipsAt.z + pose[HIP_Z]);
    turned(pose[HIP_TURN], pose[HIP_LEAN], pose[HIP_TILT], HIPS);
    set(hips, HIPS);
    turned(pose[CHEST_TURN], pose[CHEST_LEAN], pose[CHEST_TILT], CHEST);
    Quaternion.SlerpToRef(HIPS, CHEST, 0.5, SPINE);
    within(HIPS, SPINE, this.skin.node('spine'));
    within(SPINE, CHEST, this.skin.node('chest'));
    turned(pose[HEAD_TURN], pose[HEAD_LEAN], pose[HEAD_TILT], HEAD);
    within(CHEST, HEAD, this.skin.node('head'));
    this.arm(pose, ARM_L, -1, 'armL', 'forearmL', 'handL', 'fingersL', 'thumbL');
    this.arm(pose, ARM_R, 1, 'armR', 'forearmR', 'handR', 'fingersR', 'thumbR');
    this.leg(pose, FOOT_L, hips, this.hipL, this.standL, 'legL', 'shinL', 'footL');
    this.leg(pose, FOOT_R, hips, this.hipR, this.standR, 'legR', 'shinR', 'footR');
    this.gripped = -1;
  }

  // Turns an arm of `pose` to put its fist's middle at a point in the body's frame (metres: to its
  // right, above where it stands, ahead), as near as the arm reaches, the elbow under it. The
  // shoulder is taken where the hips carry it: the trunk's own leans move it little.
  reach(pose: BodyPose, side: 1 | -1, x: number, y: number, z: number): void {
    const at = side < 0 ? ARM_L : ARM_R;
    const { upper, fore, shoulder } = this;
    const tx = x - side * shoulder.x - pose[HIP_X];
    const ty = y - shoulder.y - pose[HIP_Y];
    const tz = z - shoulder.z - pose[HIP_Z];
    const span = Math.min(upper + fore - 1e-4, Math.max(Math.abs(upper - fore) + 1e-4, Math.hypot(tx, ty, tz)));
    // The arm's triangle: the upper arm is off the line to the fist by its angle at the shoulder,
    // in the plane the elbow bends in, which the arm held `out` tips over to take in the fist.
    const along = (upper * upper + span * span - fore * fore) / (2 * upper);
    const ahead = Math.sqrt(Math.max(0, along * along - tx * tx));
    pose[at + ARM_SWING] = Math.atan2(tz, -ty) - Math.acos(Math.min(1, ahead / Math.hypot(ty, tz)));
    pose[at + ARM_OUT] = Math.atan2(side * tx, ahead);
    pose[at + ARM_ELBOW] = Math.PI - Math.acos((upper * upper + fore * fore - span * span) / (2 * upper * fore));
  }

  // Holds each hand out of the skirt, `weight` of the way from how the frame's pose has left the
  // arms: a clip hangs them by a body with no skirt, or a narrower one. An arm whose palm is in the
  // cloth is swung from the shoulder, whole, the least that lays the palm on it (soft.ts
  // `Skirt.clear`). The `right` arm is left alone where it has something to aim.
  drape(weight: number, right: boolean): void {
    const { skirt, skin } = this;
    if (!skirt || weight <= 0) return;
    // The chest in the frame the hips stand in: where it is and how it's turned.
    const hips = skin.node('hips');
    const spine = skin.node('spine');
    const chest = skin.node('chest');
    hips.rotationQuaternion!.multiplyToRef(spine.rotationQuaternion!, SPINE);
    SPINE.multiplyToRef(chest.rotationQuaternion!, CHEST);
    chest.position.rotateByQuaternionToRef(SPINE, NEAR);
    spine.position.rotateByQuaternionToRef(hips.rotationQuaternion!, STEP);
    NEAR.addInPlace(STEP).addInPlace(hips.position);
    for (const side of right ? ([-1, 1] as const) : ([-1] as const)) {
      const [a, f, h] = side < 0 ? LEFT_ARM : RIGHT_ARM;
      const arm = skin.node(a);
      const forearm = skin.node(f);
      const hand = skin.node(h);
      arm.position.rotateByQuaternionToRef(CHEST, ELBOW).addInPlace(NEAR);
      const shoulder = ELBOW;
      CHEST.multiplyToRef(arm.rotationQuaternion!, THIGH);
      let swung = false;
      // Swinging the arm out lifts the hand to where the skirt is narrower: three times round is near enough.
      for (let pass = 0; pass < 3; pass++) {
        THIGH.multiplyToRef(forearm.rotationQuaternion!, SHIN);
        SHIN.multiplyToRef(hand.rotationQuaternion!, HAND);
        PALM.set(side * this.palm.x, this.palm.y, this.palm.z).rotateByQuaternionToRef(HAND, PALM);
        PALM.addInPlace(hand.position.rotateByQuaternionToRef(SHIN, STEP));
        PALM.addInPlace(forearm.position.rotateByQuaternionToRef(THIGH, STEP)).addInPlace(shoulder);
        if (!skirt.clear(PALM, side, WRIST)) break;
        PALM.subtractInPlace(shoulder).normalize();
        WRIST.subtractInPlace(shoulder).normalize();
        Quaternion.FromUnitVectorsToRef(PALM, WRIST, A);
        A.multiplyToRef(THIGH, THIGH);
        swung = true;
      }
      if (!swung) continue;
      CHEST.conjugateToRef(B).multiplyToRef(THIGH, A);
      Quaternion.SlerpToRef(arm.rotationQuaternion!, A, weight, arm.rotationQuaternion!);
    }
  }

  // Lays each hand flat on its side of the head, `weight` of the way from how a clip's moment has
  // left the arms (`play`). A clip's arms are as long as the body it was drawn on, so on another
  // its hands miss the head or go into it. The hand lies in a plane beside the head, its palm at the
  // temple or as near it as the arm reaches, its fingers pointing away from the shoulder, the wrist
  // bent to keep it in the plane and the elbow under it; and the plane is as far out as rests the
  // hand on whatever of the head is under it there (`resting`), so it touches and is never in it.
  clasp(weight: number): void {
    const head = this.skin.node('head').rotationQuaternion!;
    const { upper, wrist } = this;
    const reach = CLASP_REACH * (upper + wrist);
    for (const side of [-1, 1] as const) {
      const shoulder = side < 0 ? this.shoulderL : this.shoulderR;
      // In the chest's frame, as the head is turned: the way out from the head, and the palm that
      // far out beside the temple, or as far toward it from the point of that plane nearest the
      // shoulder as leaves the wrist in reach. Where the hand comes to lie settles how far out it
      // rests, and that where it lies: twice round is near enough.
      AWAY.set(side, 0, 0).rotateByQuaternionToRef(head, AWAY);
      let out = this.temple.x;
      for (let pass = 0; pass < 2; pass++) {
        PALM.set(side * out, this.temple.y, this.temple.z);
        PALM.rotateByQuaternionToRef(head, PALM).addInPlace(this.neck);
        NEAR.copyFrom(shoulder).addInPlace(AWAY.scaleToRef(Vector3.Dot(PALM.subtract(shoulder), AWAY), STEP));
        PALM.subtractToRef(NEAR, ALONG);
        const far = ALONG.length();
        ALONG.scaleInPlace(1 / Math.max(far, 1e-6));
        const off = Vector3.Distance(NEAR, shoulder);
        const most = Math.sqrt(Math.max(0, reach * reach - off * off)) + this.palm.x;
        NEAR.addToRef(ALONG.scaleToRef(Math.min(far, most), STEP), PALM);
        alongArm(ALONG, side, AWAY, HAND);
        const rests = this.resting(PALM, HAND, head, side);
        PALM.addInPlace(AWAY.scaleToRef(rests - out, STEP));
        out = rests;
      }
      WRIST.set(side * this.palm.x, this.palm.y, this.palm.z).rotateByQuaternionToRef(HAND, WRIST);
      PALM.subtractToRef(WRIST, WRIST).subtractInPlace(shoulder);
      const span = Math.min(upper + wrist - 1e-4, Math.max(Math.abs(upper - wrist) + 1e-4, WRIST.length()));
      WRIST.normalize();
      // The arm's triangle, its elbow off the line toward the hips and a little out and ahead.
      POLE.set(side * 0.3, -1, 0.3);
      POLE.subtractInPlace(WRIST.scaleToRef(Vector3.Dot(POLE, WRIST), STEP)).normalize();
      const along = (upper * upper + span * span - wrist * wrist) / (2 * span);
      const off = Math.sqrt(Math.max(0, upper * upper - along * along));
      WRIST.scaleToRef(along, ELBOW).addInPlace(POLE.scaleToRef(off, STEP));
      WRIST.scaleToRef(span, FOREARM).subtractInPlace(ELBOW);
      alongArm(ELBOW, side, AWAY, THIGH);
      alongArm(FOREARM, side, AWAY, SHIN);
      const [a, f, h, fingers, thumb] = side < 0 ? LEFT_ARM : RIGHT_ARM;
      const arm = this.skin.node(a).rotationQuaternion!;
      Quaternion.SlerpToRef(arm, THIGH, weight, arm);
      THIGH.conjugateToRef(B).multiplyToRef(SHIN, A);
      const forearm = this.skin.node(f).rotationQuaternion!;
      Quaternion.SlerpToRef(forearm, A, weight, forearm);
      SHIN.conjugateToRef(B).multiplyToRef(HAND, A);
      const hand = this.skin.node(h).rotationQuaternion!;
      Quaternion.SlerpToRef(hand, A, weight, hand);
      // Open, as the model holds it: a closing hand's fingers go in toward the head.
      this.hand(side, GRIP_IDLE * (1 - weight), fingers, thumb);
    }
    this.gripped = -1;
  }

  // How far out from the head's middle the palm's middle has to be for a hand to rest on the head:
  // flat beside it on `side`, the palm's middle at `palm` (the chest's frame) and the hand turned
  // `hand`. Each vertex of the hand is held off whatever of the head it lies over.
  private resting(palm: Vector3, hand: Quaternion, head: Quaternion, side: 1 | -1): number {
    // In the head's frame: the palm's middle, and the ways along the hand and across it.
    head.conjugateToRef(B);
    palm.subtractToRef(this.neck, STEP).rotateByQuaternionToRef(B, STEP);
    UP.set(side, 0, 0).rotateByQuaternionToRef(hand, UP).rotateByQuaternionToRef(B, UP);
    AHEAD.set(0, 0, 1).rotateByQuaternionToRef(hand, AHEAD).rotateByQuaternionToRef(B, AHEAD);
    const { mitt } = this;
    let out = 0;
    for (let i = 0; i < mitt.length; i += 3) {
      const y = STEP.y + mitt[i] * UP.y + mitt[i + 1] * AHEAD.y;
      const z = STEP.z + mitt[i] * UP.z + mitt[i + 1] * AHEAD.z;
      const far = this.reaches(y, z);
      if (far > 0) out = Math.max(out, far + mitt[i + 2]);
    }
    return out + CLASP_CLEAR;
  }

  // How far out the head reaches at a spot up and ahead of the neck in its frame, between the
  // points of its relief; none where there is no head.
  private reaches(y: number, z: number): number {
    const { cell, across, rows, far } = this.skull;
    const r = (y - this.skull.y) / cell;
    const c = (z - this.skull.z) / cell;
    const row = Math.floor(r);
    const column = Math.floor(c);
    const at = (i: number, j: number) => (i < 0 || i >= rows || j < 0 || j >= across ? 0 : far[i * across + j]);
    const low = at(row, column) + (at(row, column + 1) - at(row, column)) * (c - column);
    const high = at(row + 1, column) + (at(row + 1, column + 1) - at(row + 1, column)) * (c - column);
    return low + (high - low) * (r - row);
  }

  // Sits `pose` in `seat`, whose frame is the body's: its hips' pivot SAT_HIPS of a thigh over the
  // middle of the seat's top, or back from it as far as keeps its trunk behind the steering wheel's
  // middle (a belly the wheel would be lost in), a foot on each pedal and a fist on each grip.
  sit(pose: BodyPose, seat: Seat): void {
    pose[HIP_X] = -this.hipsAt.x;
    pose[HIP_Y] = SAT_HIPS * this.thigh - this.hipsAt.y;
    pose[HIP_Z] = Math.min(0, seat.hub.z - this.front) - this.hipsAt.z;
    const { feet, grips } = seat;
    for (const side of [-1, 1] as const) {
      this.tread(pose, side, side * feet.x, feet.y, feet.z);
      const grip = grips[side < 0 ? 0 : 1];
      this.reach(pose, side, grip.x, grip.y, grip.z);
    }
  }

  // Puts a foot of `pose` with the ball of its sole at a point in the body's frame, as `reach` does
  // a fist.
  tread(pose: BodyPose, side: 1 | -1, x: number, y: number, z: number): void {
    const at = side < 0 ? FOOT_L : FOOT_R;
    const stand = side < 0 ? this.standL : this.standR;
    pose[at + FOOT_X] = x - stand.x;
    pose[at + FOOT_Y] = y;
    pose[at + FOOT_Z] = z - stand.z - this.toe / 2;
  }

  // The weapon arm from the shoulder down as the model holds it, straight, its hand closed on the
  // grip: what the walker aims.
  straighten(): void {
    set(this.skin.node('forearmR'), IDENTITY);
    set(this.skin.node('handR'), THUMB_UP);
    this.hand(1, 1, 'fingersR', 'thumbR');
    this.gripped = -1;
  }

  // An arm the model holds straight out to `side`: turned about its own length, then down to
  // hanging less how far it's held out, then swung ahead; the elbow bends the forearm the way a
  // hanging arm's faces, forward.
  private arm(
    pose: BodyPose,
    at: number,
    side: 1 | -1,
    upper: JointedBone,
    fore: JointedBone,
    hand: JointedBone,
    fingers: JointedBone,
    thumb: JointedBone,
  ): void {
    Quaternion.RotationYawPitchRollToRef(0, -pose[at + ARM_SWING], -side * (Math.PI / 2 - pose[at + ARM_OUT]), A);
    Quaternion.RotationAxisToRef(Vector3.RightReadOnly, pose[at + ARM_IN], B);
    set(this.skin.node(upper), A.multiplyInPlace(B));
    Quaternion.RotationAxisToRef(Vector3.UpReadOnly, -side * pose[at + ARM_ELBOW], A);
    set(this.skin.node(fore), A);
    set(this.skin.node(hand), IDENTITY);
    this.hand(side, pose[at + ARM_GRIP], fingers, thumb);
  }

  // The hand the model holds flat, palm down, closed `grip` of the way to a fist: the fingers fold
  // under it at the knuckles and the thumb comes round under them.
  private hand(side: 1 | -1, grip: number, fingers: JointedBone, thumb: JointedBone): void {
    Quaternion.RotationAxisToRef(Vector3.LeftHandedForwardReadOnly, -side * FINGER_CURL * grip, A);
    set(this.skin.node(fingers), A);
    Quaternion.RotationYawPitchRollToRef(-side * THUMB_FOLD * grip, THUMB_CURL * grip, 0, A);
    set(this.skin.node(thumb), A);
  }

  private leg(
    pose: BodyPose,
    at: number,
    hips: TransformNode,
    joint: Vector3,
    stand: Vector3,
    upper: JointedBone,
    lower: JointedBone,
    foot: JointedBone,
  ): void {
    // The hip joint, where the hips have been put and turned.
    joint.rotateByQuaternionToRef(HIPS, HIP).addInPlace(hips.position);
    // The ankle over where the sole is put: a foot tipped onto its toe or its heel stands on that.
    const pitch = pose[at + FOOT_PITCH];
    const tip = (pitch > 0 ? this.toe : this.heel) * Math.abs(Math.sin(pitch));
    ANKLE.set(
      stand.x + pose[at + FOOT_X],
      pose[at + FOOT_Y] + this.ankle * Math.cos(pitch) + tip,
      stand.z + pose[at + FOOT_Z],
    );
    const yaw = pose[at + FOOT_YAW];
    FORWARD.set(Math.sin(yaw), 0, Math.cos(yaw));
    // The leg's triangle: hip to ankle is one side, no longer than the leg straight and no shorter
    // than it folded, and the knee is off that line on the side the foot points.
    ANKLE.subtractToRef(HIP, DOWN);
    const far = this.thigh + this.shin - 1e-4;
    const near = Math.abs(this.thigh - this.shin) + 1e-4;
    const span = Math.min(far, Math.max(near, DOWN.length()));
    DOWN.normalize();
    Vector3.CrossToRef(FORWARD, DOWN, HINGE);
    if (HINGE.lengthSquared() < 1e-8) HINGE.copyFrom(Vector3.RightReadOnly);
    HINGE.normalize();
    Vector3.CrossToRef(DOWN, HINGE, KNEEWARD);
    const cos = (this.thigh * this.thigh + span * span - this.shin * this.shin) / (2 * this.thigh * span);
    const sin = Math.sqrt(Math.max(0, 1 - cos * cos));
    // Hip to knee and knee to ankle, each bone's frame its length up it with the knee's hinge across.
    DOWN.scaleToRef(this.thigh * cos, KNEE).addInPlace(KNEEWARD.scaleToRef(this.thigh * sin, STEP));
    DOWN.scaleToRef(span, STEP).subtractInPlace(KNEE);
    framed(KNEE, THIGH);
    framed(STEP, SHIN);
    within(HIPS, THIGH, this.skin.node(upper));
    within(THIGH, SHIN, this.skin.node(lower));
    Quaternion.RotationYawPitchRollToRef(yaw, pitch, 0, A);
    within(SHIN, A, this.skin.node(foot));
  }
}

// Scratch for the frame's arithmetic, shared by every jointed body: none of it survives a call.
const IDENTITY = Quaternion.Identity();
const PALM = new Vector3();
const AWAY = new Vector3();
const POLE = new Vector3();
const ELBOW = new Vector3();
const WRIST = new Vector3();
const NEAR = new Vector3();
const FOREARM = new Vector3();
const ALONG = new Vector3();
const HAND = new Quaternion();
const LEFT_ARM = ['armL', 'forearmL', 'handL', 'fingersL', 'thumbL'] as const;
const RIGHT_ARM = ['armR', 'forearmR', 'handR', 'fingersR', 'thumbR'] as const;
const CLASP_CLEAR = 0.02; // metres a hand resting on the head is held off it
const CLASP_REACH = 0.97; // the share of its length, shoulder to wrist, an arm reaches to lay a hand by the head
// The right hand, which the model holds palm down, turned about the arm's length to thumb up.
const THUMB_UP = Quaternion.RotationAxis(Vector3.RightReadOnly, -Math.PI / 2);
const HIPS = new Quaternion();
const SPINE = new Quaternion();
const CHEST = new Quaternion();
const HEAD = new Quaternion();
const THIGH = new Quaternion();
const SHIN = new Quaternion();
const A = new Quaternion();
const B = new Quaternion();
const HIP = new Vector3();
const ANKLE = new Vector3();
const FORWARD = new Vector3();
const DOWN = new Vector3();
const HINGE = new Vector3();
const KNEEWARD = new Vector3();
const KNEE = new Vector3();
const STEP = new Vector3();
const UNDER = new Vector3();
const UP = new Vector3();
const AHEAD = new Vector3();

// A turn in the body's frame: to the right, leaning forward, tilted right side down.
function turned(turn: number, lean: number, tilt: number, result: Quaternion): void {
  Quaternion.RotationYawPitchRollToRef(turn, lean, -tilt, result);
}

function set(node: TransformNode, turn: Quaternion): void {
  (node.rotationQuaternion ??= new Quaternion()).copyFrom(turn);
}

// Gives `node` the turn that, under a parent turned `parent`, leaves it turned `turn` (a
// quaternion product applies its right factor first).
function within(parent: Quaternion, turn: Quaternion, node: TransformNode): void {
  parent.conjugateToRef(B);
  B.multiplyToRef(turn, (node.rotationQuaternion ??= new Quaternion()));
}

// The turn of an arm bone on `side` that runs along `out` from its joint, in its parent's frame,
// the back of its hand toward `back`: its frame's x away from the body's middle, its y that back.
function alongArm(out: Vector3, side: 1 | -1, back: Vector3, result: Quaternion): void {
  out.scaleToRef(side / out.length(), HINGE);
  back.subtractToRef(HINGE.scaleToRef(Vector3.Dot(back, HINGE), STEP), UP).normalize();
  Vector3.CrossToRef(HINGE, UP, AHEAD);
  Quaternion.RotationQuaternionFromAxisToRef(HINGE, UP, AHEAD, result);
}

// The turn of a leg bone that runs along `down` from its joint, HINGE across it: its frame's y back
// up the bone, its x the hinge.
function framed(down: Vector3, result: Quaternion): void {
  down.scaleToRef(-1 / down.length(), UP);
  Vector3.CrossToRef(HINGE, UP, AHEAD);
  Quaternion.RotationQuaternionFromAxisToRef(HINGE, UP, AHEAD, result);
}
