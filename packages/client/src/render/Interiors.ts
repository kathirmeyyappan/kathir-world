// Draws each interior (sim/interiors.ts) only while it could be seen, by switching on and off
// whatever is registered as part of it (a model's floor of rooms, a storey's wall frames). From
// inside a building every one of its interiors is drawn. From outside, an interior is drawn while
// an opening of it is in view with the camera on the side it opens to and its door, if it has one,
// not shut, and so is whatever that interior shows. Nothing is told how far off it is: a scope
// sees through a door across the world as well as one up close.
import { BoundingBox, Frustum, Vector3, type Camera, type Plane } from '@babylonjs/core';
import type { InteriorBuilding, Opening } from '@world/shared';

interface Watched {
  opening: Opening;
  box: BoundingBox;
  centre: Vector3;
  out: Vector3;
}

export class Interiors {
  // Draw every interior whatever is in view: what the culling is checked against.
  everything = false;
  private readonly openings = new Map<string, Watched[]>();
  private readonly parts = new Map<string, ((seen: boolean) => void)[]>();
  private readonly seen = new Map<string, boolean>();

  // `ajar` says whether a sim door is open, or still swinging: shut, its opening shows nothing.
  constructor(
    private readonly buildings: readonly InteriorBuilding[],
    private readonly ajar: (door: string) => boolean,
  ) {
    for (const b of buildings)
      for (const interior of b.interiors) {
        this.openings.set(interior.id, interior.openings.map(watch));
        this.seen.set(interior.id, true);
      }
  }

  // Something drawn as part of interior `id`: `show` is told at once whether it could be seen, and
  // again whenever that changes.
  add(id: string, show: (seen: boolean) => void): void {
    if (!this.seen.has(id)) throw new Error(`no interior ${id}`);
    const parts = this.parts.get(id) ?? [];
    parts.push(show);
    this.parts.set(id, parts);
    show(this.seen.get(id)!);
  }

  // Once a frame, with the camera placed for it.
  update(camera: Camera): void {
    // As the camera stands this frame, not as it stood for the last one drawn (forcing the view
    // matrix brings its global position up to date too).
    const planes = Frustum.GetPlanes(camera.getViewMatrix(true).multiply(camera.getProjectionMatrix(true)));
    const at = camera.globalPosition;
    const now = new Set<string>();
    for (const b of this.buildings) {
      if (this.everything || inside(b, at)) {
        for (const { id } of b.interiors) now.add(id);
        continue;
      }
      for (const { id, shows } of b.interiors)
        if (this.openings.get(id)!.some((w) => this.through(w, at, planes))) {
          now.add(id);
          for (const other of shows) now.add(other);
        }
    }
    for (const [id, was] of this.seen) {
      const is = now.has(id);
      if (is === was) continue;
      this.seen.set(id, is);
      for (const show of this.parts.get(id) ?? []) show(is);
    }
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

function inside(b: InteriorBuilding, at: Vector3): boolean {
  return at.y >= b.bottom && at.y <= b.top && Math.hypot(at.x - b.x, at.z - b.z) <= b.r;
}
