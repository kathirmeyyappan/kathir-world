// Landmarks drawn from models (models/Models.ts) are drawn in full near and as a shell far off: a
// mesh of a few thousand triangles in its own colours that keeps the landmark's outline against the
// sky, made at once from data the client already has and kept for good. Its full detail (the
// model's parts outside, their meshes and textures) is wanted within REACH of the landmark's edge
// and let go past REACH + SLACK, so walking back and forth across one line can't load and unload it
// over and over. REACH is past SCOPED_SIGHT, where even a scope sees all but nothing through the
// fog, so no swap is ever seen; the shell stands in while the full detail is on its way (at join,
// say), and the parts are drawn only once every one of them is here, all at once in the shell's
// place, so the two never overlap. A building's rooms are its interiors' (Interiors.ts),
// wanted far nearer. These distances are set against the rest of the client's (CLAUDE.md, Client
// loading): audit them together.
import type { Mesh, Vector3 } from '@babylonjs/core';
import { SCOPED_SIGHT } from '@world/shared';
import { Held, type Part } from './Held';

const REACH = SCOPED_SIGHT + 40; // metres from a landmark's edge within which its full detail is wanted
const SLACK = 100; // metres further out past which it's let go

// A landmark: where it stands (its middle and the radius of a circle round it on the floor), its
// shell, and the parts of its full detail.
export interface Landmark {
  name: string;
  x: number;
  z: number;
  r: number;
  shell: Mesh;
  parts: Part[];
}

interface Kept {
  landmark: Landmark;
  parts: Held[];
  whole: boolean | null; // whether it's drawn in full, as last told; null before the first frame
}

export class Shells {
  // Metres within which full detail is wanted: REACH, but for checking the shells closer to.
  reach = REACH;
  private readonly kept: Kept[] = [];

  add(landmark: Landmark): void {
    const parts = landmark.parts.map((p, i) => new Held(p, `${landmark.name} ${i}`));
    this.kept.push({ landmark, parts, whole: null });
  }

  // Once a frame, with where the camera is. One part begun and one let go a frame at most, so a
  // landmark's worth of either is spread over a few frames rather than taken in one.
  update(at: Vector3): void {
    let begun = false;
    let letGo = false;
    for (const kept of this.kept) {
      const { landmark, parts } = kept;
      const off = Math.hypot(at.x - landmark.x, at.z - landmark.z) - landmark.r;
      if (off <= this.reach) {
        const gone = parts.find((p) => p.status === 'gone');
        if (gone && !begun) {
          gone.want();
          begun = true;
        }
      } else if (off > this.reach + SLACK && parts.every((p) => p.status !== 'loading')) {
        const here = parts.find((p) => p.canLetGo);
        if (here && !letGo) {
          here.letGo();
          letGo = true;
        }
      }
      const whole = parts.every((p) => p.status === 'here');
      if (whole === kept.whole) continue;
      kept.whole = whole;
      landmark.shell.setEnabled(!whole);
      for (const p of parts) p.show(whole);
    }
  }
}
