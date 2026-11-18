// Loads each interior (sim/interiors.ts) while it's wanted, draws it only while it could be seen,
// and lets it go once it's far off and long unseen, through whatever is registered as part of it (a
// model's floor of rooms, a storey's wall frames).
//
// Seen: from inside a building every one of its interiors is. From outside, an interior is while an
// opening of it is in view with the camera on the side it opens to and its door, if it has one, not
// shut, and so is whatever that interior shows. Nothing about seeing waits on distance: once loaded,
// an interior through a door across the world is drawn, fogged as anything that far is.
//
// Wanted, which loads it: from inside its building or within NEAR of it, whatever's in view (so a
// door swung open in front of you shows the rooms already there), and while it's seen through an
// opening within SIGHT, or through a scope within SCOPED_SIGHT with the opening in the scope's circle
// (or within GRACE of it, so one at its edge comes a moment before it's in): as far as the fog lets
// anything be seen either way, so no doorway shows clearly with nothing behind it.
//
// Let go, which unloads it until it's wanted again: once loaded, when the camera is more than LET_GO
// from its building and it hasn't been seen or wanted for FORGET seconds. LET_GO is well past SIGHT, so
// walking back and forth across one line can't load and unload it over and over; one a scope
// fetched from further off is kept while it's looked at, and coming back fetches it again from the
// browser's cache. These distances are set against the rest of the client's (CLAUDE.md, Client
// loading): audit them together.
import { Axis, BoundingBox, Frustum, Vector3, type Camera, type Plane } from '@babylonjs/core';
import { SCOPED_SIGHT, SIGHT, type InteriorBuilding, type Opening } from '@world/shared';

const NEAR = 25; // metres from a building's round within which all its interiors are wanted
const GRACE = 0.05; // radians round the scope's circle an opening is wanted from
const LET_GO = 200; // metres from its building past which an interior unseen for FORGET is unloaded
const FORGET = 30; // seconds

interface Watched {
  opening: Opening;
  box: BoundingBox;
  centre: Vector3;
  radius: number; // from the centre to a corner
  out: Vector3;
}

// Something drawn as part of an interior: `load` fetches and builds it, begun whenever the interior
// is wanted and it isn't here, and `unload` lets all of it go again (a part that's there from the
// start has neither); `show` is told whether to draw it, once it's loaded and whenever that changes.
export interface InteriorPart {
  load?: () => Promise<void>;
  unload?: () => void;
  show: (on: boolean) => void;
}

interface Registered extends InteriorPart {
  status: 'gone' | 'loading' | 'here';
}

interface State {
  building: InteriorBuilding;
  seen: boolean;
  keptAt: number; // performance.now() when last seen or wanted
}

export class Interiors {
  // Want and draw every interior whatever is in view: what the culling is checked against.
  everything = false;
  private readonly openings = new Map<string, Watched[]>();
  // Each building's upright cylinder as a box: none of its openings is in view unless this is.
  private readonly boxes = new Map<InteriorBuilding, BoundingBox>();
  private readonly parts = new Map<string, Registered[]>();
  private readonly states = new Map<string, State>();

  // `ajar` says whether a sim door is open, or still swinging: shut, its opening shows nothing.
  constructor(
    private readonly buildings: readonly InteriorBuilding[],
    private readonly ajar: (door: string) => boolean,
  ) {
    for (const b of buildings) {
      this.boxes.set(
        b,
        new BoundingBox(new Vector3(b.x - b.r, b.bottom, b.z - b.r), new Vector3(b.x + b.r, b.top, b.z + b.r)),
      );
      for (const interior of b.interiors) {
        this.openings.set(interior.id, interior.openings.map(watch));
        this.states.set(interior.id, { building: b, seen: false, keptAt: -Infinity });
      }
    }
  }

  add(id: string, part: InteriorPart): void {
    const state = this.states.get(id);
    if (!state) throw new Error(`no interior ${id}`);
    const registered: Registered = { ...part, status: part.load ? 'gone' : 'here' };
    this.parts.set(id, [...(this.parts.get(id) ?? []), registered]);
    if (registered.status === 'here') registered.show(state.seen);
  }

  // Once a frame, with the camera placed for it, and while scoped `scope`, the radians from the look
  // to the edge of the scope's circle.
  update(camera: Camera, scope: number | null): void {
    // As the camera stands this frame, not as it stood for the last one drawn (forcing the view
    // matrix brings its global position up to date too).
    const planes = Frustum.GetPlanes(camera.getViewMatrix(true).multiply(camera.getProjectionMatrix(true)));
    const at = camera.globalPosition;
    const sight = scope === null ? SIGHT : SCOPED_SIGHT;
    const look = camera.getDirection(Axis.Z);
    const seen = new Set<string>();
    const wanted = new Set<string>();
    for (const b of this.buildings) {
      const off = this.everything ? 0 : fromBuilding(b, at);
      if (off === 0) for (const { id } of b.interiors) seen.add(id);
      if (off <= NEAR) for (const { id } of b.interiors) wanted.add(id);
      if (off === 0 || !this.boxes.get(b)!.isInFrustum(planes)) continue;
      for (const { id, shows } of b.interiors)
        for (const w of this.openings.get(id)!) {
          if (!this.through(w, at, planes)) continue;
          const near =
            Vector3.Distance(at, w.centre) <= sight && (scope === null || offLook(w, at, look) <= scope + GRACE);
          for (const each of [id, ...shows]) {
            seen.add(each);
            if (near) wanted.add(each);
          }
        }
    }
    const now = performance.now();
    // One part begun and one let go a frame at most, so a building's worth of either is spread over
    // a few frames rather than taken in one.
    let begin: (() => void) | null = null;
    let letGo: (() => void) | null = null;
    for (const [id, state] of this.states) {
      const parts = this.parts.get(id) ?? [];
      const is = seen.has(id);
      if (is || wanted.has(id)) state.keptAt = now;
      if (wanted.has(id)) {
        const gone = parts.find((p) => p.status === 'gone');
        if (gone) begin ??= () => this.load(id, gone);
      } else if (
        now - state.keptAt > FORGET * 1000 &&
        fromBuilding(state.building, at) > LET_GO &&
        parts.every((p) => p.status !== 'loading')
      ) {
        const here = parts.find((p) => p.unload && p.status === 'here');
        if (here) letGo ??= () => this.unload(here);
      }
      if (is === state.seen) continue;
      state.seen = is;
      for (const part of parts) if (part.status === 'here') part.show(is);
    }
    begin?.();
    letGo?.();
  }

  private load(id: string, part: Registered): void {
    part.status = 'loading';
    part.load!()
      .then(() => {
        part.status = 'here';
        part.show(this.states.get(id)!.seen);
      })
      .catch((e: unknown) => {
        part.status = 'gone'; // tried again the next time it's wanted
        console.error(`loading ${id}`, e);
      });
  }

  private unload(part: Registered): void {
    part.show(false);
    part.unload!();
    part.status = 'gone';
  }

  private through(w: Watched, at: Vector3, planes: Plane[]): boolean {
    if (w.opening.door && !this.ajar(w.opening.door)) return false;
    if (Vector3.Dot(at.subtract(w.centre), w.out) <= 0) return false;
    return w.box.isInFrustum(planes);
  }
}

function watch(opening: Opening): Watched {
  const corners = opening.corners.map((c) => new Vector3(c.x, c.y, c.z));
  const min = corners.reduce((a, c) => Vector3.Minimize(a, c));
  const max = corners.reduce((a, c) => Vector3.Maximize(a, c));
  return {
    opening,
    box: new BoundingBox(min, max),
    centre: Vector3.Center(min, max),
    radius: Vector3.Distance(min, max) / 2,
    out: new Vector3(opening.out.x, opening.out.y, opening.out.z),
  };
}

// Radians from the look to the nearest of an opening as seen from `at` (0 once the look is on it).
function offLook(w: Watched, at: Vector3, look: Vector3): number {
  const to = w.centre.subtract(at);
  const far = to.length();
  if (far <= w.radius) return 0;
  const angle = Math.acos(Math.min(1, Vector3.Dot(to, look) / far));
  return Math.max(0, angle - Math.asin(w.radius / far));
}

// Metres from a point to a building's upright cylinder: 0 inside it.
function fromBuilding(b: InteriorBuilding, at: Vector3): number {
  const across = Math.max(0, Math.hypot(at.x - b.x, at.z - b.z) - b.r);
  const up = Math.max(0, b.bottom - at.y, at.y - b.top);
  return Math.hypot(across, up);
}
