// What hangs off a jointed body and moves by itself (Jointed.ts `SoftBone`): a skirt, which keeps
// itself over the legs under it, and a tail of hair, which hangs and swings. Neither is in a clip:
// each is worked out after the frame's pose, from where that pose has put the body.
import { Quaternion, Vector3, type TransformNode } from '@babylonjs/core';

// A skirt's hem as its model has it, in metres: how far it reaches from the skirt's middle to each
// side, ahead and behind, and how far below the top of the skirt it is.
export interface Hem {
  readonly across: number;
  readonly ahead: number;
  readonly behind: number;
  readonly drop: number;
}

const KNEE_ROOM = 0.2; // radians of skirt kept clear round a knee, which is thicker than its joint
const FOOT_SHOWS = 0.12; // radians past the hem a joint down at the hem may be: a foot shows under a skirt at the end of a step
const HEM_NEAR = 0.9; // the share of the skirt's length down from which that begins
const MAX_SHIFT = 0.5; // radians from straight down a skirt's hem is carried ahead or behind to stay over the legs
const TOP_LEANS = 0.6; // the share of that the top of the skirt leans, the hem carried the rest and kept level
const MAX_TIP = 0.9; // radians the whole skirt tips after that, over legs held out further still: sat, or tucked
const MAX_LEAN = 0.35; // and to a side
const MAX_SPREAD = 1.3; // times its own width a hem is pushed out by legs wider apart than it
const SHORTEST = 0.4; // the share of its length a skirt is gathered to at the least, over hips nearly on the floor
// Radians the hips are from upright where a skirt starts to go with them, and where it has gone all the way.
const GOES_OVER = 0.9;
const GONE_OVER = 1.6;
const SKIRT_EASE = 0.09; // seconds a skirt takes to follow the legs: stiff cloth, a moment behind them

// A skirt: a stiff bell hung from the hips, its top ring's bone with a ring halfway down and the
// hem's under it. It hangs straight down the body's frame however the hips lean, until they go
// right over; it leans, and its hem is
// carried, level, only as far as keeps both knees and both ankles under it, the middle ring half
// as far, and pushed wider where they are further apart than it is; over legs held out further
// than the hem can be carried the whole skirt tips after them; and it is gathered up short of the
// floor when the hips come down.
export class Skirt {
  private readonly ahead: number; // radians from straight down its hem reaches, ahead, behind and to a side
  private readonly behind: number;
  private readonly across: number;
  private readonly rings: readonly { node: TransformNode; hangs: Vector3; share: number }[]; // the rings under the top one, and the share of the hem's shift each adds
  private fore = 0; // radians from straight down the hem's middle is carried ahead
  private aside = 0; // and to the body's right
  private deep = 1; // how many times its own depth the hem is pushed out to, fore and aft
  private wide = 1; // and its width
  private length = 1; // the share of its length it hangs to
  private drawn: number | null = null;

  // `rings` are the skirt's bones from the top down, and `legs` each leg's from the hip joint
  // down: thigh, shin, foot.
  constructor(
    private readonly base: TransformNode,
    private readonly hips: TransformNode,
    rings: readonly TransformNode[],
    private readonly legs: readonly (readonly [TransformNode, TransformNode, TransformNode])[],
    private readonly hem: Hem,
  ) {
    this.ahead = Math.atan2(hem.ahead, hem.drop);
    this.behind = Math.atan2(hem.behind, hem.drop);
    this.across = Math.atan2(hem.across, hem.drop);
    this.top = rings[0];
    const under = rings.slice(1);
    this.rings = under.map((node) => ({ node, hangs: node.position.clone(), share: 1 / under.length }));
  }

  private readonly top: TransformNode;

  update(): void {
    const now = performance.now() / 1000;
    const dt = this.drawn === null ? Infinity : Math.min(0.1, now - this.drawn);
    this.drawn = now;
    // The skirt's own frame is the body's while the hips are anywhere near upright, and comes round
    // to the hips' as they go over (a somersault takes the skirt with it). In that frame, from the
    // top of the skirt: each knee and ankle as an angle from straight down, ahead and to the right.
    const hips = this.hips.rotationQuaternion ?? Quaternion.Identity();
    STEP.set(0, 1, 0).rotateByQuaternionToRef(hips, STEP);
    const over = Math.acos(Math.max(-1, Math.min(1, STEP.y)));
    const turned = Math.max(0, Math.min(1, (over - GOES_OVER) / (GONE_OVER - GOES_OVER)));
    Quaternion.SlerpToRef(UPRIGHT, hips, turned * turned * (3 - 2 * turned), FRAME);
    FRAME.conjugateToRef(BACK);
    this.top.position.rotateByQuaternionToRef(hips, TOP).addInPlace(this.hips.position);
    let front = -Infinity;
    let back = Infinity;
    let right = -Infinity;
    let left = Infinity;
    for (const [thigh, shin, foot] of this.legs) {
      thigh.position.rotateByQuaternionToRef(hips, JOINT).addInPlace(this.hips.position);
      hips.multiplyToRef(thigh.rotationQuaternion ?? Quaternion.Identity(), TURN);
      for (const bone of [shin, foot]) {
        JOINT.addInPlace(bone.position.rotateByQuaternionToRef(TURN, STEP));
        TURN.multiplyInPlace(bone.rotationQuaternion ?? Quaternion.Identity());
        JOINT.subtractToRef(TOP, STEP).rotateByQuaternionToRef(BACK, STEP);
        const down = Math.max(1e-3, -STEP.y);
        // A joint down at the hem may show under it; one higher up is kept well inside the cloth.
        const low = Math.max(0, Math.min(1, (down / (this.hem.drop * this.length) - HEM_NEAR) / (1 - HEM_NEAR)));
        const room = KNEE_ROOM - (KNEE_ROOM + FOOT_SHOWS) * low;
        const fore = Math.atan2(STEP.z, down);
        const side = Math.atan2(STEP.x, down);
        front = Math.max(front, fore + room);
        back = Math.min(back, fore - room);
        right = Math.max(right, side + room);
        left = Math.min(left, side - room);
      }
    }
    const fore = fitted(back, front, this.behind, this.ahead, MAX_SHIFT + MAX_TIP);
    const side = fitted(left, right, this.across, this.across, MAX_LEAN);
    const k = 1 - Math.exp((-3 * dt) / SKIRT_EASE);
    this.fore += (fore.turn - this.fore) * k;
    this.aside += (side.turn - this.aside) * k;
    this.deep += (fore.spread - this.deep) * k;
    this.wide += (side.spread - this.wide) * k;
    const reach = this.hem.drop * Math.cos(Math.max(0, Math.abs(this.fore) - MAX_SHIFT));
    const length = Math.max(SHORTEST, Math.min(1, (TOP.y + this.base.position.y) / reach)) * (1 - turned) + turned;
    this.length += (length - this.length) * k;
    // Hung in its frame, whatever the hips are doing. The top ring, which most of the bell is on,
    // leans a share of the way after the legs and takes the spread, so the cloth over the knees
    // goes with them; the rings under it carry the hem the rest of the way and bring it back level.
    const carried = Math.max(-MAX_SHIFT, Math.min(MAX_SHIFT, this.fore));
    const leant = carried * TOP_LEANS;
    const leantAside = this.aside * TOP_LEANS;
    Quaternion.RotationYawPitchRollToRef(0, leant - this.fore, leantAside, TURN);
    hips
      .conjugateToRef((this.top.rotationQuaternion ??= new Quaternion()))
      .multiplyInPlace(FRAME)
      .multiplyInPlace(TURN);
    this.top.scaling.set(this.wide, this.length, this.deep);
    const x = (Math.tan(this.aside) - Math.tan(leantAside)) * this.hem.drop * this.length;
    const z = (Math.tan(carried) - Math.tan(leant)) * this.hem.drop * this.length;
    const last = this.rings.length - 1;
    this.rings.forEach(({ node, hangs, share }, i) => {
      node.position.set(hangs.x + (x * share) / this.wide, hangs.y, hangs.z + (z * share) / this.deep);
      Quaternion.RotationYawPitchRollToRef(
        0,
        i === last ? leant : 0,
        i === last ? -leantAside : 0,
        (node.rotationQuaternion ??= new Quaternion()),
      );
    });
  }
}

// How far a skirt's hem is carried, and how many times its own reach it spreads, to hold everything
// between the angles `low` and `high` (from straight down) when it reaches `under` below and `over`
// above: nowhere while they fit as it hangs, the least that fits them, and where nothing does,
// centred on them and spread to cover.
function fitted(
  low: number,
  high: number,
  under: number,
  over: number,
  most: number,
): { turn: number; spread: number } {
  const least = high - over;
  const greatest = low + under;
  if (least <= greatest)
    return { turn: Math.max(-most, Math.min(most, Math.max(least, Math.min(greatest, 0)))), spread: 1 };
  const turn = Math.max(-most, Math.min(most, (least + greatest) / 2));
  const reach = Math.min(1.2, (high - low) / 2);
  return { turn, spread: Math.min(MAX_SPREAD, Math.tan(reach) / Math.tan((under + over) / 2)) };
}

// A tail's hang: m/s² it falls at, how hard it is pulled back to the way it is dressed (1/s²,
// lighter down its length, so its end swings freest) and how soon it stops swinging (1/s).
const TAIL_GRAVITY = 14;
const TAIL_SPRING = 120;
const TAIL_SPRING_FADE = 0.45; // each link's pull, as a share of the link's above it
const TAIL_DRAG = 8;
const TAIL_WAKE = 0.9; // the share of the body's own speed the air round the tail has: it trails a run only a little
// The share of the ball its root sits on that the tail is kept off: the rest of the way in, the
// back of a head is hair, which the tail lies in when the head tips forward.
const BALL_SHARE = 0.5;
const TAIL_GIRTH = 0.06; // metres of hair round the tail's middle, kept off the head and the floor
const TAIL_STEP = 1 / 90; // seconds its swing is worked out a step of
const BODY_SMOOTH = 0.12; // seconds the body's speed is taken over
const MAX_PUSH = 30; // m/s² of the body's speeding up or slowing that the tail feels at the most
const SNAPPED = 1.5; // metres the body moves in a frame that can only be a respawn: it has no speed from that

// A tail of hair: a chain of bones from the head, each hung from the last. Each link's end is a
// point that falls, is pulled toward where the tail's dressing would have it (`dressed`: the way
// each link runs from the head, top to tip, in the frame of the way the head faces across the
// floor), drags, and is kept its link's length from the
// one above it, off the head (a ball the root sits on), behind it, and off the floor; the bones are then turned
// to run point to point. The points are kept from where the body stands, turned as the world is,
// so the tail swings behind a turn and a nod; of the body's own travel it feels only the speed,
// taken over a moment (a body is moved a sim tick at a time, not every frame): the air of a run or
// a fall, and the push of a start or a stop across the floor (a fall's would float it weightless).
export class Tail {
  private readonly chain: TransformNode[]; // the head and everything it hangs from, top down
  private readonly at: Vector3[]; // each link's end, from where the body stands
  private readonly speed: Vector3[];
  private readonly bound: Vector3[]; // the way each link runs as the model was bound, in its parent's frame
  private readonly lengths: number[];
  private readonly ball: Vector3; // the head's ball, from the head's pivot, and its radius
  private readonly radius: number;
  private readonly root = new Vector3(); // where its root last was, from where the body stood
  private readonly stood = new Vector3(); // where the body last stood, in the world
  private readonly going = new Vector3(); // the body's speed, m/s
  private drawn: number | null = null;

  constructor(
    private readonly head: TransformNode,
    private readonly links: readonly TransformNode[],
    private readonly ground: TransformNode, // stands on the floor under the body
    private readonly dressed: readonly Vector3[],
  ) {
    this.chain = [];
    for (let node: TransformNode | null = head; node; node = node.parent as TransformNode | null)
      this.chain.unshift(node);
    this.at = links.map(() => new Vector3());
    this.speed = links.map(() => new Vector3());
    const runs = links.map((_, i) => links[Math.min(i + 1, links.length - 1)].position);
    this.lengths = runs.map((run) => run.length());
    this.bound = runs.map((run) => run.normalizeToNew());
    const root = links[0].position;
    this.ball = new Vector3(0, root.y * 0.6, 0);
    this.radius = Vector3.Distance(this.ball, root) * BALL_SHARE;
  }

  update(): void {
    const now = performance.now() / 1000;
    const fresh = this.drawn === null;
    const dt = fresh ? 0 : Math.min(0.05, now - this.drawn!);
    this.drawn = now;
    for (const node of this.chain) node.computeWorldMatrix(true);
    const world = this.head.getWorldMatrix();
    world.decompose(SCALE, HEAD, undefined);
    const size = SCALE.y;
    // The way the head faces across the floor: the hair is dressed to hang, whichever way the head tips.
    STEP.set(0, 0, 1).rotateByQuaternionToRef(HEAD, STEP);
    Quaternion.RotationYawPitchRollToRef(Math.atan2(STEP.x, STEP.z), 0, 0, FACING);
    AHEAD.set(0, 0, 1).rotateByQuaternionToRef(FACING, AHEAD);
    // The body's speed, and how it is changing.
    const stands = this.ground.getAbsolutePosition();
    stands.subtractToRef(this.stood, STEP);
    this.stood.copyFrom(stands);
    PUSH.copyFrom(this.going);
    if (dt <= 0 || STEP.length() > SNAPPED * size) this.going.setAll(0);
    else
      this.going.addInPlace(
        STEP.scaleInPlace(1 / dt)
          .subtractInPlace(this.going)
          .scaleInPlace(1 - Math.exp(-dt / BODY_SMOOTH)),
      );
    if (dt > 0) this.going.subtractToRef(PUSH, PUSH).scaleInPlace(1 / dt);
    PUSH.y = 0;
    const push = PUSH.length();
    if (!(dt > 0)) PUSH.setAll(0);
    else if (push > MAX_PUSH * size) PUSH.scaleInPlace((MAX_PUSH * size) / push);
    this.going.scaleToRef(TAIL_WAKE - 1, WIND);
    Vector3.TransformCoordinatesToRef(this.links[0].position, world, ROOT).subtractInPlace(stands);
    Vector3.TransformCoordinatesToRef(this.ball, world, BALL).subtractInPlace(stands);
    const floor = TAIL_GIRTH * size;
    // The root is carried from where it was to where it is over the steps.
    ROOT.subtractToRef(this.root, CARRIED);
    const steps = dt > 0 ? Math.ceil(dt / TAIL_STEP) : 1;
    const h = dt / steps;
    for (let step = 1; step <= steps; step++) {
      const short = dt > 0 ? 1 - step / steps : 0; // the share of this frame's move the head has still to make
      ROOT.subtractToRef(CARRIED.scaleToRef(short, STEP), HANG);
      BALL.subtractToRef(STEP, HEADBALL);
      let above = HANG;
      let spring = TAIL_SPRING;
      for (let i = 0; i < this.at.length; i++) {
        const at = this.at[i];
        const speed = this.speed[i];
        const length = this.lengths[i] * size;
        this.dressed[i].rotateByQuaternionToRef(FACING, STEP).scaleInPlace(length).addInPlace(above);
        if (!(dt > 0)) {
          if (fresh) at.copyFrom(STEP);
        } else {
          WAS.copyFrom(at);
          STEP.subtractInPlace(at).scaleInPlace(spring * h);
          speed.addInPlace(STEP).subtractInPlace(PUSH.scaleToRef(h, STEP));
          speed.y -= TAIL_GRAVITY * size * h;
          speed
            .subtractInPlace(WIND)
            .scaleInPlace(Math.exp(-TAIL_DRAG * h))
            .addInPlace(WIND);
          at.addInPlace(speed.scaleToRef(h, STEP));
          // Off the head, off the floor, and its link's length from the point above.
          at.subtractToRef(HEADBALL, STEP);
          const out = STEP.length();
          const clear = (this.radius + TAIL_GIRTH) * size;
          if (out < clear) at.addInPlace(STEP.scaleInPlace((clear - out) / Math.max(out, 1e-6)));
          // And behind the head: a tail thrown over the top would lie there.
          const ahead = Vector3.Dot(at.subtractToRef(HEADBALL, STEP), AHEAD);
          if (ahead > 0) at.subtractInPlace(AHEAD.scaleToRef(ahead, STEP));
          at.y = Math.max(at.y, floor);
          at.subtractToRef(above, STEP).normalize().scaleInPlace(length);
          above.addToRef(STEP, at);
          at.subtractToRef(WAS, speed).scaleInPlace(1 / h);
        }
        above = at;
        spring *= TAIL_SPRING_FADE;
      }
    }
    this.root.copyFrom(ROOT);
    // Each bone turned, in its parent, from the way it was bound to the way to its point.
    let above = ROOT;
    TURN.copyFrom(HEAD);
    for (let i = 0; i < this.links.length; i++) {
      this.at[i].subtractToRef(above, STEP).normalize();
      TURN.conjugateToRef(BACK);
      STEP.rotateByQuaternionToRef(BACK, STEP);
      const turn = (this.links[i].rotationQuaternion ??= new Quaternion());
      Quaternion.FromUnitVectorsToRef(this.bound[i], STEP, turn);
      TURN.multiplyInPlace(turn);
      above = this.at[i];
    }
  }
}

const TOP = new Vector3();
const JOINT = new Vector3();
const STEP = new Vector3();
const WAS = new Vector3();
const ROOT = new Vector3();
const HANG = new Vector3();
const CARRIED = new Vector3();
const WIND = new Vector3();
const AHEAD = new Vector3();
const PUSH = new Vector3();
const HEADBALL = new Vector3();
const BALL = new Vector3();
const SCALE = new Vector3();
const TURN = new Quaternion();
const FRAME = new Quaternion();
const FACING = new Quaternion();
const UPRIGHT = Quaternion.Identity();
const BACK = new Quaternion();
const HEAD = new Quaternion();
