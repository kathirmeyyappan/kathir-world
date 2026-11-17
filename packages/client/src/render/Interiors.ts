// Loads each interior (sim/interiors.ts) the first time it's wanted, and draws it only while it
// could be seen, through whatever is registered as part of it (a model's floor of rooms, a storey's
// wall frames).
//
// Seen: from inside a building every one of its interiors is. From outside, an interior is while an
// opening of it is in view with the camera on the side it opens to and its door, if it has one, not
// shut, and so is whatever that interior shows. Nothing about seeing waits on distance: once loaded,
// an interior through a door across the world is drawn, fogged as anything that far is.
//
// Wanted, which loads it for good: from inside its building or within NEAR of it, whatever's in view
// (so a door swung open in front of you shows the rooms already there), and while it's seen through
// an opening within SIGHT, SCOPED times that through a scope. Further off without one, a doorway
// is all but fog; with one, SIGHT is past the far side of the world.
import { BoundingBox, Frustum, Vector3, type Camera, type Plane } from '@babylonjs/core';
import type { InteriorBuilding, Opening } from '@world/shared';

const NEAR = 25; // metres from a building's round within which all its interiors are wanted
const SIGHT = 125; // metres to an opening within which what's seen through it is wanted
const SCOPED = 3; // how many times SIGHT a scope wants through an opening

interface Watched {
  opening: Opening;
  box: BoundingBox;
  centre: Vector3;
  out: Vector3;
}

// Something drawn as part of an interior: `load` fetches and builds it, and is begun the first time
// the interior is wanted (none for a part that's there from the start); `show` is told whether to
// draw it, once it's loaded and whenever that changes.
export interface InteriorPart {
  load?: () => Promise<void>;
  show: (on: boolean) => void;
}

interface Registered extends InteriorPart {
  loaded: boolean;
}

interface State {
  seen: boolean;
  wanted: boolean;
}

export class Interiors {
  // Want and draw every interior whatever is in view: what the culling is checked against.
  everything = false;
  private readonly openings = new Map<string, Watched[]>();
  private readonly parts = new Map<string, Registered[]>();
  private readonly states = new Map<string, State>();

  // `ajar` says whether a sim door is open, or still swinging: shut, its opening shows nothing.
  constructor(
    private readonly buildings: readonly InteriorBuilding[],
    private readonly ajar: (door: string) => boolean,
  ) {
    for (const b of buildings)
      for (const interior of b.interiors) {
        this.openings.set(interior.id, interior.openings.map(watch));
        this.states.set(interior.id, { seen: false, wanted: false });
      }
  }

  add(id: string, part: InteriorPart): void {
    const state = this.states.get(id);
    if (!state) throw new Error(`no interior ${id}`);
    const registered: Registered = { ...part, loaded: !part.load };
    this.parts.set(id, [...(this.parts.get(id) ?? []), registered]);
    if (registered.loaded) registered.show(state.seen);
    else if (state.wanted) this.load(id, registered);
  }

  // Once a frame, with the camera placed for it.
  update(camera: Camera, scoped: boolean): void {
    // As the camera stands this frame, not as it stood for the last one drawn (forcing the view
    // matrix brings its global position up to date too).
    const planes = Frustum.GetPlanes(camera.getViewMatrix(true).multiply(camera.getProjectionMatrix(true)));
    const at = camera.globalPosition;
    const sight = scoped ? SIGHT * SCOPED : SIGHT;
    const seen = new Set<string>();
    const wanted = new Set<string>();
    for (const b of this.buildings) {
      const off = this.everything ? 0 : fromBuilding(b, at);
      if (off === 0) for (const { id } of b.interiors) seen.add(id);
      if (off <= NEAR) for (const { id } of b.interiors) wanted.add(id);
      if (off === 0) continue;
      for (const { id, shows } of b.interiors)
        for (const w of this.openings.get(id)!) {
          if (!this.through(w, at, planes)) continue;
          const near = Vector3.Distance(at, w.centre) <= sight;
          for (const each of [id, ...shows]) {
            seen.add(each);
            if (near) wanted.add(each);
          }
        }
    }
    for (const [id, state] of this.states) {
      if (wanted.has(id) && !state.wanted) {
        state.wanted = true;
        for (const part of this.parts.get(id) ?? []) if (!part.loaded) this.load(id, part);
      }
      const is = seen.has(id);
      if (is === state.seen) continue;
      state.seen = is;
      for (const part of this.parts.get(id) ?? []) if (part.loaded) part.show(is);
    }
  }

  private load(id: string, part: Registered): void {
    const begun = part.load!;
    part.load = undefined; // begun once, whatever comes of it
    begun()
      .then(() => {
        part.loaded = true;
        part.show(this.states.get(id)!.seen);
      })
      .catch((e: unknown) => console.error(`loading ${id}`, e));
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
    out: new Vector3(opening.out.x, opening.out.y, opening.out.z),
  };
}

// Metres from a point to a building's upright cylinder: 0 inside it.
function fromBuilding(b: InteriorBuilding, at: Vector3): number {
  const across = Math.max(0, Math.hypot(at.x - b.x, at.z - b.z) - b.r);
  const up = Math.max(0, b.bottom - at.y, at.y - b.top);
  return Math.hypot(across, up);
}
